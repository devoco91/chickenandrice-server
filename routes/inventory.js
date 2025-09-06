// backend/routes/inventory.js
import express from "express";
import InventoryItem from "../models/InventoryItem.js";
import InventoryMovement from "../models/InventoryMovement.js";
import InventoryStock from "../models/InventoryStock.js";
import Order from "../models/Order.js";
import {
  normalizeSlug,
  baseFoodSlug,
  gramsForFoodName,
  inferKindUnit,
  isFoodPieceByName,
  looksProtein,
} from "../utils/inventoryName.js";

const router = express.Router();

// --- helper: alias map (aliasSlug -> canonical item.slug)
async function buildAliasMap() {
  const items = await InventoryItem.find();
  const aliasToSlug = new Map(); // alias => slug
  const bySlug = new Map();      // slug => item
  for (const it of items) {
    bySlug.set(it.slug, it);
    aliasToSlug.set(it.slug, it.slug);
    for (const a of it.aliases || []) {
      const as = normalizeSlug(a);
      if (as) aliasToSlug.set(as, it.slug);
    }
    // foods: base (without "extra"/"half") points to same slug
    if (it.kind === "food") aliasToSlug.set(baseFoodSlug(it.name), it.slug);
  }
  return { items, aliasToSlug, bySlug };
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// -------------------- ITEMS --------------------

// list items (used by UI to populate selects)
router.get("/items", async (_req, res) => {
  try {
    const items = await InventoryItem.find().sort({ kind: 1, name: 1 }).lean();
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to list items" });
  }
});

// create or upsert item; optional initialQty creates a stock entry for today
router.post("/items", async (req, res) => {
  try {
    const { sku, kind, unit, initialQty } = req.body || {};
    if (!sku || !kind || !unit) {
      return res.status(400).json({ error: "sku, kind, unit are required" });
    }
    const slug = normalizeSlug(sku);
    const doc = await InventoryItem.findOneAndUpdate(
      { slug },
      { $set: { name: sku, slug, kind, unit, aliases: [] } },
      { new: true, upsert: true }
    );

    await InventoryMovement.create({
      type: "create",
      sku: doc.name,
      slug: doc.slug,
      unit: doc.unit,
      note: "",
    });

    // optional same-day initial stock
    const q = Number(initialQty || 0);
    if (q > 0) {
      await InventoryStock.create({
        sku: doc.name,
        slug: doc.slug,
        unit: doc.unit,
        qty: q,
        note: "Initial stock",
      });
    }

    res.json(doc);
  } catch (e) {
    if (String(e?.code) === "11000") return res.status(409).json({ error: "Item already exists." });
    res.status(500).json({ error: e.message || "Failed to save item" });
  }
});

// edit item (no alias editing here; UI removed aliases)
router.patch("/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const doc = await InventoryItem.findById(id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    const before = { name: doc.name, kind: doc.kind, unit: doc.unit };

    if (body.name && body.name !== doc.name) {
      const newSlug = normalizeSlug(body.name);
      if (newSlug !== doc.slug) {
        const exists = await InventoryItem.findOne({ slug: newSlug });
        if (exists) return res.status(409).json({ error: "Another item with this name already exists." });
        // also move existing stock over to the new slug
        await InventoryStock.updateMany({ slug: doc.slug }, { $set: { slug: newSlug, sku: body.name } });
        doc.slug = newSlug;
      }
      doc.name = body.name;
    }

    if (body.kind) doc.kind = body.kind;
    if (body.unit) doc.unit = body.unit;

    await doc.save();

    const after = { name: doc.name, kind: doc.kind, unit: doc.unit };
    const note = `Edited: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`;

    await InventoryMovement.create({
      type: "edit",
      sku: doc.name,
      slug: doc.slug,
      unit: doc.unit,
      note,
    });

    res.json(doc);
  } catch (e) {
    if (String(e?.code) === "11000") return res.status(409).json({ error: "Duplicate after rename." });
    res.status(500).json({ error: e.message || "Failed to edit item" });
  }
});

// delete item + its stock entries (safe for today-only views)
router.delete("/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await InventoryItem.findById(id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    await InventoryItem.deleteOne({ _id: id });
    await InventoryStock.deleteMany({ slug: doc.slug }); // remove its stock entries

    await InventoryMovement.create({
      type: "delete",
      sku: doc.name,
      slug: doc.slug,
      unit: doc.unit,
      note: "",
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to delete item" });
  }
});

// -------------------- STOCK (today-only UI views) --------------------

// list today's stock entries
router.get("/stock", async (_req, res) => {
  try {
    const start = startOfToday();
    const entries = await InventoryStock.find({ createdAt: { $gte: start } })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ entries });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to list stock" });
  }
});

// add a stock entry (re-stock)
// Add/Restock quantity for an item
router.post("/stock", async (req, res) => {
  try {
    const { sku, qty, note = "" } = req.body || {};
    const n = Number(qty);
    if (!sku || !Number.isFinite(n) || n <= 0) {
      return res.status(400).json({ error: "sku and positive qty are required" });
    }

    const sl = normalizeSlug(sku);
    const { aliasToSlug, bySlug } = await buildAliasMap();
    const canonical = aliasToSlug.get(sl) || sl;
    const item = bySlug.get(canonical);
    if (!item) return res.status(404).json({ error: "Item not found. Create it first." });

    const doc = await InventoryStock.create({
      sku: item.name,
      slug: item.slug,
      unit: item.unit,
      qty: n,
      note: note || "",
    });

    await InventoryMovement.create({
      type: "create",
      sku: item.name,
      slug: item.slug,
      unit: item.unit,
      note: `+${n} ${item.unit}${note ? ` — ${note}` : ""}`,
    });

    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to add stock" });
  }
});


// edit a stock entry (qty or note)
router.patch("/stock/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const doc = await InventoryStock.findById(id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    if (body.qty != null) {
      const n = Number(body.qty);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: "Invalid qty" });
      doc.qty = n;
    }
    if (typeof body.note === "string") doc.note = body.note;

    await doc.save();
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to edit stock entry" });
  }
});

// delete a stock entry
router.delete("/stock/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await InventoryStock.deleteOne({ _id: id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to delete stock entry" });
  }
});

// -------------------- MOVEMENTS (today only; no 'reset') --------------------
router.get("/movements", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const start = startOfToday();

    // Only today's system movements, exclude 'reset'
    const sysMoves = await InventoryMovement.find({
      createdAt: { $gte: start },
      type: { $in: ["create", "edit", "delete"] },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Also include today's stock entries as "add"
    const stockToday = await InventoryStock.find({ createdAt: { $gte: start } })
      .sort({ createdAt: -1 })
      .lean();

    const stockAsMoves = stockToday.map((s) => ({
      _id: `stock-${s._id}`,
      type: "add",
      sku: s.sku,
      slug: s.slug,
      unit: s.unit,
      note: `+${s.qty} ${s.unit}${s.note ? ` — ${s.note}` : ""}`,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    const all = [...sysMoves, ...stockAsMoves]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);

    res.json({ items: all });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to fetch movements" });
  }
});

// -------------------- SUMMARY (today only; in-shop orders only) --------------------
router.get("/summary", async (_req, res) => {
  try {
    const start = startOfToday();
    const { items, aliasToSlug, bySlug } = await buildAliasMap();

    // 1) Added today
    const stock = await InventoryStock.find({ createdAt: { $gte: start } }).lean();
    const addedGram = new Map();  // slug -> grams added
    const addedPiece = new Map(); // slug -> pieces added
    for (const s of stock) {
      if (s.unit === "gram") {
        addedGram.set(s.slug, (addedGram.get(s.slug) || 0) + Number(s.qty || 0));
      } else {
        addedPiece.set(s.slug, (addedPiece.get(s.slug) || 0) + Number(s.qty || 0));
      }
    }

    // 2) Used today (in-shop only)
    const usedGram = new Map();
    const usedPiece = new Map();
    // also collect “extra/half” rows for display (used only)
    const extraUsedDisplay = new Map(); // extraSlug -> grams used (display only)

    const orders = await Order.find({
      orderType: "instore",
      createdAt: { $gte: start },
    }).select({ items: 1 });

    for (const o of orders) {
      for (const li of Array.isArray(o.items) ? o.items : []) {
        const qty = Number(li?.quantity ?? 0) || 0;
        if (!qty) continue;

        const raw = String(li?.name || "");
        const sl = normalizeSlug(raw);
        const base = baseFoodSlug(raw);
        const canonical = aliasToSlug.get(sl) || aliasToSlug.get(base) || sl;

        // prefer configured item, else fallback
        const meta = bySlug.get(canonical);
        const unit = meta?.unit || inferKindUnit(raw).unit;

        if (unit === "gram") {
          const grams = gramsForFoodName(raw) * qty;
          // count towards base (deduct from stock)
          usedGram.set(canonical, (usedGram.get(canonical) || 0) + grams);

          // if this looks like an “extra/half”, also record a display row (no added/remaining)
          if (/(extra|half)/.test(sl)) {
            extraUsedDisplay.set(sl, (extraUsedDisplay.get(sl) || 0) + grams);
          }
        } else {
          usedPiece.set(canonical, (usedPiece.get(canonical) || 0) + qty);
        }
      }
    }

    // 3) Build rows by category (food/drink/protein). Some food rows can be in pieces.
    const foodRows = [];
    const drinkRows = [];
    const proteinRows = [];

    const pushRow = (arr, { slug, name, unit, added, used }) => {
      const remaining = Math.max(0, Number(added || 0) - Number(used || 0));
      arr.push({
        _id: bySlug.get(slug)?._id || null,
        sku: name,
        slug,
        unit,
        added: Number(added || 0),
        used: Number(used || 0),
        remaining,
      });
    };

    // Configured items first
    for (const it of items) {
      const slug = it.slug;
      const unit = it.unit;
      const kind = it.kind;

      const added =
        unit === "gram" ? (addedGram.get(slug) || 0) : (addedPiece.get(slug) || 0);
      const used =
        unit === "gram" ? (usedGram.get(slug) || 0) : (usedPiece.get(slug) || 0);

      const row = { slug, name: it.name, unit, added, used };

      if (kind === "food") pushRow(foodRows, row);
      else if (kind === "drink") pushRow(drinkRows, row);
      else pushRow(proteinRows, row);

      // clear so leftovers below will be truly unknowns
      addedGram.delete(slug);
      addedPiece.delete(slug);
      usedGram.delete(slug);
      usedPiece.delete(slug);
    }

    // Any leftovers (used/added for items not configured) — heuristic classification
    // These show up so you can click to create them quickly.
    for (const [slug, grams] of usedGram.entries()) {
      const inf = inferKindUnit(slug);
      if (inf.kind === "food") pushRow(foodRows, { slug, name: slug, unit: "gram", added: 0, used: grams });
      else if (inf.kind === "drink") pushRow(drinkRows, { slug, name: slug, unit: "piece", added: 0, used: 0 });
      else pushRow(proteinRows, { slug, name: slug, unit: "piece", added: 0, used: 0 });
    }
    for (const [slug, pcs] of usedPiece.entries()) {
      const inf = inferKindUnit(slug);
      if (inf.kind === "food") pushRow(foodRows, { slug, name: slug, unit: "piece", added: 0, used: pcs });
      else if (inf.kind === "drink") pushRow(drinkRows, { slug, name: slug, unit: "piece", added: 0, used: pcs });
      else pushRow(proteinRows, { slug, name: slug, unit: "piece", added: 0, used: pcs });
    }

    // Show “extra/half” informational rows (used-only, no added/remaining)
    for (const [extraSlug, grams] of extraUsedDisplay.entries()) {
      foodRows.push({
        _id: null,
        sku: extraSlug,
        slug: extraSlug,
        unit: "gram",
        added: 0,
        used: grams,
        remaining: 0,
        _extra: true, // client can choose to dim if desired
      });
    }

    res.json({ food: foodRows, drinks: drinkRows, proteins: proteinRows });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to compute summary" });
  }
});

export default router;

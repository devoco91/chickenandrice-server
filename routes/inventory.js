// backend/routes/inventory.js
import express from "express";
import InventoryItem from "../models/InventoryItem.js";
import InventoryMovement from "../models/InventoryMovement.js";
import Order from "../models/Order.js";
import {
  normalizeSlug,
  baseFoodSlug,
  gramsForFoodName,
  isPieceByHeuristic,
  inferKind, // NEW
} from "../utils/inventoryName.js";

const router = express.Router();

// --- helper: map aliases -> canonical slug
async function buildAliasMap() {
  const items = await InventoryItem.find();
  const aliasToSlug = new Map();    // aliasSlug => canonicalSlug
  const bySlug = new Map();         // slug => item
  for (const it of items) {
    bySlug.set(it.slug, it);
    aliasToSlug.set(it.slug, it.slug);
    for (const a of it.aliases || []) {
      const as = normalizeSlug(a);
      if (!as) continue;
      aliasToSlug.set(as, it.slug);
    }
    // for foods, also let base slug (w/o "extra"/"half") point to same item
    if (it.unit === "gram") {
      aliasToSlug.set(baseFoodSlug(it.name), it.slug);
    }
  }
  return { items, aliasToSlug, bySlug };
}

// --- create item (idempotent by slug)
router.post("/items", async (req, res) => {
  try {
    const { sku, kind, unit, aliases = [] } = req.body || {};
    if (!sku || !kind || !unit) return res.status(400).json({ error: "sku, kind, unit are required" });

    const slug = normalizeSlug(sku);
    const doc = await InventoryItem.findOneAndUpdate(
      { slug },
      { $set: { name: sku, slug, kind, unit, aliases: Array.isArray(aliases) ? aliases : [] } },
      { new: true, upsert: true }
    );

    await InventoryMovement.create({
      type: "create",
      sku: doc.name,
      slug: doc.slug,
      unit: doc.unit,
      note: "",
    });

    res.json(doc);
  } catch (e) {
    if (String(e?.code) === "11000") {
      return res.status(409).json({ error: "Item already exists." });
    }
    res.status(500).json({ error: e.message || "Failed to save item" });
  }
});

// --- edit item
router.patch("/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const doc = await InventoryItem.findById(id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    const before = { name: doc.name, kind: doc.kind, unit: doc.unit, aliases: doc.aliases?.join(", ") || "" };

    // allow changing name (re-slug) safely
    if (body.name && body.name !== doc.name) {
      const newSlug = normalizeSlug(body.name);
      if (newSlug !== doc.slug) {
        const exists = await InventoryItem.findOne({ slug: newSlug });
        if (exists) return res.status(409).json({ error: "Another item with this name already exists." });
        doc.slug = newSlug;
      }
      doc.name = body.name;
    }

    if (body.kind) doc.kind = body.kind;
    if (body.unit) doc.unit = body.unit;
    if (Array.isArray(body.aliases)) doc.aliases = body.aliases;

    await doc.save();

    const after = { name: doc.name, kind: doc.kind, unit: doc.unit, aliases: doc.aliases?.join(", ") || "" };
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

// --- delete item
router.delete("/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await InventoryItem.findById(id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    await InventoryItem.deleteOne({ _id: id });

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

// --- list movements
router.get("/movements", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const items = await InventoryMovement.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to fetch movements" });
  }
});

// --- summary (instore only). Remaining clamped to 0 because we only show usage here
router.get("/summary", async (_req, res) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const { items, aliasToSlug, bySlug } = await buildAliasMap();

    // usage accumulators
    const usedGram = new Map();   // slug -> grams used (foods by weight)
    const usedPiece = new Map();  // slug -> pieces used (drinks, proteins, piece-foods)

    // IN-STORE orders only, from today
    const orders = await Order.find({
      orderType: "instore",
      createdAt: { $gte: start },
    }).select({ items: 1, createdAt: 1 });

    for (const o of orders) {
      const lineItems = Array.isArray(o.items) ? o.items : [];
      for (const it of lineItems) {
        const qty = Number(it?.quantity ?? 0) || 0;
        if (!qty) continue;

        const rawName = String(it?.name || "");
        const sl = normalizeSlug(rawName);
        const base = baseFoodSlug(rawName);
        const canonical = aliasToSlug.get(sl) || aliasToSlug.get(base) || sl;

        // prefer configured unit; otherwise infer piece vs gram
        const meta = bySlug.get(canonical);
        let unit = meta?.unit;
        if (!unit) unit = isPieceByHeuristic(rawName) ? "piece" : "gram";

        if (unit === "piece") {
          usedPiece.set(canonical, (usedPiece.get(canonical) || 0) + qty);
        } else {
          const grams = gramsForFoodName(rawName) * qty; // 350g or 175g
          usedGram.set(canonical, (usedGram.get(canonical) || 0) + grams);
        }
      }
    }

    // prepare rows grouped by category (food/drink/protein)
    const foodRows = [];     // includes gram foods AND piece-foods (moi-moi, plantain)
    const drinkRows = [];
    const proteinRows = [];

    const pushRow = (arr, slug, name, unit, used, kind) => {
      arr.push({
        _id: bySlug.get(slug)?._id || null,
        sku: name,
        slug,
        unit,               // 'gram' or 'piece'
        used: used || 0,
        remaining: 0,
        kind: kind || bySlug.get(slug)?.kind || null,
      });
    };

    // First: all configured items (trust their kind + unit)
    for (const it of items) {
      if (it.kind === "food") {
        const used = (it.unit === "gram" ? usedGram.get(it.slug) : usedPiece.get(it.slug)) || 0;
        pushRow(foodRows, it.slug, it.name, it.unit, used, "food");
      } else if (it.kind === "drink") {
        pushRow(drinkRows, it.slug, it.name, it.unit, usedPiece.get(it.slug) || 0, "drink");
      } else {
        pushRow(proteinRows, it.slug, it.name, it.unit, usedPiece.get(it.slug) || 0, "protein");
      }
      usedGram.delete(it.slug);
      usedPiece.delete(it.slug);
    }

    // Then: leftovers (used but not configured) — infer bucket
    for (const [slug, grams] of usedGram.entries()) {
      pushRow(foodRows, slug, slug, "gram", grams, "food");
    }
    for (const [slug, pcs] of usedPiece.entries()) {
      const k = inferKind(slug);
      if (k === "protein") pushRow(proteinRows, slug, slug, "piece", pcs, "protein");
      else if (k === "drink") pushRow(drinkRows, slug, slug, "piece", pcs, "drink");
      else pushRow(foodRows, slug, slug, "piece", pcs, "food"); // moi-moi / plantain
    }

    res.json({ food: foodRows, drinks: drinkRows, proteins: proteinRows });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to compute summary" });
  }
});

// --- manual reset (also used by the midnight scheduler)
router.post("/reset", async (_req, res) => {
  try {
    await InventoryMovement.create({
      type: "reset",
      sku: "ALL",
      slug: "all",
      unit: "piece",
      note: "Daily reset",
    });
    await InventoryItem.deleteMany({});
    await InventoryMovement.deleteMany({});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to reset inventory" });
  }
});

export default router;

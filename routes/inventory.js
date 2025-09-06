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
  isPieceByHeuristic,
} from "../utils/inventoryName.js";

const router = express.Router();

// --- helper: map aliases -> canonical slug
async function buildAliasMap() {
  const items = await InventoryItem.find().lean();
  const aliasToSlug = new Map(); // aliasSlug => canonicalSlug
  const bySlug = new Map();      // slug => item

  for (const it of items) {
    bySlug.set(it.slug, it);
    aliasToSlug.set(it.slug, it.slug);

    for (const a of it.aliases || []) {
      const as = normalizeSlug(a);
      if (!as) continue;
      aliasToSlug.set(as, it.slug);
    }

    if (it.unit === "gram") {
      aliasToSlug.set(baseFoodSlug(it.name), it.slug);
    }
  }
  return { items, aliasToSlug, bySlug };
}

// ---------- ITEMS ----------

// list items (for restock dropdown)
router.get("/items", async (_req, res) => {
  try {
    const items = await InventoryItem.find().sort({ name: 1 }).lean();
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to list items" });
  }
});

// create item (idempotent by slug)
router.post("/items", async (req, res) => {
  try {
    const { sku, kind, unit } = req.body || {};
    if (!sku || !kind || !unit) return res.status(400).json({ error: "sku, kind, unit are required" });

    const slug = normalizeSlug(sku);
    const doc = await InventoryItem.findOneAndUpdate(
      { slug },
      { $set: { name: sku, slug, kind, unit, aliases: [] } }, // aliases hidden from UI
      { new: true, upsert: true }
    );

    await InventoryMovement.create({ type: "create", sku: doc.name, slug: doc.slug, unit: doc.unit, note: "" });
    res.json(doc);
  } catch (e) {
    if (String(e?.code) === "11000") return res.status(409).json({ error: "Item already exists." });
    res.status(500).json({ error: e.message || "Failed to save item" });
  }
});

// edit item
router.patch("/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const doc = await InventoryItem.findById(id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    const before = { name: doc.name, kind: doc.kind, unit: doc.unit, aliases: doc.aliases?.join(", ") || "" };

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
    // aliases removed from UI; if API sends aliases, accept, else keep as is
    if (Array.isArray(body.aliases)) doc.aliases = body.aliases;

    await doc.save();

    const after = { name: doc.name, kind: doc.kind, unit: doc.unit, aliases: doc.aliases?.join(", ") || "" };
    const note = `Edited: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`;

    await InventoryMovement.create({ type: "edit", sku: doc.name, slug: doc.slug, unit: doc.unit, note });
    res.json(doc);
  } catch (e) {
    if (String(e?.code) === "11000") return res.status(409).json({ error: "Duplicate after rename." });
    res.status(500).json({ error: e.message || "Failed to edit item" });
  }
});

// delete item (also deletes its stock entries)
router.delete("/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await InventoryItem.findById(id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    await InventoryItem.deleteOne({ _id: id });
    await InventoryStock.deleteMany({ slug: doc.slug });

    await InventoryMovement.create({ type: "delete", sku: doc.name, slug: doc.slug, unit: doc.unit, note: "" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to delete item" });
  }
});

// ---------- STOCK (restock entries) ----------

// add stock
router.post("/stock", async (req, res) => {
  try {
    const { sku, qty, note = "" } = req.body || {};
    if (!sku || !(Number(qty) > 0)) return res.status(400).json({ error: "sku and positive qty are required" });

    const { aliasToSlug, bySlug } = await buildAliasMap();
    const sl = normalizeSlug(sku);
    const base = baseFoodSlug(sku);
    const canonical = aliasToSlug.get(sl) || aliasToSlug.get(base);

    if (!canonical) return res.status(404).json({ error: "Item not found. Create the item first." });

    const meta = bySlug.get(canonical);
    const unit = meta?.unit || (isPieceByHeuristic(sku) ? "piece" : "gram");

    const entry = await InventoryStock.create({
      sku: meta?.name || sku,
      slug: canonical,
      unit,
      qty: Number(qty),
      note: String(note || ""),
    });

    res.json(entry);
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to add stock" });
  }
});

// list all stock entries (newest first)
router.get("/stock", async (_req, res) => {
  try {
    const entries = await InventoryStock.find().sort({ createdAt: -1 }).limit(500).lean();
    res.json({ entries });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to fetch stock entries" });
  }
});

// edit stock entry (qty/note)
router.patch("/stock/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const entry = await InventoryStock.findById(id);
    if (!entry) return res.status(404).json({ error: "Not found" });

    if (body.qty != null) {
      const n = Number(body.qty);
      if (!(n >= 0)) return res.status(400).json({ error: "qty must be >= 0" });
      entry.qty = n;
    }
    if (body.note != null) entry.note = String(body.note || "");

    await entry.save();
    res.json(entry);
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to edit stock entry" });
  }
});

// delete stock entry
router.delete("/stock/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await InventoryStock.deleteOne({ _id: id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to delete stock entry" });
  }
});

// ---------- MOVEMENTS (audit for items only) ----------
router.get("/movements", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const items = await InventoryMovement.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to fetch movements" });
  }
});

// ---------- SUMMARY (instore orders only; carry-over; with stock column) ----------
router.get("/summary", async (_req, res) => {
  try {
    const { items, aliasToSlug, bySlug } = await buildAliasMap();

    // totals from STOCK (carry-over; across all time)
    const stockGram = new Map();  // slug -> grams stocked
    const stockPiece = new Map(); // slug -> pieces stocked
    const entries = await InventoryStock.find().lean();
    for (const e of entries) {
      if (e.unit === "gram") stockGram.set(e.slug, (stockGram.get(e.slug) || 0) + Number(e.qty || 0));
      else stockPiece.set(e.slug, (stockPiece.get(e.slug) || 0) + Number(e.qty || 0));
    }

    // used accumulators (instore orders only; across all time)
    const usedGram = new Map();
    const usedPiece = new Map();

    const orders = await Order.find({ orderType: "instore" }).select({ items: 1 });
    for (const o of orders) {
      const lineItems = Array.isArray(o.items) ? o.items : [];
      for (const it of lineItems) {
        const qty = Number(it?.quantity ?? 0) || 0;
        if (!qty) continue;

        const rawName = String(it?.name || "");
        const sl = normalizeSlug(rawName);
        const base = baseFoodSlug(rawName);
        const canonical = aliasToSlug.get(sl) || aliasToSlug.get(base) || sl;

        const meta = bySlug.get(canonical);
        let unit = meta?.unit;
        if (!unit) unit = isPieceByHeuristic(rawName) ? "piece" : "gram";

        if (unit === "piece") {
          usedPiece.set(canonical, (usedPiece.get(canonical) || 0) + qty);
        } else {
          const grams = gramsForFoodName(rawName) * qty;
          usedGram.set(canonical, (usedGram.get(canonical) || 0) + grams);
        }
      }
    }

    // group rows
    const foodRows = [];
    const drinkRows = [];
    const proteinRows = [];

    const pushRow = (arr, slug, name, kind, unit, stock, used) => {
      const remaining = Math.max(0, (Number(stock || 0) - Number(used || 0)));
      arr.push({
        _id: bySlug.get(slug)?._id || null,
        sku: name,
        slug,
        kind,
        unit,
        stock: Number(stock || 0),
        used: Number(used || 0),
        remaining,
      });
    };

    // configured items first (stable names & kinds)
    for (const it of items) {
      const s = it.unit === "gram" ? stockGram.get(it.slug) || 0 : stockPiece.get(it.slug) || 0;
      const u = it.unit === "gram" ? usedGram.get(it.slug) || 0 : usedPiece.get(it.slug) || 0;

      if (it.kind === "drink") pushRow(drinkRows, it.slug, it.name, it.kind, it.unit, s, u);
      else if (it.kind === "protein") pushRow(proteinRows, it.slug, it.name, it.kind, it.unit, s, u);
      else pushRow(foodRows, it.slug, it.name, it.kind, it.unit, s, u);

      usedGram.delete(it.slug); usedPiece.delete(it.slug);
      stockGram.delete(it.slug); stockPiece.delete(it.slug);
    }

    // leftovers (seen in orders or restocks but not configured)
    for (const [slug, grams] of stockGram.entries()) pushRow(foodRows, slug, slug, "food", "gram", grams, usedGram.get(slug) || 0);
    for (const [slug, pcs] of stockPiece.entries()) {
      const looksProtein = /(chicken|beef|goat|turkey|fish|meat|protein)/.test(slug);
      pushRow(looksProtein ? proteinRows : drinkRows, slug, slug, looksProtein ? "protein" : "drink", "piece", pcs, usedPiece.get(slug) || 0);
    }
    for (const [slug, grams] of usedGram.entries()) pushRow(foodRows, slug, slug, "food", "gram", 0, grams);
    for (const [slug, pcs] of usedPiece.entries()) {
      const looksProtein = /(chicken|beef|goat|turkey|fish|meat|protein)/.test(slug);
      pushRow(looksProtein ? proteinRows : drinkRows, slug, slug, looksProtein ? "protein" : "drink", "piece", 0, pcs);
    }

    res.json({ food: foodRows, drinks: drinkRows, proteins: proteinRows });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to compute summary" });
  }
});

// manual reset (kept but not used; no auto reset anymore)
router.post("/reset", async (_req, res) => {
  try {
    await InventoryMovement.create({ type: "reset", sku: "ALL", slug: "all", unit: "piece", note: "Manual reset" });
    await InventoryItem.deleteMany({});
    await InventoryMovement.deleteMany({});
    await InventoryStock.deleteMany({});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to reset inventory" });
  }
});

export default router;

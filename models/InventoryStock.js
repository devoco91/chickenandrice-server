// backend/models/InventoryStock.js
import mongoose from "mongoose";

const stockSchema = new mongoose.Schema(
  {
    // Display name as chosen when restocking
    sku: { type: String, required: true },

    // Canonical slug (matches InventoryItem.slug)
    slug: { type: String, required: true, index: true },

    // 'gram' | 'piece' (must match the item’s unit)
    unit: { type: String, enum: ["gram", "piece"], required: true },

    // Quantity added to stock (grams or pieces)
    qty: { type: Number, required: true, min: 0 },

    // Optional note (e.g. Morning prep, 2pm restock)
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

stockSchema.index({ slug: 1, createdAt: -1 });

const InventoryStock =
  mongoose.models.InventoryStock || mongoose.model("InventoryStock", stockSchema);
export default InventoryStock;

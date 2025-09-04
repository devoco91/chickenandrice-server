// backend/models/InventoryStock.js
import mongoose from "mongoose";

const inventoryStockSchema = new mongoose.Schema(
  {
    // Canonical item reference
    slug: { type: String, required: true, index: true },
    sku: { type: String, required: true }, // display name at time of entry
    unit: { type: String, enum: ["gram", "piece"], required: true },

    // Quantity added in this single entry (e.g., 1000 grams, or 24 pieces)
    qty: { type: Number, required: true, min: 0 },

    // YYYY-MM-DD for Africa/Lagos (fast grouping)
    dayKey: { type: String, required: true, index: true },

    note: { type: String, default: "" },
  },
  { timestamps: true }
);

inventoryStockSchema.index({ dayKey: 1, slug: 1 });
inventoryStockSchema.index({ createdAt: -1 });

const InventoryStock =
  mongoose.models.InventoryStock || mongoose.model("InventoryStock", inventoryStockSchema);

export default InventoryStock;

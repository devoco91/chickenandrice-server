// models/Food.js
import mongoose from "mongoose";

const foodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String }, // URL or local path
    description: { type: String },
    category: { type: String, required: true },

    // Flags
    isAvailable: { type: Boolean, default: true }, // in stock or not
    isPopular: { type: Boolean, default: false },  // trending items

    readyTime: { type: Number, default: 15 }, // in minutes
  },
  { timestamps: true }
);

const Food = mongoose.model("Food", foodSchema);

export default Food;

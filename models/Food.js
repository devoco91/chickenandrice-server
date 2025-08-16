const mongoose = require("mongoose");

const foodSchema = new mongoose.Schema(
  {
    name: String,
    price: Number,
    image: String,
    description: String,
    category: String,
    isAvailable: { type: Boolean, default: true },
    isPopular: { type: Boolean, default: false },
    readyTime: Number
  },
  { timestamps: true }
);

module.exports = mongoose.model("Food", foodSchema);

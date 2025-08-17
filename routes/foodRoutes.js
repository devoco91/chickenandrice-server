const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Food = require("../models/Food");

const router = express.Router();

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

/**
 * @route   POST /api/foods
 * @desc    Create new food
 */
router.post("/", upload.single("imageFile"), async (req, res) => {
  try {
    const { name, price, description, category, isAvailable, isPopular, image: imageUrl } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: "Name and price are required" });
    }

    let image = "";
    if (req.file) {
      image = `/uploads/${req.file.filename}`;
    } else if (imageUrl && imageUrl.trim() !== "") {
      image = imageUrl.trim();
    }

    const food = new Food({
      name: name.trim(),
      price: parseFloat(price),
      description: description ? description.trim() : "",
      category: category || "Main",
      isAvailable: isAvailable === "true" || isAvailable === true,
      isPopular: isPopular === "true" || isPopular === true,
      image,
    });

    const savedFood = await food.save();
    res.status(201).json(savedFood);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @route   GET /api/foods
 * @desc    Get all foods
 */
router.get("/", async (req, res) => {
  try {
    const foods = await Food.find().sort({ createdAt: -1 });
    res.json(foods);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route   GET /api/foods/sides-drinks
 * @desc    Get only sides and drinks
 */
router.get("/sides-drinks", async (req, res) => {
  try {
    const items = await Food.find({
      category: { $in: ["Side", "Drink"] },
      isAvailable: true,
    }).sort({ createdAt: -1 });

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route   PUT /api/foods/:id
 * @desc    Update food
 */
router.put("/:id", upload.single("imageFile"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, description, category, isAvailable, isPopular, image: imageUrl } = req.body;

    const existing = await Food.findById(id);
    if (!existing) return res.status(404).json({ error: "Food not found" });

    let image = existing.image;
    if (req.file) {
      image = `/uploads/${req.file.filename}`;
    } else if (imageUrl && imageUrl.trim() !== "") {
      image = imageUrl.trim();
    }

    const updatedData = {
      name: name ? name.trim() : existing.name,
      price: price ? parseFloat(price) : existing.price,
      description: description !== undefined ? description.trim() : existing.description,
      category: category || existing.category,
      isAvailable: isAvailable === "true" || isAvailable === true,
      isPopular: isPopular === "true" || isPopular === true,
      image,
    };

    const updatedFood = await Food.findByIdAndUpdate(id, updatedData, { new: true });
    res.json(updatedFood);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @route   DELETE /api/foods/:id
 * @desc    Delete food
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const food = await Food.findById(id);

    if (!food) return res.status(404).json({ error: "Food not found" });

    // Delete file if stored locally
    if (food.image && food.image.startsWith("/uploads/")) {
      const filePath = path.join(__dirname, `..${food.image}`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await Food.findByIdAndDelete(id);
    res.json({ message: "Food deleted" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;

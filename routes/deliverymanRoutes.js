// routes/deliverymanRoutes.js
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Deliveryman from "../models/Deliveryman.js";

const router = express.Router();

// 🔐 Auth Middleware
function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token provided" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // ✅ attach decoded info (id + role)
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

/**
 * @route   POST /api/delivery/signup
 */
router.post("/signup", async (req, res) => {
  try {
    const { name, email, phone, password, address, dateOfBirth } = req.body;
    if (!name || !email || !phone || !password || !address) {
      return res.status(400).json({ message: "All required fields must be filled" });
    }

    const existing = await Deliveryman.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newDeliveryman = new Deliveryman({
      name,
      email,
      phone,
      password: hashedPassword,
      address,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      isOnline: false,
      role: "deliveryman",
    });

    await newDeliveryman.save();

    const token = jwt.sign(
      { id: newDeliveryman._id, role: newDeliveryman.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(201).json({
      message: "Signup successful",
      token,
      user: { ...newDeliveryman.toObject(), password: undefined },
    });
  } catch (error) {
    console.error("❌ Signup error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   POST /api/delivery/login
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const deliveryman = await Deliveryman.findOne({ email });
    if (!deliveryman) return res.status(404).json({ message: "Not found" });

    const match = await bcrypt.compare(password, deliveryman.password);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: deliveryman._id, role: deliveryman.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    const updatedDeliveryman = await Deliveryman.findByIdAndUpdate(
      deliveryman._id,
      { isOnline: true },
      { new: true }
    ).select("-password");

    console.log(
      `🟢 ${updatedDeliveryman.name} logged in → ONLINE (role: ${updatedDeliveryman.role})`
    );

    res.json({ token, user: updatedDeliveryman.toObject() });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Server error during login" });
  }
});

/**
 * @route   GET /api/delivery
 * @desc    Get all deliverymen (admin only)
 */
router.get("/", auth, async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admins only." });
    }
    const deliverymen = await Deliveryman.find().select("-password");
    res.json(deliverymen);
  } catch (err) {
    console.error("❌ Error fetching deliverymen:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;

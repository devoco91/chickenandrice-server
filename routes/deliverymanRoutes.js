import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Deliveryman from "../models/Deliveryman.js";
import Order from "../models/Order.js";

const router = express.Router();

// 🔐 Auth Middleware
function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token provided" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.deliverymanId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

/**
 * @route   POST /api/delivery/signup
 * @desc    Deliveryman signup
 */
router.post("/signup", async (req, res) => {
  try {
    const { name, email, phone, password, address, dateOfBirth } = req.body;

    if (!name || !email || !phone || !password || !address) {
      return res.status(400).json({ message: "All required fields must be filled" });
    }

    const existingDeliveryman = await Deliveryman.findOne({ email });
    if (existingDeliveryman) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newDeliveryman = new Deliveryman({
      name,
      email,
      phone,
      password: hashedPassword,
      address,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      isOnline: false,
    });

    await newDeliveryman.save();

    const token = jwt.sign(
      { id: newDeliveryman._id, role: "deliveryman" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(201).json({
      message: "Signup successful",
      token,
      deliveryman: { ...newDeliveryman.toObject(), password: undefined }
    });
  } catch (error) {
    console.error("❌ Signup error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   POST /api/delivery/login
 * @desc    Deliveryman login
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const deliveryman = await Deliveryman.findOne({ email });
    if (!deliveryman) return res.status(404).json({ message: "Not found" });

    const match = await bcrypt.compare(password, deliveryman.password);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: deliveryman._id, role: "deliveryman" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    const updatedDeliveryman = await Deliveryman.findByIdAndUpdate(
      deliveryman._id,
      { isOnline: true },
      { new: true }
    ).select("-password");

    console.log(`🟢 ${updatedDeliveryman.name} logged in → ONLINE`);

    res.json({ token, deliveryman: updatedDeliveryman });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Server error during login" });
  }
});

/**
 * @route   POST /api/delivery/logout
 * @desc    Logout deliveryman
 */
router.post("/logout", auth, async (req, res) => {
  try {
    const deliveryman = await Deliveryman.findById(req.deliverymanId);
    if (!deliveryman) return res.status(404).json({ message: "Deliveryman not found" });

    deliveryman.isOnline = false;
    await deliveryman.save();

    res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("❌ Logout error:", err);
    res.status(500).json({ message: "Server error during logout" });
  }
});

/**
 * @route   PATCH /api/delivery/status
 * @desc    Update deliveryman online status
 */
router.patch("/status", auth, async (req, res) => {
  try {
    const { isOnline } = req.body;
    const deliveryman = await Deliveryman.findById(req.deliverymanId);

    if (!deliveryman) return res.status(404).json({ message: "Deliveryman not found" });

    deliveryman.isOnline = !!isOnline;
    await deliveryman.save();

    console.log(`📦 ${deliveryman.name} → ${isOnline ? "ONLINE" : "OFFLINE"}`);

    res.json({
      message: "Status updated successfully",
      isOnline: deliveryman.isOnline,
      deliveryman: { ...deliveryman.toObject(), password: undefined }
    });
  } catch (err) {
    console.error("❌ Status update error:", err);
    res.status(500).json({ message: "Server error updating status" });
  }
});

/**
 * @route   GET /api/delivery
 * @desc    Get all deliverymen with their status (online/offline)
 */
router.get("/", async (req, res) => {
  try {
    const deliverymen = await Deliveryman.find().select("-password");
    res.json({ deliverymen });
  } catch (err) {
    console.error("❌ Error fetching deliverymen:", err);
    res.status(500).json({ message: "Server error fetching deliverymen" });
  }
});

/**
 * @route   GET /api/delivery/my-orders
 * @desc    Get all orders assigned to the logged-in deliveryman
 */
router.get("/my-orders", auth, async (req, res) => {
  try {
    const orders = await Order.find({ assignedTo: req.deliverymanId })
      .sort({ createdAt: -1 })
      .populate("assignedTo", "name email phone isOnline");

    res.json({ orders });
  } catch (err) {
    console.error("❌ Error fetching my orders:", err);
    res.status(500).json({ message: "Server error fetching orders" });
  }
});

export default router;

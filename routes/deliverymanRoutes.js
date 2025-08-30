// ================================
// backend/routes/deliverymanRoutes.js
// ================================
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
    req.user = decoded; // attach decoded info (id + role)
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// ================================
// 📌 Helper: pick deliveryman with fewest active orders
// ================================
const pickSmartDeliveryman = async (excludeId = null) => {
  const query = { isOnline: true };
  if (excludeId) query._id = { $ne: excludeId };

  const online = await Deliveryman.find(query);
  if (!online?.length) return null;

  const loads = await Promise.all(
    online.map(async (dm) => {
      const active = await Order.countDocuments({
        assignedTo: dm._id,
        status: { $in: ["pending", "assigned", "in-transit"] },
      });
      return { deliveryman: dm, activeOrders: active };
    })
  );

  loads.sort((a, b) => a.activeOrders - b.activeOrders);
  return loads[0].deliveryman;
};

// 📌 Auto-assign pending orders
const autoAssignPendingOrders = async () => {
  const pendingOrders = await Order.find({ status: "pending" }).sort({ createdAt: 1 });
  for (const order of pendingOrders) {
    const deliveryman = await pickSmartDeliveryman();
    if (!deliveryman) break;
    order.assignedTo = deliveryman._id;
    order.status = "assigned";
    await order.save();
  }
};

// ================================
// 📌 Signup
// ================================
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
    res.status(500).json({ message: "Server error" });
  }
});

// ================================
// 📌 Login
// ================================
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

    await autoAssignPendingOrders();

    res.json({ token, user: updatedDeliveryman.toObject() });
  } catch (err) {
    res.status(500).json({ message: "Server error during login" });
  }
});

// 📌 Logout
router.post("/logout", auth, async (req, res) => {
  try {
    const deliveryman = await Deliveryman.findByIdAndUpdate(
      req.user.id,
      { isOnline: false },
      { new: true }
    ).select("-password");
    if (!deliveryman) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Logged out successfully", user: deliveryman });
  } catch (err) {
    res.status(500).json({ message: "Server error during logout" });
  }
});

// 📌 Toggle Online/Offline
router.put("/status", auth, async (req, res) => {
  try {
    const { isOnline } = req.body;
    const deliveryman = await Deliveryman.findByIdAndUpdate(
      req.user.id,
      { isOnline },
      { new: true }
    ).select("-password");
    if (!deliveryman) return res.status(404).json({ message: "Not found" });
    if (isOnline) await autoAssignPendingOrders();
    res.json({ user: deliveryman });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ================================
// 📌 Profile
// ================================
router.get("/profile", auth, async (req, res) => {
  try {
    const deliveryman = await Deliveryman.findById(req.user.id).select("-password");
    if (!deliveryman) return res.status(404).json({ message: "Deliveryman not found" });
    res.json(deliveryman);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});



// ================================
// 📌 Order Actions
// ================================

// Accept order → stays "assigned"

router.post("/orders/:id/accept", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("assignedTo", "name phone email");
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (String(order.assignedTo?._id) !== req.user.id) {
      return res.status(403).json({ message: "Not your order" });
    }

    // ✅ Move to accepted state
    order.status = "accepted";
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Decline order → reassign or fallback to pending
router.post("/orders/:id/decline", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (String(order.assignedTo) !== req.user.id) {
      return res.status(403).json({ message: "Not your order" });
    }

    const newDm = await pickSmartDeliveryman(req.user.id);
    if (newDm) {
      order.assignedTo = newDm._id;
      order.status = "assigned";
    } else {
      order.assignedTo = null;
      order.status = "pending";
    }

    await order.save();
    await order.populate("assignedTo", "name phone email");
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Mark In-Transit
router.post("/orders/:id/in-transit", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (String(order.assignedTo) !== req.user.id)
      return res.status(403).json({ message: "Not your order" });

    order.status = "in-transit";
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Mark Delivered
router.post("/orders/:id/deliver", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (String(order.assignedTo) !== req.user.id)
      return res.status(403).json({ message: "Not your order" });

    order.status = "delivered";
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ================================
// 📌 Get all delivered orders for this deliveryman
// ================================
router.get("/orders/history", auth, async (req, res) => {
  try {
    const orders = await Order.find({
      assignedTo: req.user.id,
      status: "delivered",
    }).sort({ updatedAt: -1 });

    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});




// 📌 Get all active (non-delivered) orders assigned to logged-in deliveryman
router.get("/orders/assigned", auth, async (req, res) => {
  try {
    const orders = await Order.find({
      assignedTo: req.user.id,
      status: { $in: ["assigned", "in-transit"] }
    }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ================================
// 📌 Get all deliverymen (admin view)
// ================================
router.get("/all", async (req, res) => {
  try {
    const deliverymen = await Deliveryman.find().select("-password");
    res.json(deliverymen);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


export default router;

import express from "express";
import Order from "../models/Order.js";
import { auth, authorizeRoles } from "../middleware/auth.js";

const router = express.Router();

// =========================
// Create Order (Anyone - no login required)
// =========================
router.post("/", async (req, res) => {
  try {
    const order = new Order(req.body);
    await order.save();
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =========================
// Get All Orders (Admin only)
// =========================
router.get("/", auth, authorizeRoles("admin"), async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// =========================
// Get Single Order (Admin OR order owner)
// =========================
router.get("/:id", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (req.user.role !== "admin" && order.customerId?.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to view this order" });
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// =========================
// Delete Order (Admin only)
// =========================
router.delete("/:id", auth, authorizeRoles("admin"), async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json({ message: "Order deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete order" });
  }
});

export default router;

import express from "express";
import Order from "../models/Order.js";
import Deliveryman from "../models/Deliveryman.js";
import { auth, authorizeRoles } from "../middleware/auth.js";

const router = express.Router();

// Create Order
router.post("/", async (req, res) => {
  try {
    const order = new Order(req.body);
    await order.save();
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all orders (Admin only)
router.get("/", auth, authorizeRoles("admin"), async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("assignedTo", "name email phone isOnline")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Get assigned orders (Deliveryman only)
router.get("/assigned", auth, authorizeRoles("deliveryman"), async (req, res) => {
  try {
    const orders = await Order.find({ assignedTo: req.user.id }).sort({ createdAt: -1 });
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch assigned orders" });
  }
});

// Update order (Admin or assigned deliveryman)
router.put("/:id", auth, async (req, res) => {
  try {
    const { status, assignedTo } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (req.user.role === "admin") {
      if (status) order.status = status;
      if (assignedTo) {
        const deliveryman = await Deliveryman.findById(assignedTo);
        if (!deliveryman) return res.status(404).json({ error: "Deliveryman not found" });
        order.assignedTo = deliveryman._id;
        order.assignedToName = deliveryman.name;
        order.status = "assigned";
      }
    }

    if (req.user.role === "deliveryman") {
      if (!order.assignedTo || order.assignedTo.toString() !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to update this order" });
      }
      if (status) order.status = status;
    }

    await order.save();
    const updatedOrder = await Order.findById(order._id).populate("assignedTo", "name email phone isOnline");
    res.json(updatedOrder);
  } catch (err) {
    res.status(500).json({ error: "Failed to update order" });
  }
});

// Delete order (Admin only)
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

const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Deliveryman = require("../models/Deliveryman");

// Middleware logger (helpful in dev)
router.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.originalUrl}`);
  next();
});

/**
 * @route   POST /api/orders
 * @desc    Create new order
 */
router.post("/", async (req, res) => {
  try {
    const {
      items, customerName, houseNumber, street, landmark,
      phone, total, specialNotes
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Order must contain items" });
    }
    if (!customerName || !houseNumber || !street || !phone) {
      return res.status(400).json({ error: "Customer info is required" });
    }

    const newOrder = new Order({
      items,
      customerName,
      houseNumber,
      street,
      landmark,
      phone,
      total,
      specialNotes,
      orderDate: new Date(),
      status: "pending",
    });

    const savedOrder = await newOrder.save();
    res.status(201).json(savedOrder);
  } catch (err) {
    console.error("❌ Error saving order:", err);
    res.status(500).json({ error: "Server error creating order" });
  }
});

/**
 * @route   GET /api/orders
 * @desc    Get orders (with optional filters)
 */
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
    if (req.query.status) filter.status = req.query.status;

    const orders = await Order.find(filter).populate("assignedTo");
    res.json(orders);
  } catch (err) {
    console.error("❌ Error fetching orders:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @route   PUT /api/orders/:id/assign
 * @desc    Assign deliveryman to order
 */
router.put("/:id/assign", async (req, res) => {
  try {
    const { deliverymanId } = req.body;
    if (!deliverymanId) {
      return res.status(400).json({ error: "Deliveryman ID is required" });
    }

    const deliveryman = await Deliveryman.findById(deliverymanId);
    if (!deliveryman) {
      return res.status(404).json({ error: "Deliveryman not found" });
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { assignedTo: deliverymanId, status: "assigned" },
      { new: true }
    ).populate("assignedTo");

    if (!updatedOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(updatedOrder);
  } catch (err) {
    console.error("❌ Error assigning deliveryman:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @route   PUT /api/orders/:id
 * @desc    Update order fields (status, deliveryman, payment, notes)
 */
router.put("/:id", async (req, res) => {
  const { status, assignedTo, assignedToName, paymentStatus, specialNotes } = req.body;

  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const updateFields = {};

    // Assign by deliveryman name (alt method)
    if (assignedToName) {
      const deliveryman = await Deliveryman.findOne({ name: assignedToName });
      if (!deliveryman) return res.status(404).json({ error: "Deliveryman not found" });
      updateFields.assignedTo = deliveryman._id;
      updateFields.status = "assigned";
    }

    if (status) updateFields.status = status;
    if (assignedTo !== undefined) updateFields.assignedTo = assignedTo;
    if (paymentStatus !== undefined) updateFields.paymentStatus = paymentStatus;
    if (specialNotes !== undefined) updateFields.specialNotes = specialNotes;

    if (!updateFields.status) {
      return res.status(400).json({ error: "Status is required" });
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true }
    ).populate("assignedTo");

    res.json(updatedOrder);
  } catch (err) {
    console.error("❌ Error updating order:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @route   DELETE /api/orders/:id
 * @desc    Delete order
 */
router.delete("/:id", async (req, res) => {
  try {
    const deletedOrder = await Order.findByIdAndDelete(req.params.id);
    if (!deletedOrder) return res.status(404).json({ error: "Order not found" });

    res.json({ message: "Order deleted successfully", order: deletedOrder });
  } catch (err) {
    console.error("❌ Error deleting order:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;

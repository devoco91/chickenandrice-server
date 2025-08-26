// ================================
// backend/routes/orders.js
// ================================
import express from "express";
import Order from "../models/Order.js";
import Deliveryman from "../models/Deliveryman.js";
import { auth, authorizeRoles } from "../middleware/auth.js";

const router = express.Router();

// 📌 Picks online deliveryman with least active orders
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

// 📌 Normalizes any incoming location into valid GeoJSON Point
function normalizeGeoLocation(raw) {
  const fallback = { type: "Point", coordinates: [3.3792, 6.5244] }; // Lagos fallback

  if (!raw) return fallback;

  // ✅ Case 1: Already GeoJSON
  if (raw.type === "Point" && Array.isArray(raw.coordinates)) {
    let [lng, lat] = raw.coordinates.map((n) => Number(n));
    if (Number.isNaN(lng) || Number.isNaN(lat)) throw new Error("location.coordinates must be numbers");

    // If client mistakenly sent [lat, lng], auto-fix
    const looksReversed = Math.abs(lng) <= 90 && Math.abs(lat) > 90;
    if (looksReversed) [lng, lat] = [lat, lng];

    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("location.coordinates out of range");

    return { type: "Point", coordinates: [lng, lat] };
  }

  // ✅ Case 2: { lat, lng }
  if (raw.lat != null && raw.lng != null) {
    let lat = Number(raw.lat),
      lng = Number(raw.lng);

    if (Number.isNaN(lat) || Number.isNaN(lng)) throw new Error("location.lat/lng must be numbers");
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("location.lat/lng out of range");

    return { type: "Point", coordinates: [lng, lat] };
  }

  // ❌ Unknown shape → fallback
  return fallback;
}

// ================================
// 📌 Create Order
// ================================
router.post("/", async (req, res) => {
  try {
    const body = req.body || {};

    // Sanitize items
    const items = Array.isArray(body.items)
      ? body.items.map((it) => ({
          name: it.name,
          quantity: Number(it.quantity),
          price: Number(it.price),
        }))
      : [];

    // Totals (compute if not provided)
    const subtotal = Number(
      body.subtotal ??
        items.reduce((s, it) => s + (Number(it.price) * Number(it.quantity) || 0), 0)
    );
    const tax = Number(body.tax ?? 0);
    const deliveryFee = Number(body.deliveryFee ?? 0);
    const total = Number(body.total ?? subtotal + tax + deliveryFee);

    // Normalize location robustly
    const normalizedLocation = normalizeGeoLocation(body.location);

    const orderData = {
      items,
      customerName: body.customerName,
      phone: body.phone,
      houseNumber: body.houseNumber,
      street: body.street,
      landmark: body.landmark,
      specialNotes: body.specialNotes ?? body.notes ?? "",
      location: normalizedLocation,
      subtotal,
      tax,
      deliveryFee,
      total,
    };

    const order = new Order(orderData);

    // Auto-assign deliveryman
    const deliveryman = await pickSmartDeliveryman();
    if (deliveryman) {
      order.assignedTo = deliveryman._id;
      order.status = "assigned";
    }

    await order.save();
    await order.populate("assignedTo", "name email phone isOnline");

    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({
      error: err.message,
      receivedLocation: req.body?.location ?? null,
      hint: 'Send GeoJSON {type:"Point", coordinates:[lng,lat]} or {lat,lng}.',
    });
  }
});

// ================================
// 📌 Admin: list all
// ================================
router.get("/", auth, authorizeRoles("admin"), async (_req, res) => {
  try {
    const orders = await Order.find()
      .populate("assignedTo", "name email phone isOnline")
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// ================================
// 📌 Deliveryman: get assigned
// ================================
router.get("/assigned", auth, authorizeRoles("deliveryman"), async (req, res) => {
  try {
    const orders = await Order.find({ assignedTo: req.user.id })
      .populate("assignedTo", "name email phone isOnline")
      .sort({ createdAt: -1 });

    res.json({ orders });
  } catch {
    res.status(500).json({ error: "Failed to fetch assigned orders" });
  }
});

// ================================
// 📌 Update Order
// ================================
router.put("/:id", auth, async (req, res) => {
  try {
    const { status, assignedTo } = req.body;
    let order = await Order.findById(req.params.id).populate(
      "assignedTo",
      "name email phone isOnline"
    );
    if (!order) return res.status(404).json({ error: "Order not found" });

    // ✅ Admin updates
    if (req.user.role === "admin") {
      if (status) order.status = status;
      if (assignedTo) {
        const dm = await Deliveryman.findById(assignedTo);
        if (!dm) return res.status(404).json({ error: "Deliveryman not found" });
        order.assignedTo = dm._id;
        order.status = "assigned";
      }
    }

    // ✅ Deliveryman updates
    if (req.user.role === "deliveryman") {
      if (!order.assignedTo || order.assignedTo._id.toString() !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to update this order" });
      }

      if (status === "accepted") order.status = "in-transit";
      else if (status === "rejected") {
        order.assignedTo = null;
        order.status = "pending";

        const newDm = await pickSmartDeliveryman(req.user.id);
        if (newDm) {
          order.assignedTo = newDm._id;
          order.status = "assigned";
        }
      } else if (status === "delivered") order.status = "delivered";
      else if (status) order.status = status;
    }

    await order.save();
    await order.populate("assignedTo", "name email phone isOnline");

    res.json(order);
  } catch {
    res.status(500).json({ error: "Failed to update order" });
  }
});

// ================================
// 📌 Delete Order
// ================================
router.delete("/:id", auth, authorizeRoles("admin"), async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json({ message: "Order deleted successfully" });
  } catch {
    res.status(500).json({ error: "Failed to delete order" });
  }
});

export default router;

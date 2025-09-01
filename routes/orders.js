// ================================
// backend/routes/orders.js
// ================================
import express from "express";
import Order from "../models/Order.js";
import Deliveryman from "../models/Deliveryman.js";
import { geocodeAddress } from "../utils/geocode.js";

const router = express.Router();

// ================================
// 📌 Pick online deliveryman with least active orders
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
        status: { $in: ["pending", "assigned", "accepted", "in-transit"] },
      });
      return { deliveryman: dm, activeOrders: active };
    })
  );

  loads.sort((a, b) => a.activeOrders - b.activeOrders);
  return loads[0].deliveryman;
};

// Helpers to clean special prefixes added by client when using geolocation
const stripAutoDetected = (s = "") =>
  String(s).replace(/^Auto\s*detected,?\s*/i, "").trim();

const stripUsingCurrentLocation = (s = "") =>
  String(s).replace(/^Using\s+(your\s+)?current\s+location,?\s*/i, "").trim();

// ================================
// 📌 Normalize location into GeoJSON
// ================================
async function normalizeGeoLocation(raw, street = "", houseNumber = "") {
  const fallback = { type: "Point", coordinates: [3.3792, 6.5244] };

  if (!raw && !street) return fallback;

  // Already a Point
  if (raw?.type === "Point" && Array.isArray(raw.coordinates)) {
    let [lng, lat] = raw.coordinates.map(Number);
    const looksReversed = Math.abs(lng) <= 90 && Math.abs(lat) > 90;
    if (looksReversed) [lng, lat] = [lat, lng];
    return { type: "Point", coordinates: [lng, lat] };
  }

  // Raw lat/lng
  if (raw?.lat != null && raw?.lng != null) {
    return { type: "Point", coordinates: [Number(raw.lng), Number(raw.lat)] };
  }

  // Clean client-set prefixes before geocoding
  const cleanedStreet = stripUsingCurrentLocation(stripAutoDetected(street));
  if (cleanedStreet) {
    const address = `${houseNumber || ""} ${cleanedStreet}`.trim();
    const coords = await geocodeAddress(address);
    if (coords) {
      return { type: "Point", coordinates: [coords.lng, coords.lat] };
    }
  }

  return fallback;
}

// ================================
// 📌 Create Order
// ================================
router.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    const orderType = body.orderType || "online";

    const items = Array.isArray(body.items)
      ? body.items.map((it) => ({
          // ✅ keep foodId from client (if your schema uses it)
          foodId: it.foodId,
          name: it.name,
          quantity: Number(it.quantity),
          price: Number(it.price),
        }))
      : [];

    const subtotal = Number(
      body.subtotal ??
        items.reduce((s, it) => s + (Number(it.price) * Number(it.quantity) || 0), 0)
    );
    const tax = Number(body.tax ?? 0);
    const deliveryFee = Number(body.deliveryFee ?? 0);
    const total = Number(body.total ?? subtotal + tax + deliveryFee);

    const rawPM = String(body.paymentMode || "").toLowerCase();
    let paymentMode = undefined;
    if (["cash", "card", "upi"].includes(rawPM)) paymentMode = rawPM;
    else if (rawPM === "transfer") paymentMode = "upi";

    let orderData = {
      items,
      subtotal,
      tax,
      deliveryFee,
      total,
      specialNotes: body.specialNotes ?? "",
      orderType,
      paymentMode,
    };

    if (orderType === "online") {
      const normalizedLoc = await normalizeGeoLocation(
        body.location,
        body.street,
        body.houseNumber
      );

      orderData = {
        ...orderData,
        customerName: body.customerName,
        phone: body.phone,
        houseNumber: body.houseNumber,
        // ✅ Strip both "Auto detected" and "Using current location" before saving
        street: stripUsingCurrentLocation(stripAutoDetected(body.street || "")),
        landmark: body.landmark,
        location: normalizedLoc,
      };
    } else {
      orderData = {
        ...orderData,
        customerName: body.customerName || "Walk-in Customer",
        phone: body.phone || "",
        houseNumber: "",
        street: "",
        landmark: "",
        location: { type: "Point", coordinates: [3.3792, 6.5244] },
      };
    }

    const order = new Order(orderData);

    if (orderType === "online") {
      const deliveryman = await pickSmartDeliveryman();
      if (deliveryman) {
        order.assignedTo = deliveryman._id;
        order.status = "assigned";
      } else {
        order.status = "pending";
      }
    }

    await order.save();
    await order.populate("assignedTo", "name email phone isOnline");
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message, received: req.body });
  }
});

// ================================
// 📌 Get Orders (all / filter by type)
// ================================
router.get("/", async (req, res) => {
  try {
    const { type } = req.query;
    let filter = {};
    if (type) filter.orderType = type;

    const orders = await Order.find(filter).populate("assignedTo", "name email phone isOnline");
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📌 Get Online Orders
router.get("/online", async (req, res) => {
  try {
    const orders = await Order.find({ orderType: "online" }).populate(
      "assignedTo",
      "name email phone isOnline"
    );
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📌 Get In-store Orders
router.get("/instore", async (req, res) => {
  try {
    const orders = await Order.find({ orderType: "instore" });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📌 Get Assigned Orders
router.get("/assigned", async (req, res) => {
  try {
    const orders = await Order.find({
      status: "assigned",
      orderType: { $in: ["online", null] },
    }).populate("assignedTo", "name email phone isOnline");

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================================
// 📌 Update Order Status
// ================================
router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["accepted", "in-transit", "delivered", "cancelled"].includes(status)) {
      return res.status(400).json({ error: "Invalid status update" });
    }

    const order = await Order.findByIdAndUpdate(id, { status }, { new: true }).populate(
      "assignedTo",
      "name email phone isOnline"
    );

    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================================
// 📌 Get Orders by Status
// ================================
router.get("/status/:status", async (req, res) => {
  try {
    const { status } = req.params;
    if (
      !["pending", "assigned", "accepted", "in-transit", "delivered", "cancelled"].includes(
        status
      )
    ) {
      return res.status(400).json({ error: "Invalid status filter" });
    }

    const orders = await Order.find({ status, orderType: "online" }).populate(
      "assignedTo",
      "name email phone isOnline"
    );
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================================
// 📌 Delete Order (Admin)
// ================================
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await Order.findByIdAndDelete(id);
  res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

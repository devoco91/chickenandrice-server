const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    items: [
      {
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
      },
    ],

    // Customer Info
    customerName: { type: String, required: true },
    phone: { type: String, required: true },
    houseNumber: { type: String, required: true },
    street: { type: String, required: true },
    landmark: { type: String },

    // Financials
    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paymentMode: { type: String, enum: ["cash", "card", "upi"], default: "cash" }, // 🔑 added for frontend compatibility
    paymentStatus: { type: String, enum: ["unpaid", "paid"], default: "unpaid" },

    specialNotes: { type: String },

    // Order Status
    status: {
      type: String,
      enum: ["pending", "assigned", "in-transit", "delivered", "cancelled", "completed"],
      default: "pending",
    },

    // Delivery assignment
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deliveryman",
    },
    assignedToName: { type: String }, // denormalized for quick lookup

    // Dates
    orderDate: { type: Date, default: Date.now },
    deliveryDate: { type: Date },
    deliveryTime: { type: Date },

    // Geo location (optional)
    location: {
      lat: { type: Number },
      lng: { type: Number },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);

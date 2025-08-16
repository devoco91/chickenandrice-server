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
    customerName: { type: String, required: true },
    houseNumber: { type: String, required: true },
    street: { type: String, required: true },
    landmark: { type: String },
    phone: { type: String, required: true },
    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    total: { type: Number, required: true },
    specialNotes: { type: String },


    status: {
      type: String,
      enum: ["pending", "assigned", "in-transit", "delivered", "cancelled", "completed"],
      default: "pending",
    },

      assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deliveryman",
    },

    
    assignedToName: { type: String },

    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid",
    },

    deliveryTime: { type: Date },
    deliveryDate: { type: Date },
    orderDate: { type: Date, default: Date.now },

    location: {
      lat: { type: Number },
      lng: { type: Number },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);

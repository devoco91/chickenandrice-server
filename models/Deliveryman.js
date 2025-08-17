const mongoose = require("mongoose");

const deliverymanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // store hashed password only
    address: { type: String, required: true },
    dateOfBirth: { type: Date },
    profilePicture: { type: String },

    // Status fields
    isActive: { type: Boolean, default: true },   // whether still employed
    isOnline: { type: Boolean, default: false },  // live availability

    // Role (for JWT + RBAC)
    role: { type: String, enum: ["deliveryman"], default: "deliveryman" },

    // Tracking fields (optional, useful later)
    lastLogin: { type: Date },
    assignedOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Deliveryman", deliverymanSchema);

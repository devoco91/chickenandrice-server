const mongoose = require("mongoose");

const deliverymanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    address: { type: String, required: true },
    dateOfBirth: { type: Date },
    profilePicture: { type: String },

    isActive: { type: Boolean, default: true },
    isOnline: { type: Boolean, default: false }, 
  },
  { timestamps: true }
);

module.exports = mongoose.model("Deliveryman", deliverymanSchema);

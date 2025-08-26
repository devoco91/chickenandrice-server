import mongoose from "mongoose";

const deliverymanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    address: {
      type: String,
      required: true, // ✅ added to match signup route
    },
    dateOfBirth: {
      type: Date, // ✅ optional field
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ["deliveryman", "admin"], // ✅ added enum for safety
      default: "deliveryman",
    },
  },
  { timestamps: true }
);

const Deliveryman = mongoose.model("Deliveryman", deliverymanSchema);

export default Deliveryman;

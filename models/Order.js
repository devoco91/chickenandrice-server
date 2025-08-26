import mongoose from "mongoose";

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
    phone: { type: String, required: true },
    houseNumber: { type: String, required: true },
    street: { type: String, required: true },
    landmark: { type: String },

    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    total: { type: Number, default: 0 },

    paymentMode: {
      type: String,
      enum: ["cash", "card", "upi"],
      default: "cash",
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid",
    },

    specialNotes: { type: String },

    status: {
      type: String,
      enum: ["pending", "assigned", "in-transit", "delivered", "cancelled", "completed"],
      default: "pending",
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deliveryman",
      default: null,
    },

    orderDate: { type: Date, default: Date.now },
    deliveryDate: { type: Date },
    deliveryTime: { type: Date },

    // ✅ GeoJSON Point (required)
    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lng, lat]
        required: true,
        default: [3.3792, 6.5244], // ✅ Lagos fallback
      },
    },
  },
  { timestamps: true }
);

// ✅ Geospatial index for queries like nearest deliveryman
orderSchema.index({ location: "2dsphere" });

// ✅ Auto-calc totals before save
orderSchema.pre("save", function (next) {
  if (this.items && this.items.length > 0) {
    this.subtotal = this.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
  }
  this.tax = this.tax || 0;
  this.deliveryFee = this.deliveryFee || 0;
  this.total = this.subtotal + this.tax + this.deliveryFee;
  next();
});

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
export default Order;

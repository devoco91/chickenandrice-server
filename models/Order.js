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

    // Customer Info
    customerName: { type: String, required: true },
    phone: { type: String, required: true },
    houseNumber: { type: String, required: true },
    street: { type: String, required: true },
    landmark: { type: String },

    // Financials (auto-calculated)
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
    assignedToName: { type: String }, // quick lookup

    // Dates
    orderDate: { type: Date, default: Date.now },
    deliveryDate: { type: Date },
    deliveryTime: { type: Date },

    // Geo location
    location: {
      lat: { type: Number },
      lng: { type: Number },
    },
  },
  { timestamps: true }
);

// Auto-calculate financials before saving
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

const Order = mongoose.model("Order", orderSchema);

export default Order;

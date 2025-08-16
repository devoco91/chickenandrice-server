const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes 
const foodRoutes = require("./routes/foodRoutes");
const orderRoutes = require("./routes/orders");
const deliverymanRoutes = require("./routes/deliverymanRoutes");

app.use("/api/foods", foodRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/deliverymen", deliverymanRoutes);  

app.get("/test-image", (req, res) => {
  res.send(`
    <h1>Image Test</h1>
    <img src="/uploads/sample.jpg" alt="Test Image" style="width:200px;" />
  `);
});

const Order = require("./models/Order");
app.get("/orders-test", async (req, res) => {
  console.log("🧪 GET /orders-test hit");
  try {
    const orders = await Order.find().populate("items.foodId");
    console.log("Orders found:", orders.length);
    res.json(orders);
  } catch (error) {
    console.error("❌ Error fetching orders:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/", (req, res) => {
  res.send("🍔 Fast Food API is live!");
});

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => {
    console.log("✅ MongoDB connected");
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
  });

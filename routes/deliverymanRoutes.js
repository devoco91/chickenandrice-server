const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Deliveryman = require("../models/Deliveryman");

const router = express.Router();

// Middleware
function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token provided" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.deliverymanId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// Signup
router.post("/signup", async (req, res) => {
  try {
    const { name, email, phone, password, address, dateOfBirth } = req.body;

    if (!name || !email || !phone || !password || !address) {
      return res.status(400).json({ message: "All required fields must be filled" });
    }

    const existingDeliveryman = await Deliveryman.findOne({ email });
    if (existingDeliveryman) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newDeliveryman = new Deliveryman({
      name,
      email,
      phone,
      password: hashedPassword,
      address,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      isOnline: false
    });

    await newDeliveryman.save();

    res.status(201).json({ message: "Signup successful", deliveryman: newDeliveryman });
  } catch (error) {
    console.error("❌ Signup error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const deliveryman = await Deliveryman.findOne({ email });
    if (!deliveryman) return res.status(404).json({ message: "Not found" });

    const match = await bcrypt.compare(password, deliveryman.password);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: deliveryman._id, role: "deliveryman" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );


    const updatedDeliveryman = await Deliveryman.findByIdAndUpdate(
      deliveryman._id,
      { isOnline: true },
      { new: true }
    );

    console.log(`🟢 Deliveryman ${updatedDeliveryman.name} logged in and set to ONLINE:`, updatedDeliveryman.isOnline);

    res.json({ token, deliveryman: updatedDeliveryman });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Server error during login" });
  }
});

// Logout 
router.post("/logout", auth, async (req, res) => {
  try {
    const deliveryman = await Deliveryman.findById(req.deliverymanId);
    if (!deliveryman) return res.status(404).json({ message: "Deliveryman not found" });

    deliveryman.isOnline = false;
    await deliveryman.save();

    res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("❌ Logout error:", err);
    res.status(500).json({ message: "Server error during logout" });
  }
});

// Update online status 
router.patch("/status", auth, async (req, res) => {
  try {
    const { isOnline } = req.body;
    const deliveryman = await Deliveryman.findById(req.deliverymanId);
    
    if (!deliveryman) return res.status(404).json({ message: "Deliveryman not found" });

    deliveryman.isOnline = isOnline;
    await deliveryman.save();

    console.log(`📦 Deliveryman ${deliveryman.name} status updated to: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);

    res.json({ 
      message: "Status updated successfully", 
      isOnline: deliveryman.isOnline,
      deliveryman: deliveryman 
    });
  } catch (err) {
    console.error("❌ Status update error:", err);
    res.status(500).json({ message: "Server error updating status" });
  }
});

// Dashboard (protected route)
router.get("/dashboard", auth, async (req, res) => {
  try {
    const deliveryman = await Deliveryman.findById(req.deliverymanId).select("-password");
    if (!deliveryman) return res.status(404).json({ message: "User not found" });

    res.json({ message: "Dashboard access granted", deliveryman });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get all 
router.get("/", async (req, res) => {
  try {

    const onlyOnline = req.query.online === "true" || req.query.isOnline === "true";

    const query = onlyOnline ? { isOnline: true } : {};
    const deliverymen = await Deliveryman.find(query).select("-password");

    console.log(`📋 Query: ${JSON.stringify(query)}, Found: ${deliverymen.length} deliverymen`);
    if (onlyOnline) {
      console.log(`🟢 Online deliverymen:`, deliverymen.map(d => `${d.name} (${d.isOnline})`));
    }

    res.json(deliverymen);
  } catch (err) {
    console.error("❌ Error fetching deliverymen:", err);
    res.status(500).json({ message: "Server error fetching deliverymen" });
  }
});

module.exports = router;
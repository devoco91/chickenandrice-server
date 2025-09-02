// routes/adminAuth.js
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const safeEmail = String(email).toLowerCase().trim();
    const admin = await Admin.findOne({ email: safeEmail });
    if (!admin) {
      // keep your semantics; or change to 401 if you prefer not to leak existence
      return res.status(404).json({ message: "Admin not found" });
    }

    if (!admin.password) {
      return res.status(500).json({ message: "Account not configured for password login" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("❌ JWT_SECRET is not set");
      return res.status(500).json({ message: "Server config error (JWT)" });
    }

    const token = jwt.sign(
      { id: admin._id, role: "admin" },
      secret,
      { expiresIn: "1d" }
    );

    return res.json({
      token,
      user: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: "admin",
      }
    });
  } catch (err) {
    console.error("❌ Admin login error:", err);
    return res.status(500).json({ message: "Server error during admin login" });
  }
});

export default router;

// server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";

// Routes
import foodRoutes from "./routes/foodRoutes.js";
import orderRoutes from "./routes/orders.js";
import deliverymanRoutes from "./routes/deliverymanRoutes.js";
import checkMealRoutes from "./routes/checkMeal.js";
import adminAuthRoutes from "./routes/auth.js";
import foodPopRoutes from "./routes/foodPopRoutes.js";
import drinkPopRoutes from "./routes/drinkPopRoutes.js";
import proteinPopRoutes from "./routes/proteinPopRoutes.js";
import emailRoutes from "./routes/emailRoutes.js";
import drinkRoutes from "./routes/drinkRoutes.js";

dotenv.config();

const app = express();

// ===== Middleware =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== CORS setup =====
const allowedOrigins = [
  "https://chickenandrice.net",
  "https://www.chickenandrice.net",
  /\.chickenandrice\.net$/,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://chickenandrice.vercel.app",
];

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true);
      if (
        allowedOrigins.includes(origin) ||
        allowedOrigins.some((o) => o instanceof RegExp && o.test(origin))
      ) return cb(null, true);
      console.error("❌ Blocked by CORS:", origin);
      return cb(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true,
  })
);

// ===== Static uploads =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// IMPORTANT:
// - In PRODUCTION (Fly): UPLOAD_DIR should be /data/uploads (volume)
// - In LOCAL DEV (Windows): set UPLOAD_DIR=uploads to keep it in the project
const UPLOAD_DIR = (process.env.UPLOAD_DIR || "/data/uploads").replace(/\\/g, "/");
const LEGACY_DIR = path.join(__dirname, "uploads");

// Ensure both exist; they may be the same or different depending on env
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch {}
try { fs.mkdirSync(LEGACY_DIR, { recursive: true }); } catch {}

// Serve from volume (or configured dir) first
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, { etag: true, maxAge: "365d", immutable: true })
);
// Fallback: also serve the local project ./uploads folder
app.use(
  "/uploads",
  express.static(LEGACY_DIR, { etag: true, maxAge: "365d", immutable: true })
);

// Debug helper — see where files are and what’s visible
app.get("/__uploads", (_req, res) => {
  try {
    const volumeFiles = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : [];
    const legacyFiles = fs.existsSync(LEGACY_DIR) ? fs.readdirSync(LEGACY_DIR) : [];
    res.json({
      uploadDir: UPLOAD_DIR,
      volumeFiles,
      legacyDir: LEGACY_DIR,
      legacyFiles,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== MongoDB connect =====
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// ===== Routes =====
app.get("/", (_req, res) => {
  res.json({ message: "Welcome to Chicken & Rice API 🍚🍗" });
});

app.get("/api/protected", (req, res) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    res.json({ message: "Protected route access granted", user: decoded });
  });
});

app.use("/api/foods", foodRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/delivery", deliverymanRoutes);
app.use("/api/check-meal", checkMealRoutes);
app.use("/api/admin", adminAuthRoutes);
app.use("/api/foodpop", foodPopRoutes);
app.use("/api/drinkpop", drinkPopRoutes);
app.use("/api/proteinpop", proteinPopRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/drinks", drinkRoutes);

// ===== Email Utility =====
export const sendEmail = async ({ subject, html }) => {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  const mailOptions = {
    from: `"Chicken & Rice" <${process.env.EMAIL_USER}>`,
    to: "chickenandriceltd@gmail.com",
    subject,
    html,
  };

  await transporter.sendMail(mailOptions);
};

// ===== Error handler =====
app.use((err, _req, res, _next) => {
  console.error("⚠️ Server error:", err.message);
  res.status(500).json({ error: "Something went wrong" });
});

// ===== Start server =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

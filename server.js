// server.js
import "dotenv/config"; // Load env FIRST

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";

import { upload } from "./middleware/upload.js";

// Routes
import foodRoutes from "./routes/foodRoutes.js";
import orderRoutes from "./routes/orders.js";
import deliverymanRoutes from "./routes/deliverymanRoutes.js";
import checkMealRoutes from "./routes/checkMeal.js";
// ❗ Ensure this matches the file you showed earlier:
import adminAuthRoutes from "./routes/auth.js";
import foodPopRoutes from "./routes/foodPopRoutes.js";
import drinkPopRoutes from "./routes/drinkPopRoutes.js";
import proteinPopRoutes from "./routes/proteinPopRoutes.js";
import emailRoutes from "./routes/emailRoutes.js";
import drinkRoutes from "./routes/drinkRoutes.js";

const app = express();

// ===== Basics / Hardening =====
app.set("trust proxy", 1);

// JSON/body parsing MUST come before routes
app.use(express.json({ limit: "1mb" }));
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
      ) {
        return cb(null, true);
      }
      console.error("❌ Blocked by CORS:", origin);
      return cb(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true,
  })
);

// ===== Static uploads =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DEV (Windows): set UPLOAD_DIR=uploads
// PROD (Fly):    set UPLOAD_DIR=/data/uploads  and mount the volume to /data
const UPLOAD_DIR = (process.env.UPLOAD_DIR || "/data/uploads").replace(/\\/g, "/");
const LEGACY_DIR = path.join(__dirname, "uploads");

// Ensure both exist (safe if already exist)
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch {}
try { fs.mkdirSync(LEGACY_DIR, { recursive: true }); } catch {}

console.log("🗂  Using UPLOAD_DIR:", UPLOAD_DIR);
console.log("🗂  Legacy ./uploads:", LEGACY_DIR);
try {
  fs.writeFileSync(path.join(UPLOAD_DIR, ".write-test"), "ok");
  console.log("✍️  UPLOAD_DIR write test: OK");
  fs.unlinkSync(path.join(UPLOAD_DIR, ".write-test"));
} catch (e) {
  console.error("❌ Cannot write to UPLOAD_DIR:", e.message);
}

// Serve from UPLOAD_DIR first, fallback to ./uploads
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, { etag: true, maxAge: "365d", immutable: true })
);
app.use(
  "/uploads",
  express.static(LEGACY_DIR, { etag: true, maxAge: "365d", immutable: true })
);

// ===== Health / Diagnostics =====
app.get("/healthz", (_req, res) => {
  const ok = Boolean(process.env.MONGO_URI) && Boolean(process.env.JWT_SECRET);
  res.json({
    ok,
    mongoUriConfigured: Boolean(process.env.MONGO_URI),
    jwtConfigured: Boolean(process.env.JWT_SECRET),
    uploadDir: UPLOAD_DIR,
  });
});

app.get("/__uploads", (_req, res) => {
  try {
    const volumeFiles = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : [];
    const legacyFiles = fs.existsSync(LEGACY_DIR) ? fs.readdirSync(LEGACY_DIR) : [];
    res.json({ uploadDir: UPLOAD_DIR, volumeFiles, legacyDir: LEGACY_DIR, legacyFiles });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/__diag/ping", (_req, res) => {
  const canWrite = (() => {
    try { fs.accessSync(UPLOAD_DIR, fs.constants.W_OK); return true; } catch { return false; }
  })();
  res.json({ ok: true, uploadDir: UPLOAD_DIR, canWrite });
});

app.post("/__diag/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  console.log("[__diag/upload]", "dest=", UPLOAD_DIR, "filename=", req.file.filename);
  return res.json({
    saved: true,
    uploadDir: UPLOAD_DIR,
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`,
  });
});

// ===== MongoDB connect =====
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI is not set");
}
if (!process.env.JWT_SECRET) {
  console.warn("⚠️  JWT_SECRET is not set — login will fail in production");
}
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// ===== Root & Protected test =====
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

// ===== Routes =====
app.use("/api/foods", foodRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/delivery", deliverymanRoutes); // /login, /signup, etc.
app.use("/api/check-meal", checkMealRoutes);
app.use("/api/admin", adminAuthRoutes);      // /login
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

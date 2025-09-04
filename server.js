// backend/server.js
import "dotenv/config";

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { upload } from "./middleware/upload.js";

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

// NEW
import inventoryRoutes from "./routes/inventory.js";
import InventoryItem from "./models/InventoryItem.js"; // for a harmless index cleanup on boot

const app = express();
app.set("trust proxy", 1);

// body parsing
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// CORS
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

// Static uploads
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = (process.env.UPLOAD_DIR || "/data/uploads").replace(/\\/g, "/");
const LEGACY_DIR = path.join(__dirname, "uploads");

try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch {}
try { fs.mkdirSync(LEGACY_DIR, { recursive: true }); } catch {}

app.use("/uploads", express.static(UPLOAD_DIR, { etag: true, maxAge: "365d", immutable: true }));
app.use("/uploads", express.static(LEGACY_DIR, { etag: true, maxAge: "365d", immutable: true }));

// Health/diagnostics
app.get("/healthz", (_req, res) => {
  const ok = Boolean(process.env.MONGO_URI) && Boolean(process.env.JWT_SECRET);
  res.json({
    ok,
    mongoUriConfigured: Boolean(process.env.MONGO_URI),
    jwtConfigured: Boolean(process.env.JWT_SECRET),
    uploadDir: UPLOAD_DIR,
  });
});

app.get("/__diag/ping", (_req, res) => {
  const canWrite = (() => {
    try { fs.accessSync(UPLOAD_DIR, fs.constants.W_OK); return true; } catch { return false; }
  })();
  res.json({ ok: true, uploadDir: UPLOAD_DIR, canWrite });
});

app.post("/__diag/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  return res.json({
    saved: true,
    uploadDir: UPLOAD_DIR,
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`,
  });
});

// Mongo
if (!process.env.MONGO_URI) console.error("❌ MONGO_URI is not set");
if (!process.env.JWT_SECRET) console.warn("⚠️ JWT_SECRET is not set");

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB connected");

    // Remove any accidental old index on "name" to prevent E11000 (harmless if missing)
    try {
      const coll = mongoose.connection.db.collection("inventoryitems");
      const idx = await coll.indexExists("name_1");
      if (idx) {
        await coll.dropIndex("name_1");
        console.log("🧹 Dropped legacy index inventoryitems.name_1");
      }
    } catch {}
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// Root + protected test
app.get("/", (_req, res) => res.json({ message: "Welcome to Chicken & Rice API 🍚🍗" }));

app.get("/api/protected", (req, res) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    res.json({ message: "Protected route access granted", user: decoded });
  });
});

// Routes
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

// NEW
app.use("/api/inventory", inventoryRoutes);

// Error handler
app.use((err, _req, res, _next) => {
  console.error("⚠️ Server error:", err?.message || err);
  res.status(500).json({ error: "Something went wrong" });
});

// --- Midnight auto-reset (local server time) ---
function msToNextMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0); // next local midnight
  return next.getTime() - now.getTime();
}

async function runDailyReset() {
  try {
    // Call the route handler directly to keep logic in one place
    const { default: inventoryRouter } = await import("./routes/inventory.js");
    // We can't easily call the router; instead, do what it does:
    const InventoryMovement = (await import("./models/InventoryMovement.js")).default;
    const InventoryItem = (await import("./models/InventoryItem.js")).default;

    await InventoryMovement.create({ type: "reset", sku: "ALL", slug: "all", unit: "piece", note: "Daily reset" });
    await InventoryItem.deleteMany({});
    await InventoryMovement.deleteMany({});
    console.log("🕛 Inventory auto-reset completed.");
  } catch (e) {
    console.error("Auto-reset failed:", e?.message || e);
  } finally {
    setTimeout(runDailyReset, msToNextMidnight());
  }
}
setTimeout(runDailyReset, msToNextMidnight());

const PORT = process.env.PORT || 5000; // 5000 to avoid Next dev conflict
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// server.js
import express from "express";
import fs from "fs";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import path from "path";
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

// ✅ NEW: upload routes
import uploadRoutes from "./routes/uploadRoutes.js";

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
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        allowedOrigins.some((o) => o instanceof RegExp && o.test(origin))
      ) {
        return callback(null, true);
      }
      console.error("❌ Blocked by CORS:", origin);
      return callback(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true,
  })
);

// ===== Static uploads (persistent first, then legacy fallback) =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Persistent dir (Fly volume / env), fallback to /data/uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/data/uploads";
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (e) {
  console.warn("⚠️ Could not ensure UPLOAD_DIR exists:", e?.message);
}

// 1) Serve from persistent directory
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    etag: true,
    maxAge: "365d",
    immutable: true,
  })
);

// 2) Fallback to project ./uploads for old/local files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ===== MongoDB connect =====
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// ===== Routes =====
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Chicken & Rice API 🍚🍗" });
});

app.get("/api/protected", (req, res) => {
  console.log(
    "🔑 Checking JWT_SECRET:",
    process.env.JWT_SECRET ? "[LOADED]" : "[MISSING]"
  );

  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error("❌ JWT verification failed:", err.message);
      return res.status(403).json({ error: "Invalid token" });
    }
    res.json({ message: "Protected route access granted", user: decoded });
  });
});

// Modular routes
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

// ✅ NEW: upload routes (saves into UPLOAD_DIR and returns public URL)
app.use("/api", uploadRoutes);

// ✅ Tiny debug endpoint to list files (optional; remove later)
app.get("/__uploads", (req, res) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    res.json({ dir: UPLOAD_DIR, count: files.length, files });
  } catch (e) {
    res.status(500).json({ error: e?.message || "list failed" });
  }
});

// ===== Email Utility =====
export const sendEmail = async ({ subject, html }) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // App password
      },
    });

    const mailOptions = {
      from: `"Chicken & Rice" <${process.env.EMAIL_USER}>`,
      to: "chickenandriceltd@gmail.com",
      subject,
      html,
    };

    await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully");
  } catch (err) {
    console.error("❌ Email sending failed:", err.message);
    throw err;
  }
};

// ===== Error handler =====
app.use((err, req, res, next) => {
  console.error("⚠️ Server error:", err.message);
  res.status(500).json({ error: "Something went wrong" });
});

// ===== Start server =====
const PORT = process.env.PORT || 3000;
let portSource = process.env.PORT
  ? process.env.FLY_APP_NAME
    ? "Fly (injected)"
    : ".env/local"
  : "default (3000)";

app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Server running on http://localhost:${PORT} [${portSource}]`)
);

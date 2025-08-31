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

// ===== Static uploads (volume first, with migrate+symlink safety) =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/data/uploads"; // volume
const LEGACY_DIR = path.join(__dirname, "uploads"); // old path inside app

try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch {}

// Migrate files from ./uploads → /data/uploads once, then symlink ./uploads → /data/uploads
try {
  const legacyExists = fs.existsSync(LEGACY_DIR);
  if (legacyExists) {
    const isLink = fs.lstatSync(LEGACY_DIR).isSymbolicLink?.() || false;
    if (!isLink) {
      // move any existing files
      try {
        for (const item of fs.readdirSync(LEGACY_DIR)) {
          const src = path.join(LEGACY_DIR, item);
          const dst = path.join(UPLOAD_DIR, item);
          try {
            fs.renameSync(src, dst);
          } catch {
            /* ignore conflicts */
          }
        }
      } catch {}
      // replace folder with symlink
      try {
        fs.rmSync(LEGACY_DIR, { recursive: true, force: true });
      } catch {}
      try {
        fs.symlinkSync(UPLOAD_DIR, LEGACY_DIR);
      } catch {}
    }
  } else {
    // create symlink if missing
    try {
      fs.symlinkSync(UPLOAD_DIR, LEGACY_DIR);
    } catch {}
  }
} catch (e) {
  console.log("uploads symlink setup:", e.message);
}

// Serve from volume first
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    etag: true,
    maxAge: "365d",
    immutable: true,
  })
);

// Fallback: serve from legacy path (now typically a symlink)
app.use("/uploads", express.static(LEGACY_DIR));

// Debug helper
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
  console.log("🔑 Checking JWT_SECRET:", process.env.JWT_SECRET ? "[LOADED]" : "[MISSING]");
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
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
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
app.use((err, _req, res, _next) => {
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://localhost:${PORT} [${portSource}]`);
});

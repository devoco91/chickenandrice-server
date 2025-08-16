// server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS setup (allow main + www + subdomains)
const allowedOrigins = [
  "https://chickenandrice.net",
  "https://www.chickenandrice.net",
  /\.chickenandrice\.net$/,
  "http://localhost:3000",   // ✅ for local frontend dev
  "http://127.0.0.1:3000",   // ✅ some browsers resolve localhost as 127.0.0.1
  "https://chickenandrice.vercel.app/"
];
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow curl / Postman
      if (
        allowedOrigins.includes(origin) ||
        allowedOrigins.some((o) => o instanceof RegExp && o.test(origin))
      ) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// Connect MongoDB
const MONGO_URI = process.env.MONGO_URI;
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// Sample route
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Chicken & Rice API 🍚🍗" });
});

// Example auth route (JWT protected, expand later)
app.get("/protected", (req, res) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    res.json({ message: "Protected route access granted", user: decoded });
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("⚠️ Server error:", err.stack);
  res.status(500).json({ error: "Something went wrong" });
});

// Start server with clear source logging
let portSource = "default (3000)";
if (process.env.PORT) {
  portSource = process.env.FLY_APP_NAME ? "Fly (injected)" : ".env/local";
}
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Server running on port ${PORT} [${portSource}]`)
);

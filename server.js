import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// Middleware
app.use(express.json());

// ✅ CORS setup – only allow your frontend
const allowedOrigins = [
  "https://chickenandrice.net",
  "https://www.chickenandrice.net",
  "http://localhost:3000" // for local dev
];
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// ✅ MongoDB connection
const MONGO_URI = process.env.MONGO_URI;
mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1); // stop app if DB connection fails
  });

// ✅ Routes
app.get("/", (req, res) => {
  res.send("🚀 FastFolder Backend API is running on chickenandrice.net");
});

// Example protected route (JWT to be added later)
app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello from FastFolder backend!" });
});

// ✅ Health check (important for Fly.io / Vercel)
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// seedAdmin.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import Admin from "./models/Admin.js"; // ✅ use Admin model

dotenv.config();

async function seedAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const email = "chickenandriceltd@gmail.com";
    const plainPassword = "@Business25";

    // Check if already exists
    let admin = await Admin.findOne({ email });

    if (admin) {
      console.log("⚠️ Admin already exists:", email);
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    admin = new Admin({
      name: "Admin",
      email,
      password: hashedPassword,
      role: "admin"
    });

    await admin.save();
    console.log("✅ Admin seeded:", email);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding admin:", err.message);
    process.exit(1);
  }
}

seedAdmin();

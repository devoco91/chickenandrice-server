// middlewares/upload.js
import multer from "multer";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = (process.env.UPLOAD_DIR || "/data/uploads").replace(/\\/g, "/");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function sanitizeName(original) {
  const ext = path.extname(original).toLowerCase();
  const base = path.basename(original, ext);
  const safe = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${Date.now()}-${safe}${ext}`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, sanitizeName(file.originalname)),
});

export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

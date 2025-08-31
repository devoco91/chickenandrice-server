// middleware/upload.js
import multer from "multer";
import path from "path";
import fs from "fs";

// Resolve the upload dir at request time (so it works even if dotenv
// wasn’t loaded before this module was imported).
const resolveUploadDir = () => {
  const dir = (process.env.UPLOAD_DIR || "/data/uploads").replace(/\\/g, "/");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
  return dir;
};

function sanitizeName(original) {
  const ext = path.extname(original).toLowerCase();
  const base = path.basename(original, ext);
  const safe = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${Date.now()}-${safe}${ext}`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = resolveUploadDir();
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, sanitizeName(file.originalname)),
});

export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

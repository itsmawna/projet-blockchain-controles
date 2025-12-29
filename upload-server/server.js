import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";

const app = express();
app.use(cors());

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, Date.now() + "_" + safe);
  },
});
const upload = multer({ storage });

// Upload
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).send("No file");
  const uri = `http://localhost:5001/files/${req.file.filename}`;
  res.json({ uri });
});

// Télécharger
app.use("/files", express.static(UPLOAD_DIR));

app.listen(5001, () => console.log("Upload server: http://localhost:5001"));

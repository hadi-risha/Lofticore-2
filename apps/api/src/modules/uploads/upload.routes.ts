import { Router } from "express";
import multer from "multer";
import { ErrorCode, HttpStatus, Role } from "@lofticore/shared";
import { AppError } from "../../lib/app-error";
import { saveFile } from "../../lib/storage";
import { authenticate, authorize } from "../../middleware/authenticate";
import { requireApproved } from "../../middleware/require-approved";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_MODEL_BYTES = 25 * 1024 * 1024;

// The browser says what a file is, but it can lie. The first bytes are the truth.
function detectImage(buf: Buffer): "jpg" | "png" | "webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (
    buf.length > 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "png";
  if (
    buf.length > 12 &&
    buf.subarray(0, 4).toString() === "RIFF" &&
    buf.subarray(8, 12).toString() === "WEBP"
  )
    return "webp";
  return null;
}

// A binary glTF (.glb) file starts with the four letters "glTF".
const isGlb = (buf: Buffer) => buf.length > 12 && buf.subarray(0, 4).toString("latin1") === "glTF";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});
const uploadModel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MODEL_BYTES, files: 1 },
});

export const uploadRouter = Router();

uploadRouter.post(
  "/image",
  authenticate,
  authorize(Role.SELLER, Role.ADMIN, Role.SUPER_ADMIN),
  requireApproved,
  upload.single("file"),
  async (req, res) => {
    if (!req.file)
      throw AppError.badRequest("Choose an image to upload.", ErrorCode.UPLOAD_INVALID_FILE);
    const ext = detectImage(req.file.buffer);
    if (!ext)
      throw AppError.badRequest(
        "Only JPG, PNG or WebP images are allowed.",
        ErrorCode.UPLOAD_INVALID_FILE,
      );
    res.status(HttpStatus.CREATED).json({ url: await saveFile(req.file.buffer, ext, "image") });
  },
);

// 3D models for the AR view
uploadRouter.post(
  "/model",
  authenticate,
  authorize(Role.SELLER, Role.ADMIN, Role.SUPER_ADMIN),
  requireApproved,
  uploadModel.single("file"),
  async (req, res) => {
    if (!req.file)
      throw AppError.badRequest("Choose a 3D model to upload.", ErrorCode.UPLOAD_INVALID_FILE);
    if (!isGlb(req.file.buffer)) {
      throw AppError.badRequest(
        "Only .glb 3D model files are allowed.",
        ErrorCode.UPLOAD_INVALID_FILE,
      );
    }
    res.status(HttpStatus.CREATED).json({ url: await saveFile(req.file.buffer, "glb", "model") });
  },
);

// multer reports oversize files with its own error type
export const uploadErrorHandler = (err: unknown): AppError | null => {
  if (err instanceof multer.MulterError) {
    return AppError.badRequest(
      err.code === "LIMIT_FILE_SIZE"
        ? "That file is too large. Images can be up to 5 MB and 3D models up to 25 MB."
        : "That upload wasn't accepted.",
      ErrorCode.UPLOAD_INVALID_FILE,
    );
  }
  return null;
};

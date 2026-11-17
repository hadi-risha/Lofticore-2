import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env";
import { PUBLIC_DIR } from "../config/paths";
import { AppError } from "./app-error";
import { ErrorCode, HttpStatus } from "@lofticore/shared";

// Where uploaded files live. Callers only ever see the URL that comes back, so the
// rest of the app doesn't know (or care) whether it's a folder or Cloudinary.
//
//   STORAGE=local       a folder on this server. Fine for development. On most free
//                       hosts the disk is wiped on every deploy, so don't use it there.
//   STORAGE=cloudinary  Cloudinary's free tier. Survives deploys and is served from a CDN.

export const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");

export type FileKind = "image" | "model";

async function saveLocal(buf: Buffer, ext: string) {
  await mkdir(UPLOAD_DIR, { recursive: true });
  // a random name: nothing the user typed ever reaches the file system
  const name = `${randomBytes(12).toString("hex")}.${ext}`;
  await writeFile(path.join(UPLOAD_DIR, name), buf);
  return `/static/uploads/${name}`;
}

// Cloudinary's REST upload, signed with the API secret. No SDK needed for this.
async function saveCloudinary(buf: Buffer, ext: string, kind: FileKind) {
  const {
    CLOUDINARY_CLOUD_NAME: cloud,
    CLOUDINARY_API_KEY: key,
    CLOUDINARY_API_SECRET: secret,
  } = env;
  if (!cloud || !key || !secret) throw unavailable();

  const timestamp = String(Math.floor(Date.now() / 1000));
  const folder = "lofticore";
  // parameters are signed in alphabetical order, joined with &, followed by the secret
  const signature = createHash("sha1")
    .update(`folder=${folder}&timestamp=${timestamp}${secret}`)
    .digest("hex");

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)]), `upload.${ext}`);
  form.append("api_key", key);
  form.append("timestamp", timestamp);
  form.append("folder", folder);
  form.append("signature", signature);

  // 3D models aren't images, so they go in as "raw" files
  const resource = kind === "model" ? "raw" : "image";
  let res: Response;
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${resource}/upload`, {
      method: "POST",
      body: form,
    });
  } catch {
    throw unavailable();
  }
  const data = (await res.json().catch(() => null)) as { secure_url?: string } | null;
  if (!res.ok || !data?.secure_url) throw unavailable();
  return data.secure_url;
}

const unavailable = () =>
  new AppError(
    HttpStatus.SERVICE_UNAVAILABLE,
    ErrorCode.SERVICE_UNAVAILABLE,
    "We couldn't store that file right now. Please try again.",
  );

export const saveFile = (buf: Buffer, ext: string, kind: FileKind = "image") =>
  env.STORAGE === "cloudinary" ? saveCloudinary(buf, ext, kind) : saveLocal(buf, ext);

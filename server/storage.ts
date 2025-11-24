import fs from 'fs';
import path from 'path';
import { ENV } from './_core/env';

// Local storage implementation
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "").replace(/\\/g, "/");
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const filePath = path.join(UPLOADS_DIR, key);
  
  // Ensure directory exists for the file
  const fileDir = path.dirname(filePath);
  if (!fs.existsSync(fileDir)) {
    await fs.promises.mkdir(fileDir, { recursive: true });
  }

  let buffer: Buffer;
  if (Buffer.isBuffer(data)) {
    buffer = data;
  } else if (typeof data === 'string') {
    buffer = Buffer.from(data);
  } else {
    buffer = Buffer.from(data);
  }

  await fs.promises.writeFile(filePath, buffer);

  // Return local URL
  // Assuming the server mounts /uploads
  const url = `/uploads/${key}`;
  
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string; }> {
  const key = normalizeKey(relKey);
  const filePath = path.join(UPLOADS_DIR, key);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${key}`);
  }

  return {
    key,
    url: `/uploads/${key}`,
  };
}

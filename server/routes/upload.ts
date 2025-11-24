import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import * as db from "../db";
import { Throttle } from "../utils/throttle";
import { logger } from "../_core/logger";

// Temporary storage for chunks
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const TEMP_DIR = path.join(UPLOADS_DIR, "temp");

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

export async function uploadChunkHandler(req: Request, res: Response) {
  try {
    const { uploadId, chunkIndex } = req.params;
    
    // 1. Validate session
    const session = await db.getUploadSession(uploadId);
    if (!session) {
      return res.status(404).send("Upload session not found");
    }

    if (new Date() > session.expiresAt) {
      return res.status(410).send("Upload session expired");
    }

    // 2. Get Speed Limit
    const config = await db.getSystemConfig("uploadSpeedLimit");
    const speedLimitMB = config ? parseFloat(config.configValue) : 0;
    const speedLimitBytes = speedLimitMB > 0 ? speedLimitMB * 1024 * 1024 : 0;

    // 3. Prepare chunk path
    const chunkDir = path.join(TEMP_DIR, uploadId);
    if (!fs.existsSync(chunkDir)) {
      fs.mkdirSync(chunkDir, { recursive: true });
    }
    // Use simple index as filename to match router expectation
    const chunkPath = path.join(chunkDir, chunkIndex);

    // 4. Stream to file with throttling
    const fileStream = fs.createWriteStream(chunkPath);
    
    if (speedLimitBytes > 0) {
      const throttle = new Throttle(speedLimitBytes);
      req.pipe(throttle).pipe(fileStream);
    } else {
      req.pipe(fileStream);
    }

    req.on('end', () => {
      // Wait for file stream to finish
    });

    fileStream.on('finish', () => {
      res.status(200).send("Chunk uploaded");
    });

    fileStream.on('error', (err) => {
      logger.error("Chunk write error", "Upload", err);
      res.status(500).send("Chunk write error");
    });

  } catch (error) {
    logger.error("Upload chunk handler error", "Upload", error);
    res.status(500).send("Internal Server Error");
  }
}

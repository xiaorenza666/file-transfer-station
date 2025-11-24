import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import * as db from "../db";
import * as bcrypt from "bcryptjs";
import { Throttle } from "../utils/throttle";
import { logger } from "../_core/logger";

export async function downloadHandler(req: Request, res: Response) {
  try {
    const { token } = req.params;
    const password = req.query.p as string | undefined;

    // 1. Get file info
    const file = await db.getFileByShareToken(token);
    if (!file) {
      return res.status(404).send("File not found");
    }

    // 2. Check expiration
    if (file.expiresAt && new Date() > file.expiresAt) {
      await db.markFileAsExpired(file.id);
      return res.status(410).send("File has expired");
    }

    // 3. Verify password
    if (file.password) {
      if (!password) {
        return res.status(401).send("Password required");
      }
      const isValid = await bcrypt.compare(password, file.password);
      if (!isValid) {
        return res.status(403).send("Invalid password");
      }
    }

    // 4. Log download (only if it's a new request, not a partial range resume? 
    // Actually, logging every range request might spam logs. 
    // But for audit, we should probably log "access". 
    // Let's log only if range is 0- or not present, or just log everything for now.)
    // To avoid spamming DB on resume, maybe we can skip if Range header is present and start > 0?
    const range = req.headers.range;
    const isResume = range && !range.startsWith("bytes=0-");
    
    if (!isResume) {
      await db.createFileAccessLog({
        fileId: file.id,
        userId: null, // We don't have user context in this raw handler easily unless we parse cookies
        accessType: 'download',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      
      // Update download count
      await db.updateFileDownloadCount(file.id);
    }

    // 5. Get file path
    // Assuming local storage structure from storage.ts
    const filePath = path.join(process.cwd(), "uploads", file.fileKey);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found on disk");
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    // 6. Get Speed Limit
    const config = await db.getSystemConfig("downloadSpeedLimit");
    const speedLimitMB = config ? parseFloat(config.configValue) : 0;
    const speedLimitBytes = speedLimitMB > 0 ? speedLimitMB * 1024 * 1024 : 0;

    // 7. Handle Range
    let start = 0;
    let end = fileSize - 1;
    let status = 200;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const partialStart = parts[0];
      const partialEnd = parts[1];

      if (!partialStart && partialEnd) {
        // bytes=-500 (last 500 bytes)
        start = fileSize - parseInt(partialEnd, 10);
        end = fileSize - 1;
      } else {
        start = partialStart ? parseInt(partialStart, 10) : 0;
        end = partialEnd ? parseInt(partialEnd, 10) : fileSize - 1;
      }

      // Validate bounds
      if (isNaN(start)) start = 0;
      if (isNaN(end)) end = fileSize - 1;
      
      if (start < 0) start = 0;
      if (end >= fileSize) end = fileSize - 1;

      if (start > end) {
        res.status(416).header("Content-Range", `bytes */${fileSize}`).send();
        return;
      }

      status = 206;
    }

    const chunksize = end - start + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });

    res.writeHead(status, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
    });

    // 8. Stream with Throttling
    if (speedLimitBytes > 0) {
      const throttle = new Throttle(speedLimitBytes);
      
      // Handle client disconnect
      res.on('close', () => {
        fileStream.destroy();
        throttle.destroy();
      });

      fileStream.pipe(throttle).pipe(res);
      
      throttle.on('end', () => {
        if (file.burnAfterRead && end === fileSize - 1) {
           db.deleteFile(file.id).catch(err => logger.error("Failed to burn file", "Download", err));
        }
      });
    } else {
      // Handle client disconnect
      res.on('close', () => {
        fileStream.destroy();
      });

      fileStream.pipe(res);
      
      fileStream.on('end', () => {
        if (file.burnAfterRead && end === fileSize - 1) {
           db.deleteFile(file.id).catch(err => logger.error("Failed to burn file", "Download", err));
        }
      });
    }

    // Handle errors
    fileStream.on("error", (err) => {
      logger.error("Stream error", "Download", err);
      if (!res.headersSent) {
        res.status(500).send("Stream error");
      } else {
        res.end();
      }
    });

  } catch (error) {
    logger.error("Download handler error", "Download", error);
    if (!res.headersSent) {
      res.status(500).send("Internal Server Error");
    }
  }
}

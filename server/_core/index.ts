import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import fs from "fs";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { downloadHandler } from "../routes/download";
import { uploadChunkHandler } from "../routes/upload";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { logger } from "./logger";

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  
  // Request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    const { method, url } = req;
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info(`${method} ${url} ${res.statusCode} - ${duration}ms`, 'HTTP');
    });
    
    next();
  });

  // Configure body parser with larger size limit for file uploads
  // We set a high limit here (1GB) and enforce the actual limit in the application logic
  app.use(express.json({ limit: "1024mb" }));
  app.use(express.urlencoded({ limit: "1024mb", extended: true }));
  
  // Serve uploads directory
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Download route
  app.get("/api/download/:token", downloadHandler);

  // Upload chunk route
  app.post("/api/upload/chunk/:uploadId/:chunkIndex", uploadChunkHandler);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    logger.warn(`Port ${preferredPort} is busy, using port ${port} instead`, 'Server');
  }

  server.listen(port, () => {
    logger.info(`Server running on http://localhost:${port}/`, 'Server');
  });
}

startServer().catch((err) => {
  logger.error('Failed to start server', 'Server', err);
});

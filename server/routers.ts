import { COOKIE_NAME } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { storagePut, storageGet } from "./storage";
import * as crypto from "crypto";
import * as bcrypt from "bcryptjs";
import { sdk } from "./_core/sdk";
import { logger } from "./_core/logger";
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const TEMP_DIR = path.join(UPLOADS_DIR, "temp");

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  
  // Public system config
  public: router({
    getConfig: publicProcedure.query(async () => {
      const maxFileSizeConfig = await db.getSystemConfig("maxFileSize");
      return {
        maxFileSize: maxFileSizeConfig ? parseInt(maxFileSizeConfig.configValue, 10) : 50, // Default 50MB
      };
    }),
  }),

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    // Local email/password register (no verification)
    register: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(6),
        name: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const existing = await db.getUserByEmail(input.email);
        if (existing) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Email already registered' });
        }
        const passwordHash = await bcrypt.hash(input.password, 10);
        const user = await db.createLocalUser({
          email: input.email,
          name: input.name ?? null,
          passwordHash,
        });
        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || '' });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: 365*24*60*60*1000 });
        return { success: true } as const;
      }),

    // Local email/password login
    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(6),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserByEmail(input.email);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
        }
        const ok = await bcrypt.compare(input.password, user.passwordHash);
        if (!ok) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
        }
        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || '' });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: 365*24*60*60*1000 });
        return { success: true } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    // Change password
    changePassword: protectedProcedure
      .input(z.object({
        oldPassword: z.string(),
        newPassword: z.string().min(6),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserByOpenId(ctx.user.openId);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot change password for this user' });
        }
        
        const isValid = await bcrypt.compare(input.oldPassword, user.passwordHash);
        if (!isValid) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Incorrect old password' });
        }
        
        const newHash = await bcrypt.hash(input.newPassword, 10);
        await db.updateUserPassword(user.id, newHash);
        
        return { success: true };
      }),
  }),

  // File operations
  files: router({
    // Initialize chunked upload
    initUpload: publicProcedure
      .input(z.object({
        filename: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        totalChunks: z.number(),
        password: z.string().optional(),
        burnAfterRead: z.boolean().default(false),
        expiresInSeconds: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || null;

        // Check max file size
        const config = await db.getSystemConfig("maxFileSize");
        if (config) {
          const maxFileSizeMB = parseInt(config.configValue, 10);
          if (!isNaN(maxFileSizeMB) && input.fileSize > maxFileSizeMB * 1024 * 1024) {
             throw new TRPCError({ code: 'PAYLOAD_TOO_LARGE', message: `File size exceeds limit of ${maxFileSizeMB}MB` });
          }
        }

        const uploadId = uuidv4();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours to complete upload

        // Store metadata
        const metadata = {
          password: input.password,
          burnAfterRead: input.burnAfterRead,
          expiresInSeconds: input.expiresInSeconds,
        };

        // Calculate real total chunks based on our enforced chunk size
        const chunkSize = 1024 * 1024 * 20; // 20MB
        const realTotalChunks = Math.ceil(input.fileSize / chunkSize);

        await db.createUploadSession({
          uploadId,
          userId,
          filename: input.filename,
          fileSize: input.fileSize,
          mimeType: input.mimeType,
          totalChunks: realTotalChunks,
          metadata: JSON.stringify(metadata),
          expiresAt,
        });

        // Ensure temp directory exists
        const uploadDir = path.join(TEMP_DIR, uploadId);
        await fs.promises.mkdir(uploadDir, { recursive: true });

        return {
          uploadId,
          chunkSize,
        };
      }),

    // Merge chunked upload
    mergeUpload: publicProcedure
      .input(z.object({
        uploadId: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const session = await db.getUploadSession(input.uploadId);
        if (!session) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Upload session not found' });
        }

        // Verify ownership if user is logged in
        if (ctx.user && session.userId && session.userId !== ctx.user.id && ctx.user.role !== 'admin') {
           throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
        }

        const uploadDir = path.join(TEMP_DIR, input.uploadId);
        
        // Check if all chunks exist
        // We assume chunks are named 0, 1, 2...
        // A more robust check would be to list files and count them
        let chunkFiles: string[] = [];
        try {
          chunkFiles = await fs.promises.readdir(uploadDir);
        } catch (e) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to read upload directory' });
        }

        // Filter for numeric filenames only (chunks)
        const chunks = chunkFiles
          .filter(f => !isNaN(parseInt(f)))
          .sort((a, b) => parseInt(a) - parseInt(b));

        if (chunks.length !== session.totalChunks) {
          throw new TRPCError({ 
            code: 'PRECONDITION_FAILED', 
            message: `Missing chunks. Expected ${session.totalChunks}, found ${chunks.length}` 
          });
        }

        // Generate final file location
        const shareToken = crypto.randomBytes(16).toString('hex');
        const randomSuffix = crypto.randomBytes(8).toString('hex');
        const lastDotIndex = session.filename.lastIndexOf('.');
        const name = lastDotIndex !== -1 ? session.filename.substring(0, lastDotIndex) : session.filename;
        const ext = lastDotIndex !== -1 ? session.filename.substring(lastDotIndex) : '';
        
        // We mimic the storage key structure: files/{shareToken}/{filename}
        const fileKey = `files/${shareToken}/${name}-${randomSuffix}${ext}`;
        const finalPath = path.join(UPLOADS_DIR, fileKey);
        const finalDir = path.dirname(finalPath);

        await fs.promises.mkdir(finalDir, { recursive: true });

        // Merge chunks
        // Create a readable stream from chunks and pipe to storagePut
        const { PassThrough } = await import('stream');
        const passThrough = new PassThrough();

        // Start processing chunks asynchronously
        (async () => {
          for (const chunk of chunks) {
            const chunkPath = path.join(uploadDir, chunk);
            const data = await fs.promises.readFile(chunkPath);
            if (!passThrough.write(data)) {
              await new Promise(resolve => passThrough.once('drain', resolve));
            }
          }
          passThrough.end();
        })().catch(err => {
          logger.error("Error reading chunks", err);
          passThrough.destroy(err);
        });

        // Upload to storage (Local or S3)
        const { url: fileUrl } = await storagePut(fileKey, passThrough, session.mimeType || undefined);

        // Clean up temp files
        try {
          await fs.promises.rm(uploadDir, { recursive: true, force: true });
          await db.deleteUploadSession(input.uploadId);
        } catch (e) {
          logger.error("Failed to cleanup temp files", String(e));
        }

        // Parse metadata
        let metadata: any = {};
        try {
          metadata = JSON.parse(session.metadata || '{}');
        } catch (e) {}

        // Hash password if provided
        let hashedPassword: string | undefined;
        if (metadata.password) {
          hashedPassword = await bcrypt.hash(metadata.password, 10);
        }
        
        // Calculate expiration
        let expiresAt: Date | undefined;
        if (metadata.expiresInSeconds) {
          expiresAt = new Date(Date.now() + metadata.expiresInSeconds * 1000);
        }

        // Create file record
        const file = await db.createFile({
          userId: session.userId,
          filename: session.filename,
          fileKey,
          fileUrl: `/uploads/${fileKey}`, // Local storage URL convention
          fileSize: session.fileSize,
          mimeType: session.mimeType,
          shareToken,
          password: hashedPassword,
          burnAfterRead: metadata.burnAfterRead || false,
          expiresAt,
        });

        // Log audit
        if (session.userId) {
          await db.createAuditLog({
            userId: session.userId,
            action: 'file_upload_chunked',
            targetType: 'file',
            targetId: file.id,
            details: JSON.stringify({ filename: session.filename, fileSize: session.fileSize }),
            ipAddress: ctx.req.ip,
          });
        }

        return {
          shareToken: file.shareToken,
          shareUrl: `${ctx.req.protocol}://${ctx.req.get('host')}/share/${file.shareToken}`,
        };
      }),

    // Upload file (public - supports guest uploads)
    upload: publicProcedure
      .input(z.object({
        filename: z.string(),
        fileData: z.string(), // base64 encoded
        mimeType: z.string(),
        fileSize: z.number(),
        password: z.string().optional(),
        burnAfterRead: z.boolean().default(false),
        expiresInSeconds: z.number().optional(), // null means no expiration
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || null;
        
        // Check max file size from config
        const config = await db.getSystemConfig("maxFileSize");
        if (config) {
          const maxFileSizeMB = parseInt(config.configValue, 10);
          if (!isNaN(maxFileSizeMB) && input.fileSize > maxFileSizeMB * 1024 * 1024) {
             throw new TRPCError({ code: 'PAYLOAD_TOO_LARGE', message: `File size exceeds limit of ${maxFileSizeMB}MB` });
          }
        }

        // Generate unique share token
        const shareToken = crypto.randomBytes(16).toString('hex');
        
        // Generate file key with random suffix to prevent enumeration, preserving extension
        const randomSuffix = crypto.randomBytes(8).toString('hex');
        const lastDotIndex = input.filename.lastIndexOf('.');
        const name = lastDotIndex !== -1 ? input.filename.substring(0, lastDotIndex) : input.filename;
        const ext = lastDotIndex !== -1 ? input.filename.substring(lastDotIndex) : '';
        const fileKey = `files/${shareToken}/${name}-${randomSuffix}${ext}`;
        
        // Upload to S3
        const fileBuffer = Buffer.from(input.fileData, 'base64');
        const { url: fileUrl } = await storagePut(fileKey, fileBuffer, input.mimeType);
        
        // Hash password if provided
        let hashedPassword: string | undefined;
        if (input.password) {
          hashedPassword = await bcrypt.hash(input.password, 10);
        }
        
        // Calculate expiration
        let expiresAt: Date | undefined;
        if (input.expiresInSeconds) {
          expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);
          logger.info("File upload with expiration", "Upload", { 
            expiresInSeconds: input.expiresInSeconds,
            expiresAt,
            now: new Date()
          });
        }
        
        // Create file record
        const file = await db.createFile({
          userId,
          filename: input.filename,
          fileKey,
          fileUrl,
          fileSize: input.fileSize,
          mimeType: input.mimeType,
          shareToken,
          password: hashedPassword,
          burnAfterRead: input.burnAfterRead,
          expiresAt,
        });
        
        // Log audit
        if (userId) {
          await db.createAuditLog({
            userId,
            action: 'file_upload',
            targetType: 'file',
            targetId: file.id,
            details: JSON.stringify({ filename: input.filename, fileSize: input.fileSize }),
            ipAddress: ctx.req.ip,
          });
        }
        
        return {
          shareToken: file.shareToken,
          shareUrl: `${ctx.req.protocol}://${ctx.req.get('host')}/share/${file.shareToken}`,
        };
      }),

    // Get file info by share token (public)
    getByShareToken: publicProcedure
      .input(z.object({
        shareToken: z.string(),
        password: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const file = await db.getFileByShareToken(input.shareToken);
        
        if (!file) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'File not found' });
        }
        
        // Check expiration
        if (file.expiresAt) {
          const now = new Date();
          const isExpired = now > file.expiresAt;
          logger.info("Checking file expiration", "File", {
            fileId: file.id,
            expiresAt: file.expiresAt,
            now,
            isExpired,
            expiresAtType: typeof file.expiresAt
          });
          
          if (isExpired) {
            await db.markFileAsExpired(file.id);
            throw new TRPCError({ code: 'NOT_FOUND', message: 'File has expired' });
          }
        }
        
        // Check password
        const requiresPassword = !!file.password;
        let passwordValid = false;
        
        if (requiresPassword) {
          if (!input.password) {
            // Log failed access
            await db.createFileAccessLog({
              fileId: file.id,
              userId: ctx.user?.id ?? null,
              accessType: 'failed_password',
              ipAddress: ctx.req.ip,
              userAgent: ctx.req.get('user-agent'),
            });
            
            return {
              requiresPassword: true,
              passwordValid: false,
              file: null,
            };
          }
          
          passwordValid = await bcrypt.compare(input.password, file.password || '');
          
          if (!passwordValid) {
            await db.createFileAccessLog({
              fileId: file.id,
              userId: ctx.user?.id ?? null,
              accessType: 'failed_password',
              ipAddress: ctx.req.ip,
              userAgent: ctx.req.get('user-agent'),
            });
            
            return {
              requiresPassword: true,
              passwordValid: false,
              file: null,
            };
          }
        }

        // Generate fresh URL if needed (e.g. S3 signed URL)
        let fileUrl = file.fileUrl;
        if (!file.burnAfterRead && (!requiresPassword || passwordValid)) {
          try {
            const { url } = await storageGet(file.fileKey);
            fileUrl = url;
          } catch (e) {
            logger.warn("Failed to generate fresh URL", "File", e);
          }
        }
        
        // Return file info (without password hash)
        return {
          requiresPassword,
          passwordValid: requiresPassword ? passwordValid : true,
          file: {
            id: file.id,
            filename: file.filename,
            fileSize: file.fileSize,
            mimeType: file.mimeType,
            downloadCount: file.downloadCount,
            burnAfterRead: file.burnAfterRead,
            createdAt: file.createdAt,
            // Allow preview for non-burn-after-read files if password is valid (or not required)
            fileUrl: (!file.burnAfterRead && (!requiresPassword || passwordValid)) ? fileUrl : undefined,
          },
        };
      }),

    // Download file
    download: publicProcedure
      .input(z.object({
        shareToken: z.string(),
        password: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const file = await db.getFileByShareToken(input.shareToken);
        
        if (!file) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'File not found' });
        }
        
        // Check expiration
        if (file.expiresAt && new Date() > file.expiresAt) {
          await db.markFileAsExpired(file.id);
          throw new TRPCError({ code: 'NOT_FOUND', message: 'File has expired' });
        }
        
        // Verify password
        if (file.password) {
          if (!input.password) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Password required' });
          }
          const isValid = await bcrypt.compare(input.password, file.password);
          if (!isValid) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid password' });
          }
        }
        
        // Construct download URL
        const protocol = ctx.req.protocol;
        const host = ctx.req.get('host');
        let downloadUrl = `${protocol}://${host}/api/download/${file.shareToken}`;
        if (input.password) {
          downloadUrl += `?p=${encodeURIComponent(input.password)}`;
        }
        
        return {
          fileUrl: downloadUrl,
          filename: file.filename,
        };
      }),

    // Get user's files (protected)
    myFiles: protectedProcedure
      .query(async ({ ctx }) => {
        const files = await db.getUserFiles(ctx.user.id);
        return files.map(f => ({
          id: f.id,
          filename: f.filename,
          fileSize: f.fileSize,
          mimeType: f.mimeType,
          shareToken: f.shareToken,
          downloadCount: f.downloadCount,
          burnAfterRead: f.burnAfterRead,
          expiresAt: f.expiresAt,
          createdAt: f.createdAt,
        }));
      }),

    // Delete user's file (protected)
    delete: protectedProcedure
      .input(z.object({ fileId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const file = await db.getFileById(input.fileId);
        
        if (!file) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'File not found' });
        }
        
        // Check ownership
        if (file.userId !== ctx.user.id && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
        }
        
        await db.deleteFile(input.fileId);
        
        await db.createAuditLog({
          userId: ctx.user.id,
          action: 'file_delete',
          targetType: 'file',
          targetId: input.fileId,
          details: JSON.stringify({ filename: file.filename }),
          ipAddress: ctx.req.ip,
        });
        
        return { success: true };
      }),
  }),

  // Admin operations
  admin: router({
    // Get statistics
    statistics: adminProcedure
      .query(async () => {
        return await db.getStatistics();
      }),

    // Get all users
    users: adminProcedure
      .query(async () => {
        return await db.getAllUsers();
      }),

    // Update user role
    updateUserRole: adminProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(['user', 'admin']),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserRole(input.userId, input.role);
        
        await db.createAuditLog({
          userId: ctx.user.id,
          action: 'user_role_update',
          targetType: 'user',
          targetId: input.userId,
          details: JSON.stringify({ newRole: input.role }),
          ipAddress: ctx.req.ip,
        });
        
        return { success: true };
      }),

    // Get all files
    files: adminProcedure
      .query(async () => {
        return await db.getAllFiles();
      }),

    // Get system config
    getConfig: adminProcedure
      .query(async () => {
        const configs = await db.getAllSystemConfigs();
        const configMap: Record<string, string> = {};
        configs.forEach(c => {
          configMap[c.configKey] = c.configValue;
        });
        return configMap;
      }),

    // Update system config
    updateConfig: adminProcedure
      .input(z.object({
        key: z.string(),
        value: z.string(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.setSystemConfig(input.key, input.value, input.description);
        
        await db.createAuditLog({
          userId: ctx.user.id,
          action: 'config_update',
          targetType: 'config',
          details: JSON.stringify({ key: input.key, value: input.value }),
          ipAddress: ctx.req.ip,
        });
        
        return { success: true };
      }),

    // Get audit logs
    auditLogs: adminProcedure
      .input(z.object({ limit: z.number().default(100) }))
      .query(async ({ input }) => {
        return await db.getAuditLogs(input.limit);
      }),

    // Get access logs
    accessLogs: adminProcedure
      .input(z.object({ limit: z.number().default(100) }))
      .query(async ({ input }) => {
        return await db.getAllAccessLogs(input.limit);
      }),

    // Clean expired files
    cleanExpiredFiles: adminProcedure
      .mutation(async ({ ctx }) => {
        const expiredFiles = await db.getExpiredFiles();
        
        for (const file of expiredFiles) {
          await db.markFileAsExpired(file.id);
        }
        
        await db.createAuditLog({
          userId: ctx.user.id,
          action: 'clean_expired_files',
          details: JSON.stringify({ count: expiredFiles.length }),
          ipAddress: ctx.req.ip,
        });
        
        return { cleaned: expiredFiles.length };
      }),
  }),
});

export type AppRouter = typeof appRouter;

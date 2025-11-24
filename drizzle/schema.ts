import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, bigint } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  /** Optional password hash for local email/password auth */
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Files table - stores file metadata and S3 references
 */
export const files = mysqlTable("files", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID - null for guest uploads */
  userId: int("userId"),
  /** Original filename */
  filename: varchar("filename", { length: 255 }).notNull(),
  /** S3 file key */
  fileKey: text("fileKey").notNull(),
  /** S3 file URL */
  fileUrl: text("fileUrl").notNull(),
  /** File size in bytes */
  fileSize: bigint("fileSize", { mode: "number" }).notNull(),
  /** MIME type */
  mimeType: varchar("mimeType", { length: 127 }),
  /** Share token for accessing the file */
  shareToken: varchar("shareToken", { length: 64 }).notNull().unique(),
  /** Optional password for access */
  password: varchar("password", { length: 255 }),
  /** Burn after reading - delete after first download */
  burnAfterRead: boolean("burnAfterRead").default(false).notNull(),
  /** Expiration timestamp - null means no expiration */
  expiresAt: timestamp("expiresAt"),
  /** Download count */
  downloadCount: int("downloadCount").default(0).notNull(),
  /** File status */
  status: mysqlEnum("status", ["active", "deleted", "expired"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type File = typeof files.$inferSelect;
export type InsertFile = typeof files.$inferInsert;

/**
 * File access logs - track downloads and access attempts
 */
export const fileAccessLogs = mysqlTable("file_access_logs", {
  id: int("id").autoincrement().primaryKey(),
  fileId: int("fileId").notNull(),
  /** User ID - null for guest access */
  userId: int("userId"),
  /** Access type: download, preview, failed_password */
  accessType: mysqlEnum("accessType", ["download", "preview", "failed_password"]).notNull(),
  /** IP address */
  ipAddress: varchar("ipAddress", { length: 45 }),
  /** User agent */
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FileAccessLog = typeof fileAccessLogs.$inferSelect;
export type InsertFileAccessLog = typeof fileAccessLogs.$inferInsert;

/**
 * System configuration table
 */
export const systemConfig = mysqlTable("system_config", {
  id: int("id").autoincrement().primaryKey(),
  /** Config key */
  configKey: varchar("configKey", { length: 64 }).notNull().unique(),
  /** Config value (JSON string) */
  configValue: text("configValue").notNull(),
  /** Description */
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemConfig = typeof systemConfig.$inferSelect;
export type InsertSystemConfig = typeof systemConfig.$inferInsert;

/**
 * Audit logs - track admin and system operations
 */
export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID - null for system operations */
  userId: int("userId"),
  /** Action type */
  action: varchar("action", { length: 64 }).notNull(),
  /** Target type: user, file, config */
  targetType: varchar("targetType", { length: 32 }),
  /** Target ID */
  targetId: int("targetId"),
  /** Additional details (JSON string) */
  details: text("details"),
  /** IP address */
  ipAddress: varchar("ipAddress", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

/**
 * Upload sessions for chunked uploads
 */
export const uploadSessions = mysqlTable("upload_sessions", {
  id: int("id").autoincrement().primaryKey(),
  /** Unique upload ID (UUID) */
  uploadId: varchar("uploadId", { length: 64 }).notNull().unique(),
  /** User ID - null for guest uploads */
  userId: int("userId"),
  /** Original filename */
  filename: varchar("filename", { length: 255 }).notNull(),
  /** Total file size in bytes */
  fileSize: bigint("fileSize", { mode: "number" }).notNull(),
  /** MIME type */
  mimeType: varchar("mimeType", { length: 127 }),
  /** Total number of chunks expected (optional) */
  totalChunks: int("totalChunks"),
  /** Metadata (JSON string) for password, burnAfterRead, expiration, etc. */
  metadata: text("metadata"),
  /** Expiration timestamp for the session itself */
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UploadSession = typeof uploadSessions.$inferSelect;
export type InsertUploadSession = typeof uploadSessions.$inferInsert;

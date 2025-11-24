import { eq, desc, and, isNull, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import * as bcrypt from "bcryptjs";
import { 
  InsertUser, 
  users, 
  files, 
  InsertFile, 
  File,
  fileAccessLogs,
  InsertFileAccessLog,
  systemConfig,
  InsertSystemConfig,
  auditLogs,
  InsertAuditLog,
  User,
  uploadSessions,
  InsertUploadSession,
  UploadSession,
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { logger } from './_core/logger';

let _db: ReturnType<typeof drizzle> | null = null;

// In-memory fallback for test/dev without DATABASE_URL
type MemoryState = {
  users: User[];
  files: File[];
  fileAccessLogs: Array<import("../drizzle/schema").FileAccessLog>;
  systemConfig: Array<import("../drizzle/schema").SystemConfig>;
  auditLogs: Array<import("../drizzle/schema").AuditLog>;
  uploadSessions: UploadSession[];
  ids: { user: number; file: number; accessLog: number; config: number; audit: number; uploadSession: number };
};

const memory: MemoryState = {
  users: [],
  files: [],
  fileAccessLogs: [],
  systemConfig: [],
  auditLogs: [],
  uploadSessions: [],
  ids: { user: 1, file: 1, accessLog: 1, config: 1, audit: 1, uploadSession: 1 },
};

// Initialize default admin user in memory
const initDefaultAdmin = () => {
  const email = "admin@example.com";
  const password = "adminpassword";
  const passwordHash = bcrypt.hashSync(password, 10);
  const now = new Date();
  
  memory.users.push({
    id: memory.ids.user++,
    openId: `local:${email}`,
    name: "Admin",
    email: email,
    passwordHash: passwordHash,
    loginMethod: "local" as any,
    role: "admin",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  });
};

// Call initialization
initDefaultAdmin();

const useMemory = async () => !(await getDb());

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      logger.warn("Failed to connect:", "DB", error);
      _db = null;
    }
  }
  return _db;
}

// ============ User Operations ============

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    // Memory fallback
    const existing = memory.users.find(u => u.openId === user.openId);
    const now = new Date();
    if (existing) {
      existing.name = user.name ?? existing.name ?? null as any;
      existing.email = user.email ?? existing.email ?? null as any;
      (existing as any).passwordHash = (user as any).passwordHash ?? (existing as any).passwordHash ?? null;
      existing.loginMethod = user.loginMethod ?? existing.loginMethod ?? null as any;
      existing.lastSignedIn = user.lastSignedIn ?? now;
      if (user.role) existing.role = user.role as any;
    } else {
      memory.users.push({
        id: memory.ids.user++,
        openId: user.openId,
        name: user.name ?? null as any,
        email: user.email ?? null as any,
        passwordHash: (user as any).passwordHash ?? null,
        loginMethod: user.loginMethod ?? null as any,
        role: (user.role ?? (user.openId === ENV.ownerOpenId ? 'admin' : 'user')) as any,
        createdAt: now,
        updatedAt: now,
        lastSignedIn: user.lastSignedIn ?? now,
      });
    }
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    logger.error("Failed to upsert user:", "DB", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    return memory.users.find(u => u.openId === openId);
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [...memory.users].sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function updateUserRole(userId: number, role: "user" | "admin") {
  const db = await getDb();
  if (!db) {
    const u = memory.users.find(u=>u.id===userId);
    if (u) u.role = role as any;
    return;
  }
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) {
    const u = memory.users.find(u => u.id === userId);
    if (u) (u as any).passwordHash = passwordHash;
    return;
  }
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

// ============ Local Auth Support ============

export async function getUserByEmail(email: string) {
  const db = await getDb();
  const norm = email.toLowerCase();
  if (!db) return memory.users.find(u => (u.email || "").toLowerCase() === norm);
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function createLocalUser(params: { email: string; name?: string | null; passwordHash: string; role?: "user" | "admin"; }): Promise<User> {
  const db = await getDb();
  const now = new Date();
  const openId = `local:${params.email.toLowerCase()}`.slice(0, 64);
  if (!db) {
    const user: User = {
      id: memory.ids.user++,
      openId,
      name: params.name ?? null as any,
      email: params.email,
      passwordHash: params.passwordHash,
      loginMethod: 'local' as any,
      role: (params.role ?? 'user') as any,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    };
    memory.users.push(user);
    return user;
  }
  await db.insert(users).values({
    openId,
    name: params.name ?? null,
    email: params.email,
    passwordHash: params.passwordHash,
    loginMethod: 'local',
    role: (params.role ?? 'user') as any,
    lastSignedIn: now,
  } as InsertUser);
  const [created] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  if (!created) throw new Error("Failed to create local user");
  return created as User;
}

// ============ File Operations ============

export async function createFile(file: InsertFile): Promise<File> {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const rec: File = {
      id: memory.ids.file++,
      userId: (file.userId ?? null) as any,
      filename: file.filename!,
      fileKey: file.fileKey!,
      fileUrl: file.fileUrl!,
      fileSize: file.fileSize!,
      mimeType: (file.mimeType ?? null) as any,
      shareToken: file.shareToken!,
      password: (file.password ?? null) as any,
      burnAfterRead: file.burnAfterRead ?? false,
      expiresAt: (file.expiresAt ?? null) as any,
      downloadCount: 0,
      status: (file.status ?? 'active') as any,
      createdAt: now,
      updatedAt: now,
    };
    memory.files.push(rec);
    return rec;
  }
  
  const result = await db.insert(files).values(file);
  const insertedId = Number(result[0].insertId);
  
  const inserted = await db.select().from(files).where(eq(files.id, insertedId)).limit(1);
  if (!inserted[0]) throw new Error("Failed to retrieve inserted file");
  
  return inserted[0];
}

export async function getFileByShareToken(shareToken: string) {
  const db = await getDb();
  if (!db) return memory.files.find(f=>f.shareToken===shareToken && f.status==='active');
  
  const result = await db.select().from(files)
    .where(and(
      eq(files.shareToken, shareToken),
      eq(files.status, "active")
    ))
    .limit(1);
  
  return result[0];
}

export async function getFileById(fileId: number) {
  const db = await getDb();
  if (!db) return memory.files.find(f=>f.id===fileId);
  
  const result = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  return result[0];
}

export async function getUserFiles(userId: number) {
  const db = await getDb();
  if (!db) return memory.files.filter(f=>f.userId===userId && f.status==='active').sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
  
  return db.select().from(files)
    .where(and(
      eq(files.userId, userId),
      eq(files.status, "active")
    ))
    .orderBy(desc(files.createdAt));
}

export async function getAllFiles() {
  const db = await getDb();
  if (!db) return [...memory.files].sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
  
  return db.select().from(files)
    .orderBy(desc(files.createdAt));
}

export async function updateFileDownloadCount(fileId: number) {
  const db = await getDb();
  if (!db) {
    const f = memory.files.find(f=>f.id===fileId);
    if (f) f.downloadCount = (f.downloadCount ?? 0) + 1;
    return;
  }
  
  await db.update(files)
    .set({ downloadCount: sql`${files.downloadCount} + 1` })
    .where(eq(files.id, fileId));
}

export async function deleteFile(fileId: number) {
  const db = await getDb();
  if (!db) {
    const f = memory.files.find(f=>f.id===fileId);
    if (f) f.status = 'deleted' as any;
    return;
  }
  
  await db.update(files)
    .set({ status: "deleted" })
    .where(eq(files.id, fileId));
}

export async function markFileAsExpired(fileId: number) {
  const db = await getDb();
  if (!db) {
    const f = memory.files.find(f=>f.id===fileId);
    if (f) f.status = 'expired' as any;
    return;
  }
  
  await db.update(files)
    .set({ status: "expired" })
    .where(eq(files.id, fileId));
}

export async function getExpiredFiles() {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    return memory.files.filter(f=>f.status==='active' && f.expiresAt != null && f.expiresAt < now);
  }
  
  const now = new Date();
  return db.select().from(files)
    .where(and(
      eq(files.status, "active"),
      lt(files.expiresAt, now)
    ));
}

// ============ File Access Log Operations ============

export async function createFileAccessLog(log: InsertFileAccessLog) {
  const db = await getDb();
  if (!db) {
    memory.fileAccessLogs.push({
      id: memory.ids.accessLog++,
      fileId: log.fileId!,
      userId: (log.userId ?? null) as any,
      accessType: log.accessType as any,
      ipAddress: (log.ipAddress ?? null) as any,
      userAgent: (log.userAgent ?? null) as any,
      createdAt: new Date(),
    });
    return;
  }
  
  await db.insert(fileAccessLogs).values(log);
}

export async function getFileAccessLogs(fileId: number) {
  const db = await getDb();
  if (!db) return memory.fileAccessLogs.filter(l=>l.fileId===fileId).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
  
  return db.select().from(fileAccessLogs)
    .where(eq(fileAccessLogs.fileId, fileId))
    .orderBy(desc(fileAccessLogs.createdAt));
}

export async function getAllAccessLogs(limit: number = 100) {
  const db = await getDb();
  if (!db) return memory.fileAccessLogs.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()).slice(0, limit);
  
  return db.select().from(fileAccessLogs)
    .orderBy(desc(fileAccessLogs.createdAt))
    .limit(limit);
}

// ============ System Config Operations ============

// Simple in-memory cache for system config
const configCache: Record<string, { value: any; expires: number }> = {};
const CONFIG_CACHE_TTL = 60 * 1000; // 1 minute

export async function getSystemConfig(key: string) {
  // Check cache
  const cached = configCache[key];
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  const db = await getDb();
  if (!db) return memory.systemConfig.find(c=>c.configKey===key);
  
  const result = await db.select().from(systemConfig)
    .where(eq(systemConfig.configKey, key))
    .limit(1);
  
  const value = result[0];
  
  // Update cache
  configCache[key] = {
    value,
    expires: Date.now() + CONFIG_CACHE_TTL
  };
  
  return value;
}

export async function setSystemConfig(key: string, value: string, description?: string) {
  // Invalidate cache
  delete configCache[key];

  const db = await getDb();
  if (!db) {
    const existing = memory.systemConfig.find(c=>c.configKey===key);
    const now = new Date();
    if (existing) {
      existing.configValue = value;
      existing.description = (description ?? null) as any;
      existing.updatedAt = now;
    } else {
      memory.systemConfig.push({
        id: memory.ids.config++,
        configKey: key,
        configValue: value,
        description: (description ?? null) as any,
        updatedAt: now,
      });
    }
    return;
  }
  
  await db.insert(systemConfig)
    .values({ configKey: key, configValue: value, description })
    .onDuplicateKeyUpdate({ set: { configValue: value, description } });
}

export async function getAllSystemConfigs() {
  const db = await getDb();
  if (!db) return [...memory.systemConfig];
  
  return db.select().from(systemConfig);
}

// ============ Audit Log Operations ============

export async function createAuditLog(log: InsertAuditLog) {
  const db = await getDb();
  if (!db) {
    memory.auditLogs.push({
      id: memory.ids.audit++,
      userId: (log.userId ?? null) as any,
      action: log.action!,
      targetType: (log.targetType ?? null) as any,
      targetId: (log.targetId ?? null) as any,
      details: (log.details ?? null) as any,
      ipAddress: (log.ipAddress ?? null) as any,
      createdAt: new Date(),
    });
    return;
  }
  
  await db.insert(auditLogs).values(log);
}

export async function getAuditLogs(limit: number = 100) {
  const db = await getDb();
  if (!db) return memory.auditLogs.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()).slice(0, limit);
  
  return db.select().from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

// ============ Statistics ============

export async function getStatistics() {
  const db = await getDb();
  if (!db) return {
    totalUsers: memory.users.length,
    totalFiles: memory.files.filter(f=>f.status==='active').length,
    totalDownloads: memory.files.reduce((s,f)=>s+(f.downloadCount||0),0),
    totalStorage: memory.files.filter(f=>f.status==='active').reduce((s,f)=>s+(f.fileSize||0),0),
  };
  
  const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [fileCount] = await db.select({ count: sql<number>`count(*)` }).from(files).where(eq(files.status, "active"));
  const [downloadSum] = await db.select({ sum: sql<number>`sum(${files.downloadCount})` }).from(files);
  const [storageSum] = await db.select({ sum: sql<number>`sum(${files.fileSize})` }).from(files).where(eq(files.status, "active"));
  
  return {
    totalUsers: userCount?.count || 0,
    totalFiles: fileCount?.count || 0,
    totalDownloads: downloadSum?.sum || 0,
    totalStorage: storageSum?.sum || 0,
  };
}

// ============ Upload Session Operations ============

export async function createUploadSession(session: InsertUploadSession): Promise<UploadSession> {
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const rec: UploadSession = {
      id: memory.ids.uploadSession++,
      uploadId: session.uploadId,
      userId: (session.userId ?? null) as any,
      filename: session.filename,
      fileSize: session.fileSize,
      mimeType: (session.mimeType ?? null) as any,
      totalChunks: (session.totalChunks ?? null) as any,
      metadata: (session.metadata ?? null) as any,
      expiresAt: session.expiresAt,
      createdAt: now,
    };
    memory.uploadSessions.push(rec);
    return rec;
  }
  
  const result = await db.insert(uploadSessions).values(session);
  const insertedId = Number(result[0].insertId);
  
  const inserted = await db.select().from(uploadSessions).where(eq(uploadSessions.id, insertedId)).limit(1);
  if (!inserted[0]) throw new Error("Failed to retrieve inserted upload session");
  
  return inserted[0];
}

export async function getUploadSession(uploadId: string) {
  const db = await getDb();
  if (!db) return memory.uploadSessions.find(s => s.uploadId === uploadId);
  
  const result = await db.select().from(uploadSessions).where(eq(uploadSessions.uploadId, uploadId)).limit(1);
  return result[0];
}

export async function deleteUploadSession(uploadId: string) {
  const db = await getDb();
  if (!db) {
    const idx = memory.uploadSessions.findIndex(s => s.uploadId === uploadId);
    if (idx !== -1) memory.uploadSessions.splice(idx, 1);
    return;
  }
  
  await db.delete(uploadSessions).where(eq(uploadSessions.uploadId, uploadId));
}

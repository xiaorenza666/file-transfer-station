import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(user?: AuthenticatedUser): TrpcContext {
  return {
    user: user || null,
    req: {
      protocol: "https",
      headers: {},
      ip: "127.0.0.1",
      get: (header: string) => {
        if (header === "host") return "localhost:3000";
        if (header === "user-agent") return "test-agent";
        return undefined;
      },
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("File Upload and Download", () => {
  it("should allow guest upload without authentication", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Create a small test file (base64 encoded "test content")
    const testContent = Buffer.from("test content").toString("base64");

    const result = await caller.files.upload({
      filename: "test.txt",
      fileData: testContent,
      mimeType: "text/plain",
      fileSize: 12,
      burnAfterRead: false,
    });

    expect(result).toHaveProperty("shareToken");
    expect(result).toHaveProperty("shareUrl");
    expect(result.shareToken).toBeTruthy();
    expect(result.shareUrl).toContain(result.shareToken);
  });

  it("should allow authenticated user upload", async () => {
    const user: AuthenticatedUser = {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    const ctx = createTestContext(user);
    const caller = appRouter.createCaller(ctx);

    const testContent = Buffer.from("authenticated content").toString("base64");

    const result = await caller.files.upload({
      filename: "auth-test.txt",
      fileData: testContent,
      mimeType: "text/plain",
      fileSize: 20,
      burnAfterRead: false,
    });

    expect(result).toHaveProperty("shareToken");
    expect(result.shareToken).toBeTruthy();
  });

  it("should support password protection", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const testContent = Buffer.from("protected content").toString("base64");

    const uploadResult = await caller.files.upload({
      filename: "protected.txt",
      fileData: testContent,
      mimeType: "text/plain",
      fileSize: 17,
      password: "secret123",
      burnAfterRead: false,
    });

    expect(uploadResult.shareToken).toBeTruthy();

    // Try to access without password
    const infoWithoutPassword = await caller.files.getByShareToken({
      shareToken: uploadResult.shareToken,
    });

    expect(infoWithoutPassword.requiresPassword).toBe(true);
    expect(infoWithoutPassword.passwordValid).toBe(false);
    expect(infoWithoutPassword.file).toBeNull();

    // Try with wrong password
    const infoWithWrongPassword = await caller.files.getByShareToken({
      shareToken: uploadResult.shareToken,
      password: "wrong",
    });

    expect(infoWithWrongPassword.requiresPassword).toBe(true);
    expect(infoWithWrongPassword.passwordValid).toBe(false);

    // Try with correct password
    const infoWithCorrectPassword = await caller.files.getByShareToken({
      shareToken: uploadResult.shareToken,
      password: "secret123",
    });

    expect(infoWithCorrectPassword.requiresPassword).toBe(true);
    expect(infoWithCorrectPassword.passwordValid).toBe(true);
    expect(infoWithCorrectPassword.file).toBeTruthy();
    expect(infoWithCorrectPassword.file?.filename).toBe("protected.txt");
  });

  it("should support burn after read", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const testContent = Buffer.from("burn content").toString("base64");

    const uploadResult = await caller.files.upload({
      filename: "burn.txt",
      fileData: testContent,
      mimeType: "text/plain",
      fileSize: 12,
      burnAfterRead: true,
    });

    // Get file info
    const fileInfo = await caller.files.getByShareToken({
      shareToken: uploadResult.shareToken,
    });

    expect(fileInfo.file?.burnAfterRead).toBe(true);

    // Download the file (should trigger deletion)
    const downloadResult = await caller.files.download({
      shareToken: uploadResult.shareToken,
    });

    expect(downloadResult.fileUrl).toBeTruthy();

    // Try to access again (should fail because file was deleted)
    try {
      await caller.files.getByShareToken({
        shareToken: uploadResult.shareToken,
      });
      // If we get here, the test should fail
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.code).toBe("NOT_FOUND");
    }
  });

  it("should support file expiration", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const testContent = Buffer.from("expiring content").toString("base64");

    // Upload with very short expiration (0.001 hours = 3.6 seconds)
    const uploadResult = await caller.files.upload({
      filename: "expiring.txt",
      fileData: testContent,
      mimeType: "text/plain",
      fileSize: 16,
      expiresInHours: 0.001,
      burnAfterRead: false,
    });

    // File should be accessible immediately
    const fileInfo = await caller.files.getByShareToken({
      shareToken: uploadResult.shareToken,
    });

    expect(fileInfo.file).toBeTruthy();

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 4000));

    // File should be expired now
    try {
      await caller.files.getByShareToken({
        shareToken: uploadResult.shareToken,
      });
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.code).toBe("NOT_FOUND");
    }
  }, 10000); // Increase timeout for this test
});

describe("Admin Operations", () => {
  it("should allow admin to view statistics", async () => {
    const admin: AuthenticatedUser = {
      id: 1,
      openId: "admin-user",
      email: "admin@example.com",
      name: "Admin User",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    const ctx = createTestContext(admin);
    const caller = appRouter.createCaller(ctx);

    const stats = await caller.admin.statistics();

    expect(stats).toHaveProperty("totalUsers");
    expect(stats).toHaveProperty("totalFiles");
    expect(stats).toHaveProperty("totalDownloads");
    expect(stats).toHaveProperty("totalStorage");
    expect(typeof stats.totalUsers).toBe("number");
    expect(typeof stats.totalFiles).toBe("number");
  });

  it("should prevent non-admin from accessing admin endpoints", async () => {
    const user: AuthenticatedUser = {
      id: 2,
      openId: "regular-user",
      email: "user@example.com",
      name: "Regular User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    const ctx = createTestContext(user);
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.admin.statistics();
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.code).toBe("FORBIDDEN");
    }
  });

  it("should allow admin to clean expired files", async () => {
    const admin: AuthenticatedUser = {
      id: 1,
      openId: "admin-user",
      email: "admin@example.com",
      name: "Admin User",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    const ctx = createTestContext(admin);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.admin.cleanExpiredFiles();

    expect(result).toHaveProperty("cleaned");
    expect(typeof result.cleaned).toBe("number");
    expect(result.cleaned).toBeGreaterThanOrEqual(0);
  });
});

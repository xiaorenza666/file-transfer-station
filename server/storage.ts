import fs from 'fs';
import path from 'path';
import { ENV } from './_core/env';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from 'stream';

// Local storage implementation
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// S3 Client Initialization
let s3Client: S3Client | null = null;
if (ENV.s3.endpoint && ENV.s3.bucket && ENV.s3.accessKeyId && ENV.s3.secretAccessKey) {
  s3Client = new S3Client({
    region: ENV.s3.region,
    endpoint: ENV.s3.endpoint,
    credentials: {
      accessKeyId: ENV.s3.accessKeyId,
      secretAccessKey: ENV.s3.secretAccessKey,
    },
    forcePathStyle: true, // Needed for MinIO and some S3 compatible providers
  });
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "").replace(/\\/g, "/");
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string | Readable,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);

  if (s3Client && ENV.s3.bucket) {
    // S3 Upload
    let body: Buffer | Uint8Array | string | Readable = data;
    
    // Convert string to buffer if needed, but Readable is fine for S3
    if (typeof data === 'string') {
      body = Buffer.from(data);
    }

    await s3Client.send(new PutObjectCommand({
      Bucket: ENV.s3.bucket,
      Key: key,
      Body: body as any, // AWS SDK types are strict, but it accepts Readable
      ContentType: contentType,
    }));

    // Generate URL
    let url = "";
    if (ENV.s3.publicUrl) {
      url = `${ENV.s3.publicUrl}/${key}`;
    } else {
      // Fallback to endpoint/bucket/key or just key if we want to sign it later
      // For now, let's return a signed URL valid for 1 hour as the "url"
      // Or just the key if we expect the frontend to ask for a signed url
      // The current app expects a direct URL for previews.
      // Let's generate a signed URL for immediate use.
      url = await getSignedUrl(s3Client, new GetObjectCommand({
        Bucket: ENV.s3.bucket,
        Key: key,
      }), { expiresIn: 3600 });
    }

    return { key, url };
  } else {
    // Local Upload
    const filePath = path.join(UPLOADS_DIR, key);
    
    // Ensure directory exists for the file
    const fileDir = path.dirname(filePath);
    if (!fs.existsSync(fileDir)) {
      await fs.promises.mkdir(fileDir, { recursive: true });
    }

    if (data instanceof Readable) {
      const writeStream = fs.createWriteStream(filePath);
      data.pipe(writeStream);
      await new Promise((resolve, reject) => {
        writeStream.on('finish', () => resolve(null));
        writeStream.on('error', reject);
      });
    } else {
      let buffer: Buffer;
      if (Buffer.isBuffer(data)) {
        buffer = data;
      } else if (typeof data === 'string') {
        buffer = Buffer.from(data);
      } else {
        buffer = Buffer.from(data);
      }
      await fs.promises.writeFile(filePath, buffer);
    }

    // Return local URL
    const url = `/uploads/${key}`;
    return { key, url };
  }
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string; }> {
  const key = normalizeKey(relKey);

  if (s3Client && ENV.s3.bucket) {
    let url = "";
    if (ENV.s3.publicUrl) {
      url = `${ENV.s3.publicUrl}/${key}`;
    } else {
      url = await getSignedUrl(s3Client, new GetObjectCommand({
        Bucket: ENV.s3.bucket,
        Key: key,
      }), { expiresIn: 3600 });
    }
    return { key, url };
  } else {
    const filePath = path.join(UPLOADS_DIR, key);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${key}`);
    }
    return {
      key,
      url: `/uploads/${key}`,
    };
  }
}

export async function storageDelete(relKey: string): Promise<void> {
  const key = normalizeKey(relKey);

  if (s3Client && ENV.s3.bucket) {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: ENV.s3.bucket,
      Key: key,
    }));
  } else {
    const filePath = path.join(UPLOADS_DIR, key);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
}

export async function storageStat(relKey: string): Promise<{ size: number }> {
  const key = normalizeKey(relKey);

  if (s3Client && ENV.s3.bucket) {
    const head = await s3Client.send(new HeadObjectCommand({
      Bucket: ENV.s3.bucket,
      Key: key,
    }));
    return { size: head.ContentLength || 0 };
  } else {
    const filePath = path.join(UPLOADS_DIR, key);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${key}`);
    }
    const stat = await fs.promises.stat(filePath);
    return { size: stat.size };
  }
}

export async function storageGetStream(relKey: string, range?: { start: number; end: number }): Promise<Readable> {
  const key = normalizeKey(relKey);

  if (s3Client && ENV.s3.bucket) {
    const commandInput: any = {
      Bucket: ENV.s3.bucket,
      Key: key,
    };
    
    if (range) {
      commandInput.Range = `bytes=${range.start}-${range.end}`;
    }

    const { Body } = await s3Client.send(new GetObjectCommand(commandInput));
    
    if (Body instanceof Readable) {
      return Body;
    }
    // Handle other body types (Blob, ReadableStream, etc.) if necessary
    // Node.js SDK usually returns IncomingMessage which is Readable
    return Body as unknown as Readable;
  } else {
    const filePath = path.join(UPLOADS_DIR, key);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${key}`);
    }
    
    const options: any = {};
    if (range) {
      options.start = range.start;
      options.end = range.end;
    }
    
    return fs.createReadStream(filePath, options);
  }
}

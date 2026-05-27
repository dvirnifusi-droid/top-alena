import { Client as MinioClient } from 'minio';
import { nanoid } from 'nanoid';
import path from 'node:path';
import type { Readable } from 'node:stream';

const endpoint = new URL(process.env.S3_ENDPOINT ?? 'http://localhost:9000');
const bucket = process.env.S3_BUCKET ?? 'top-alena';
const publicUrl = process.env.S3_PUBLIC_URL ?? `${endpoint.origin}/${bucket}`;

export const minio = new MinioClient({
  endPoint: endpoint.hostname,
  port: Number(endpoint.port) || (endpoint.protocol === 'https:' ? 443 : 80),
  useSSL: endpoint.protocol === 'https:',
  accessKey: process.env.S3_ACCESS_KEY ?? '',
  secretKey: process.env.S3_SECRET_KEY ?? '',
  region: process.env.S3_REGION ?? 'us-east-1',
});

let bucketReady: Promise<void> | null = null;
async function ensureBucket() {
  if (bucketReady) return bucketReady;
  bucketReady = (async () => {
    const exists = await minio.bucketExists(bucket).catch(() => false);
    if (!exists) await minio.makeBucket(bucket, process.env.S3_REGION ?? 'us-east-1');
  })();
  return bucketReady;
}

export async function createSignedUrl(fileUrl: string, expiresIn = 3600) {
  await ensureBucket();
  // Extract the key from the public URL (works for default MinIO/S3 URLs).
  const prefix = publicUrl + '/';
  if (!fileUrl?.startsWith(prefix)) return { url: fileUrl, signed: false };
  const key = fileUrl.slice(prefix.length);
  const signed = await minio.presignedGetObject(bucket, key, expiresIn);
  return { url: signed, signed: true, expires_in: expiresIn };
}

export async function uploadStreamToS3(
  filename: string,
  mimetype: string,
  stream: Readable,
) {
  await ensureBucket();
  const ext = path.extname(filename) || '';
  const key = `${new Date().getFullYear()}/${nanoid(16)}${ext}`;
  await minio.putObject(bucket, key, stream, undefined, { 'Content-Type': mimetype });
  return { key, url: `${publicUrl}/${key}` };
}

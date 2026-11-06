import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../../config/env.js";
import type { Storage } from "./types.js";

// Qualquer serviço compatível com S3: AWS S3, Cloudflare R2, Backblaze B2… (ver docs/storage.md).
export function criarStorageS3(): Storage {
  if (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)
    throw new Error(
      "Storage S3 sem credenciais: preencha S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY.",
    );

  const bucket = env.STORAGE_BUCKET;
  const s3 = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });

  return {
    async upload(path, body, contentType) {
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: path, Body: body, ContentType: contentType }),
      );
    },
    async remove(paths) {
      if (paths.length === 0) return;
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: paths.map((Key) => ({ Key })) },
        }),
      );
    },
    signedUrl(path, expiresInSeconds = env.STORAGE_SIGNED_URL_TTL) {
      return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: path }), {
        expiresIn: expiresInSeconds,
      });
    },
  };
}

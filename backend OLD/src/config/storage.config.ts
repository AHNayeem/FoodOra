import { registerAs } from '@nestjs/config';

import { loadEnvironment } from './environment';

export const storageConfig = registerAs('storage', () => {
  const env = loadEnvironment();
  return {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    /** CDN-fronted: menu photos, review media, CMS assets. */
    publicBucket: env.S3_BUCKET_PUBLIC,
    /** Presigned access only: rider documents, invoices, exports. */
    privateBucket: env.S3_BUCKET_PRIVATE,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    cdnBaseUrl: env.CDN_BASE_URL,
    uploadMaxBytes: env.UPLOAD_MAX_BYTES,
    uploadUrlTtlSeconds: env.UPLOAD_URL_TTL,
    /** Nothing is reachable until credentials exist; the health probe says so. */
    get configured(): boolean {
      return Boolean(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
    },
  } as const;
});

export type StorageConfig = ReturnType<typeof storageConfig>;

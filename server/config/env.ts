import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(projectRoot, ".env") });

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  CORS_ORIGIN: z.preprocess(emptyToUndefined, z.string().optional()),
  MINIO_ENDPOINT: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  MINIO_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  MINIO_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  MINIO_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  MINIO_USE_SSL: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).optional()),
  MINIO_BUCKET_EVIDENCE: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  MINIO_BUCKET_IMAGES: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  MINIO_BUCKET_WORKING: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  MINIO_BUCKET_CERTIFICATES: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
});

function readEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const values = parsed.data;
  return {
    ...values,
    PORT: values.PORT ?? (values.NODE_ENV === "production" ? 3000 : 3001),
    JWT_EXPIRES_IN: values.JWT_EXPIRES_IN ?? "7d",
    MINIO_PORT: values.MINIO_PORT ?? 9000,
    MINIO_USE_SSL: values.MINIO_USE_SSL === "true",
    MINIO_BUCKET_EVIDENCE: values.MINIO_BUCKET_EVIDENCE ?? "recovered-evidence",
    MINIO_BUCKET_IMAGES: values.MINIO_BUCKET_IMAGES ?? "forensic-images",
    MINIO_BUCKET_WORKING: values.MINIO_BUCKET_WORKING ?? "working-copies",
    MINIO_BUCKET_CERTIFICATES: values.MINIO_BUCKET_CERTIFICATES ?? "certificates",
  };
}

export const env = readEnv();
export const PROJECT_ROOT = projectRoot;

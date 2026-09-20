import dotenv from 'dotenv'
import path from 'node:path'
import { z } from 'zod'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') })

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().url(),
  TOKEN_ENCRYPTION_KEY: z.string().min(32),
  FILE_ENCRYPTION_KEY: z.string().min(32).optional(),
  MAX_UPLOAD_BYTES: z.coerce.number().default(5 * 1024 * 1024 * 1024),
  CHUNK_SIZE_BYTES: z.coerce.number().default(64 * 1024 * 1024),
})

export const env = envSchema.parse(process.env)

import crypto from 'node:crypto'
import { env } from '../config/env.js'

/**
 * File-at-rest encryption (AES-256-GCM, single master key).
 * Objects stored in Google Drive / S3 are opaque ciphertext blobs — unreadable
 * without this key. Encryption/decryption happens only on the server (proxy).
 *
 * Uses FILE_ENCRYPTION_KEY when set, otherwise falls back to TOKEN_ENCRYPTION_KEY
 * so existing deployments keep working.
 */
const secret = env.FILE_ENCRYPTION_KEY && env.FILE_ENCRYPTION_KEY.length > 0
  ? env.FILE_ENCRYPTION_KEY
  : env.TOKEN_ENCRYPTION_KEY

const key = crypto.createHash('sha256').update(secret).digest()

export type EncryptedBlob = { cipher: Buffer; iv: string; authTag: string }

export function encryptBuffer(plain: Buffer): EncryptedBlob {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
  const authTag = cipher.getAuthTag()
  return { cipher: encrypted, iv: iv.toString('base64'), authTag: authTag.toString('base64') }
}

export function decryptBuffer(cipher: Buffer, ivB64: string, authTagB64: string): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'))
  return Buffer.concat([decipher.update(cipher), decipher.final()])
}

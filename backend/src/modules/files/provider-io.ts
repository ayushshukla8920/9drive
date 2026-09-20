import { GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { google } from 'googleapis'
import { Readable } from 'node:stream'
import type { ConnectedAccount } from '@prisma/client'
import { getAuthedGoogleClient, ensureGoogleAppFolder } from '../google/google.service.js'
import { createS3Client, getS3ConfigForAccount, buildS3ObjectKey, uploadS3Object } from '../s3/s3.service.js'
import { normalizeHeaders } from './stream-google-file.js'

/**
 * Low-level provider object I/O for encrypted chunks. Chunks are opaque
 * ciphertext blobs stored with a neutral name/mime, and are NEVER made public.
 */

export async function putEncryptedChunk(
  account: ConnectedAccount,
  userId: string,
  fileId: string,
  chunkIndex: number,
  cipher: Buffer,
): Promise<{ providerFileId: string; provider: string }> {
  if (account.provider === 's3') {
    const config = await getS3ConfigForAccount(account.id, userId)
    const key = buildS3ObjectKey(config, userId, fileId, `chunk-${chunkIndex}.enc`)
    await uploadS3Object(config, key, Readable.from(cipher), 'application/octet-stream')
    return { providerFileId: key, provider: 's3' }
  }

  const auth = await getAuthedGoogleClient(account)
  const drive = google.drive({ version: 'v3', auth })
  const parentId = await ensureGoogleAppFolder(account)
  const uploaded = await drive.files.create({
    requestBody: { name: `${fileId}.p${chunkIndex}.enc`, parents: [parentId] },
    media: { mimeType: 'application/octet-stream', body: Readable.from(cipher) },
    fields: 'id',
  })
  // Intentionally NOT setting any public permission — chunks stay private.
  return { providerFileId: uploaded.data.id ?? '', provider: 'google_drive' }
}

async function collectStream(stream: Readable): Promise<Buffer> {
  const parts: Buffer[] = []
  for await (const part of stream) parts.push(Buffer.isBuffer(part) ? part : Buffer.from(part))
  return Buffer.concat(parts)
}

export async function getChunkBuffer(
  account: ConnectedAccount,
  provider: string,
  providerFileId: string,
): Promise<Buffer> {
  if (provider === 's3') {
    const config = await getS3ConfigForAccount(account.id)
    const client = createS3Client(config)
    const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: providerFileId }))
    return collectStream(response.Body as Readable)
  }

  const auth = await getAuthedGoogleClient(account)
  const headers = normalizeHeaders(await auth.getRequestHeaders())
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${providerFileId}?alt=media`, { headers })
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText)
    throw new Error(`Failed to fetch chunk ${providerFileId}: ${message || response.statusText}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

export async function deleteChunkObject(
  account: ConnectedAccount,
  provider: string,
  providerFileId: string,
): Promise<void> {
  if (!providerFileId) return
  if (provider === 's3') {
    const config = await getS3ConfigForAccount(account.id)
    const client = createS3Client(config)
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: providerFileId }))
    return
  }
  const auth = await getAuthedGoogleClient(account)
  const drive = google.drive({ version: 'v3', auth })
  await drive.files.delete({ fileId: providerFileId })
}

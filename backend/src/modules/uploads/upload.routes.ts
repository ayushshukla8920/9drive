import Busboy from 'busboy'
import crypto from 'node:crypto'
import type { NextFunction, Response } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { google } from 'googleapis'
import type { ConnectedAccount } from '@prisma/client'
import { env } from '../../config/env.js'
import { prisma } from '../../config/prisma.js'
import { requireAuth, type AuthRequest } from '../../middleware/auth.middleware.js'
import { ensureGoogleAppFolder, getAuthedGoogleClient, syncGoogleQuota } from '../google/google.service.js'
import { syncS3Quota } from '../s3/s3.service.js'
import { encryptBuffer } from '../../utils/file-crypto.js'
import { putEncryptedChunk, deleteChunkObject } from '../files/provider-io.js'
import { createAuditLog } from '../../utils/audit.js'

type ChunkAllocation = {
  accountsById: Map<string, ConnectedAccount>
  chunkAccountIds: string[]
  reservedByAccount: Map<string, bigint>
}

/**
 * Builds a chunk→account plan. Splits across drives ONLY when no single account
 * can hold the whole file. Chunk ciphertext size == plaintext size (AES-GCM).
 */
async function planChunkAllocation(
  userId: string,
  sizeBytes: bigint,
  reservedBytesByAccount: Map<string, bigint>,
  targetAccountId?: string | null,
): Promise<ChunkAllocation | null> {
  const chunkSize = BigInt(env.CHUNK_SIZE_BYTES)
  const chunkSizes: bigint[] = []
  let remaining = sizeBytes
  while (remaining > 0n) {
    const s = remaining > chunkSize ? chunkSize : remaining
    chunkSizes.push(s)
    remaining -= s
  }
  if (chunkSizes.length === 0) chunkSizes.push(0n)

  // selectAccount also refreshes stale quotas, so availableBytes below is fresh.
  const primary = await selectAccount(userId, sizeBytes, reservedBytesByAccount, targetAccountId)
  if (primary) {
    return {
      accountsById: new Map([[primary.id, primary]]),
      chunkAccountIds: chunkSizes.map(() => primary.id),
      reservedByAccount: new Map([[primary.id, sizeBytes]]),
    }
  }

  // No single account fits the whole file. A forced target can't be split.
  if (targetAccountId) return null

  const accounts = await prisma.connectedAccount.findMany({
    where: { userId, provider: { in: ['google_drive', 's3'] }, status: 'connected' },
    include: { storageAccount: true },
  })
  const accountsById = new Map(accounts.map((a) => [a.id, a as ConnectedAccount]))
  const remainingByAccount = new Map<string, bigint | null>()
  for (const a of accounts) {
    const avail = a.storageAccount?.availableBytes
    remainingByAccount.set(a.id, avail === null || avail === undefined ? null : avail - (reservedBytesByAccount.get(a.id) ?? 0n))
  }

  const chunkAccountIds: string[] = []
  const reservedByAccount = new Map<string, bigint>()
  for (const size of chunkSizes) {
    // Pick the account with the most remaining space that still fits this chunk (null = unlimited).
    let bestId: string | null = null
    let bestRemaining: bigint | null = null
    for (const [id, rem] of remainingByAccount) {
      const fits = rem === null || rem >= size
      if (!fits) continue
      if (bestId === null) { bestId = id; bestRemaining = rem; continue }
      if (rem === null) continue // keep a finite one first so we don't waste unlimited pointlessly
      if (bestRemaining !== null && rem > bestRemaining) { bestId = id; bestRemaining = rem }
    }
    if (bestId === null) return null
    chunkAccountIds.push(bestId)
    reservedByAccount.set(bestId, (reservedByAccount.get(bestId) ?? 0n) + size)
    const rem = remainingByAccount.get(bestId)
    if (rem !== null && rem !== undefined) remainingByAccount.set(bestId, rem - size)
  }

  return { accountsById, chunkAccountIds, reservedByAccount }
}

export const uploadRouter = Router()

type UploadMeta = { fieldName: string; fileName: string; mimeType: string; sizeBytes: bigint; folderId?: string; targetAccountId?: string }
type RoutingMode = 'most_available' | 'round_robin' | 'priority'

function logUpload(message: string, metadata?: Record<string, unknown>) {
  console.info('[upload]', message, metadata ?? '')
}

function syncQuotaInBackground(accountId: string, sessionId: string) {
  logUpload('quota sync started', { accountId, sessionId })
  syncGoogleQuota(accountId)
    .then(() => logUpload('quota sync completed', { accountId, sessionId }))
    .catch((error) => logUpload('quota sync failed', { accountId, sessionId, message: error instanceof Error ? error.message : 'Unknown error' }))
}

function normalizePriorityAccountIds(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function byPriority<T extends { account: { id: string; createdAt: Date } }>(items: T[], priorityAccountIds: string[]) {
  const order = new Map(priorityAccountIds.map((id, index) => [id, index]))
  return [...items].sort((a, b) => {
    const aOrder = order.get(a.account.id)
    const bOrder = order.get(b.account.id)
    if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder
    if (aOrder !== undefined) return -1
    if (bOrder !== undefined) return 1
    return a.account.createdAt.getTime() - b.account.createdAt.getTime()
  })
}

async function selectAccount(userId: string, sizeBytes: bigint, reservedBytesByAccount = new Map<string, bigint>(), targetAccountId?: string | null) {
  const accounts = await prisma.connectedAccount.findMany({
    where: { userId, provider: { in: ['google_drive', 's3'] }, status: 'connected', ...(targetAccountId ? { id: targetAccountId } : {}) },
    include: { storageAccount: true },
  })

  const stale = accounts.filter((account) => !account.storageAccount?.lastSyncedAt || account.storageAccount.lastSyncedAt.getTime() < Date.now() - 5 * 60_000)
  await Promise.allSettled(stale.map(async (account) => {
    try {
      if (account.provider === 's3') {
        await syncS3Quota(account.id)
      } else {
        await syncGoogleQuota(account.id)
      }
    } catch (err: any) {
      console.error(`[upload] failed to sync quota for account ${account.email} (${account.id}):`, err.message || err)
      await prisma.connectedAccount.update({
        where: { id: account.id },
        data: { lastError: err.message || 'Quota sync failed' }
      }).catch(() => undefined)
    }
  }))

  const fresh = await prisma.connectedAccount.findMany({
    where: { userId, provider: { in: ['google_drive', 's3'] }, status: 'connected' },
    include: { storageAccount: true },
  })

  const eligible = fresh
    .map((account) => ({ account, availableBytes: account.storageAccount?.availableBytes === null || account.storageAccount?.availableBytes === undefined ? null : account.storageAccount.availableBytes - (reservedBytesByAccount.get(account.id) ?? 0n) }))
    .filter(({ availableBytes }) => availableBytes === null || availableBytes >= sizeBytes)

  if (eligible.length === 0) return null

  if (targetAccountId) {
    const target = eligible.find(e => e.account.id === targetAccountId)
    return target?.account ?? null
  }

  const policy = await prisma.uploadRoutingPolicy.upsert({ where: { userId }, create: { userId, mode: 'most_available', priorityAccountIds: [] }, update: {} })
  const mode = (['most_available', 'round_robin', 'priority'].includes(policy.mode) ? policy.mode : 'most_available') as RoutingMode
  const priorityAccountIds = normalizePriorityAccountIds(policy.priorityAccountIds)

  if (mode === 'priority') return byPriority(eligible, priorityAccountIds)[0]?.account ?? null

  if (mode === 'round_robin') {
    const ordered = byPriority(eligible, priorityAccountIds)
    const selected = ordered[policy.roundRobinCursor % ordered.length]?.account ?? ordered[0]?.account ?? null
    await prisma.uploadRoutingPolicy.update({ where: { userId }, data: { roundRobinCursor: policy.roundRobinCursor + 1 } })
    return selected
  }

  return eligible
    .sort((a, b) => {
      if (a.availableBytes === null && b.availableBytes === null) return a.account.provider === 's3' ? -1 : 1
      if (a.availableBytes === null) return a.account.provider === 's3' ? -1 : 1
      if (b.availableBytes === null) return b.account.provider === 's3' ? 1 : -1
      return Number(b.availableBytes - a.availableBytes)
    })[0]?.account
}

export async function handleUpload(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    logUpload('request started', { userId: req.user!.id, contentLength: req.headers['content-length'] })
    const contentType = req.headers['content-type']
    if (!contentType?.includes('multipart/form-data')) return res.status(400).json({ code: 'UPLOAD_INVALID_CONTENT_TYPE', message: 'multipart/form-data required.' })

    const busboy = Busboy({ headers: req.headers, limits: { files: 25, fileSize: env.MAX_UPLOAD_BYTES } })
    const fields: { sizeBytes?: bigint; fileName?: string; mimeType?: string; folderId?: string; targetAccountId?: string } = {}
    let batchMeta: UploadMeta[] | null = null
    let responded = false
    let fileSeen = false
    const reservedBytesByAccount = new Map<string, bigint>()
    const completed: Array<Record<string, unknown>> = []
    const failed: Array<{ fileName: string; code: string; message: string }> = []
    const pendingUploads: Array<Promise<void>> = []

    const fail = async (status: number, code: string, message: string) => {
      if (responded) return
      responded = true
      req.unpipe(busboy)
      req.resume()
      return res.status(status).json({ code, message })
    }

    const parseBatchMeta = (value: string) => JSON.parse(value).map((item: { fieldName: string; fileName: string; mimeType: string; sizeBytes: string | number; folderId?: string }) => ({
      fieldName: item.fieldName,
      fileName: item.fileName,
      mimeType: item.mimeType,
      sizeBytes: BigInt(item.sizeBytes),
      folderId: item.folderId,
    })) as UploadMeta[]

    const metaForFile = (fieldName: string, info: { filename: string; mimeType: string }) => {
      if (batchMeta) return batchMeta.find((item) => item.fieldName === fieldName)
      const sizeBytes = fields.sizeBytes
      if (!sizeBytes) return null
      return { fieldName, sizeBytes, fileName: fields.fileName || info.filename, mimeType: fields.mimeType || info.mimeType || 'application/octet-stream', folderId: fields.folderId, targetAccountId: fields.targetAccountId }
    }

    const uploadOne = async (fieldName: string, fileStream: NodeJS.ReadableStream, info: { filename: string; mimeType: string }) => {
      const meta = metaForFile(fieldName, info)
      const fileName = meta?.fileName || info.filename
      try {
        fileStream.on('limit', () => logUpload('file stream size limit reached', { fileName }))
        if (!meta?.sizeBytes || meta.sizeBytes <= 0n) {
          fileStream.resume()
          failed.push({ fileName, code: 'UPLOAD_SIZE_REQUIRED', message: 'sizeBytes field must be sent before file field.' })
          return
        }
        if (meta.sizeBytes > BigInt(env.MAX_UPLOAD_BYTES)) {
          fileStream.resume()
          failed.push({ fileName, code: 'UPLOAD_TOO_LARGE', message: 'File exceeds max upload size.' })
          return
        }

        const folderId = meta.folderId || null
        let targetAccountId: string | undefined = meta.targetAccountId || undefined
        if (folderId) {
          const folderRecord = await prisma.folder.findFirstOrThrow({ where: { id: folderId, userId: req.user!.id, deletedAt: null } })
          if (folderRecord.connectedAccountId) {
            targetAccountId = folderRecord.connectedAccountId
          }
        }

        const plan = await planChunkAllocation(req.user!.id, meta.sizeBytes, reservedBytesByAccount, targetAccountId)
        if (!plan) {
          fileStream.resume()
          failed.push({ fileName, code: 'NO_ACCOUNT_WITH_ENOUGH_SPACE', message: 'No connected storage account has enough space for this upload.' })
          return
        }
        for (const [accId, bytes] of plan.reservedByAccount) {
          reservedBytesByAccount.set(accId, (reservedBytesByAccount.get(accId) ?? 0n) + bytes)
        }
        const primaryAccount = plan.accountsById.get(plan.chunkAccountIds[0])!

        const session = await prisma.uploadSession.create({ data: { userId: req.user!.id, targetConnectedAccountId: primaryAccount.id, folderId, fileName, mimeType: meta.mimeType, sizeBytes: meta.sizeBytes, status: 'uploading' } })
        const accountsUsed = new Set(plan.chunkAccountIds)
        logUpload('encrypted upload started', { sessionId: session.id, fileName, sizeBytes: meta.sizeBytes.toString(), chunks: plan.chunkAccountIds.length, accounts: accountsUsed.size })

        // Pre-generate the file id so provider chunk object names reference it.
        const fileId = crypto.randomUUID()
        const chunkSize = env.CHUNK_SIZE_BYTES
        const chunkRecords: Array<{ fileId: string; chunkIndex: number; connectedAccountId: string; provider: string; providerFileId: string; plainBytes: bigint; cipherBytes: bigint; iv: string; authTag: string }> = []
        let index = 0
        let totalPlain = 0
        let pending: Buffer[] = []
        let pendingLen = 0

        const flushChunk = async (buf: Buffer) => {
          const accountId = plan.chunkAccountIds[index] ?? plan.chunkAccountIds[plan.chunkAccountIds.length - 1]
          const account = plan.accountsById.get(accountId)!
          const { cipher, iv, authTag } = encryptBuffer(buf)
          const { providerFileId, provider } = await putEncryptedChunk(account, req.user!.id, fileId, index, cipher)
          chunkRecords.push({ fileId, chunkIndex: index, connectedAccountId: account.id, provider, providerFileId, plainBytes: BigInt(buf.length), cipherBytes: BigInt(cipher.length), iv, authTag })
          index += 1
          totalPlain += buf.length
        }

        try {
          for await (const data of fileStream as AsyncIterable<Buffer>) {
            const piece = Buffer.isBuffer(data) ? data : Buffer.from(data)
            pending.push(piece)
            pendingLen += piece.length
            while (pendingLen >= chunkSize) {
              const combined = Buffer.concat(pending)
              await flushChunk(combined.subarray(0, chunkSize))
              const rest = combined.subarray(chunkSize)
              pending = rest.length ? [Buffer.from(rest)] : []
              pendingLen = rest.length
            }
          }
          if (pendingLen > 0) await flushChunk(Buffer.concat(pending))
        } catch (streamError) {
          await Promise.allSettled(chunkRecords.map((c) => deleteChunkObject(plan.accountsById.get(c.connectedAccountId)!, c.provider, c.providerFileId)))
          await prisma.uploadSession.update({ where: { id: session.id }, data: { status: 'failed', errorMessage: 'Upload stream failed.' } }).catch(() => undefined)
          throw streamError
        }

        if (BigInt(totalPlain) !== meta.sizeBytes) {
          await Promise.allSettled(chunkRecords.map((c) => deleteChunkObject(plan.accountsById.get(c.connectedAccountId)!, c.provider, c.providerFileId)))
          await prisma.uploadSession.update({ where: { id: session.id }, data: { status: 'failed', errorMessage: 'Streamed byte count did not match declared size.' } })
          failed.push({ fileName, code: 'UPLOAD_SIZE_MISMATCH', message: 'Streamed byte count did not match declared size.' })
          return
        }

        const file = await prisma.file.create({
          data: { id: fileId, userId: req.user!.id, connectedAccountId: primaryAccount.id, folderId, provider: primaryAccount.provider, providerFileId: '', name: fileName, mimeType: meta.mimeType, sizeBytes: meta.sizeBytes, encrypted: true, chunkCount: chunkRecords.length },
        })
        await prisma.fileChunk.createMany({ data: chunkRecords })
        logUpload('encrypted upload completed', { sessionId: session.id, fileId: file.id, chunks: chunkRecords.length, accounts: accountsUsed.size })
        completed.push({ ...file, sizeBytes: file.sizeBytes.toString() })
        await prisma.uploadSession.update({ where: { id: session.id }, data: { status: 'completed', completedAt: new Date() } })
        for (const accId of accountsUsed) {
          const acc = plan.accountsById.get(accId)!
          if (acc.provider === 's3') syncS3Quota(accId).catch(() => undefined)
          else syncQuotaInBackground(accId, session.id)
        }
      } catch (error) {
        fileStream.resume()
        logUpload('file upload failed', { fileName, message: error instanceof Error ? error.message : 'Upload failed' })
        failed.push({ fileName, code: 'UPLOAD_FAILED', message: error instanceof Error ? error.message : 'Upload failed' })
      }
    }

    busboy.on('field', (name, value) => {
      if (name === 'sizeBytes') fields.sizeBytes = BigInt(value)
      if (name === 'fileName') fields.fileName = value
      if (name === 'mimeType') fields.mimeType = value
      if (name === 'folderId') fields.folderId = value
      if (name === 'targetAccountId') fields.targetAccountId = value
      if (name === 'filesMeta') batchMeta = parseBatchMeta(value)
    })

    busboy.on('file', (name, fileStream, info) => {
      fileSeen = true
      pendingUploads.push(uploadOne(name, fileStream, info))
    })

    busboy.on('error', (error) => {
      logUpload('multipart parser failed', { message: error instanceof Error ? error.message : 'Unknown error' })
      if (!responded) {
        responded = true
        next(error)
      }
    })

    busboy.on('finish', () => {
      if (!responded && !fileSeen) return fail(400, 'UPLOAD_FILE_REQUIRED', 'file field required.')
      Promise.all(pendingUploads).then(() => {
        if (responded) return
        responded = true
        logUpload('response sent', { completed: completed.length, failed: failed.length })
        if (completed.length === 0) return res.status(400).json({ code: failed[0]?.code ?? 'UPLOAD_FAILED', message: failed[0]?.message ?? 'Upload failed', failed })
        if (!batchMeta && completed.length === 1 && failed.length === 0) return res.status(201).json({ file: completed[0] })
        return res.status(201).json({ files: completed, failed })
      }).catch(next)
    })

    req.pipe(busboy)
  } catch (error) {
    return next(error)
  }
}

uploadRouter.post('/', requireAuth, handleUpload)

// Resumable upload endpoints

// 1. Initialize resumable session
uploadRouter.post('/resumable/init', requireAuth, async (_req: AuthRequest, res) => {
  // Resumable uploads streamed directly to the provider are disabled: they cannot
  // be encrypted or split. Use the standard POST /uploads (server-side encrypted) endpoint.
  return res.status(410).json({ code: 'RESUMABLE_DISABLED', message: 'Resumable upload is disabled. Uploads are encrypted server-side via POST /uploads.' })
})

uploadRouter.post('/resumable/init-legacy-disabled', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
      sizeBytes: z.string(),
      folderId: z.string().nullable().optional(),
      targetAccountId: z.string().nullable().optional()
    }).parse(req.body)

    const sizeBytes = BigInt(body.sizeBytes)
    if (sizeBytes <= 0n) return res.status(400).json({ code: 'UPLOAD_SIZE_REQUIRED', message: 'Valid sizeBytes required.' })
    if (sizeBytes > BigInt(env.MAX_UPLOAD_BYTES)) return res.status(400).json({ code: 'UPLOAD_TOO_LARGE', message: 'File exceeds max upload size.' })

    const folderId = body.folderId || null
    let targetAccountId = body.targetAccountId
    if (folderId) {
      const folderRecord = await prisma.folder.findFirstOrThrow({ where: { id: folderId, userId: req.user!.id, deletedAt: null } })
      if (folderRecord.connectedAccountId) {
        targetAccountId = folderRecord.connectedAccountId
      }
    }

    const account = await selectAccount(req.user!.id, sizeBytes, undefined, targetAccountId)
    if (!account) return res.status(400).json({ code: 'NO_ACCOUNT_WITH_ENOUGH_SPACE', message: 'No connected storage account has enough space.' })

    if (account.provider !== 'google_drive') {
      const session = await prisma.uploadSession.create({
        data: {
          userId: req.user!.id,
          targetConnectedAccountId: account.id,
          folderId,
          fileName: body.fileName,
          mimeType: body.mimeType,
          sizeBytes,
          status: 'uploading'
        }
      })
      return res.status(201).json({ sessionId: session.id, provider: account.provider, offset: 0 })
    }

    const auth = await getAuthedGoogleClient(account)
    const appFolderId = await ensureGoogleAppFolder(account)
    let targetParentId = appFolderId
    if (folderId) {
      const folderRecord = await prisma.folder.findFirst({ where: { id: folderId, userId: req.user!.id } })
      if (folderRecord?.providerFolderId) {
        targetParentId = folderRecord.providerFolderId
      }
    }

    // Initiate Google Drive Resumable Session
    const headers = new Headers()
    const token = await auth.getAccessToken()
    headers.set('Authorization', `Bearer ${token.token}`)
    headers.set('Content-Type', 'application/json')
    headers.set('X-Upload-Content-Type', body.mimeType)
    headers.set('X-Upload-Content-Length', sizeBytes.toString())

    const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: body.fileName,
        parents: [targetParentId]
      })
    })

    if (!initRes.ok) {
      const errText = await initRes.text()
      throw new Error(`Google API Init Error: ${errText}`)
    }

    const sessionUri = initRes.headers.get('location')
    if (!sessionUri) throw new Error('Google API did not return Location header.')

    const session = await prisma.uploadSession.create({
      data: {
        userId: req.user!.id,
        targetConnectedAccountId: account.id,
        folderId,
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes,
        status: 'uploading',
        googleSessionUri: sessionUri
      }
    })

    return res.status(201).json({ sessionId: session.id, provider: 'google_drive', offset: 0 })
  } catch (error) {
    return next(error)
  }
})

// 2. Query/Resume resumable status
uploadRouter.get('/resumable/status/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const session = await prisma.uploadSession.findFirstOrThrow({
      where: { id: String(req.params.id), userId: req.user!.id }
    })

    if (session.status === 'completed') {
      return res.json({ status: 'completed', offset: session.sizeBytes.toString() })
    }

    if (!session.googleSessionUri || !session.targetConnectedAccountId) {
      return res.json({ status: 'uploading', offset: '0' })
    }

    const account = await prisma.connectedAccount.findFirstOrThrow({
      where: { id: session.targetConnectedAccountId, userId: req.user!.id }
    })
    const auth = await getAuthedGoogleClient(account)
    const token = await auth.getAccessToken()

    // Query Google Drive for uploaded offset
    const queryHeaders = new Headers()
    queryHeaders.set('Authorization', `Bearer ${token.token}`)
    queryHeaders.set('Content-Range', `bytes */${session.sizeBytes}`)

    const queryRes = await fetch(session.googleSessionUri, {
      method: 'PUT',
      headers: queryHeaders
    })

    if (queryRes.status === 308) {
      const range = queryRes.headers.get('range')
      if (range) {
        // e.g. bytes=0-1048575
        const parts = range.split('-')
        const lastByte = BigInt(parts[1])
        return res.json({ status: 'uploading', offset: (lastByte + 1n).toString() })
      }
    } else if (queryRes.ok) {
      return res.json({ status: 'completed', offset: session.sizeBytes.toString() })
    }

    return res.json({ status: 'uploading', offset: '0' })
  } catch (error) {
    return res.json({ status: 'failed', offset: '0' })
  }
})

// 3. Upload chunk
uploadRouter.put('/resumable/chunk/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const session = await prisma.uploadSession.findFirstOrThrow({
      where: { id: String(req.params.id), userId: req.user!.id }
    })

    const rangeHeader = req.headers['content-range']
    if (!rangeHeader || typeof rangeHeader !== 'string') {
      return res.status(400).json({ code: 'MISSING_CONTENT_RANGE', message: 'Content-Range header is required.' })
    }

    // Parse Content-Range, e.g. bytes 0-5242879/10485760
    const match = rangeHeader.match(/bytes\s+(\d+)-(\d+)\/(\d+)/)
    if (!match) return res.status(400).json({ code: 'INVALID_CONTENT_RANGE', message: 'Invalid Content-Range format.' })

    const startByte = BigInt(match[1])
    const endByte = BigInt(match[2])
    const totalBytes = BigInt(match[3])

    if (!session.googleSessionUri || !session.targetConnectedAccountId) {
      return res.status(400).json({ code: 'UNSUPPORTED_PROVIDER', message: 'Only Google Drive resumable uploads supported.' })
    }

    const account = await prisma.connectedAccount.findFirstOrThrow({
      where: { id: session.targetConnectedAccountId, userId: req.user!.id }
    })
    const auth = await getAuthedGoogleClient(account)
    const drive = google.drive({ version: 'v3', auth })
    const token = await auth.getAccessToken()

    // Stream chunk body from client to Google Drive resumable URI
    const putHeaders = new Headers()
    putHeaders.set('Authorization', `Bearer ${token.token}`)
    putHeaders.set('Content-Range', rangeHeader)
    putHeaders.set('Content-Length', (endByte - startByte + 1n).toString())

    const putRes = await fetch(session.googleSessionUri, {
      method: 'PUT',
      headers: putHeaders,
      body: req as any,
      duplex: 'half'
    } as any)

    if (putRes.status === 308) {
      return res.json({ status: 'uploading', offset: (endByte + 1n).toString() })
    }

    if (putRes.ok) {
      // Completed! Parse metadata
      const fileMeta = await putRes.json() as { id: string; name: string; mimeType: string }

      // Make the file public (anyone with link can edit/download)
      try {
        await drive.permissions.create({
          fileId: fileMeta.id,
          requestBody: {
            role: 'writer',
            type: 'anyone'
          }
        })
      } catch (err: any) {
        console.error('Failed to make Google Drive resumable file public:', err.message || err)
      }

      let existingFile = await prisma.file.findFirst({
        where: { providerFileId: fileMeta.id, userId: req.user!.id }
      })

      if (!existingFile) {
        existingFile = await prisma.file.create({
          data: {
            userId: req.user!.id,
            connectedAccountId: account.id,
            folderId: session.folderId,
            provider: 'google_drive',
            providerFileId: fileMeta.id,
            name: fileMeta.name || session.fileName,
            mimeType: fileMeta.mimeType || session.mimeType,
            sizeBytes: totalBytes
          }
        })
      }

      await prisma.uploadSession.update({
        where: { id: session.id },
        data: { status: 'completed', completedAt: new Date() }
      })

      await createAuditLog(req.user!.id, 'UPLOAD_FILE', 'file', existingFile.id, { name: existingFile.name, size: existingFile.sizeBytes.toString() })

      syncQuotaInBackground(account.id, session.id)

      return res.status(201).json({ status: 'completed', file: { ...existingFile, sizeBytes: existingFile.sizeBytes.toString() } })
    }

    const errorMsg = await putRes.text()
    await prisma.uploadSession.update({
      where: { id: session.id },
      data: { status: 'failed', errorMessage: errorMsg }
    })

    return res.status(putRes.status).json({ code: 'UPLOAD_FAILED', message: errorMsg })
  } catch (error) {
    return next(error)
  }
})

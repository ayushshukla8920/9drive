import type { ConnectedAccount, File } from '@prisma/client'
import type { Response } from 'express'
import { prisma } from '../../config/prisma.js'
import { decryptBuffer } from '../../utils/file-crypto.js'
import { getChunkBuffer } from './provider-io.js'
import { streamGoogleFile } from './stream-google-file.js'
import { streamS3File } from '../s3/s3.service.js'

type FileWithAccount = File & { connectedAccount: ConnectedAccount }
type StreamOptions = { disposition?: 'inline' | 'attachment' }

/** Legacy (unencrypted, single-object) files stream straight from the provider. */
export function streamProviderFile(file: FileWithAccount, range: string | undefined, res: Response, options: StreamOptions = {}) {
  if (file.provider === 's3') return streamS3File(file, range, res, options)
  return streamGoogleFile(file, range, res, options)
}

function contentDisposition(type: 'inline' | 'attachment', fileName: string) {
  return `${type}; filename="${fileName.replaceAll('"', '')}"`
}

function writeAsync(res: Response, buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    res.write(buffer, (error) => (error ? reject(error) : resolve()))
  })
}

function parseRange(range: string | undefined, total: number): { start: number; end: number } | null {
  if (!range) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  if (!match) return null
  const [, startRaw, endRaw] = match
  let start = startRaw ? Number(startRaw) : 0
  let end = endRaw ? Number(endRaw) : total - 1
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  if (startRaw === '' && endRaw !== '') { start = Math.max(0, total - Number(endRaw)); end = total - 1 }
  if (start > end || start >= total) return null
  end = Math.min(end, total - 1)
  return { start, end }
}

/**
 * Streams a stored file to the response. Encrypted+chunked files are fetched
 * chunk-by-chunk from their (possibly different) provider accounts, decrypted,
 * reassembled and streamed. Legacy files fall back to a direct provider stream.
 */
export async function streamStoredFile(file: FileWithAccount, range: string | undefined, res: Response, options: StreamOptions = {}) {
  if (!file.encrypted) return streamProviderFile(file, range, res, options)

  const chunks = await prisma.fileChunk.findMany({
    where: { fileId: file.id },
    include: { connectedAccount: true },
    orderBy: { chunkIndex: 'asc' },
  })
  if (chunks.length === 0) return streamProviderFile(file, range, res, options)

  const total = Number(file.sizeBytes)
  const wanted = parseRange(range, total)

  res.setHeader('Content-Type', file.mimeType)
  res.setHeader('Accept-Ranges', 'bytes')
  if (options.disposition) res.setHeader('Content-Disposition', contentDisposition(options.disposition, file.name))

  if (wanted) {
    res.status(206)
    res.setHeader('Content-Range', `bytes ${wanted.start}-${wanted.end}/${total}`)
    res.setHeader('Content-Length', String(wanted.end - wanted.start + 1))
  } else {
    res.status(200)
    res.setHeader('Content-Length', String(total))
  }

  const start = wanted ? wanted.start : 0
  const end = wanted ? wanted.end : total - 1

  let offset = 0
  for (const chunk of chunks) {
    const plainBytes = Number(chunk.plainBytes)
    const chunkStart = offset
    const chunkEnd = offset + plainBytes - 1
    offset += plainBytes

    // Skip chunks entirely outside the requested range.
    if (chunkEnd < start || chunkStart > end) continue

    const cipher = await getChunkBuffer(chunk.connectedAccount, chunk.provider, chunk.providerFileId)
    const plain = decryptBuffer(cipher, chunk.iv, chunk.authTag)

    const sliceStart = Math.max(0, start - chunkStart)
    const sliceEnd = Math.min(plain.length, end - chunkStart + 1)
    await writeAsync(res, plain.subarray(sliceStart, sliceEnd))
  }

  res.end()
}

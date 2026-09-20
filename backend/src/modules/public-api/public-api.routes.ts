import { Router } from 'express'
import { requireApiKey, type ApiKeyRequest } from '../../middleware/api-key.middleware.js'
import { prisma } from '../../config/prisma.js'
import { handleUpload } from '../uploads/upload.routes.js'
import { streamStoredFile } from '../files/stream-file.js'

export const publicApiRouter = Router()

publicApiRouter.post('/v1/uploads', requireApiKey('files:upload'), handleUpload)

// List the caller's objects.
publicApiRouter.get('/v1/files', requireApiKey('files:read'), async (req: ApiKeyRequest, res, next) => {
  try {
    const files = await prisma.file.findMany({
      where: { userId: req.user!.id, status: 'active' },
      select: { id: true, name: true, mimeType: true, sizeBytes: true, createdAt: true, folderId: true, encrypted: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return res.json({ files: files.map((f) => ({ ...f, sizeBytes: f.sizeBytes.toString() })) })
  } catch (error) {
    return next(error)
  }
})

// Download (decrypted + reassembled) via API key.
publicApiRouter.get('/v1/files/:id/download', requireApiKey('files:read'), async (req: ApiKeyRequest, res, next) => {
  try {
    const file = await prisma.file.findFirst({
      where: { id: String(req.params.id), userId: req.user!.id, status: 'active' },
      include: { connectedAccount: true },
    })
    if (!file) return res.status(404).json({ code: 'FILE_NOT_FOUND', message: 'File not found.' })
    return streamStoredFile(file, req.headers.range, res, { disposition: 'attachment' })
  } catch (error) {
    return next(error)
  }
})

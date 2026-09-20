import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../config/prisma.js'

export type AuthRequest = Request & {
  user?: { id: string; sessionId: string }
}

const workspaceEmail = 'workspace@9drive.local'

/**
 * Cloudflare Access is the only admission layer for this deployment. The
 * database record below is an internal workspace owner used to retain the
 * existing ownership relationships for storage data; it is not a login user.
 */
export async function requireAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    const workspace = await prisma.user.upsert({
      where: { email: workspaceEmail },
      create: { name: '9Drive workspace', email: workspaceEmail, passwordHash: 'cloudflare-access-managed' },
      update: {},
    })
    req.user = { id: workspace.id, sessionId: 'cloudflare-access' }
    return next()
  } catch (error) {
    return next(error)
  }
}

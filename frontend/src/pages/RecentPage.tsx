import { useEffect, useState } from 'react'
import { FileTable } from '@/components/drive/FileTable'
import { PageHeader } from '@/components/drive/PageHeader'
import { Card } from '@/components/ui/card'
import { apiFetch, formatBytes, formatDate } from '@/lib/api'
import type { FileItem } from '@/data/drive-data'

type BackendFile = { id: string; name: string; mimeType: string; sizeBytes: string; createdAt: string; folderId?: string | null; connectedAccount?: { email: string; provider: string }; folder?: { id: string; name: string } | null }

function mimeToKind(mimeType: string): FileItem['kind'] {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.includes('pdf')) return 'pdf'
  return 'doc'
}

function mapFile(file: BackendFile): FileItem {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    createdAt: file.createdAt,
    date: formatDate(file.createdAt),
    size: formatBytes(file.sizeBytes),
    access: file.connectedAccount?.email ?? (file.connectedAccount?.provider === 's3' ? 'S3 Storage' : 'Google Drive'),
    kind: mimeToKind(file.mimeType),
    shared: 1,
    folderId: file.folderId,
    folderName: file.folder?.name,
  }
}

export function RecentPage() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    apiFetch<{ files: BackendFile[] }>('/files')
      .then((data) => {
        const mapped = data.files
          .map(mapFile)
          .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
          .slice(0, 50)
        setFiles(mapped)
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Failed to load recent objects'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <PageHeader title="Recent" description="The most recently added objects across your workspace." />
      {message ? <p className="mt-4 rounded-lg border border-[color:var(--accent-border)] bg-[color:var(--accent-soft)] p-3 text-sm font-medium text-[color:var(--accent)]">{message}</p> : null}
      {loading ? (
        <Card className="mt-6 p-6"><p className="text-sm text-[color:var(--text-muted)]">Loading recent objects…</p></Card>
      ) : files.length === 0 ? (
        <Card className="mt-6 p-6"><p className="text-sm text-[color:var(--text-muted)]">No objects yet. Upload an object from the Objects page to see it here.</p></Card>
      ) : (
        <div className="mt-6">
          <FileTable files={files} mode="default" />
        </div>
      )}
    </>
  )
}

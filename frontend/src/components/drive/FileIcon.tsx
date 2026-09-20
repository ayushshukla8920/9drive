import { FileText, Image as ImageIcon, Film, FileType } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FileItem } from '@/data/drive-data'

/* Neutral Cloudscape-style glyphs (muted, no rainbow) */
export function FileIcon({ kind, className }: { kind: FileItem['kind']; className?: string }) {
  const base = 'h-4 w-4 shrink-0'
  const muted = 'text-[color:var(--text-muted)]'
  if (kind === 'image') return <ImageIcon className={cn(base, muted, className)} />
  if (kind === 'video') return <Film className={cn(base, muted, className)} />
  if (kind === 'pdf') return <FileType className={cn(base, muted, className)} />
  return <FileText className={cn(base, muted, className)} />
}

import { Folder, MoreHorizontal } from 'lucide-react'
import { type MouseEvent } from 'react'
import { FileIcon } from '@/components/drive/FileIcon'
import type { FileItem, FolderItem } from '@/data/drive-data'

function fileType(file: FileItem): string {
  const dot = file.name.lastIndexOf('.')
  if (dot > 0 && dot < file.name.length - 1) return file.name.slice(dot + 1).toLowerCase()
  if (file.kind === 'image') return 'image'
  if (file.kind === 'video') return 'video'
  if (file.kind === 'pdf') return 'pdf'
  return '—'
}

export function ObjectsTable({
  folders,
  files,
  selectedFileIds,
  allSelected,
  onToggleFile,
  onToggleAll,
  onOpenFolder,
  onOpenFile,
  onFileContextMenu,
  onFolderContextMenu,
  onDropItem,
}: {
  folders: FolderItem[]
  files: FileItem[]
  selectedFileIds: Set<string>
  allSelected: boolean
  onToggleFile: (file: FileItem) => void
  onToggleAll: () => void
  onOpenFolder: (folder: FolderItem) => void
  onOpenFile: (file: FileItem) => void
  onFileContextMenu: (event: MouseEvent<HTMLElement>, file: FileItem) => void
  onFolderContextMenu: (event: MouseEvent<HTMLElement>, folder: FolderItem) => void
  onDropItem: (fileId: string, folderId: string) => void
}) {
  const empty = folders.length === 0 && files.length === 0

  return (
    <div className="overflow-x-auto">
      <table className="aws-table min-w-[820px]">
        <thead>
          <tr>
            <th className="w-10">
              <input
                type="checkbox"
                className="aws-check"
                checked={allSelected}
                onChange={onToggleAll}
                aria-label="Select all objects"
              />
            </th>
            <th>Name</th>
            <th className="w-32">Type</th>
            <th className="w-56">Last modified</th>
            <th className="w-28">Size</th>
            <th className="w-36">Storage class</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {/* Folders first (S3 "common prefixes") */}
          {folders.map((folder) => (
            <tr
              key={`folder-${folder.id ?? folder.name}`}
              onContextMenu={(event) => onFolderContextMenu(event, folder)}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }}
              onDragEnter={(event) => event.currentTarget.classList.add('selected')}
              onDragLeave={(event) => event.currentTarget.classList.remove('selected')}
              onDrop={(event) => {
                event.preventDefault()
                event.currentTarget.classList.remove('selected')
                const fileId = event.dataTransfer.getData('text/plain')
                if (fileId && folder.id) onDropItem(fileId, folder.id)
              }}
            >
              <td />
              <td>
                <span className="flex min-w-0 items-center gap-2.5">
                  <Folder className="h-4 w-4 shrink-0 text-[color:var(--accent)]" />
                  <button className="aws-folder-link truncate max-w-[420px]" onClick={() => onOpenFolder(folder)} title={folder.name}>
                    {folder.name}/
                  </button>
                </span>
              </td>
              <td className="text-[color:var(--text-muted)]">Folder</td>
              <td className="text-[color:var(--text-muted)]">—</td>
              <td className="text-[color:var(--text-muted)]">—</td>
              <td className="text-[color:var(--text-muted)]">—</td>
              <td className="text-right">
                <button
                  className="aws-row-kebab"
                  onClick={(event) => { event.stopPropagation(); onFolderContextMenu(event, folder) }}
                  aria-label={`Actions for ${folder.name}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}

          {/* Objects */}
          {files.map((file) => {
            const selected = selectedFileIds.has(file.id ?? '')
            return (
              <tr
                key={`file-${file.id ?? file.name}`}
                className={selected ? 'selected' : undefined}
                draggable
                onDragStart={(event) => { event.dataTransfer.setData('text/plain', file.id ?? ''); event.dataTransfer.effectAllowed = 'move' }}
                onContextMenu={(event) => onFileContextMenu(event, file)}
              >
                <td>
                  <input
                    type="checkbox"
                    className="aws-check"
                    checked={selected}
                    onChange={() => onToggleFile(file)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Select ${file.name}`}
                  />
                </td>
                <td>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <FileIcon kind={file.kind} />
                    <button className="aws-obj-link truncate max-w-[420px]" onClick={() => onOpenFile(file)} title={file.name}>
                      {file.name}
                    </button>
                  </span>
                </td>
                <td className="text-[color:var(--text-muted)]">{fileType(file)}</td>
                <td className="text-[color:var(--text-muted)]">{file.date && file.date !== '--' ? file.date : '—'}</td>
                <td className="text-[color:var(--text-muted)]">{file.size}</td>
                <td><span className="aws-tag">Standard</span></td>
                <td className="text-right">
                  <button
                    className="aws-row-kebab"
                    onClick={(event) => { event.stopPropagation(); onFileContextMenu(event, file) }}
                    aria-label={`Actions for ${file.name}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            )
          })}

          {empty ? (
            <tr>
              <td colSpan={7}>
                <div className="aws-empty">
                  <p className="text-[15px] font-bold text-[color:var(--text-heading)]">No objects</p>
                  <p className="mt-1 text-[13px]">Upload an object or create a folder to get started.</p>
                </div>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

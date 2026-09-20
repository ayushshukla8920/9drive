import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import { API_URL } from '@/lib/api'

export type UploadProgressStatus = 'uploading' | 'done' | 'error' | 'partial'
export type UploadProgressFile = { name: string; size: number; percent: number; status: UploadProgressStatus }
export type UploadProgressState = { open: boolean; fileName: string; percent: number; status: UploadProgressStatus; files: UploadProgressFile[] }

type PendingUpload = { file: File; folderId: string | null; targetAccountId?: string | null }

type UploadContextType = {
  uploadProgress: UploadProgressState
  setUploadProgress: React.Dispatch<React.SetStateAction<UploadProgressState>>
  uploadFiles: (files: File[], folderId: string | null, targetAccountId?: string | null) => Promise<void>
  retryFailedUpload: (fileName: string) => Promise<void>
}

const UploadContext = createContext<UploadContextType | undefined>(undefined)

export function UploadProvider({ children }: { children: ReactNode }) {
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState>({
    open: false,
    fileName: '',
    percent: 0,
    status: 'uploading',
    files: []
  })
  // Track params per file name so a failed upload can be retried.
  const pendingRef = useRef<Record<string, PendingUpload>>({})

  /**
   * Uploads a single file via multipart POST. The server encrypts the file
   * (AES-256-GCM) and splits it into chunks across storage accounts, so the
   * bytes are never readable inside Google Drive / S3.
   */
  function uploadSingleFile(file: File, folderId: string | null, onProgress: (percent: number) => void, targetAccountId?: string | null) {
    return new Promise<void>((resolve, reject) => {
      const form = new FormData()
      // Fields MUST be appended before the file so the server reads metadata first.
      form.append('sizeBytes', String(file.size))
      form.append('fileName', file.name)
      form.append('mimeType', file.type || 'application/octet-stream')
      if (folderId) form.append('folderId', folderId)
      if (targetAccountId) form.append('targetAccountId', targetAccountId)
      form.append('file', file, file.name)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${API_URL}/uploads`)
      xhr.withCredentials = true
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100)
          resolve()
        } else {
          let message = 'Upload failed'
          try { message = JSON.parse(xhr.responseText)?.message || message } catch { /* ignore */ }
          reject(new Error(message))
        }
      }
      xhr.onerror = () => reject(new Error('Upload failed'))
      xhr.send(form)
    })
  }

  async function uploadFiles(filesToUpload: File[], targetFolderId: string | null, targetAccountId?: string | null) {
    if (filesToUpload.length === 0) return

    setUploadProgress({
      open: true,
      fileName: filesToUpload.length === 1 ? filesToUpload[0].name : `${filesToUpload.length} files`,
      percent: 0,
      status: 'uploading',
      files: filesToUpload.map(f => ({ name: f.name, size: f.size, percent: 0, status: 'uploading' }))
    })

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i]
      pendingRef.current[file.name] = { file, folderId: targetFolderId, targetAccountId }
      try {
        await uploadSingleFile(file, targetFolderId, (filePercent) => {
          setUploadProgress((current) => {
            const nextFiles = [...current.files]
            if (nextFiles[i]) nextFiles[i] = { ...nextFiles[i], percent: filePercent, status: filePercent >= 100 ? 'done' : 'uploading' }
            const overallPercent = Math.round(nextFiles.reduce((sum, f) => sum + f.percent, 0) / nextFiles.length)
            return { ...current, percent: overallPercent, files: nextFiles }
          })
        }, targetAccountId)
      } catch (err) {
        console.error('File upload failed:', file.name, err)
        setUploadProgress((current) => {
          const nextFiles = [...current.files]
          if (nextFiles[i]) nextFiles[i] = { ...nextFiles[i], status: 'error' }
          return { ...current, status: 'partial', files: nextFiles }
        })
      }
    }

    window.dispatchEvent(new Event('9drive:storage-changed'))
    window.dispatchEvent(new Event('9drive:upload-completed'))
  }

  async function retryFailedUpload(fileName: string) {
    const pending = pendingRef.current[fileName]
    if (!pending) return

    setUploadProgress((current) => ({
      ...current,
      status: 'uploading',
      files: current.files.map(f => f.name === fileName ? { ...f, status: 'uploading' as const } : f)
    }))

    const fileIndex = uploadProgress.files.findIndex(f => f.name === fileName)
    try {
      await uploadSingleFile(pending.file, pending.folderId, (filePercent) => {
        setUploadProgress((current) => {
          const nextFiles = [...current.files]
          if (nextFiles[fileIndex]) nextFiles[fileIndex] = { ...nextFiles[fileIndex], percent: filePercent, status: filePercent >= 100 ? 'done' : 'uploading' }
          const overallPercent = Math.round(nextFiles.reduce((sum, f) => sum + f.percent, 0) / nextFiles.length)
          const allDone = nextFiles.every(f => f.status === 'done')
          return { ...current, percent: overallPercent, status: allDone ? 'done' : 'uploading', files: nextFiles }
        })
      }, pending.targetAccountId)

      window.dispatchEvent(new Event('9drive:storage-changed'))
      window.dispatchEvent(new Event('9drive:upload-completed'))
    } catch (err) {
      console.error('Retry upload failed:', fileName, err)
      setUploadProgress((current) => ({
        ...current,
        status: 'partial',
        files: current.files.map(f => f.name === fileName ? { ...f, status: 'error' as const } : f)
      }))
    }
  }

  return (
    <UploadContext.Provider value={{ uploadProgress, setUploadProgress, uploadFiles, retryFailedUpload }}>
      {children}
    </UploadContext.Provider>
  )
}

export function useUpload() {
  const context = useContext(UploadContext)
  if (context === undefined) {
    throw new Error('useUpload must be used within an UploadProvider')
  }
  return context
}

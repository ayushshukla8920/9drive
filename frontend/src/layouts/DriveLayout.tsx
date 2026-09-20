import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { Outlet, useOutletContext, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Bell,
  Braces,
  Gauge,
  History,
  Menu,
  Moon,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  Star,
  Sun,
  Trash2,
  X,
  ShieldCheck,
  HardDrive,
  Info,
  CheckCircle,
  ChevronDown,
  Upload,
  Database,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiFetch, formatBytes } from '@/lib/api'
import { useUpload } from '@/context/UploadContext'
import { getGravatarUrl } from '@/lib/gravatar'
import { cn } from '@/lib/utils'

const menu = [
  { label: 'Objects', icon: Database, href: '/all-files', section: 'Storage' },
  { label: 'Shared with me', icon: Share2, href: '/shared', section: 'Storage' },
  { label: 'Recent', icon: History, href: '/recent', section: 'Storage' },
  { label: 'Starred', icon: Star, href: '/starred', section: 'Storage' },
  { label: 'Trash', icon: Trash2, href: '/trash', section: 'Storage' },
  { label: 'Storage metrics', icon: Gauge, href: '/quota', section: 'Manage' },
  { label: 'Activity log', icon: History, href: '/activity', section: 'Manage' },
  { label: 'Settings', icon: Settings, href: '/settings', section: 'Manage' },
  { label: 'API access', icon: Braces, href: '/api', section: 'Manage' },
]

type StorageSummary = {
  totalBytes: string
  usedBytes: string
  availableBytes: string
}

type StorageBreakdown = {
  photo: string
  video: string
  document: string
}

function SystemInfoDropdown({ storage }: { storage: any }) {
  const activeGoogle = storage?.accounts?.filter((a: any) => a.provider === 'google_drive' && a.status === 'connected') ?? []

  return (
    <div className="absolute right-0 top-11 z-[70] w-[min(calc(100vw-2rem),22rem)] overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-pop)]">
      <div className="border-b border-[color:var(--border)] px-4 py-3 bg-[color:var(--surface-subtle)]">
        <p className="text-sm font-bold text-[color:var(--text-heading)]">Account & resource info</p>
        <p className="text-xs text-[color:var(--text-muted)]">Overview of your connections & guidelines</p>
      </div>
      <div className="max-h-96 overflow-y-auto p-4 space-y-4">
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-[color:var(--success)]" /> Connection status</h4>
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between text-xs rounded-lg bg-[color:var(--surface-subtle)] p-2.5 border border-[color:var(--border)]">
              <span className="font-semibold text-[color:var(--text)]">Google Drive accounts</span>
              <span className={activeGoogle.length > 0 ? 'text-[color:var(--success)] font-bold' : 'text-[color:var(--warning)] font-bold'}>
                {activeGoogle.length} connected
              </span>
            </div>
            {activeGoogle.map((acc: any) => (
              <p key={acc.id} className="text-[11px] text-[color:var(--text-muted)] truncate px-2.5">— {acc.email}</p>
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5 text-[color:var(--accent)]" /> Storage engine</h4>
          <div className="mt-2 text-xs text-[color:var(--text-muted)] space-y-1 bg-[color:var(--surface-subtle)] p-2.5 rounded-lg border border-[color:var(--border)]">
            <p>• <b>Metadata:</b> MySQL workspace catalog</p>
            <p>• <b>Object roots:</b> Google Drive &amp; S3-compatible storage</p>
            <p>• <b>Max upload:</b> 5 GB per stream</p>
          </div>
        </div>
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] flex items-center gap-1.5"><Info className="h-3.5 w-3.5 text-[color:var(--accent)]" /> Usage tips</h4>
          <ul className="mt-2 text-[11px] text-[color:var(--text-muted)] list-disc list-inside space-y-1 pl-1">
            <li>Folders are workspace prefixes stored in MySQL.</li>
            <li>Objects stream directly to Google Drive or S3-compatible storage.</li>
            <li>Use Sync to fetch changes made directly in a provider.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

type WorkspaceIdentity = { name: string; email: string }

function Sidebar({ onNavigate, storage, breakdown }: { onNavigate?: () => void; storage: StorageSummary | null; breakdown: StorageBreakdown }) {
  const used = Number(storage?.usedBytes ?? 0)
  const total = Number(storage?.totalBytes ?? 0)
  const progress = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const items = [
    ['Photos', formatBytes(breakdown.photo)],
    ['Videos', formatBytes(breakdown.video)],
    ['Documents', formatBytes(breakdown.document)],
    ['Free', formatBytes(storage?.availableBytes)],
  ]

  return (
    <aside className="aws-side-nav flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <Database className="h-5 w-5 text-[color:var(--accent)]" />
        <div>
          <p className="aws-side-title">9Drive S3</p>
        </div>
      </div>
      <div className="h-px w-full bg-[color:var(--border)]" />

      <nav className="mt-2 grid gap-0.5 overflow-y-auto px-2">
        {menu.map((item, index) => (
          <div key={item.label} className={index === 0 || item.section !== menu[index - 1].section ? 'mt-3 first:mt-1' : ''}>
            {index === 0 || item.section !== menu[index - 1].section ? <p className="nav-section-label mb-1 px-3">{item.section}</p> : null}
            <NavLink to={item.href} onClick={onNavigate} className={({ isActive }) => cn('nav-item inline-flex h-9 w-full items-center gap-2.5 px-3 text-[13px]', isActive && 'active')}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-[color:var(--border)] p-4 text-[12px]">
        <p className="nav-section-label mb-2">Storage usage</p>
        <div className="mb-3 space-y-1.5">
          {items.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between text-[color:var(--text-muted)]">
              <span>{label}</span>
              <span className="font-semibold text-[color:var(--text)]">{value}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs font-bold text-[color:var(--text)]">
          <span>{formatBytes(storage?.usedBytes)} used</span>
          <span className="text-[color:var(--text-faint)]">{formatBytes(storage?.totalBytes)}</span>
        </div>
        <div className="storage-meter my-2 h-1.5 overflow-hidden rounded-full">
          <span className="block h-full rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-3 flex items-center gap-1.5 leading-5 text-[color:var(--text-muted)]"><ShieldCheck className="h-3.5 w-3.5 text-[color:var(--success)]" />Protected by Cloudflare Zero Trust.</p>
      </div>
    </aside>
  )
}

type ConnectedAccount = {
  id: string
  email: string
  provider: string
}

export type DriveLayoutContext = {
  setHeaderActions: (actions: ReactNode) => void
}

export function useDriveLayoutActions() {
  return useOutletContext<DriveLayoutContext>()
}

export function DriveLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchValue, setSearchValue] = useState(searchParams.get('q') ?? '')
  const user: WorkspaceIdentity = { name: 'Shared workspace', email: 'Cloudflare Access' }
  const [storage, setStorage] = useState<StorageSummary | null>(null)
  const [breakdown, setBreakdown] = useState<StorageBreakdown>({ photo: '0', video: '0', document: '0' })
  const [infoOpen, setInfoOpen] = useState(false)
  const [, setHeaderActions] = useState<ReactNode>(null)
  const { uploadProgress, setUploadProgress, retryFailedUpload } = useUpload()
  const [uploadProgressCollapsed, setUploadProgressCollapsed] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('9drive:theme') : null
    if (saved === 'light' || saved === 'dark') return saved
    return 'light'
  })

  // Advanced search states
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterKind, setFilterKind] = useState(searchParams.get('kind') ?? '')
  const [filterAccountId, setFilterAccountId] = useState(searchParams.get('accountId') ?? '')
  const [filterMinSize, setFilterMinSize] = useState(() => {
    const min = searchParams.get('minSize')
    return min ? String(Math.round(Number(min) / (1024 * 1024))) : ''
  })
  const [filterMaxSize, setFilterMaxSize] = useState(() => {
    const max = searchParams.get('maxSize')
    return max ? String(Math.round(Number(max) / (1024 * 1024))) : ''
  })
  const [filterStartDate, setFilterStartDate] = useState(() => {
    const raw = searchParams.get('startDate')
    return raw ? raw.split('T')[0] : ''
  })
  const [filterEndDate, setFilterEndDate] = useState(() => {
    const raw = searchParams.get('endDate')
    return raw ? raw.split('T')[0] : ''
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
      root.classList.remove('light')
    } else {
      root.classList.add('light')
      root.classList.remove('dark')
    }
    localStorage.setItem('9drive:theme', theme)
  }, [theme])

  useEffect(() => {
    getGravatarUrl(user.email, 48).then(setAvatarUrl).catch(() => setAvatarUrl(''))
  }, [user.email])

  function toggleTheme() {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  }

  async function loadSidebarStats() {
    await Promise.all([
      apiFetch<StorageSummary>('/storage/summary').then(setStorage),
      apiFetch<StorageBreakdown>('/storage/breakdown').then(setBreakdown),
    ])
  }

  async function loadConnectedAccounts() {
    try {
      const data = await apiFetch<{ accounts: ConnectedAccount[] }>('/connected-accounts')
      setAccounts(data.accounts)
    } catch (e) {
      console.warn('Failed to load accounts for filter dropdown', e)
    }
  }

  useEffect(() => {
    setSearchValue(searchParams.get('q') ?? '')
    setFilterKind(searchParams.get('kind') ?? '')
    setFilterAccountId(searchParams.get('accountId') ?? '')
    setFilterMinSize(() => {
      const min = searchParams.get('minSize')
      return min ? String(Math.round(Number(min) / (1024 * 1024))) : ''
    })
    setFilterMaxSize(() => {
      const max = searchParams.get('maxSize')
      return max ? String(Math.round(Number(max) / (1024 * 1024))) : ''
    })

    const rawStart = searchParams.get('startDate')
    setFilterStartDate(rawStart ? rawStart.split('T')[0] : '')

    const rawEnd = searchParams.get('endDate')
    setFilterEndDate(rawEnd ? rawEnd.split('T')[0] : '')
  }, [searchParams])

  function applyFilters() {
    const nextParams = new URLSearchParams()
    const activeFolderId = searchParams.get('folderId')
    if (activeFolderId && location.pathname === '/all-files') {
      nextParams.set('folderId', activeFolderId)
    }

    const q = searchValue.trim()
    if (q) nextParams.set('q', q)

    if (filterKind) nextParams.set('kind', filterKind)
    if (filterAccountId) nextParams.set('accountId', filterAccountId)

    if (filterMinSize) {
      const bytes = Number(filterMinSize) * 1024 * 1024
      if (!isNaN(bytes)) nextParams.set('minSize', String(bytes))
    }
    if (filterMaxSize) {
      const bytes = Number(filterMaxSize) * 1024 * 1024
      if (!isNaN(bytes)) nextParams.set('maxSize', String(bytes))
    }

    if (filterStartDate) {
      nextParams.set('startDate', new Date(filterStartDate).toISOString())
    }
    if (filterEndDate) {
      nextParams.set('endDate', new Date(filterEndDate).toISOString())
    }

    setFiltersOpen(false)
    navigate({ pathname: '/all-files', search: nextParams.toString() })
  }

  function clearFilters() {
    setFilterKind('')
    setFilterAccountId('')
    setFilterMinSize('')
    setFilterMaxSize('')
    setFilterStartDate('')
    setFilterEndDate('')
    setFiltersOpen(false)

    const nextParams = new URLSearchParams()
    const activeFolderId = searchParams.get('folderId')
    if (activeFolderId && location.pathname === '/all-files') {
      nextParams.set('folderId', activeFolderId)
    }
    const q = searchValue.trim()
    if (q) nextParams.set('q', q)

    navigate({ pathname: '/all-files', search: nextParams.toString() })
  }

  function searchFiles(event: FormEvent) {
    event.preventDefault()
    applyFilters()
  }

  useEffect(() => {
    loadSidebarStats().catch(() => undefined)
    loadConnectedAccounts().catch(() => undefined)
    window.addEventListener('9drive:storage-changed', loadSidebarStats)
    return () => window.removeEventListener('9drive:storage-changed', loadSidebarStats)
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { setInfoOpen(false); setFiltersOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const avatarInitial = (user.name ?? 'U').trim().charAt(0).toUpperCase()

  return (
    <main className="drive-app flex min-h-screen w-full flex-col overflow-x-hidden">
      {/* ---------- AWS global top navigation ---------- */}
      <header className="aws-top-nav">
        <button className="aws-nav-btn lg:hidden" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}>
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-[color:var(--aws-orange)]" />
          <span className="aws-brand-word">9Drive <span className="aws-brand-badge">S3</span></span>
        </div>

        <div className="relative ml-auto w-full max-w-md">
          <form onSubmit={searchFiles} className="aws-search relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-faint)]" />
            <Input value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="Search objects" className="h-[34px] pl-9 pr-10" />
            <button type="button" onClick={() => setFiltersOpen(!filtersOpen)} className={cn('absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-faint)] hover:text-[color:var(--accent)]', filtersOpen && 'text-[color:var(--accent)]')} aria-label="Search filters"><SlidersHorizontal className="h-4 w-4" /></button>
          </form>

          {filtersOpen && (
            <div className="absolute left-0 right-0 top-11 z-[70] rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-[var(--shadow-pop)]">
              <div className="flex items-center justify-between border-b border-[color:var(--border)] pb-3">
                <span className="text-sm font-bold text-[color:var(--text-heading)]">Advanced filters</span>
                <button type="button" onClick={clearFilters} className="text-xs font-bold text-[color:var(--accent)] hover:underline">Clear all</button>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">File type</label>
                  <select value={filterKind} onChange={(e) => setFilterKind(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-[color:var(--border-input)] bg-[color:var(--surface)] px-3 text-sm focus:border-[color:var(--accent)] focus:outline-none">
                    <option value="">All types</option>
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="pdf">PDF</option>
                    <option value="doc">Document</option>
                    <option value="archive">Archive</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">Connected account</label>
                  <select value={filterAccountId} onChange={(e) => setFilterAccountId(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-[color:var(--border-input)] bg-[color:var(--surface)] px-3 text-sm focus:border-[color:var(--accent)] focus:outline-none">
                    <option value="">All accounts</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>{acc.email} ({acc.provider})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">Size range (MB)</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input type="number" placeholder="Min" value={filterMinSize} onChange={(e) => setFilterMinSize(e.target.value)} className="block h-10 w-full rounded-lg border border-[color:var(--border-input)] bg-[color:var(--surface)] px-3 text-sm focus:border-[color:var(--accent)] focus:outline-none" />
                    <span className="text-[color:var(--text-faint)] text-xs font-semibold">to</span>
                    <input type="number" placeholder="Max" value={filterMaxSize} onChange={(e) => setFilterMaxSize(e.target.value)} className="block h-10 w-full rounded-lg border border-[color:var(--border-input)] bg-[color:var(--surface)] px-3 text-sm focus:border-[color:var(--accent)] focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">Date range</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="block h-10 w-full rounded-lg border border-[color:var(--border-input)] bg-[color:var(--surface)] px-3 text-sm focus:border-[color:var(--accent)] focus:outline-none" />
                    <span className="text-[color:var(--text-faint)] text-xs font-semibold">to</span>
                    <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="block h-10 w-full rounded-lg border border-[color:var(--border-input)] bg-[color:var(--surface)] px-3 text-sm focus:border-[color:var(--accent)] focus:outline-none" />
                  </div>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2 border-t border-[color:var(--border)] pt-4">
                <Button variant="outline" size="sm" type="button" onClick={() => setFiltersOpen(false)}>Cancel</Button>
                <Button variant="default" size="sm" type="button" onClick={applyFilters}>Apply filters</Button>
              </div>
            </div>
          )}
        </div>

        <button className="aws-nav-btn" aria-label="Toggle theme" onClick={toggleTheme}>
          {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
        <div className="relative">
          <button className="aws-nav-btn relative" aria-label="Account info" aria-expanded={infoOpen} onClick={() => setInfoOpen(!infoOpen)}>
            <Bell className="h-4 w-4" />
            {!infoOpen ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[color:var(--aws-orange)]" /> : null}
          </button>
          {infoOpen ? <SystemInfoDropdown storage={storage} /> : null}
        </div>
        <div className="ml-1 hidden items-center gap-2 sm:flex">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full border border-white/20 object-cover" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--aws-orange)] text-xs font-bold text-white">{avatarInitial}</div>
          )}
        </div>
      </header>

      {/* ---------- Body: side nav + content ---------- */}
      <div className="flex min-h-0 w-full flex-1 lg:h-[calc(100vh-48px)] lg:overflow-hidden">
        <div className="hidden lg:block lg:h-full lg:shrink-0">
          <Sidebar storage={storage} breakdown={breakdown} />
        </div>

        {/* Mobile drawer */}
        <div className={cn('fixed inset-0 z-[65] bg-black/40 transition-opacity lg:hidden', sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0')} onClick={() => setSidebarOpen(false)} />
        <div className={cn('fixed inset-y-0 left-0 z-[66] w-72 transform bg-[color:var(--surface)] shadow-2xl transition-transform duration-300 ease-out lg:hidden', sidebarOpen ? 'translate-x-0' : '-translate-x-full')}>
          <div className="absolute right-3 top-3 z-10">
            <button className="aws-row-kebab" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X className="h-5 w-5" /></button>
          </div>
          <Sidebar storage={storage} breakdown={breakdown} onNavigate={() => setSidebarOpen(false)} />
        </div>

        <section className="aws-main min-w-0 flex-1 lg:h-full lg:overflow-y-auto">
          <div className="content-canvas px-4 pt-5 sm:px-6">
            <Outlet context={{ setHeaderActions } satisfies DriveLayoutContext} />
          </div>
        </section>
      </div>

      {/* ---------- Upload progress ---------- */}
      {uploadProgress.open ? (
        <div className="fixed inset-x-3 bottom-3 z-[80] max-h-[70dvh] overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-pop)] sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[min(420px,calc(100vw-2.5rem))]">
          <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
            <div className="flex items-center gap-2 font-bold text-sm text-[color:var(--text-heading)]">
              {uploadProgress.status === 'done' ? <CheckCircle className="h-5 w-5 text-[color:var(--success)]" /> : uploadProgress.status === 'partial' || uploadProgress.status === 'error' ? <X className="h-5 w-5 text-[color:var(--danger)]" /> : <Upload className="h-5 w-5 text-[color:var(--accent)]" />}
              {uploadProgress.status === 'done' ? 'Upload complete' : uploadProgress.status === 'partial' ? 'Upload completed with errors' : uploadProgress.status === 'error' ? 'Upload failed' : uploadProgress.percent >= 99 ? 'Processing on server' : 'Uploading objects'}
            </div>
            <div className="flex items-center gap-1">
              <button className="aws-row-kebab" onClick={() => setUploadProgressCollapsed(!uploadProgressCollapsed)}><ChevronDown className={cn('h-4 w-4 transition-transform', uploadProgressCollapsed && 'rotate-180')} /></button>
              <button className="aws-row-kebab" onClick={() => setUploadProgress((current) => ({ ...current, open: false }))}><X className="h-4 w-4" /></button>
            </div>
          </div>
          {!uploadProgressCollapsed && (
            <div className="p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <p className="truncate font-semibold">{uploadProgress.fileName}</p>
                <span className="text-[color:var(--text-muted)]">{uploadProgress.percent}%</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-[color:var(--surface-hover)]">
                <div className={uploadProgress.status === 'error' || uploadProgress.status === 'partial' ? 'h-full rounded-full bg-[color:var(--danger)]' : uploadProgress.status === 'done' ? 'h-full rounded-full bg-[color:var(--success)]' : 'h-full rounded-full bg-[color:var(--accent)]'} style={{ width: `${uploadProgress.percent}%` }} />
              </div>
              {uploadProgress.files.length > 0 ? (
                <div className="mt-4 grid max-h-64 gap-3 overflow-y-auto pr-1">
                  {uploadProgress.files.map((file, index) => (
                    <div key={`${file.name}-${file.size}-${index}`} className="grid gap-1 rounded-lg bg-[color:var(--surface-subtle)] p-3">
                      <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
                        <p className="min-w-0 flex-1 truncate font-semibold" title={file.name}>{file.name}</p>
                        <span className="shrink-0 text-xs text-[color:var(--text-muted)]">{file.percent}%</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-xs text-[color:var(--text-muted)]">
                        <span>{formatBytes(file.size)}</span>
                        <div className="flex items-center gap-2">
                          {file.status === 'error' && (
                            <Button variant="default" size="sm" className="h-6 px-2 text-[11px]" onClick={() => retryFailedUpload(file.name)}>
                              Retry
                            </Button>
                          )}
                          <span className={file.status === 'error' ? 'font-semibold text-[color:var(--danger)]' : file.status === 'done' ? 'font-semibold text-[color:var(--success)]' : 'font-semibold text-[color:var(--accent)]'}>
                            {file.status === 'error' ? 'Failed' : file.status === 'done' ? 'Done' : file.percent >= 99 ? 'Processing' : 'Uploading'}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-[color:var(--surface-hover)]">
                        <div className={file.status === 'error' ? 'h-full rounded-full bg-[color:var(--danger)]' : file.status === 'done' ? 'h-full rounded-full bg-[color:var(--success)]' : 'h-full rounded-full bg-[color:var(--accent)]'} style={{ width: `${file.percent}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </main>
  )
}

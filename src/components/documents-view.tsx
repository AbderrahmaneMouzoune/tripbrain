'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type React from 'react'
import {
  Upload,
  Trash2,
  Download,
  Search,
  File,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FolderOpen,
  SortAsc,
  SortDesc,
  LayoutGrid,
  LayoutList,
  X,
  FileArchive,
  FileSpreadsheet,
  Eye,
  Inbox,
  ArrowUpRight,
  PlusCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer'
import { useDocuments, StoredFile } from '@/hooks/use-documents'
import {
  SOURCE_CATEGORIES,
  CATEGORY_COLOR_CLASSES,
} from '@/lib/document-sources'

/**
 * Opens a source: tries the deep link first; if the app is not installed the
 * browser stays visible and the fallback URL is opened in a new tab after 1.5s.
 */
function openSource(deepLink: string, fallback: string) {
  try {
    window.location.href = deepLink
  } catch {
    // If the deep link assignment fails, open the fallback directly
    try {
      window.open(fallback, '_blank', 'noopener,noreferrer')
    } catch {
      // Silently ignore popup-blocker or CSP errors
    }
    return
  }

  const handleVisibilityChange = () => {
    if (document.hidden) {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }

  const timer = setTimeout(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    try {
      window.open(fallback, '_blank', 'noopener,noreferrer')
    } catch {
      // Silently ignore popup-blocker or CSP errors
    }
  }, 1500)

  document.addEventListener('visibilitychange', handleVisibilityChange)
}

// ---------------------------------------------------------------------------
// DocumentSourcesDrawer
// ---------------------------------------------------------------------------

interface DocumentSourcesDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function DocumentSourcesDrawer({
  open,
  onOpenChange,
}: DocumentSourcesDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle>Importe depuis tes apps</DrawerTitle>
          <DrawerDescription>
            Retrouve tes réservations en 1 clic · Plus besoin de chercher dans
            tes emails
          </DrawerDescription>
        </DrawerHeader>

        <div className="overflow-y-auto px-4 pb-8">
          {SOURCE_CATEGORIES.map((category) => {
            const colors =
              CATEGORY_COLOR_CLASSES[category.color] ??
              CATEGORY_COLOR_CLASSES['blue']
            return (
              <div key={category.label} className="mt-5">
                {/* Category header */}
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${colors.dot}`}
                    aria-hidden
                  />
                  <p className="text-foreground text-xs font-semibold uppercase tracking-wider">
                    {category.label}
                  </p>
                </div>
                {/* Source cards grid */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {category.items.map((source) => (
                    <button
                      key={source.name}
                      onClick={() =>
                        openSource(source.deepLink, source.fallback)
                      }
                      className="hover:border-primary/40 hover:bg-primary/5 group flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all"
                    >
                      <div className="flex w-full items-start justify-between gap-1">
                        <span className="text-xl leading-none">
                          {source.icon}
                        </span>
                        <ArrowUpRight className="text-muted-foreground group-hover:text-primary h-3.5 w-3.5 shrink-0 transition-colors" />
                      </div>
                      <span className="text-foreground text-sm font-medium leading-tight">
                        {source.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <DrawerClose className="sr-only">Fermer</DrawerClose>
      </DrawerContent>
    </Drawer>
  )
}

type SortField = 'name' | 'size' | 'addedAt'
type SortOrder = 'asc' | 'desc'
type ViewMode = 'grid' | 'list'

// ---------------------------------------------------------------------------
// DocumentsEmptyState
// ---------------------------------------------------------------------------

interface DocumentsEmptyStateProps {
  onOpenSources: () => void
  onAddFiles: () => void
  isDragging: boolean
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
}

function DocumentsEmptyState({
  onOpenSources,
  onAddFiles,
  isDragging,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
}: DocumentsEmptyStateProps) {
  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      className={`flex flex-col items-center gap-6 rounded-3xl border-2 border-dashed px-6 py-16 text-center transition-all ${
        isDragging
          ? 'border-primary bg-primary/5'
          : 'border-border/50 hover:border-border/80'
      }`}
    >
      {/* Icon */}
      <div
        className={`flex h-20 w-20 items-center justify-center rounded-3xl transition-colors ${
          isDragging ? 'bg-primary/10' : 'bg-muted'
        }`}
      >
        {isDragging ? (
          <Upload className="text-primary h-10 w-10" strokeWidth={1.5} />
        ) : (
          <FolderOpen
            className="text-muted-foreground h-10 w-10"
            strokeWidth={1}
          />
        )}
      </div>

      {/* Copy */}
      <div className="max-w-sm space-y-2">
        <p className="text-foreground font-semibold">
          {isDragging ? 'Déposez vos fichiers ici' : 'Aucun document'}
        </p>
        <p className="text-muted-foreground text-sm">
          {isDragging
            ? 'Déposez vos fichiers pour les ajouter.'
            : 'On ne voit encore aucun document… Commence par importer tes réservations depuis Booking, Airbnb ou Gmail, ou ajoute tes fichiers ici.'}
        </p>
      </div>

      {/* Actions */}
      {!isDragging && (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button onClick={onOpenSources} className="gap-2">
            <Inbox className="h-4 w-4" />
            Importer depuis mes apps
          </Button>
          <Button variant="outline" onClick={onAddFiles} className="gap-2">
            <Upload className="h-4 w-4" />
            Ajouter un fichier
          </Button>
        </div>
      )}
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function getFileIcon(type: string, name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''

  if (type.startsWith('image/'))
    return <FileImage className="h-6 w-6 text-blue-500" />
  if (type.startsWith('video/'))
    return <FileVideo className="h-6 w-6 text-purple-500" />
  if (type.startsWith('audio/'))
    return <FileAudio className="h-6 w-6 text-pink-500" />
  if (type === 'application/pdf' || ext === 'pdf')
    return <FileText className="h-6 w-6 text-red-500" />
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext))
    return <FileSpreadsheet className="h-6 w-6 text-green-500" />
  if (['doc', 'docx', 'odt', 'txt', 'md'].includes(ext))
    return <FileText className="h-6 w-6 text-blue-400" />
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext))
    return <FileArchive className="h-6 w-6 text-yellow-500" />
  return <File className="h-6 w-6 text-muted-foreground" />
}

function getFileTypeBadge(type: string, name: string): string {
  const ext = name.split('.').pop()?.toUpperCase() ?? 'FILE'
  if (type.startsWith('image/')) return ext || 'IMAGE'
  if (type.startsWith('video/')) return ext || 'VIDEO'
  if (type.startsWith('audio/')) return ext || 'AUDIO'
  return ext || type.split('/').pop()?.toUpperCase() || 'FILE'
}

/** Returns true for file types the browser can render natively in a new tab. */
function isPreviewable(type: string, name: string): boolean {
  if (
    type.startsWith('image/') ||
    type.startsWith('video/') ||
    type.startsWith('audio/') ||
    type.startsWith('text/')
  )
    return true
  if (type === 'application/pdf') return true
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ['pdf', 'txt', 'md', 'csv'].includes(ext)
}

interface FileCardProps {
  file: StoredFile
  viewMode: ViewMode
  onDelete: (id: string) => void
  onDownload: (file: StoredFile) => void
  onPreview: (file: StoredFile) => void
  previewUrl: string | null
}

function FileCard({
  file,
  viewMode,
  onDelete,
  onDownload,
  onPreview,
  previewUrl,
}: FileCardProps) {
  const previewable = isPreviewable(file.type, file.name)
  const [confirmOpen, setConfirmOpen] = useState(false)

  /** Shared confirmation dialog — rendered once, used by both list & grid. */
  const deleteDialog = (trigger: React.ReactNode) => (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer ce document ?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{file.name}</span>{' '}
            sera définitivement supprimé. Cette action est irréversible.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onDelete(file.id)}
          >
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  if (viewMode === 'list') {
    return (
      <div className="bg-card border-border/60 hover:border-border flex items-center gap-3 rounded-xl border px-4 py-3 transition-all">
        <div className="shrink-0">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={file.name}
              className="h-10 w-10 cursor-pointer rounded-lg object-cover"
              onClick={() => onPreview(file)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPreview(file) } }}
              tabIndex={0}
              role="button"
              title="Aperçu"
            />
          ) : (
            <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
              {getFileIcon(file.type, file.name)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-medium">
            {file.name}
          </p>
          <p className="text-muted-foreground text-xs">
            {formatFileSize(file.size)} · {formatDate(file.addedAt)}
          </p>
        </div>
        <Badge variant="outline" className="text-muted-foreground shrink-0 text-[10px]">
          {getFileTypeBadge(file.type, file.name)}
        </Badge>
        <div className="flex shrink-0 gap-1">
          {previewable && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPreview(file)}
            >
              <Eye className="h-3.5 w-3.5" />
              <span className="sr-only">Aperçu {file.name}</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onDownload(file)}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="sr-only">Télécharger {file.name}</span>
          </Button>
          {deleteDialog(
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive h-8 w-8"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only">Supprimer {file.name}</span>
            </Button>,
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card border-border/60 hover:border-border group relative flex flex-col overflow-hidden rounded-xl border transition-all hover:shadow-sm">
      {/* Thumbnail / Icon area */}
      <div
        className={`bg-muted/40 relative flex h-32 items-center justify-center overflow-hidden ${previewable ? 'cursor-pointer' : ''}`}
        onClick={previewable ? () => onPreview(file) : undefined}
        onKeyDown={previewable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPreview(file) } } : undefined}
        role={previewable ? 'button' : undefined}
        tabIndex={previewable ? 0 : undefined}
        title={previewable ? 'Cliquer pour prévisualiser' : undefined}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={file.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2">
            {getFileIcon(file.type, file.name)}
          </div>
        )}
        {/* Action overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {previewable && (
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8 shadow-sm"
              onClick={() => onPreview(file)}
            >
              <Eye className="h-3.5 w-3.5" />
              <span className="sr-only">Aperçu {file.name}</span>
            </Button>
          )}
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8 shadow-sm"
            onClick={() => onDownload(file)}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="sr-only">Télécharger {file.name}</span>
          </Button>
          {deleteDialog(
            <Button
              variant="destructive"
              size="icon"
              className="h-8 w-8 shadow-sm"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only">Supprimer {file.name}</span>
            </Button>,
          )}
        </div>
        {/* Type badge */}
        <Badge
          variant="secondary"
          className="absolute right-2 bottom-2 text-[10px] font-mono"
        >
          {getFileTypeBadge(file.type, file.name)}
        </Badge>
      </div>

      {/* File info */}
      <div className="flex flex-col gap-0.5 p-3">
        <p className="text-foreground truncate text-sm font-medium" title={file.name}>
          {file.name}
        </p>
        <p className="text-muted-foreground text-xs">
          {formatFileSize(file.size)} · {formatDate(file.addedAt)}
        </p>
      </div>
    </div>
  )
}

export function DocumentsView() {
  const { files, loading, addFiles, deleteFile, downloadFile } =
    useDocuments()
  const [isDragging, setIsDragging] = useState(false)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('addedAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)
  // Track blob URLs opened for preview so we can revoke on unmount
  const openedPreviewUrlsRef = useRef<Set<string>>(new Set())

  // Revoke all preview-tab blob URLs on unmount
  useEffect(() => {
    const set = openedPreviewUrlsRef.current
    return () => {
      for (const url of set) URL.revokeObjectURL(url)
    }
  }, [])

  const openPreview = useCallback((file: StoredFile) => {
    const url = URL.createObjectURL(file.blob)
    openedPreviewUrlsRef.current.add(url)
    window.open(url, '_blank', 'noopener')
  }, [])

  // Generate preview URLs for image files
  useEffect(() => {
    const newUrls: Record<string, string> = {}
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        newUrls[file.id] = URL.createObjectURL(file.blob)
      }
    }
    setPreviewUrls((prev) => {
      // Revoke old URLs that are no longer needed
      for (const [id, url] of Object.entries(prev)) {
        if (!newUrls[id]) URL.revokeObjectURL(url)
      }
      return newUrls
    })
    return () => {
      for (const url of Object.values(newUrls)) {
        URL.revokeObjectURL(url)
      }
    }
  }, [files])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      dragCounterRef.current = 0
      setIsDragging(false)
      const droppedFiles = Array.from(e.dataTransfer.files)
      if (droppedFiles.length > 0) {
        await addFiles(droppedFiles)
      }
    },
    [addFiles],
  )

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setIsDragging(false)
  }

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files ?? [])
      if (selected.length > 0) {
        await addFiles(selected)
      }
      // Reset input to allow re-uploading the same file
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [addFiles],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id)
      await deleteFile(id)
      setDeletingId(null)
    },
    [deleteFile],
  )

  const filteredAndSorted = files
    .filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0
      if (sortField === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortField === 'size') cmp = a.size - b.size
      else cmp = a.addedAt - b.addedAt
      return sortOrder === 'asc' ? cmp : -cmp
    })

  const totalSize = files.reduce((acc, f) => acc + f.size, 0)

  return (
    <div className="flex flex-col gap-6">
      {/* Hidden file input — always mounted so the ref is stable */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={handleFileInput}
        aria-label="Ajouter des fichiers"
      />

      <DocumentSourcesDrawer
        open={sourcesOpen}
        onOpenChange={setSourcesOpen}
      />

      {/* ----------------------------------------------------------------- */}
      {/* Loading */}
      {/* ----------------------------------------------------------------- */}
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
          <p className="text-muted-foreground text-sm">Chargement…</p>
        </div>
      ) : files.length === 0 ? (
        /* ---------------------------------------------------------------- */
        /* Unified empty state                                               */
        /* ---------------------------------------------------------------- */
        <DocumentsEmptyState
          onOpenSources={() => setSourcesOpen(true)}
          onAddFiles={() => fileInputRef.current?.click()}
          isDragging={isDragging}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
        />
      ) : (
        /* ---------------------------------------------------------------- */
        /* Has documents                                                      */
        /* ---------------------------------------------------------------- */
        <>
          {/* Compact import link */}
          <button
            onClick={() => setSourcesOpen(true)}
            className="text-primary hover:text-primary/80 flex items-center gap-1.5 self-start text-sm font-medium transition-colors"
          >
            <Inbox className="h-4 w-4" />
            Importer depuis mes apps
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>

          {/* Stats + toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Stats */}
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-sm">
                <span className="text-foreground font-semibold">
                  {files.length}
                </span>{' '}
                fichier{files.length > 1 ? 's' : ''}
              </span>
              <span className="text-border">·</span>
              <span className="text-muted-foreground text-sm">
                {formatFileSize(totalSize)} utilisé
                {totalSize !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="text-muted-foreground absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher…"
                  className="h-8 w-40 pl-8 text-sm sm:w-52"
                />
                {search && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1/2 right-1 h-6 w-6 -translate-y-1/2"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSearch('')
                    }}
                  >
                    <X className="h-3 w-3" />
                    <span className="sr-only">Effacer la recherche</span>
                  </Button>
                )}
              </div>

              {/* Sort */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5">
                    {sortOrder === 'asc' ? (
                      <SortAsc className="h-3.5 w-3.5" />
                    ) : (
                      <SortDesc className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden text-xs sm:inline">Trier</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setSortField('addedAt')
                      setSortOrder('desc')
                    }}
                  >
                    Plus récent
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSortField('addedAt')
                      setSortOrder('asc')
                    }}
                  >
                    Plus ancien
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSortField('name')
                      setSortOrder('asc')
                    }}
                  >
                    Nom (A → Z)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSortField('name')
                      setSortOrder('desc')
                    }}
                  >
                    Nom (Z → A)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSortField('size')
                      setSortOrder('desc')
                    }}
                  >
                    Taille (grand → petit)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSortField('size')
                      setSortOrder('asc')
                    }}
                  >
                    Taille (petit → grand)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* View mode toggle */}
              <div className="border-border/60 flex overflow-hidden rounded-lg border">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="icon"
                  className="h-8 w-8 rounded-none"
                  onClick={() => setViewMode('grid')}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="sr-only">Vue grille</span>
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="icon"
                  className="h-8 w-8 rounded-none border-l"
                  onClick={() => setViewMode('list')}
                >
                  <LayoutList className="h-3.5 w-3.5" />
                  <span className="sr-only">Vue liste</span>
                </Button>
              </div>
            </div>
          </div>

          {/* File list */}
          {filteredAndSorted.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <Search
                className="text-muted-foreground h-8 w-8"
                strokeWidth={1.5}
              />
              <p className="text-muted-foreground text-sm">
                Aucun fichier ne correspond à &ldquo;{search}&rdquo;
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearch('')}
              >
                Effacer la recherche
              </Button>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {filteredAndSorted.map((file) => (
                <div
                  key={file.id}
                  className={`transition-opacity ${deletingId === file.id ? 'opacity-40' : ''}`}
                >
                  <FileCard
                    file={file}
                    viewMode="grid"
                    onDelete={handleDelete}
                    onDownload={downloadFile}
                    onPreview={openPreview}
                    previewUrl={previewUrls[file.id] ?? null}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredAndSorted.map((file) => (
                <div
                  key={file.id}
                  className={`transition-opacity ${deletingId === file.id ? 'opacity-40' : ''}`}
                >
                  <FileCard
                    file={file}
                    viewMode="list"
                    onDelete={handleDelete}
                    onDownload={downloadFile}
                    onPreview={openPreview}
                    previewUrl={previewUrls[file.id] ?? null}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Add more documents button                                         */}
          {/* ---------------------------------------------------------------- */}
          <button
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-4 text-sm font-medium transition-all ${
              isDragging
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border/50 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary'
            }`}
          >
            <PlusCircle className="h-4 w-4" />
            {isDragging
              ? 'Déposez vos fichiers ici'
              : "Ajouter d'autres documents"}
          </button>
        </>
      )}
    </div>
  )
}

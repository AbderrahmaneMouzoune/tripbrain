'use client'

import { useRef, useState } from 'react'
import { Compass, Upload, PlayCircle, AlertCircle, FileSpreadsheet, Table } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { ImportFormatGuide } from '@/components/import-format-guide'

type ImportMode = 'json' | 'xlsx' | 'csv'

interface OnboardingScreenProps {
  onImportFile: (file: File) => Promise<void>
  onImportXlsx: (file: File) => Promise<void>
  onImportCsv: (files: File[]) => Promise<void>
  onUseMockData: () => Promise<void>
}

const MODE_CONFIG: Record<
  ImportMode,
  { label: string; description: string; detail: string }
> = {
  json: {
    label: 'Choisir un fichier .json',
    description: 'Dépose ton fichier JSON ici, ou choisis-le manuellement.',
    detail: "Le fichier doit provenir d'un export TripBrain.",
  },
  xlsx: {
    label: 'Choisir un fichier .xlsx',
    description: 'Dépose ton fichier Excel ici, ou choisis-le manuellement.',
    detail: 'Le fichier doit contenir 3 onglets : Days, Activities, Transports.',
  },
  csv: {
    label: 'Choisir les 3 fichiers CSV',
    description: 'Dépose ou sélectionne tes 3 fichiers CSV simultanément.',
    detail: "Les fichiers doivent s'appeler days.csv, activities.csv et transports.csv.",
  },
}

export function OnboardingScreen({
  onImportFile,
  onImportXlsx,
  onImportCsv,
  onUseMockData,
}: OnboardingScreenProps) {
  const [importMode, setImportMode] = useState<ImportMode>('json')
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMock, setLoadingMock] = useState(false)

  const jsonInputRef = useRef<HTMLInputElement>(null)
  const xlsxInputRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  // ── Generic async wrapper ─────────────────────────────────────────────────

  const runImport = async (action: () => Promise<void>) => {
    setError(null)
    setLoading(true)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'import.")
    } finally {
      setLoading(false)
    }
  }

  // ── Per-format handlers ───────────────────────────────────────────────────

  const handleJsonFile = (file: File) => {
    if (!file.name.endsWith('.json')) {
      setError('Veuillez sélectionner un fichier JSON.')
      return
    }
    runImport(() => onImportFile(file))
  }

  const handleXlsxFile = (file: File) => {
    if (!file.name.endsWith('.xlsx')) {
      setError('Veuillez sélectionner un fichier .xlsx')
      return
    }
    runImport(() => onImportXlsx(file))
  }

  const handleCsvFiles = (files: File[]) => {
    if (files.length === 0) return
    if (files.some((f) => !f.name.endsWith('.csv'))) {
      setError('Veuillez sélectionner uniquement des fichiers .csv')
      return
    }
    runImport(() => onImportCsv(files))
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (!files.length) return
    if (importMode === 'json') handleJsonFile(files[0])
    else if (importMode === 'xlsx') handleXlsxFile(files[0])
    else handleCsvFiles(files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  // ── File input change handlers ────────────────────────────────────────────

  const handleJsonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleJsonFile(file)
  }

  const handleXlsxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleXlsxFile(file)
  }

  const handleCsvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) handleCsvFiles(files)
  }

  const handleClickInput = () => {
    setError(null)
    if (importMode === 'json') jsonInputRef.current?.click()
    else if (importMode === 'xlsx') xlsxInputRef.current?.click()
    else csvInputRef.current?.click()
  }

  const handleMockData = async () => {
    setError(null)
    setLoadingMock(true)
    try {
      await onUseMockData()
    } catch {
      setError('Erreur lors du chargement des données de démonstration.')
    } finally {
      setLoadingMock(false)
    }
  }

  const config = MODE_CONFIG[importMode]

  return (
    <div className="bg-background flex min-h-dvh flex-col items-center justify-center px-4 py-6 sm:py-8">
      {/* Background decoration */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="animate-sticker-float bg-primary/12 border-primary/30 absolute top-8 -left-8 h-24 w-24 rotate-12 rounded-2xl border-2" />
        <div className="animate-sticker-bounce bg-secondary/16 border-secondary/35 absolute top-16 right-3 h-20 w-20 -rotate-12 rounded-full border-2" />
        <div className="animate-sticker-float bg-accent/14 border-accent/35 absolute top-72 right-10 h-16 w-16 rotate-6 rounded-xl border-2 [animation-delay:180ms]" />
      </div>

      <div className="relative z-10 w-full max-w-3xl space-y-5">
        {/* Logo / brand */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative h-16 w-16 shrink-0">
            <div className="bg-primary absolute inset-0 rotate-6 rounded-2xl opacity-20" />
            <div className="bg-primary relative flex h-16 w-16 items-center justify-center rounded-2xl shadow-sm">
              <Compass
                className="text-primary-foreground h-8 w-8"
                strokeWidth={1.5}
              />
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-foreground font-display text-2xl font-bold tracking-[0.08em] uppercase">
              TripBrain
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Votre roadbook de voyage intelligent
            </p>
          </div>
        </div>

        {/* Intro text */}
        <p className="text-muted-foreground mx-auto max-w-xl text-center text-sm leading-relaxed">
          Bienvenue ! Importez votre itinéraire depuis un fichier JSON, Excel ou CSV, ou
          utilisez les données de démonstration pour explorer l&apos;application.
        </p>

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg px-4 py-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Main card */}
        <Card className="overflow-hidden">
          <CardContent className="space-y-4 p-4 sm:p-5">
            {/* Import mode selector */}
            <Tabs
              value={importMode}
              onValueChange={(v) => {
                setImportMode(v as ImportMode)
                setError(null)
              }}
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="json" className="gap-1.5 text-xs">
                  JSON
                </TabsTrigger>
                <TabsTrigger value="xlsx" className="gap-1.5 text-xs">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Excel .xlsx
                </TabsTrigger>
                <TabsTrigger value="csv" className="gap-1.5 text-xs">
                  <Table className="h-3.5 w-3.5" />
                  CSV
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Drop zone */}
            <div
              className={`rounded-xl border border-dashed p-4 text-center transition-all sm:p-5 ${
                isDragging
                  ? 'border-primary bg-primary/5 ring-primary/30 ring-2'
                  : 'hover:border-primary/50'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="bg-primary/10 mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl">
                <Upload className="text-primary h-5 w-5" />
              </div>
              <p className="text-foreground text-sm font-semibold">Importer mes données</p>
              <p className="text-muted-foreground mt-1 text-xs">{config.description}</p>
              <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
                {config.detail}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={handleClickInput}
                disabled={loading}
              >
                {loading ? 'Chargement…' : config.label}
              </Button>
            </div>

            <Separator />

            {/* Demo data */}
            <div className="bg-secondary/10 flex flex-col items-center justify-between gap-3 rounded-xl p-3">
              <div className="min-w-0">
                <p className="text-foreground text-sm font-medium">
                  Essayer avec les données de démo
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Parfait pour découvrir l&apos;app en 30 secondes.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleMockData}
                disabled={loadingMock}
                className="shrink-0"
              >
                <PlayCircle className="mr-2 h-4 w-4" />
                {loadingMock ? 'Chargement…' : 'Lancer la démo'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Format guide */}
        <div className="flex justify-center">
          <ImportFormatGuide />
        </div>

        {/* Hidden file inputs */}
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={handleJsonChange}
        />
        <input
          ref={xlsxInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={handleXlsxChange}
        />
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          className="sr-only"
          onChange={handleCsvChange}
        />
      </div>
    </div>
  )
}


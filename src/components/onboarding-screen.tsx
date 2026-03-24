'use client'

import { useRef, useState } from 'react'
import { Compass, Upload, PlayCircle, AlertCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { ImportFormatGuide } from '@/components/import-format-guide'

interface OnboardingScreenProps {
  onImportFile: (file: File) => Promise<void>
  onUseMockData: () => Promise<void>
}

export function OnboardingScreen({
  onImportFile,
  onUseMockData,
}: OnboardingScreenProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingMock, setLoadingMock] = useState(false)
  const [loadingImport, setLoadingImport] = useState(false)

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.json') && !file.name.endsWith('.csv')) {
      setError('Veuillez sélectionner un fichier JSON ou CSV.')
      return
    }
    setError(null)
    setLoadingImport(true)
    try {
      await onImportFile(file)
    } catch (err) {
      const message = err instanceof Error ? err.message : null
      setError(
        message
          ? `Erreur : ${message}`
          : "Impossible de lire le fichier. Vérifiez qu'il respecte le format TripBrain.",
      )
    } finally {
      setLoadingImport(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  const handleMockData = async () => {
    setLoadingMock(true)
    setError(null)
    try {
      await onUseMockData()
    } catch {
      setError('Erreur lors du chargement des données de démonstration.')
    } finally {
      setLoadingMock(false)
    }
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4 py-8">
      {/* Background decoration */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="animate-sticker-float bg-primary/12 border-primary/30 absolute top-8 -left-8 h-24 w-24 rotate-12 rounded-2xl border-2" />
        <div className="animate-sticker-bounce bg-secondary/16 border-secondary/35 absolute top-16 right-3 h-20 w-20 -rotate-12 rounded-full border-2" />
        <div className="animate-sticker-float [animation-delay:180ms] bg-accent/14 border-accent/35 absolute top-72 right-10 h-16 w-16 rotate-6 rounded-xl border-2" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Unified card */}
        <Card className="shadow-md">
          <CardContent className="space-y-5 p-6">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 shrink-0">
                <div className="bg-primary absolute inset-0 rotate-6 rounded-xl opacity-20" />
                <div className="bg-primary relative flex h-10 w-10 items-center justify-center rounded-xl shadow-sm">
                  <Compass className="text-primary-foreground h-5 w-5" strokeWidth={1.5} />
                </div>
              </div>
              <div>
                <h1 className="text-foreground font-display text-base font-bold tracking-[0.08em] uppercase leading-tight">
                  TripBrain
                </h1>
                <p className="text-muted-foreground text-xs">
                  Importez vos données ou explorez la démo
                </p>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Import row */}
            <button
              type="button"
              className={`border-border hover:border-primary/50 focus-visible:ring-ring flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-all focus-visible:ring-2 focus-visible:outline-none ${
                isDragging ? 'border-primary ring-primary/30 ring-2' : ''
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              disabled={loadingImport}
            >
              <div className="bg-primary/10 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                <Upload className="text-primary h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-foreground text-sm font-semibold">
                  {loadingImport ? 'Chargement…' : 'Importer mes données'}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  Glissez-déposez ou cliquez · JSON ou CSV
                </p>
              </div>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json,.csv,text/csv"
              className="sr-only"
              onChange={handleFileChange}
            />

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="border-border w-full border-t" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card text-muted-foreground px-3 text-xs uppercase tracking-wider">
                  ou
                </span>
              </div>
            </div>

            {/* Demo row */}
            <button
              type="button"
              className="border-border hover:border-primary/50 focus-visible:ring-ring flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-all focus-visible:ring-2 focus-visible:outline-none"
              onClick={handleMockData}
              disabled={loadingMock}
            >
              <div className="bg-secondary/20 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                <PlayCircle className="text-secondary-foreground h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-foreground text-sm font-semibold">
                  {loadingMock ? 'Chargement…' : 'Utiliser les données de démo'}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  Exemple de voyage prêt à explorer
                </p>
              </div>
            </button>

            {/* Format guide */}
            <div className="flex justify-center pt-1">
              <ImportFormatGuide />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

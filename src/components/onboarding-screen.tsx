'use client'

import { useRef, useState } from 'react'
import { Compass, Upload, PlayCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CsvFormatGuide } from '@/components/csv-format-guide'

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
    } catch {
      setError(
        "Impossible de lire le fichier. Vérifiez qu'il s'agit d'un export TripBrain valide.",
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
          Bienvenue ! Pour commencer, importez votre fichier de données de
          voyage ou utilisez les données de démonstration pour explorer
          l&apos;application.
        </p>

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg px-4 py-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Options */}
        <Card className="overflow-hidden">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div
              className={`rounded-xl border border-dashed p-4 text-center transition-all sm:p-5 ${isDragging ? 'border-primary bg-primary/5 ring-primary/30 ring-2' : 'hover:border-primary/50'}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="bg-primary/10 mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl">
                <Upload className="text-primary h-5 w-5" />
              </div>
              <p className="text-foreground text-sm font-semibold">
                Importer mes données
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Dépose ton fichier JSON ou CSV ici, ou choisis-le manuellement.
              </p>
              <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
                Le fichier doit provenir d&apos;un export TripBrain (JSON) ou
                respecter le format CSV TripBrain. Après import, ton itinéraire
                et tes infos sont disponibles immédiatement.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loadingImport}
                >
                  {loadingImport ? 'Chargement…' : 'Choisir un fichier'}
                </Button>
                <CsvFormatGuide />
              </div>
            </div>

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

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json,.csv,text/csv"
          className="sr-only"
          onChange={handleFileChange}
        />
      </div>
    </div>
  )
}


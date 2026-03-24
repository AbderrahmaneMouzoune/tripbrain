'use client'

import { useRef, useState } from 'react'
import { Compass, Upload, PlayCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
    <div className="bg-background flex min-h-screen flex-col items-center justify-center px-4 py-12">
      {/* Background decoration */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="animate-sticker-float bg-primary/12 border-primary/30 absolute top-8 -left-8 h-24 w-24 rotate-12 rounded-2xl border-2" />
        <div className="animate-sticker-bounce bg-secondary/16 border-secondary/35 absolute top-16 right-3 h-20 w-20 -rotate-12 rounded-full border-2" />
        <div className="animate-sticker-float [animation-delay:180ms] bg-accent/14 border-accent/35 absolute top-72 right-10 h-16 w-16 rotate-6 rounded-xl border-2" />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-8">
        {/* Logo / brand */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-16 w-16 shrink-0">
            <div className="bg-primary absolute inset-0 rotate-6 rounded-2xl opacity-20" />
            <div className="bg-primary relative flex h-16 w-16 items-center justify-center rounded-2xl shadow-sm">
              <Compass className="text-primary-foreground h-8 w-8" strokeWidth={1.5} />
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
        <p className="text-muted-foreground text-center text-sm leading-relaxed">
          Bienvenue ! Pour commencer, importez votre fichier de données de
          voyage (JSON ou CSV) ou utilisez les données de démonstration pour
          explorer l&apos;application.
        </p>

        {/* Format guide link */}
        <div className="flex justify-center">
          <ImportFormatGuide />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg px-4 py-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Options */}
        <div className="space-y-4">
          {/* Import file */}
          <Card
            className={`cursor-pointer transition-all ${isDragging ? 'border-primary ring-primary/30 ring-2' : 'hover:border-primary/50'}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <CardContent className="flex flex-col items-center gap-4 py-8">
              <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-xl">
                <Upload className="text-primary h-6 w-6" />
              </div>
              <div className="text-center">
                <p className="text-foreground font-semibold">
                  Importer mes données
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Glissez-déposez ou cliquez pour sélectionner un fichier
                  JSON ou CSV
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="pointer-events-none"
                disabled={loadingImport}
              >
                {loadingImport ? 'Chargement…' : 'Choisir un fichier .json / .csv'}
              </Button>
            </CardContent>
          </Card>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json,.csv,text/csv"
            className="sr-only"
            onChange={handleFileChange}
          />

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="border-border w-full border-t" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background text-muted-foreground px-3 text-xs uppercase tracking-wider">
                ou
              </span>
            </div>
          </div>

          {/* Mock data */}
          <Card
            className="cursor-pointer transition-all hover:border-primary/50"
            onClick={handleMockData}
          >
            <CardContent className="flex flex-col items-center gap-4 py-8">
              <div className="bg-secondary/20 flex h-12 w-12 items-center justify-center rounded-xl">
                <PlayCircle className="text-secondary-foreground h-6 w-6" />
              </div>
              <div className="text-center">
                <p className="text-foreground font-semibold">
                  Utiliser les données de démo
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Explorez l&apos;application avec un exemple de voyage
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="pointer-events-none"
                disabled={loadingMock}
              >
                {loadingMock ? 'Chargement…' : 'Démarrer la démo'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

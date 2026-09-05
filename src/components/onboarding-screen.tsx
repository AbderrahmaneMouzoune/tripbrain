'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AppIcon } from '@/components/app-icon'
import {
  AlertCircle,
  ArrowUpRight,
  KeyRound,
  PlayCircle,
  Sparkles,
  Upload,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ImportFormatGuide } from '@/components/import-format-guide'
import { ImportShareDialog } from '@/components/share-dialog/import-share-dialog'
import { PwaInstallEntry } from '@/components/pwa-install-prompt'
import type { DayItinerary } from '@/lib/itinerary-data'
import { trackEvent } from '@/lib/analytics/client'
import { getGeneratorUrl } from '@/lib/site-links'

const PROMPT_SOURCE = { kind: 'prompt' } as const

interface OnboardingScreenProps {
  onImportFile: (file: File) => Promise<void>
  onImportXlsx: (file: File) => Promise<void>
  onImportCsv: (files: File[]) => Promise<void>
  onImportShared: (itinerary: DayItinerary[]) => Promise<void>
  onUseMockData: () => Promise<void>
}

export function OnboardingScreen({
  onImportFile,
  onImportXlsx,
  onImportCsv,
  onImportShared,
  onUseMockData,
}: OnboardingScreenProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMock, setLoadingMock] = useState(false)
  const [shareImportOpen, setShareImportOpen] = useState(false)

  // Première chose vue quand aucun voyage n'est enregistré : savoir combien de
  // visites s'arrêtent là dit si l'import est assez clair.
  useEffect(() => {
    trackEvent('onboarding_viewed')
  }, [])

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

  // ── Auto-detect format from files ────────────────────────────────────────

  const handleFiles = (files: File[]) => {
    if (files.length === 0) return

    // Multiple files → must all be CSV
    if (files.length > 1) {
      if (files.some((f) => !f.name.toLowerCase().endsWith('.csv'))) {
        setError(
          'En cas de sélection multiple, tous les fichiers doivent être des .csv',
        )
        return
      }
      runImport(() => onImportCsv(files))
      return
    }

    const file = files[0]
    const name = file.name.toLowerCase()
    if (name.endsWith('.json')) {
      runImport(() => onImportFile(file))
    } else if (name.endsWith('.xlsx')) {
      runImport(() => onImportXlsx(file))
    } else if (name.endsWith('.csv')) {
      setError(
        'Pour importer en CSV, sélectionnez les 3 fichiers simultanément (days.csv, activities.csv, transports.csv)',
      )
    } else {
      setError(
        'Format non supporté. Utilisez un fichier .json, .xlsx, ou 3 fichiers .csv',
      )
    }
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  // ── File input ────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files ?? []))
    // Reset so the same file can be re-selected after an error
    if (e.target) e.target.value = ''
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

  return (
    <div className="bg-background flex min-h-dvh flex-col items-center justify-center px-4 py-6 sm:py-8">
      {/* Background decoration */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="animate-sticker-float bg-primary/10 border-primary/15 shadow-primary/10 absolute top-8 -left-8 h-24 w-24 rotate-12 rounded-2xl border shadow-sm" />
        <div className="animate-sticker-bounce bg-secondary/10 border-secondary/35 shadow-secondary/10 absolute top-16 right-3 h-20 w-20 -rotate-12 rounded-full border shadow-sm" />
        <div className="animate-sticker-float bg-accent/10 border-accent/15 shadow-accent/10 absolute top-72 right-10 h-16 w-16 rotate-6 rounded-xl border shadow-sm [animation-delay:180ms]" />
      </div>

      <div className="relative z-10 w-full max-w-3xl space-y-5">
        {/* Logo / brand */}
        <div className="flex flex-col items-center gap-2">
          <AppIcon size="lg" />
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
        {/* <p className="text-muted-foreground mx-auto max-w-xl text-center text-sm leading-relaxed">
          Bienvenue ! Importez votre itinéraire depuis un fichier JSON, Excel ou CSV, ou
          utilisez les données de démonstration pour explorer l&apos;application.
        </p> */}

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
            {/*
              Première question de quelqu'un qui ouvre l'app sans voyage :
              « où est-ce que je fabrique mon itinéraire ? ». Elle se traitait
              jusqu'ici en dehors de l'app, sans que rien ne le dise ici. Le
              renvoi vers le générateur passe donc avant l'import : c'est le
              seul chemin praticable quand on n'a encore aucun fichier.
            */}
            <div className="border-primary/25 bg-primary/5 rounded-xl border p-4 text-center">
              <div className="bg-primary/10 mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl">
                <Sparkles className="text-primary h-5 w-5" />
              </div>
              <p className="text-foreground text-sm font-semibold">
                Je n’ai pas encore d’itinéraire
              </p>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                Décrivez votre voyage sur <strong>tripbrain.fr</strong> :
                ChatGPT ou Claude en fait un programme jour par jour, que vous
                renvoyez ici d’un clic. Gratuit, sans compte.
              </p>
              <Button
                size="sm"
                className="mt-4"
                asChild
                onClick={() =>
                  trackEvent('generator_opened', { surface: 'onboarding' })
                }
              >
                <a
                  href={getGeneratorUrl('onboarding')}
                  target="_blank"
                  rel="noreferrer"
                >
                  Créer mon itinéraire
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>

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
              <p className="text-foreground text-sm font-semibold">
                J’ai déjà un itinéraire à importer
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Formats acceptés : <strong>.json</strong> (export TripBrain),{' '}
                <strong>.xlsx</strong> (Excel avec 3 onglets), ou{' '}
                <strong>3 fichiers .csv</strong> simultanément.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setError(null)
                  fileInputRef.current?.click()
                }}
                disabled={loading}
              >
                {loading ? 'Chargement…' : 'Choisir un fichier'}
              </Button>
            </div>

            {/* Format guide — right after the upload zone */}
            <div className="flex justify-center">
              <ImportFormatGuide />
            </div>

            {/* Partage reçu depuis un autre appareil */}
            <div className="bg-primary/5 flex flex-col items-center justify-between gap-3 rounded-xl p-3">
              <div className="min-w-0">
                <p className="text-foreground text-sm font-medium">
                  J’ai un code de partage
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Récupérez le voyage préparé sur un autre appareil.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(null)
                  setShareImportOpen(true)
                }}
                className="shrink-0"
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Saisir un code
              </Button>
            </div>

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

        {/* Installation sur l'écran d'accueil, discrète tant qu'aucun voyage n'est chargé */}
        <div className="flex justify-center">
          <PwaInstallEntry />
        </div>

        {/* Hidden file input — accepts all supported formats, multiple for CSV */}
        <ImportShareDialog
          open={shareImportOpen}
          onOpenChange={setShareImportOpen}
          source={PROMPT_SOURCE}
          onImport={onImportShared}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.xlsx,.csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          multiple
          className="sr-only"
          onChange={handleFileChange}
        />

        {/*
          Les pages légales sont accessibles dès le premier écran : c'est le
          seul moment où l'application n'a encore rien à montrer d'autre.
        */}
        <nav
          aria-label="Informations légales"
          className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs"
        >
          <Link
            href="/mentions-legales"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Mentions légales
          </Link>
          <Link
            href="/politique-de-confidentialite"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Confidentialité
          </Link>
          <Link
            href="/guide"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Guide d’import
          </Link>
        </nav>
      </div>
    </div>
  )
}

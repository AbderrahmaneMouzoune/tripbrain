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
import { ActionRow } from '@/components/share-dialog/action-row'
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

        {/*
          ── Les quatre façons de commencer ──
          Elles occupaient quatre pavés centrés, soit un écran et demi à faire
          défiler pour découvrir la dernière. Elles tiennent maintenant en un
          écran.

          L'ordre suit qui arrive ici : quelqu'un qui ouvre l'app sans voyage a
          le plus souvent déjà préparé son itinéraire sur le site, et vient le
          récupérer — par le fichier qu'il a téléchargé, ou par le code envoyé
          depuis l'ordinateur. Le générateur ferme la marche : il ne sert
          qu'à ceux qui arrivent les mains vides.
        */}
        <Card className="overflow-hidden">
          <CardContent className="space-y-3 p-4 sm:p-5">
            {/*
              Zone de dépôt — cliquable de bout en bout : viser le bouton sur
              un écran tactile est le geste le plus étroit de cet écran, alors
              que le bloc entier dit déjà ce qu'il fait. Le contour en
              pointillés reste la seule chose qui annonce qu'on peut y lâcher
              un fichier.
            */}
            <button
              type="button"
              onClick={() => {
                setError(null)
                fileInputRef.current?.click()
              }}
              disabled={loading}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`focus-visible:ring-ring/50 block w-full cursor-pointer rounded-xl border border-dashed p-4 text-left transition-all outline-none focus-visible:ring-[3px] disabled:cursor-default ${
                isDragging
                  ? 'border-primary bg-primary/5 ring-primary/30 ring-2'
                  : 'hover:border-primary/50 hover:bg-muted/40'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="bg-primary/10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                  <Upload className="text-primary h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-sm font-semibold">
                    J’ai déjà un itinéraire
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                    <strong>.json</strong> (export TripBrain),{' '}
                    <strong>.xlsx</strong> (3 onglets) ou{' '}
                    <strong>3 .csv</strong> à la fois.
                  </p>
                </div>
              </div>
              {/*
                Rendu en <span> : le clic appartient au bloc, et un bouton
                dans un bouton n'existe pas en HTML.
              */}
              <Button
                asChild
                size="sm"
                className="pointer-events-none mt-3 w-full"
              >
                <span>{loading ? 'Chargement…' : 'Choisir un fichier'}</span>
              </Button>
            </button>

            {/* Le guide se range sous la zone qu'il explique, hors du clic. */}
            <div className="flex justify-center">
              <ImportFormatGuide />
            </div>

            {/* Partage reçu depuis un autre appareil */}
            <ActionRow
              icon={KeyRound}
              tone="primary"
              label="J’ai un code de partage"
              description="Récupérez le voyage préparé sur un autre appareil"
              className="bg-primary/5 hover:bg-primary/10"
              onClick={() => {
                setError(null)
                setShareImportOpen(true)
              }}
            />

            {/* Demo data */}
            <ActionRow
              icon={PlayCircle}
              tone="secondary"
              label={loadingMock ? 'Chargement…' : 'Essayer avec la démo'}
              description="Pour découvrir l’app en 30 secondes"
              className="bg-secondary/10 hover:bg-secondary/15"
              disabled={loadingMock}
              onClick={handleMockData}
            />

            {/*
              Le générateur reste signalé — sans lui, personne ne devine où se
              fabrique un itinéraire — mais en pied de carte : c'est le cas
              minoritaire, et il emmène hors de l'app.
            */}
            <div className="border-border/60 border-t pt-3 text-center">
              <a
                href={getGeneratorUrl('onboarding')}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  trackEvent('generator_opened', { surface: 'onboarding' })
                }
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs underline-offset-4 transition-colors hover:underline"
              >
                <Sparkles className="text-primary h-3.5 w-3.5" />
                Pas encore d’itinéraire ? Créez-le sur tripbrain.fr
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
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

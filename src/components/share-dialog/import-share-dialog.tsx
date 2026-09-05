'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { REGEXP_ONLY_DIGITS } from 'input-otp'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCalendarEvent,
  IconDownload,
  IconKey,
  IconMapPin,
  IconRoute,
} from '@tabler/icons-react'
import type { DayItinerary } from '@/lib/itinerary-data'
import {
  SHARE_CODE_LENGTH,
  decompressItinerary,
  fetchSharedItinerary,
  summarizeSharedItinerary,
} from '@/lib/share'
import { trackEvent } from '@/lib/analytics/client'
import { shareImportFailureReason } from '@/lib/analytics/metrics'

/** D'où vient le partage à importer. */
export type ImportShareSource =
  /** L'utilisateur saisit le code lui-même. */
  | { kind: 'prompt' }
  /** Code déjà connu — arrivée par `?code=` ou par un QR code scanné. */
  | { kind: 'code'; code: string }
  /** Itinéraire embarqué dans l'URL — arrivée par `?import=`. */
  | { kind: 'payload'; payload: string }

interface ImportShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  source: ImportShareSource
  /** Un itinéraire est déjà enregistré : l'import va le remplacer. */
  hasExistingData?: boolean
  onImport: (itinerary: DayItinerary[]) => Promise<void>
  /** Appelé quand l'utilisateur veut revenir à la dialog précédente. */
  onNavBack?: () => void
}

type ImportState =
  | { status: 'prompt' }
  | { status: 'resolving' }
  | { status: 'preview'; itinerary: DayItinerary[] }
  | { status: 'importing'; itinerary: DayItinerary[] }
  | { status: 'error'; message: string }

function toFrenchError(err: unknown): string {
  if (!(err instanceof Error)) return 'Import impossible.'
  const msg = err.message.toLowerCase()
  if (msg.includes('network') || msg.includes('failed to fetch')) {
    return 'Erreur réseau : vérifiez votre connexion internet et réessayez.'
  }
  // Les routes /api/share et le décodage répondent déjà en français.
  return err.message
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function ImportShareDialog({
  open,
  onOpenChange,
  source,
  hasExistingData = false,
  onImport,
  onNavBack,
}: ImportShareDialogProps) {
  const [state, setState] = useState<ImportState>({ status: 'prompt' })
  const [code, setCode] = useState('')

  // Le code lui-même n'est jamais mesuré : seule sa provenance l'est.
  const analyticsSource = source.kind

  const resolveCode = useCallback(
    async (value: string) => {
      setState({ status: 'resolving' })
      trackEvent('share_import_started', { source: analyticsSource })
      try {
        setState({
          status: 'preview',
          itinerary: await fetchSharedItinerary(value),
        })
      } catch (err) {
        setState({ status: 'error', message: toFrenchError(err) })
        trackEvent('share_import_failed', {
          source: analyticsSource,
          reason: shareImportFailureReason(err),
        })
      }
    },
    [analyticsSource],
  )

  // À l'ouverture : un payload d'URL se lit sur place, un code demande un
  // aller-retour serveur, et une saisie manuelle attend l'utilisateur.
  useEffect(() => {
    if (!open) return

    setCode('')

    if (source.kind === 'payload') {
      trackEvent('share_import_started', { source: 'payload' })
      try {
        setState({
          status: 'preview',
          itinerary: decompressItinerary(source.payload),
        })
      } catch (err) {
        setState({ status: 'error', message: toFrenchError(err) })
        trackEvent('share_import_failed', {
          source: 'payload',
          reason: shareImportFailureReason(err),
        })
      }
      return
    }

    if (source.kind === 'code') {
      setCode(source.code)
      resolveCode(source.code)
      return
    }

    setState({ status: 'prompt' })
  }, [open, source, resolveCode])

  const handleImport = useCallback(async () => {
    if (state.status !== 'preview') return
    const { itinerary } = state

    setState({ status: 'importing', itinerary })
    try {
      await onImport(itinerary)
      trackEvent('share_import_completed', {
        source: analyticsSource,
        days_count: itinerary.length,
      })
      onOpenChange(false)
    } catch (err) {
      setState({ status: 'error', message: toFrenchError(err) })
      trackEvent('share_import_failed', {
        source: analyticsSource,
        reason: shareImportFailureReason(err),
      })
    }
  }, [state, onImport, onOpenChange, analyticsSource])

  const handleRetry = useCallback(() => {
    // Une saisie manuelle repart du champ ; un lien n'a rien à ressaisir.
    if (source.kind === 'prompt') {
      setCode('')
      setState({ status: 'prompt' })
      return
    }
    if (source.kind === 'code') {
      resolveCode(source.code)
      return
    }
    onOpenChange(false)
  }, [source, resolveCode, onOpenChange])

  const handleNavBack = useCallback(() => {
    onOpenChange(false)
    onNavBack?.()
  }, [onOpenChange, onNavBack])

  const summary =
    state.status === 'preview' || state.status === 'importing'
      ? summarizeSharedItinerary(state.itinerary)
      : null

  const description =
    state.status === 'preview' || state.status === 'importing'
      ? 'Vérifiez le voyage reçu avant de l’enregistrer.'
      : source.kind === 'prompt'
        ? `Saisissez les ${SHARE_CODE_LENGTH} chiffres affichés sur l’autre appareil.`
        : 'Récupération du voyage partagé.'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {onNavBack && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Retour"
            onClick={handleNavBack}
            className="absolute top-4 left-4 h-7 w-7 opacity-70 hover:opacity-100"
          >
            <IconArrowLeft className="h-4 w-4" />
            <span className="sr-only">Retour</span>
          </Button>
        )}

        <DialogHeader className={onNavBack ? 'pl-6' : undefined}>
          <DialogTitle className="flex items-center gap-2">
            <IconKey className="h-5 w-5" />
            Importer un partage
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Conteneur stable — min-h évite le layout shift entre les états */}
        <div className="flex min-h-[16rem] flex-col justify-between gap-4 py-2">
          {state.status === 'prompt' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              <InputOTP
                autoFocus
                maxLength={SHARE_CODE_LENGTH}
                // Le code n'est fait que de chiffres : le pavé numérique
                // qu'affiche le mobile est bien celui qu'il faut.
                pattern={REGEXP_ONLY_DIGITS}
                inputMode="numeric"
                autoComplete="one-time-code"
                // Un code recopié avec son séparateur (« 4820-5137 ») reste collable.
                pasteTransformer={(pasted) => pasted.replace(/\D/g, '')}
                value={code}
                onChange={setCode}
                onComplete={(value) => resolveCode(value)}
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3].map((i) => (
                    <InputOTPSlot key={i} index={i} className="font-mono" />
                  ))}
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  {[4, 5, 6, 7].map((i) => (
                    <InputOTPSlot key={i} index={i} className="font-mono" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <p className="text-muted-foreground text-center text-xs">
                Le code se trouve dans « Partager & données » sur l’appareil qui
                possède le voyage.
              </p>
            </div>
          )}

          {(state.status === 'resolving' || state.status === 'importing') && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
              <p className="text-muted-foreground text-sm">
                {state.status === 'resolving'
                  ? 'Récupération du voyage…'
                  : 'Enregistrement en cours…'}
              </p>
            </div>
          )}

          {state.status === 'error' && (
            <>
              <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                <div className="bg-destructive/10 rounded-full p-4">
                  <IconAlertTriangle className="text-destructive h-8 w-8" />
                </div>
                <p className="text-destructive text-sm leading-relaxed">
                  {state.message}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleRetry}
                className="w-full"
              >
                {source.kind === 'payload' ? 'Fermer' : 'Réessayer'}
              </Button>
            </>
          )}

          {state.status === 'preview' && summary && (
            <>
              <div className="border-border bg-muted/40 flex flex-col gap-2 rounded-lg border p-4">
                <p className="text-foreground flex items-center gap-2 text-sm font-medium">
                  <IconRoute className="text-primary h-4 w-4 shrink-0" />
                  {summary.dayCount} jour{summary.dayCount > 1 ? 's' : ''} de
                  voyage
                </p>
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <IconMapPin className="h-4 w-4 shrink-0" />
                  {summary.firstCity === summary.lastCity
                    ? summary.firstCity
                    : `${summary.firstCity} → ${summary.lastCity}`}
                </p>
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <IconCalendarEvent className="h-4 w-4 shrink-0" />
                  Du {formatDate(summary.startDate)} au{' '}
                  {formatDate(summary.endDate)}
                </p>
              </div>

              {hasExistingData && (
                <p className="bg-warning/10 text-foreground flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed">
                  <IconAlertTriangle className="text-warning mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Cet import remplacera l’itinéraire actuellement enregistré sur
                  cet appareil.
                </p>
              )}

              <div className="flex w-full gap-2">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1"
                >
                  Annuler
                </Button>
                <Button onClick={handleImport} className="flex-1 gap-2">
                  <IconDownload className="h-4 w-4" />
                  {hasExistingData ? 'Remplacer' : 'Importer'}
                </Button>
              </div>
            </>
          )}

          {/* Le résumé manque (partage vide) : rien à importer. */}
          {state.status === 'preview' && !summary && (
            <>
              <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                <div className="bg-destructive/10 rounded-full p-4">
                  <IconAlertTriangle className="text-destructive h-8 w-8" />
                </div>
                <p className="text-destructive text-sm">
                  Ce partage ne contient aucune journée.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleRetry}
                className="w-full"
              >
                {source.kind === 'payload' ? 'Fermer' : 'Réessayer'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

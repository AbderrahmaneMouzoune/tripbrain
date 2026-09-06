'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  IconSparkles,
} from '@tabler/icons-react'
import type { DayItinerary } from '@/lib/itinerary-data'
import {
  SHARE_CODE_LENGTH,
  decompressItinerary,
  fetchSharedItinerary,
  summarizeSharedItinerary,
  type ShareOrigin,
} from '@/lib/share'
import { trackEvent } from '@/lib/analytics/client'
import { shareImportFailureReason } from '@/lib/analytics/metrics'

/** D'où vient le partage à importer. */
export type ImportShareSource =
  /** L'utilisateur saisit le code lui-même. */
  | { kind: 'prompt' }
  /** Code déjà connu — arrivée par `?code=` ou par un QR code scanné. */
  | { kind: 'code'; code: string }
  /**
   * Itinéraire embarqué dans l'URL — arrivée par `?import=` (QR code) ou par
   * `#import=` (retour du générateur, que `origin` distingue).
   */
  | { kind: 'payload'; payload: string; origin?: ShareOrigin }

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

/**
 * Le pointeur est-il fin (souris, trackpad) ?
 *
 * Sur un écran tactile, ouvrir le clavier d'office déplace toute la page à
 * l'ouverture de la dialog. On ne prend donc la main sur le focus que là où le
 * clavier est physique.
 */
function hasFinePointer(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: fine)').matches
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
  const codeInputRef = useRef<HTMLInputElement>(null)

  /**
   * Un itinéraire qui revient du générateur emprunte le chemin `payload`, mais
   * ne raconte pas la même histoire qu'un QR code scanné : la mesure les
   * sépare. Le contenu, lui, n'est jamais mesuré.
   */
  const fromGenerator =
    source.kind === 'payload' && source.origin === 'generator'
  const analyticsSource = fromGenerator ? 'generator' : source.kind

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
      trackEvent('share_import_started', { source: analyticsSource })
      try {
        setState({
          status: 'preview',
          itinerary: decompressItinerary(source.payload),
        })
      } catch (err) {
        setState({ status: 'error', message: toFrenchError(err) })
        trackEvent('share_import_failed', {
          source: analyticsSource,
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
  }, [open, source, resolveCode, analyticsSource])

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

  const title = fromGenerator
    ? 'Récupérer votre itinéraire'
    : 'Importer un partage'

  const description =
    state.status === 'preview' || state.status === 'importing'
      ? fromGenerator
        ? 'Votre itinéraire généré sur tripbrain.fr, prêt à être enregistré ici.'
        : 'Vérifiez le voyage reçu avant de l’enregistrer.'
      : source.kind === 'prompt'
        ? `Saisissez les ${SHARE_CODE_LENGTH} chiffres affichés sur l’autre appareil.`
        : fromGenerator
          ? 'Récupération de l’itinéraire généré sur le site.'
          : 'Récupération du voyage partagé.'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* En-tête fixe, corps défilant : la dialog tient sur tous les écrans. */}
      <DialogContent
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-sm"
        onOpenAutoFocus={(event) => {
          // Au clavier physique, on va droit au champ. Ailleurs, on laisse
          // Radix poser le focus sur le premier bouton : le clavier virtuel ne
          // s'ouvre pas tout seul, et l'écran ne saute pas à l'ouverture.
          if (!hasFinePointer() || source.kind !== 'prompt') return
          event.preventDefault()
          codeInputRef.current?.focus()
        }}
      >
        <DialogHeader className="px-4 pt-5 pb-3 text-left sm:px-6 sm:pt-6">
          <div className="flex items-center gap-2 pr-8">
            {/* Retour — ferme cette dialog et ré-ouvre la précédente */}
            {onNavBack && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Retour"
                onClick={handleNavBack}
                className="-ml-2 shrink-0 opacity-70 hover:opacity-100"
              >
                <IconArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <DialogTitle className="flex min-w-0 items-center gap-2">
              {fromGenerator ? (
                <IconSparkles className="h-5 w-5 shrink-0" />
              ) : (
                <IconKey className="h-5 w-5 shrink-0" />
              )}
              {title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-pretty">
            {description}
          </DialogDescription>
        </DialogHeader>

        {/* Conteneur stable — min-h évite le layout shift entre les états */}
        <div className="flex min-h-[16rem] flex-1 flex-col justify-between gap-4 overflow-y-auto overscroll-contain px-4 pb-5 sm:px-6 sm:pb-6">
          {state.status === 'prompt' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              <InputOTP
                ref={codeInputRef}
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
                containerClassName="w-full gap-1.5 sm:gap-2"
              >
                <InputOTPGroup className="flex-1">
                  {[0, 1, 2, 3].map((i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className="h-11 w-full flex-1 font-mono text-base"
                    />
                  ))}
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup className="flex-1">
                  {[4, 5, 6, 7].map((i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className="h-11 w-full flex-1 font-mono text-base"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <p className="text-muted-foreground text-center text-xs text-pretty">
                Le code se trouve dans « Partager &amp; données » sur l’appareil
                qui possède le voyage.
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
                <p className="text-muted-foreground flex items-start gap-2 text-sm">
                  <IconMapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">
                    {summary.firstCity === summary.lastCity
                      ? summary.firstCity
                      : `${summary.firstCity} → ${summary.lastCity}`}
                  </span>
                </p>
                <p className="text-muted-foreground flex items-start gap-2 text-sm">
                  <IconCalendarEvent className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 text-pretty">
                    Du {formatDate(summary.startDate)} au{' '}
                    {formatDate(summary.endDate)}
                  </span>
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

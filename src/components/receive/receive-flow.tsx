'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, KeyRound } from 'lucide-react'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics/client'
import { shareImportFailureReason } from '@/lib/analytics/metrics'
import { SHARE_CODE_LENGTH, type IncomingShare } from '@/lib/share'
import {
  getNativeApp,
  hasNativeCapability,
  isNativeApp,
  scanQrNatively,
  triggerHaptic,
} from '@/lib/native-app'
import { CodeEntryStep } from '@/components/receive/code-entry-step'
import { QrScanStep } from '@/components/receive/qr-scan-step'
import { TripPreviewStep } from '@/components/receive/trip-preview-step'
import {
  resolveIncomingShare,
  shareAnalyticsSource,
  type ReceivedTrip,
  type ReceivedVia,
} from '@/components/receive/received-trip'
import {
  describeShareError,
  parseShareInput,
  type ShareErrorDescription,
} from '@/components/receive/share-input'
import { scanValueReloadsPage } from '@/components/receive/native-scan'

/** Délai laissé à un natif v1 pour recharger la page sur le lien scanné. */
const NATIVE_V1_NAVIGATION_GRACE_MS = 3000

const FOREIGN_QR_ERROR: ShareErrorDescription = {
  kind: 'invalid',
  message: 'Ce QR code ne contient pas de voyage TripBrain.',
}

/** Par où commence la réception : une saisie à faire, ou un partage déjà en main. */
export type ReceiveStart =
  | { method: 'code' | 'scan' }
  | { incoming: IncomingShare; via: ReceivedVia }

/**
 * Où le parcours s'affiche :
 * - `onboarding` : étapes 2 et 3 du parcours d'accueil, barre de progression ;
 * - `screen` : écran empilé depuis le menu, avec un voyage déjà ouvert ;
 * - `overlay` : partage arrivé par l'URL, au-dessus de tout.
 */
export type ReceivePresentation = 'onboarding' | 'screen' | 'overlay'

type Step =
  | { kind: 'code'; code?: string; error?: ShareErrorDescription | null }
  | { kind: 'scan' }
  | { kind: 'failed'; message: string }
  | { kind: 'preview'; received: ReceivedTrip }

/**
 * Réception d'un voyage partagé, de la saisie à l'enregistrement : code ou QR
 * code, récupération, puis aperçu avec le choix ajouter / remplacer. Partagé
 * par l'accueil, l'écran « Recevoir » et l'arrivée par lien.
 */
export function ReceiveFlow({
  start,
  presentation,
  onExit,
  onSaved,
}: {
  start: ReceiveStart
  presentation: ReceivePresentation
  /** Retour depuis la première étape (ou fermeture). */
  onExit: () => void
  /** Voyage enregistré : à l'appelant d'enchaîner (écran « voyage prêt »). */
  onSaved: () => void
}) {
  // Dans l'app, le scanner est celui du téléphone : l'écran de scan web
  // (caméra dans la WebView) ne s'affiche pas, la saisie du code reste dessous.
  // Le parcours n'est rendu qu'une fois l'état local chargé, jamais au serveur.
  const [nativeScan] = useState(
    () => isNativeApp() && hasNativeCapability('qr/scan'),
  )
  const [history, setHistory] = useState<Step[]>(() =>
    'method' in start
      ? [
          {
            kind: start.method === 'scan' && nativeScan ? 'code' : start.method,
          },
        ]
      : [],
  )
  const [busy, setBusy] = useState(() => !('method' in start))
  const [busyLabel, setBusyLabel] = useState(() =>
    !('method' in start) && start.incoming.origin === 'generator'
      ? 'Récupération de votre itinéraire…'
      : 'Récupération du voyage…',
  )
  const top = history[history.length - 1]

  const push = useCallback(
    (step: Step) => setHistory((current) => [...current, step]),
    [],
  )
  const replaceTop = useCallback(
    (step: Step) => setHistory((current) => [...current.slice(0, -1), step]),
    [],
  )

  const back = useCallback(() => {
    if (history.length <= 1) {
      onExit()
      return
    }
    setHistory((current) => current.slice(0, -1))
  }, [history.length, onExit])

  const resolve = useCallback(
    async (incoming: IncomingShare, via: ReceivedVia) => {
      const source = shareAnalyticsSource(incoming, via)
      const fromGenerator = incoming.origin === 'generator'
      trackEvent('share_import_started', { source })
      setBusyLabel(
        fromGenerator
          ? 'Récupération de votre itinéraire…'
          : 'Récupération du voyage…',
      )
      setBusy(true)
      try {
        const { days, group } = await resolveIncomingShare(incoming)
        push({
          kind: 'preview',
          received: {
            days,
            ...(group ? { group, title: group.state.title || undefined } : {}),
            source: fromGenerator ? 'generator' : 'share',
            via: fromGenerator ? 'generator' : via,
            analytics: { kind: 'share', source },
          },
        })
      } catch (error) {
        trackEvent('share_import_failed', {
          source,
          reason: shareImportFailureReason(error),
        })
        const description = describeShareError(error)
        if (incoming.code && !incoming.payload) {
          // Un code qui ne répond pas : on le montre dans le champ, en erreur,
          // avec ce qu'on peut faire à la place.
          const step: Step = {
            kind: 'code',
            code: incoming.code,
            error: description,
          }
          setHistory((current) =>
            current[current.length - 1]?.kind === 'code'
              ? [...current.slice(0, -1), step]
              : [...current, step],
          )
        } else {
          push({ kind: 'failed', message: description.message })
        }
      } finally {
        setBusy(false)
      }
    },
    [push],
  )

  /** Affiche une erreur dans le champ du code, ou l'empile s'il n'est pas dessous. */
  const showCodeError = useCallback((error: ShareErrorDescription) => {
    setHistory((current) => {
      const step: Step = { kind: 'code', error }
      return current[current.length - 1]?.kind === 'code'
        ? [...current.slice(0, -1), step]
        : [...current, step]
    })
  }, [])

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Scanner du téléphone : la valeur lue suit le même chemin qu'un lien collé.
  const scanningRef = useRef(false)
  const scanNatively = useCallback(async () => {
    if (scanningRef.current) return
    scanningRef.current = true
    try {
      const value = await scanQrNatively()
      // Écran fermé sans rien lire : on reste sur la saisie du code.
      if (!value || !mountedRef.current) return
      const incoming = parseShareInput(value, window.location.host)

      // Sans liste `capabilities`, c'est un natif v1.
      const legacyNative = !Array.isArray(getNativeApp()?.capabilities)
      if (scanValueReloadsPage(value, window.location.host, legacyNative)) {
        // Un natif v1 recharge déjà la page sur ce lien, qui rouvrira le
        // partage : on patiente, et on ne prend le relais que s'il ne l'a pas fait.
        if (incoming) triggerHaptic('success')
        setBusyLabel('Récupération du voyage…')
        setBusy(true)
        await new Promise((done) =>
          setTimeout(done, NATIVE_V1_NAVIGATION_GRACE_MS),
        )
        if (!mountedRef.current) return
        if (incoming) {
          void resolve(incoming, 'scan')
        } else {
          setBusy(false)
          showCodeError(FOREIGN_QR_ERROR)
        }
        return
      }

      if (!incoming) {
        triggerHaptic('warning')
        showCodeError(FOREIGN_QR_ERROR)
        return
      }
      triggerHaptic('success')
      void resolve(incoming, 'scan')
    } finally {
      scanningRef.current = false
    }
  }, [resolve, showCodeError])

  const requestScan = useCallback(() => {
    if (nativeScan) void scanNatively()
    else push({ kind: 'scan' })
  }, [nativeScan, scanNatively, push])

  // Un partage déjà en main (lien, presse-papiers) se résout dès l'ouverture,
  // une seule fois même si l'effet est rejoué. Un scan demandé dès l'entrée
  // (accueil, menu) ouvre le scanner du téléphone par-dessus la saisie.
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    if ('method' in start) {
      if (start.method !== 'scan' || !nativeScan) return
      startedRef.current = true
      void scanNatively()
      return
    }
    startedRef.current = true
    void resolve(start.incoming, start.via)
  }, [start, resolve, nativeScan, scanNatively])

  const onboarding = presentation === 'onboarding'
  const inputBackIcon =
    presentation === 'overlay' && history.length <= 1 ? 'close' : 'back'

  if (busy && top?.kind !== 'code') {
    return (
      <MobileScreen
        onBack={history.length > 0 ? back : onExit}
        backIcon={history.length > 0 ? 'back' : 'close'}
        progress={onboarding ? { step: 3, total: 4 } : undefined}
      >
        <div
          role="status"
          className="flex flex-1 flex-col items-center justify-center gap-4 py-16"
        >
          <span className="border-primary size-10 animate-spin rounded-full border-[3px] border-t-transparent" />
          <p className="text-muted-foreground text-sm font-bold">{busyLabel}</p>
        </div>
      </MobileScreen>
    )
  }

  if (!top) return null

  switch (top.kind) {
    case 'code':
      return (
        <CodeEntryStep
          // Une nouvelle erreur remonte le champ avec le code tenté.
          key={`${history.length}-${top.code ?? ''}`}
          initialCode={top.code}
          error={top.error}
          busy={busy}
          onSubmitCode={(code) => {
            replaceTop({ kind: 'code', code, error: null })
            void resolve({ code }, 'typed-code')
          }}
          onIncoming={(incoming) => void resolve(incoming, 'link')}
          onScan={requestScan}
          onBack={back}
          backIcon={inputBackIcon}
          progress={onboarding ? { step: 2, total: 4 } : undefined}
        />
      )
    case 'scan':
      return (
        <QrScanStep
          onBack={back}
          backIcon={history.length <= 1 ? 'close' : 'back'}
          onResult={(incoming, via) => void resolve(incoming, via)}
          onUseCode={() => {
            // Revenir au champ s'il est juste en dessous, plutôt que d'empiler.
            if (history[history.length - 2]?.kind === 'code') back()
            else push({ kind: 'code' })
          }}
        />
      )
    case 'failed':
      return (
        <MobileScreen
          onBack={back}
          backIcon={history.length <= 1 ? 'close' : 'back'}
          progress={onboarding ? { step: 2, total: 4 } : undefined}
          title="Impossible d’ouvrir ce partage"
          footer={
            <>
              <Button
                size="xl"
                className="w-full"
                onClick={() => push({ kind: 'code' })}
              >
                <KeyRound aria-hidden />
                Saisir un code
              </Button>
              <Button
                variant="ghost"
                className="text-muted-foreground min-h-11 w-full font-extrabold"
                onClick={back}
              >
                {history.length <= 1 ? 'Fermer' : 'Retour'}
              </Button>
            </>
          }
        >
          <div
            role="alert"
            className="bg-destructive-soft text-destructive flex items-start gap-3 rounded-[18px] p-4"
          >
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
            <p className="text-sm leading-relaxed font-bold">{top.message}</p>
          </div>
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
            Le lien est peut-être incomplet. Demandez un nouveau partage, ou
            saisissez le code à {SHARE_CODE_LENGTH} chiffres affiché sur l’autre
            appareil.
          </p>
        </MobileScreen>
      )
    case 'preview':
      return (
        <TripPreviewStep
          received={top.received}
          onBack={back}
          backIcon={history.length <= 1 ? 'close' : 'back'}
          eyebrow={presentation === 'onboarding' ? undefined : 'Partage reçu'}
          progress={onboarding ? { step: 3, total: 4 } : undefined}
          onSaved={onSaved}
        />
      )
  }
}

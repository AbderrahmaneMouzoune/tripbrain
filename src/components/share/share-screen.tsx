'use client'

import { useCallback, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  FileJson,
  KeyRound,
  Link2,
  Loader2,
  Map as MapIcon,
  QrCode,
  RefreshCw,
  Share2,
  ShieldCheck,
  WifiOff,
} from 'lucide-react'
import type { ScreenProps } from '@/components/app/screen-props'
import { useTrip } from '@/components/app/trip-provider'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { OptionCard } from '@/components/mobile/option-card'
import { Button } from '@/components/ui/button'
import { formatTripRange, plural } from '@/components/trip-menu/trip-format'
import {
  NATIVE_SHARE_TEXT,
  NATIVE_SHARE_TITLE,
  fitsInlineQr,
  formatCountdown,
  resolveShareExpiry,
  sharePrivacyNote,
  spellShareCode,
  toFrenchShareError,
} from '@/components/share/share-format'
import {
  SHARE_CODE_LENGTH,
  canShareNatively,
  compressItinerary,
  createShareCode,
  formatShareCode,
  getInlineQrUrl,
  getShareCodeUrl,
  shareNatively,
  type ShareCode,
} from '@/lib/share'
import { useClipboard } from '@/hooks/use-clipboard'
import { trackEvent } from '@/lib/analytics/client'
import { shareFailureReason } from '@/lib/analytics/metrics'
import { cn } from '@/lib/utils'

type CompressState =
  | { status: 'compressing' }
  | { status: 'ready'; compressed: string }
  | { status: 'error'; message: string }

type ServerState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'ready'; share: ShareCode; expiresAt: Date }
  | {
      status: 'error'
      message: string
      reason: ReturnType<typeof shareFailureReason>
    }

/** `inline` : le QR code contient tout le voyage. `server` : code déposé une heure. */
type TransferMode = 'inline' | 'server'

type StepState = 'done' | 'active' | 'todo'

/**
 * Partager l'itinéraire : trois façons de l'envoyer (lien, QR code, code à
 * dicter), puis la vue QR/code. L'itinéraire est compressé dès l'ouverture :
 * c'est sa taille qui décide si un QR code autonome suffit — dans ce cas rien
 * ne part sur le réseau tant qu'on ne demande pas explicitement un code.
 */
export function ShareScreen({ onClose }: ScreenProps<'share'>) {
  const { itinerary, activeTrip, trips, activeTripId, exportData } = useTrip()
  const summary = trips.find((trip) => trip.id === activeTripId)

  const [compress, setCompress] = useState<CompressState>({
    status: 'compressing',
  })
  const [server, setServer] = useState<ServerState>({ status: 'idle' })
  const [view, setView] = useState<'choice' | 'transfer'>('choice')
  const [mode, setMode] = useState<TransferMode>('inline')
  const [revision, setRevision] = useState(0)
  /** Message du repli quand le serveur de partage ne répond pas. */
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)
  const [linkNotice, setLinkNotice] = useState<string | null>(null)
  // Décidé après le montage : `navigator.share` n'existe pas au rendu serveur.
  const [hasNativeShare, setHasNativeShare] = useState(false)

  const codeClipboard = useClipboard()
  const linkClipboard = useClipboard()

  useEffect(() => {
    setHasNativeShare(canShareNatively())
  }, [])

  // Compression locale à l'ouverture (et à chaque nouvel essai).
  useEffect(() => {
    let cancelled = false
    setCompress({ status: 'compressing' })
    compressItinerary(itinerary)
      .then((compressed) => {
        if (!cancelled) setCompress({ status: 'ready', compressed })
      })
      .catch((error) => {
        if (cancelled) return
        setCompress({
          status: 'error',
          message: toFrenchShareError(error, 'compress'),
        })
        trackEvent('share_failed', {
          method: 'qr_inline',
          reason: shareFailureReason(error),
        })
      })
    return () => {
      cancelled = true
    }
  }, [itinerary, revision])

  const compressed = compress.status === 'ready' ? compress.compressed : null
  const canInline = compressed !== null && fitsInlineQr(compressed)
  const inlineUrl = compressed && canInline ? getInlineQrUrl(compressed) : null

  // Horloge du compte à rebours : ne tourne que lorsqu'un code est affiché.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (server.status !== 'ready') return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(timer)
  }, [server.status])
  const serverExpired =
    server.status === 'ready' && server.expiresAt.getTime() <= now
  // Un code expiré ne mène plus nulle part : son lien et son QR disparaissent.
  const serverUrl =
    server.status === 'ready' && !serverExpired
      ? getShareCodeUrl(server.share.code)
      : null

  /** Dépose le voyage sur le serveur : uniquement sur demande explicite. */
  const createCode = useCallback(async () => {
    if (!compressed) return
    setFallbackNotice(null)
    setServer({ status: 'uploading' })
    const startedAt = Date.now()
    try {
      const share = await createShareCode(compressed)
      setServer({
        status: 'ready',
        share,
        expiresAt: resolveShareExpiry(share, startedAt),
      })
      trackEvent('share_created', {
        method: 'server_code',
        days_count: itinerary.length,
      })
    } catch (error) {
      const reason = shareFailureReason(error)
      trackEvent('share_failed', { method: 'server_code', reason })
      // Service indisponible : un petit voyage passe quand même, par le QR autonome.
      if (reason === 'unavailable' && fitsInlineQr(compressed)) {
        setServer({ status: 'idle' })
        setMode('inline')
        setFallbackNotice(
          'Le service de partage par code est indisponible pour le moment. Ce QR code contient tout le voyage et fonctionne sans lui.',
        )
        return
      }
      setServer({
        status: 'error',
        message:
          reason === 'unavailable'
            ? `${toFrenchShareError(error, 'share')} Le voyage est trop volumineux pour un QR code autonome : exportez le fichier JSON en attendant.`
            : toFrenchShareError(error, 'share'),
        reason,
      })
    }
  }, [compressed, itinerary.length])

  const trackInline = useCallback(() => {
    trackEvent('share_created', {
      method: 'qr_inline',
      days_count: itinerary.length,
    })
  }, [itinerary.length])

  const openTransfer = (next: TransferMode) => {
    setLinkNotice(null)
    setMode(next)
    setView('transfer')
    if (next === 'inline') {
      trackInline()
      return
    }
    // Un code encore valide sert à nouveau : inutile d'en déposer un second.
    if (server.status !== 'ready' || server.expiresAt.getTime() <= Date.now()) {
      void createCode()
    }
  }

  /**
   * Ouvre la feuille de partage du système. Appelée directement depuis le
   * clic : les navigateurs refusent un partage natif sans geste. Si elle
   * n'aboutit pas, le lien part au moins dans le presse-papier.
   */
  const sendLink = async (url: string) => {
    const outcome = await shareNatively({
      title: NATIVE_SHARE_TITLE,
      text: NATIVE_SHARE_TEXT,
      url,
    })
    trackEvent('share_link_sent', { outcome })
    if (outcome === 'unavailable') {
      setHasNativeShare(false)
      await linkClipboard.copy(url)
      setLinkNotice('Lien copié : collez-le dans un message.')
    }
  }

  const handleSendLinkOption = () => {
    if (!compressed) return
    if (inlineUrl) {
      trackInline()
      void sendLink(inlineUrl)
      return
    }
    // Trop gros pour un lien autonome : le lien passe par un code déposé.
    openTransfer('server')
  }

  const tripFacts = [
    summary ? formatTripRange(summary.startDate, summary.endDate) : null,
    plural(itinerary.length, 'jour'),
    summary && summary.cityCount > 0
      ? plural(summary.cityCount, 'ville')
      : null,
  ].filter(Boolean)

  // ── Vue QR / code ──────────────────────────────────────────────────────────
  if (view === 'transfer') {
    const showInline = mode === 'inline' && inlineUrl !== null
    const ready = showInline || serverUrl !== null
    const activeUrl = showInline ? inlineUrl : serverUrl

    return (
      <MobileScreen
        onBack={() => setView('choice')}
        title="Partager"
        actions={
          ready ? (
            <span className="bg-success-soft text-success animate-pop flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold">
              <Check className="size-3.5" aria-hidden />
              Prêt
            </span>
          ) : null
        }
        footer={
          activeUrl ? (
            <>
              {hasNativeShare && (
                <Button
                  size="xl"
                  className="w-full"
                  onClick={() => void sendLink(activeUrl)}
                >
                  <Share2 aria-hidden />
                  Partager…
                </Button>
              )}
              <Button
                size="lg2"
                variant={hasNativeShare ? 'outline' : 'default'}
                className="w-full"
                onClick={() => {
                  void linkClipboard.copy(activeUrl)
                }}
              >
                {linkClipboard.copied ? (
                  <Check aria-hidden />
                ) : (
                  <Link2 aria-hidden />
                )}
                {linkClipboard.copied ? 'Lien copié' : 'Copier le lien'}
              </Button>
            </>
          ) : undefined
        }
      >
        <p className="text-muted-foreground -mt-2 text-[15px] leading-relaxed">
          {showInline
            ? 'Tout le voyage tient dans ce QR code.'
            : server.status === 'ready'
              ? 'Votre voyage est prêt à être envoyé.'
              : server.status === 'error'
                ? 'Le partage n’a pas pu être préparé.'
                : 'Préparation du partage…'}
        </p>

        <PreparationSteps
          steps={[
            {
              label: 'Analyse de l’itinéraire',
              state: compressed ? 'done' : 'active',
            },
            {
              label: 'Compression',
              state: compressed ? 'done' : 'todo',
            },
            ...(showInline
              ? []
              : [
                  {
                    label: 'Envoi',
                    state: (server.status === 'ready'
                      ? 'done'
                      : server.status === 'uploading'
                        ? 'active'
                        : 'todo') as StepState,
                  },
                ]),
          ]}
        />

        {fallbackNotice && showInline && (
          <p
            role="status"
            className="bg-secondary-soft text-secondary-strong mt-3 flex items-start gap-2 rounded-2xl px-3 py-2.5 text-[13px] leading-snug font-bold"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {fallbackNotice}
          </p>
        )}

        {activeUrl && (
          <div className="bg-card border-border animate-pop mx-auto mt-4 rounded-3xl border p-4 shadow-[0_12px_30px_rgba(14,26,58,0.08)]">
            {/* Le QR reste noir sur blanc, même en thème sombre : sinon il ne se lit plus. */}
            <div className="rounded-xl bg-white p-2">
              <QRCodeSVG
                value={activeUrl}
                size={220}
                level="M"
                marginSize={1}
                role="img"
                aria-label={`QR code du voyage ${activeTrip?.title ?? ''}`.trim()}
                className="h-auto w-[min(220px,60vw)]"
              />
            </div>
          </div>
        )}

        {showInline && (
          <div className="mt-4 flex flex-col items-center gap-3 text-center">
            <p className="text-success flex items-center gap-2 text-sm font-extrabold">
              <WifiOff className="size-4 shrink-0" aria-hidden />
              Fonctionne même sans connexion, et n’expire pas.
            </p>
            <Button
              variant="soft"
              size="lg2"
              onClick={() => openTransfer('server')}
            >
              <KeyRound aria-hidden />
              Dicter un code
            </Button>
          </div>
        )}

        {!showInline && server.status === 'uploading' && (
          <div className="text-muted-foreground mt-10 flex flex-col items-center gap-3 text-sm font-bold">
            <Loader2 className="text-primary size-8 animate-spin" aria-hidden />
            Dépôt du voyage, le temps du transfert…
          </div>
        )}

        {!showInline && server.status === 'error' && (
          <div
            role="alert"
            className="mt-6 flex flex-col items-center gap-4 text-center"
          >
            <span className="bg-destructive-soft text-destructive flex size-16 items-center justify-center rounded-full">
              <AlertTriangle className="size-7" aria-hidden />
            </span>
            <p className="text-destructive text-sm leading-relaxed font-bold">
              {server.message}
            </p>
            <div className="flex w-full flex-col gap-2">
              <Button
                size="lg2"
                variant="outline"
                className="w-full"
                onClick={() => void createCode()}
              >
                <RefreshCw aria-hidden />
                Réessayer
              </Button>
              {canInline && (
                <Button
                  size="lg2"
                  variant="ghost"
                  className="w-full"
                  onClick={() => openTransfer('inline')}
                >
                  <QrCode aria-hidden />
                  Montrer le QR code autonome
                </Button>
              )}
              <Button
                size="lg2"
                variant="ghost"
                className="w-full"
                onClick={exportData}
              >
                <FileJson aria-hidden />
                Exporter le fichier JSON
              </Button>
            </div>
          </div>
        )}

        {!showInline && server.status === 'ready' && (
          <ServerCode
            share={server.share}
            expiresAt={server.expiresAt}
            now={now}
            copied={codeClipboard.copied}
            onCopy={() => void codeClipboard.copy(server.share.code)}
            onRenew={() => void createCode()}
          />
        )}
      </MobileScreen>
    )
  }

  // ── Choix ──────────────────────────────────────────────────────────────────
  const preparing = compress.status === 'compressing'

  return (
    <MobileScreen
      onBack={onClose}
      backIcon="close"
      title="Partager l’itinéraire"
    >
      <div className="bg-card border-border flex items-center gap-3 rounded-2xl border px-3 py-2.5">
        <span
          aria-hidden
          className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
        >
          <MapIcon className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-black">
            {activeTrip?.title ?? 'Mon voyage'}
          </span>
          <span className="text-muted-foreground text-[13px]">
            {tripFacts.join(' · ')}
          </span>
        </span>
        {canInline && (
          <span className="bg-success-soft text-success shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold">
            QR autonome
          </span>
        )}
      </div>

      {compress.status === 'error' ? (
        <div role="alert" className="mt-6 flex flex-col items-center gap-4">
          <p className="text-destructive text-center text-sm font-bold">
            {compress.message}
          </p>
          <Button
            variant="outline"
            size="lg2"
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw aria-hidden />
            Réessayer
          </Button>
        </div>
      ) : (
        <div className="mt-3.5 flex flex-col gap-2.5" aria-busy={preparing}>
          <OptionCard
            icon={Share2}
            tone="primary"
            selected
            disabled={preparing}
            title="Envoyer un lien"
            description={
              <>
                {hasNativeShare
                  ? 'Par Messages, WhatsApp ou e-mail, via la feuille de partage du téléphone'
                  : 'Le lien est copié, prêt à coller dans un message'}
                <span className="bg-background mt-1.5 block rounded-[10px] px-2 py-1.5 text-xs italic">
                  « {NATIVE_SHARE_TEXT} »
                </span>
              </>
            }
            onClick={handleSendLinkOption}
          />
          {linkNotice && (
            <p
              role="status"
              className="text-success flex items-center gap-2 px-1 text-sm font-extrabold"
            >
              <Check className="size-4" aria-hidden />
              {linkNotice}
            </p>
          )}
          <OptionCard
            icon={QrCode}
            tone="accent"
            disabled={preparing}
            title="Montrer un QR code"
            description={
              canInline
                ? 'À scanner à côté de vous : ce voyage tient dedans, il fonctionne même sans connexion'
                : 'À scanner à côté de vous, valable 1 heure'
            }
            onClick={() => openTransfer(canInline ? 'inline' : 'server')}
          />
          <OptionCard
            icon={KeyRound}
            tone="secondary"
            disabled={preparing}
            title="Dicter un code"
            description={
              <>
                {SHARE_CODE_LENGTH} chiffres, valable 1 heure
                <span
                  aria-hidden
                  className="text-muted-foreground mt-0.5 block font-mono text-[13px] font-semibold tracking-[0.08em]"
                >
                  {formatShareCode('·'.repeat(SHARE_CODE_LENGTH))}
                </span>
              </>
            }
            onClick={() => openTransfer('server')}
          />
        </div>
      )}

      <button
        type="button"
        onClick={exportData}
        className="pressable text-muted-foreground focus-visible:ring-ring/50 mt-2 flex min-h-11 w-full items-center gap-2.5 rounded-xl px-1 text-left text-sm font-extrabold outline-none focus-visible:ring-[3px]"
      >
        <FileJson className="size-[18px] shrink-0" aria-hidden />
        <span className="flex-1">Exporter le fichier JSON</span>
      </button>

      <p className="bg-muted text-muted-foreground mt-1 flex items-start gap-2.5 rounded-[14px] px-3 py-2.5 text-xs leading-normal">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{sharePrivacyNote(canInline)}</span>
      </p>
    </MobileScreen>
  )
}

/** Étapes de préparation, cochées au fil de l'avancement réel. */
function PreparationSteps({
  steps,
}: {
  steps: { label: string; state: StepState }[]
}) {
  return (
    <ul
      aria-label="Préparation"
      className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs font-extrabold"
    >
      {steps.map((step) => (
        <li
          key={step.label}
          className={cn(
            'flex items-center gap-1',
            step.state === 'done' && 'text-success',
            step.state === 'active' && 'text-foreground',
            step.state === 'todo' && 'text-muted-foreground opacity-60',
          )}
        >
          {step.state === 'done' ? (
            <Check className="animate-pop size-3.5" aria-hidden />
          ) : step.state === 'active' ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <span className="size-3.5" aria-hidden />
          )}
          {step.label}
          <span className="sr-only">
            {step.state === 'done'
              ? ' : terminé'
              : step.state === 'active'
                ? ' : en cours'
                : ' : à venir'}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Code à dicter, groupé 4+4, avec son compte à rebours réel. */
function ServerCode({
  share,
  expiresAt,
  now,
  copied,
  onCopy,
  onRenew,
}: {
  share: ShareCode
  expiresAt: Date
  now: number
  copied: boolean
  onCopy: () => void
  onRenew: () => void
}) {
  const remaining = formatCountdown(expiresAt, now)

  return (
    <div className="mt-[18px] flex flex-col items-center gap-1">
      <p className="text-secondary-strong text-[11px] font-black tracking-[0.1em] uppercase">
        Ou dictez ce code
      </p>
      <p
        aria-label={spellShareCode(share.code)}
        className={cn(
          'font-mono text-[40px] leading-[1.15] font-semibold tracking-[0.08em] tabular-nums',
          !remaining && 'text-muted-foreground line-through',
        )}
      >
        {formatShareCode(share.code)}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {remaining ? (
          <>
            <Button variant="soft" size="lg2" className="h-11" onClick={onCopy}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? 'Code copié' : 'Copier le code'}
            </Button>
            <span className="text-muted-foreground flex items-center gap-1.5 text-[13px] font-extrabold">
              <Clock className="size-4" aria-hidden />
              Expire dans {remaining}
            </span>
          </>
        ) : (
          <>
            <span className="text-destructive text-[13px] font-extrabold">
              Code expiré
            </span>
            <Button
              variant="soft"
              size="lg2"
              className="h-11"
              onClick={onRenew}
            >
              <RefreshCw aria-hidden />
              Nouveau code
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

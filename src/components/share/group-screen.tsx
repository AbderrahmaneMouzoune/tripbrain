'use client'

import { useEffect, useId, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  AlertTriangle,
  Check,
  CloudOff,
  Link2,
  Loader2,
  RefreshCw,
  Share2,
  UserRound,
  Users,
} from 'lucide-react'
import type { ScreenProps } from '@/components/app/screen-props'
import { useTrip } from '@/components/app/trip-provider'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { Button } from '@/components/ui/button'
import { useClipboard } from '@/hooks/use-clipboard'
import { usePreferences } from '@/hooks/use-preferences'
import { MAX_AUTHOR_LENGTH, getGroupInviteUrl } from '@/lib/group-sync'
import { canShareNatively, shareNatively } from '@/lib/share'
import { cn } from '@/lib/utils'

/** « à l'instant », « il y a 4 min », « il y a 2 h », sinon la date. */
function formatAgo(at: number | null, now: number): string | null {
  if (!at) return null
  const minutes = Math.round((now - at) / 60_000)
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  return new Date(at).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  })
}

/**
 * Voyager à plusieurs : un même voyage tenu à jour sur le téléphone de chaque
 * voyageur. Avant activation, ce que ça change ; après, l'état de la
 * synchronisation et de quoi inviter les autres.
 */
export function GroupScreen({ onClose }: ScreenProps<'group'>) {
  const {
    activeTrip,
    enableGroup,
    leaveGroup,
    groupSyncStatus,
    requestGroupSync,
  } = useTrip()
  const { preferences, update } = usePreferences()
  const nameId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [hasNativeShare, setHasNativeShare] = useState(false)
  const linkClipboard = useClipboard()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setHasNativeShare(canShareNatively())
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const group = activeTrip?.group
  const title = activeTrip?.title ?? 'ce voyage'

  const nameField = (
    <div className="mt-5">
      <label
        htmlFor={nameId}
        className="text-muted-foreground mb-1.5 block text-[11px] font-black tracking-[0.1em] uppercase"
      >
        Votre prénom
      </label>
      <div className="border-border-strong bg-card focus-within:border-primary focus-within:ring-primary/20 flex items-center rounded-[14px] border-[1.5px] focus-within:ring-4">
        <UserRound
          aria-hidden
          className="text-muted-foreground ml-3 size-5 shrink-0"
        />
        <input
          id={nameId}
          type="text"
          autoComplete="given-name"
          maxLength={MAX_AUTHOR_LENGTH}
          value={preferences.travelerName}
          placeholder="Facultatif"
          onChange={(event) => update({ travelerName: event.target.value })}
          className="text-foreground placeholder:text-muted-foreground/60 h-[50px] min-w-0 flex-1 bg-transparent px-2 text-[15px] font-bold outline-none"
        />
      </div>
      <p className="text-muted-foreground mt-1.5 text-xs leading-snug">
        Les autres voient qui a fait la dernière modification.
      </p>
    </div>
  )

  // ── Pas encore synchronisé ────────────────────────────────────────────────
  if (!group) {
    const enable = async () => {
      if (!activeTrip) return
      setBusy(true)
      setError(null)
      try {
        await enableGroup(activeTrip.id)
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'La synchronisation n’a pas pu démarrer.',
        )
      } finally {
        setBusy(false)
      }
    }

    return (
      <MobileScreen
        onBack={onClose}
        title="Voyager à plusieurs"
        description={`Un seul programme pour ${title}, sur le téléphone de chacun.`}
        footer={
          <Button
            size="xl"
            className="w-full"
            disabled={busy || !activeTrip || activeTrip.isDemo}
            onClick={() => void enable()}
          >
            {busy ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Users aria-hidden />
            )}
            {busy ? 'Mise en route…' : 'Synchroniser ce voyage'}
          </Button>
        }
      >
        <ol className="flex flex-col gap-3 text-[15px] leading-snug">
          {[
            [
              'Vous invitez vos compagnons',
              'par un lien ou un QR code. Ils retrouvent le voyage dans leur propre TripBrain.',
            ],
            [
              'Chacun peut modifier le programme',
              'ajouter un restaurant, décaler une visite, cocher ce qui est fait.',
            ],
            [
              'Les changements arrivent chez tous',
              'dès qu’il y a du réseau. Sans réseau, le voyage reste lisible et vos modifications attendent.',
            ],
          ].map(([lead, rest], index) => (
            <li key={lead} className="flex gap-3">
              <span
                aria-hidden
                className="bg-primary-soft text-primary-strong flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-black"
              >
                {index + 1}
              </span>
              <span>
                <strong className="font-black">{lead}</strong>, {rest}
              </span>
            </li>
          ))}
        </ol>

        <p className="bg-muted text-muted-foreground mt-5 rounded-[14px] px-3 py-2.5 text-xs leading-normal">
          Les documents (billets, réservations) ne sont pas partagés : ils
          restent sur votre téléphone. Le voyage, lui, est gardé sur nos
          serveurs tant qu’il est synchronisé.
        </p>

        {nameField}

        {activeTrip?.isDemo && (
          <p className="text-muted-foreground mt-4 text-sm font-bold">
            Le voyage d’exemple ne peut pas être synchronisé.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="bg-destructive-soft text-destructive mt-4 flex items-start gap-2 rounded-[14px] px-3 py-2.5 text-sm font-bold"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}
      </MobileScreen>
    )
  }

  // ── Synchronisé ───────────────────────────────────────────────────────────
  const inviteUrl = getGroupInviteUrl(group.id)
  const checked = formatAgo(groupSyncStatus.checkedAt ?? group.syncedAt, now)
  const lastChange = formatAgo(group.remoteUpdatedAt, now)

  const sendInvite = async () => {
    const outcome = await shareNatively({
      title: `Rejoindre « ${title} » sur TripBrain`,
      text: 'Le programme du voyage, à jour sur nos deux téléphones :',
      url: inviteUrl,
    })
    if (outcome === 'unavailable') {
      setHasNativeShare(false)
      await linkClipboard.copy(inviteUrl)
    }
  }

  return (
    <MobileScreen
      onBack={onClose}
      title="Voyager à plusieurs"
      description={title}
      footer={
        <>
          {hasNativeShare && (
            <Button
              size="xl"
              className="w-full"
              onClick={() => void sendInvite()}
            >
              <Share2 aria-hidden />
              Inviter quelqu’un
            </Button>
          )}
          <Button
            size="lg2"
            variant={hasNativeShare ? 'outline' : 'default'}
            className="w-full"
            onClick={() => void linkClipboard.copy(inviteUrl)}
          >
            {linkClipboard.copied ? (
              <Check aria-hidden />
            ) : (
              <Link2 aria-hidden />
            )}
            {linkClipboard.copied
              ? 'Lien copié'
              : 'Copier le lien d’invitation'}
          </Button>
        </>
      }
    >
      <SyncState
        state={groupSyncStatus.state}
        dirty={group.dirty}
        checked={checked}
        message={groupSyncStatus.message}
        onRetry={() => requestGroupSync(0)}
      />
      {lastChange && (
        <p className="text-muted-foreground mt-2 px-1 text-[13px]">
          Dernière modification{' '}
          {group.lastAuthor ? (
            <>
              par{' '}
              <strong className="text-foreground">{group.lastAuthor}</strong>
            </>
          ) : null}{' '}
          {lastChange}
        </p>
      )}

      <div className="mt-5 flex items-center gap-4">
        <div className="border-border shrink-0 rounded-2xl border bg-white p-2">
          <QRCodeSVG
            value={inviteUrl}
            size={132}
            level="M"
            marginSize={1}
            role="img"
            aria-label={`QR code d’invitation au voyage ${title}`}
          />
        </div>
        <p className="text-muted-foreground text-[13px] leading-snug">
          À scanner par un compagnon de voyage. Le lien ne s’use pas : il ouvre
          le voyage et permet de le modifier, ne l’envoyez qu’à ceux qui partent
          avec vous.
        </p>
      </div>

      {nameField}

      <div className="mt-6">
        {confirmLeave ? (
          <div className="bg-destructive-soft rounded-[14px] p-3">
            <p className="text-destructive text-sm leading-snug font-bold">
              Le voyage reste sur ce téléphone, mais ne recevra plus les
              modifications des autres. Eux continuent sans vous.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="destructive"
                size="lg2"
                className="flex-1"
                onClick={() => {
                  if (activeTrip) void leaveGroup(activeTrip.id)
                  setConfirmLeave(false)
                }}
              >
                Arrêter
              </Button>
              <Button
                variant="ghost"
                size="lg2"
                className="flex-1"
                onClick={() => setConfirmLeave(false)}
              >
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmLeave(true)}
            className="text-muted-foreground hover:text-destructive min-h-11 px-1 text-sm font-extrabold"
          >
            Ne plus synchroniser sur ce téléphone
          </button>
        )}
      </div>
    </MobileScreen>
  )
}

function SyncState({
  state,
  dirty,
  checked,
  message,
  onRetry,
}: {
  state: 'idle' | 'syncing' | 'offline' | 'error'
  dirty: boolean
  checked: string | null
  message?: string
  onRetry: () => void
}) {
  const view =
    state === 'syncing'
      ? {
          icon: <Loader2 className="size-4 animate-spin" aria-hidden />,
          text: dirty ? 'Envoi de vos modifications…' : 'Vérification…',
          tone: 'bg-primary-soft text-primary-strong',
        }
      : state === 'offline'
        ? {
            icon: <CloudOff className="size-4" aria-hidden />,
            text: dirty
              ? 'Hors ligne : vos modifications partiront au retour du réseau'
              : 'Hors ligne : le voyage reste consultable',
            tone: 'bg-muted text-muted-foreground',
          }
        : state === 'error'
          ? {
              icon: <AlertTriangle className="size-4" aria-hidden />,
              text: message ?? 'La synchronisation a échoué',
              tone: 'bg-destructive-soft text-destructive',
            }
          : {
              icon: <Check className="size-4" aria-hidden />,
              text: checked ? `À jour · vérifié ${checked}` : 'À jour',
              tone: 'bg-success-soft text-success',
            }

  return (
    <div
      role="status"
      className={cn(
        'flex min-h-11 items-center gap-2 rounded-[14px] px-3 text-sm font-extrabold',
        view.tone,
      )}
    >
      {view.icon}
      <span className="flex-1">{view.text}</span>
      {(state === 'error' || state === 'offline') && (
        <button
          type="button"
          onClick={onRetry}
          aria-label="Réessayer"
          className="-mr-1 flex size-9 items-center justify-center rounded-full"
        >
          <RefreshCw className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}

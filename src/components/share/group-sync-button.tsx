'use client'

import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CloudOff,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import { useTrip } from '@/components/app/trip-provider'
import { Button } from '@/components/ui/button'
import type { GroupSyncStatus } from '@/hooks/use-group-sync'
import { cn } from '@/lib/utils'

interface StateView {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  /** Libellé court, pour le bouton compact. */
  short: string
  /** Phrase complète, pour l'écran du groupe. */
  long: string
  tone: string
  spin?: boolean
}

/** Ce que dit le bouton, selon l'écart entre ce téléphone et le groupe. */
export function describeGroupState(status: GroupSyncStatus): StateView {
  if (status.syncing) {
    return {
      icon: Loader2,
      short: 'Synchronisation…',
      long: 'Synchronisation en cours…',
      tone: 'bg-primary-soft text-primary-strong',
      spin: true,
    }
  }
  switch (status.version) {
    case 'synced':
      return {
        icon: Check,
        short: 'À jour',
        long: 'Vous avez la même version que le groupe.',
        tone: 'bg-success-soft text-success',
      }
    case 'behind':
      return {
        icon: ArrowDownToLine,
        short: 'Nouvelle version',
        long: 'Le groupe a modifié le voyage. Synchronisez pour voir ses changements.',
        tone: 'bg-secondary-soft text-secondary-strong',
      }
    case 'ahead':
      return {
        icon: ArrowUpFromLine,
        short: 'À envoyer',
        long: 'Vos modifications ne sont que sur ce téléphone. Synchronisez pour les envoyer au groupe.',
        tone: 'bg-primary-soft text-primary-strong',
      }
    case 'diverged':
      return {
        icon: RefreshCw,
        short: 'À synchroniser',
        long: 'Vous et le groupe avez modifié le voyage. La synchronisation réunit les deux.',
        tone: 'bg-secondary-soft text-secondary-strong',
      }
    default:
      return status.offline
        ? {
            icon: CloudOff,
            short: 'Hors ligne',
            long: 'Hors ligne : impossible de comparer avec le groupe pour l’instant.',
            tone: 'bg-muted text-muted-foreground',
          }
        : {
            icon: RefreshCw,
            short: 'Synchroniser',
            long: 'Version du groupe pas encore vérifiée.',
            tone: 'bg-muted text-muted-foreground',
          }
  }
}

/** Une phrase sur la dernière synchronisation demandée. */
export function describeSyncResult(
  result: NonNullable<GroupSyncStatus['lastResult']>,
): string {
  if (result.upToDate)
    return 'Rien de neuf : vous aviez déjà la dernière version.'
  const parts: string[] = []
  if (result.received) {
    parts.push(
      result.author
        ? `Modifications de ${result.author} récupérées`
        : 'Modifications du groupe récupérées',
    )
  }
  if (result.sent) parts.push('vos modifications sont envoyées')
  const sentence = parts.join(', ')
  const conflict =
    result.conflicts > 0
      ? ` ${result.conflicts === 1 ? 'Un élément modifié' : `${result.conflicts} éléments modifiés`} des deux côtés : la version du groupe a été gardée.`
      : ''
  return sentence
    ? `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.${conflict}`
    : `Vous avez la même version que le groupe.${conflict}`
}

/**
 * Bouton d'état compact, pour l'en-tête d'un voyage synchronisé : il dit si
 * ce téléphone a la même version que le groupe, et synchronise d'un appui.
 */
export function GroupSyncPill({ className }: { className?: string }) {
  const { activeTrip, groupSyncStatus, syncGroupNow } = useTrip()
  if (!activeTrip?.group) return null
  const view = describeGroupState(groupSyncStatus)
  const Icon = view.icon
  return (
    <button
      type="button"
      onClick={() => void syncGroupNow()}
      disabled={groupSyncStatus.syncing}
      aria-label={`${view.long} Appuyer pour synchroniser.`}
      className={cn(
        'pressable inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-extrabold',
        'focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]',
        view.tone,
        className,
      )}
    >
      <Icon
        className={cn('size-4 shrink-0', view.spin && 'animate-spin')}
        aria-hidden
      />
      {view.short}
    </button>
  )
}

/** Version complète, pour l'écran « Voyager à plusieurs ». */
export function GroupSyncPanel() {
  const { groupSyncStatus, syncGroupNow } = useTrip()
  const view = describeGroupState(groupSyncStatus)
  const Icon = view.icon
  const result = groupSyncStatus.lastResult
  return (
    <section
      aria-label="Synchronisation"
      className="bg-card border-border rounded-[18px] border p-3.5"
    >
      <div role="status" className="flex items-start gap-2.5">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full',
            view.tone,
          )}
        >
          <Icon
            className={cn('size-[18px]', view.spin && 'animate-spin')}
            aria-hidden
          />
        </span>
        <p className="flex-1 pt-1.5 text-sm leading-snug font-extrabold">
          {view.long}
        </p>
      </div>
      <Button
        size="lg2"
        className="mt-3 w-full"
        variant={groupSyncStatus.version === 'synced' ? 'outline' : 'default'}
        disabled={groupSyncStatus.syncing}
        onClick={() => void syncGroupNow()}
      >
        <RefreshCw
          className={cn(groupSyncStatus.syncing && 'animate-spin')}
          aria-hidden
        />
        Synchroniser maintenant
      </Button>
      {groupSyncStatus.error ? (
        <p
          role="alert"
          className="text-destructive mt-2.5 flex items-start gap-2 text-[13px] leading-snug font-bold"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {groupSyncStatus.error}
        </p>
      ) : result ? (
        <p className="text-muted-foreground mt-2.5 text-[13px] leading-snug">
          {describeSyncResult(result)}
        </p>
      ) : null}
    </section>
  )
}

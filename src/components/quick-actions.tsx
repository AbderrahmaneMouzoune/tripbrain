'use client'

import {
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'
import { useLongPress } from '@/hooks/use-long-press'
import { trackEvent } from '@/lib/analytics/client'
import { readPreferences, writePreferences } from '@/lib/preferences'
import type {
  QuickAction,
  QuickActionEntity,
  QuickActionIcon,
} from '@/lib/quick-actions'
import { BottomSheet } from '@/components/mobile/bottom-sheet'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  Hotel,
  Navigation,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Train,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'

/** Identifiant de l'astuce « appui long » dans les préférences. */
export const LONG_PRESS_TIP_ID = 'long-press'

/**
 * Le geste a été trouvé : l'astuce qui l'annonce n'a plus lieu d'être. Écrit
 * directement dans les préférences — chaque cible de l'écran n'a pas à s'y
 * abonner pour si peu.
 */
function markLongPressDiscovered() {
  const current = readPreferences()
  if (current.tipsSeen.includes(LONG_PRESS_TIP_ID)) return
  writePreferences({
    ...current,
    tipsSeen: [...current.tipsSeen, LONG_PRESS_TIP_ID],
  })
}

/** Associe les icônes nommées des descripteurs d'actions à leur composant. */
const QUICK_ACTION_ICONS: Record<QuickActionIcon, LucideIcon> = {
  edit: Pencil,
  plus: Plus,
  copy: Copy,
  navigation: Navigation,
  search: Search,
  external: ExternalLink,
  check: Check,
  skip: X,
  undo: RotateCcw,
  'move-up': ArrowUp,
  'move-down': ArrowDown,
  trash: Trash2,
  train: Train,
  hotel: Hotel,
}

/** Tons de la rangée « Où en êtes-vous ? », selon le statut proposé. */
const STATUS_TONES: Partial<Record<QuickActionIcon, string>> = {
  check: 'bg-success-soft text-success',
  skip: 'border-border-strong bg-card text-foreground border-[1.5px]',
  undo: 'bg-primary-soft text-primary-strong',
}

interface QuickActionsTargetProps {
  /** Élément concerné, pour la mesure d'usage */
  entity: QuickActionEntity
  /** Ce sur quoi portent les actions, repris en tête du menu */
  title: string
  description?: string
  /** Pastille d'icône de l'en-tête du menu */
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  actions: readonly QuickAction[]
  /**
   * Pose les gestes sur l'enfant plutôt que d'ajouter un conteneur : utile
   * quand le parent compte sur ses enfants directs (listes, séparateurs).
   */
  asChild?: boolean
  className?: string
  children: ReactNode
}

/**
 * Rend une information du roadbook sensible à l'appui long.
 *
 * Maintenir le doigt dessus — ou faire un clic droit, ou appuyer sur la touche
 * « menu » du clavier — ouvre une feuille listant ce qu'on peut en faire :
 * dire où on en est, modifier, copier, ouvrir un lien, supprimer. Les boutons
 * visibles de l'interface restent en place : ce menu est un raccourci, pas le
 * seul chemin.
 */
export function QuickActionsTarget({
  entity,
  title,
  description,
  icon,
  actions,
  asChild = false,
  className,
  children,
}: QuickActionsTargetProps) {
  const [open, setOpen] = useState(false)

  const { pressed, handlers } = useLongPress({
    disabled: actions.length === 0,
    onLongPress: () => {
      setOpen(true)
      markLongPressDiscovered()
      trackEvent('quick_actions_opened', { entity })
    },
  })

  const Target = asChild ? Slot : 'div'

  return (
    <>
      <Target
        data-pressed={pressed}
        className={cn(
          // L'appui long remplace le menu natif (aperçu de lien, sélection de
          // texte) : on le neutralise, et on répond par un léger retrait pour
          // que le geste se voie avant même que la feuille n'arrive.
          'transition-transform duration-200 [-webkit-touch-callout:none] data-[pressed=true]:scale-[0.985] data-[pressed=true]:select-none',
          className,
        )}
        {...handlers}
      >
        {children}
      </Target>

      {actions.length > 0 && (
        <QuickActionsSheet
          open={open}
          onOpenChange={setOpen}
          entity={entity}
          title={title}
          description={description}
          icon={icon}
          actions={actions}
        />
      )}
    </>
  )
}

interface QuickActionsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entity: QuickActionEntity
  title: string
  description?: string
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  actions: readonly QuickAction[]
}

/**
 * Feuille d'actions rapides : en-tête de l'élément, rangée « Où en
 * êtes-vous ? » pour les statuts, liste des autres actions, et la suppression
 * à part, en rouge, qui demande un second appui.
 */
export function QuickActionsSheet({
  open,
  onOpenChange,
  entity,
  title,
  description,
  icon: HeaderIcon,
  actions,
}: QuickActionsSheetProps) {
  /** Action fâcheuse en attente de son second appui. */
  const [confirming, setConfirming] = useState<string | null>(null)

  const close = () => {
    setConfirming(null)
    onOpenChange(false)
  }

  const runAction = (action: QuickAction) => {
    if (action.confirm && confirming !== action.id) {
      setConfirming(action.id)
      return
    }
    trackEvent('quick_action_used', { entity, action: action.kind })
    close()
    action.run?.()
  }

  const statusActions = actions.filter((action) => action.kind === 'status')
  const listActions = actions.filter(
    (action) => action.kind !== 'status' && !action.destructive,
  )
  const destructiveActions = actions.filter((action) => action.destructive)

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setConfirming(null)
        onOpenChange(next)
      }}
      title={title}
      description={description ?? 'Que faire de cette information ?'}
      hideHeader
      className="pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mt-1 flex items-center gap-3">
        {HeaderIcon && (
          <span
            aria-hidden
            className="bg-primary-soft text-primary flex size-12 shrink-0 items-center justify-center rounded-[14px]"
          >
            <HeaderIcon className="size-[22px]" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[19px] leading-6 font-black">
            {title}
          </p>
          {description && (
            <p className="text-muted-foreground truncate text-sm font-bold">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Fermer"
          className="bg-background text-muted-foreground pressable flex size-11 shrink-0 items-center justify-center rounded-full"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      {statusActions.length > 0 && (
        <>
          <p className="text-secondary-strong mt-4 mb-2 text-[11px] font-black tracking-[0.1em]">
            OÙ EN ÊTES-VOUS ?
          </p>
          <div className="flex gap-2">
            {statusActions.map((action) => {
              const Icon = QUICK_ACTION_ICONS[action.icon]
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => runAction(action)}
                  className={cn(
                    'pressable flex min-h-[62px] flex-1 flex-col items-center justify-center gap-1 rounded-[14px] px-2 text-center text-sm font-extrabold',
                    STATUS_TONES[action.icon] ?? 'bg-muted text-foreground',
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {action.label}
                </button>
              )
            })}
          </div>
        </>
      )}

      {listActions.length > 0 && (
        <ul className="divide-border/70 mt-3 divide-y">
          {listActions.map((action) => (
            <li key={action.id}>
              <ActionRow
                action={action}
                onRun={() => runAction(action)}
                onOpenLink={() => {
                  trackEvent('quick_action_used', {
                    entity,
                    action: action.kind,
                  })
                  close()
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {destructiveActions.length > 0 && (
        <div className="border-background mt-1.5 border-t-[6px] pt-1.5">
          {destructiveActions.map((action) => {
            const isConfirming = confirming === action.id
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => runAction(action)}
                aria-live="polite"
                className={cn(
                  'text-destructive pressable flex min-h-[50px] w-full items-center gap-3.5 rounded-xl text-left text-[15px] font-extrabold',
                  isConfirming && 'bg-destructive-soft px-2',
                )}
              >
                <span
                  aria-hidden
                  className="bg-destructive-soft flex size-9 shrink-0 items-center justify-center rounded-xl"
                >
                  <Trash2 className="size-[18px]" />
                </span>
                {isConfirming && action.confirmLabel
                  ? action.confirmLabel
                  : action.label}
              </button>
            )
          })}
        </div>
      )}
    </BottomSheet>
  )
}

function ActionRow({
  action,
  onRun,
  onOpenLink,
}: {
  action: QuickAction
  onRun: () => void
  onOpenLink: () => void
}) {
  const Icon = QUICK_ACTION_ICONS[action.icon]
  const body = (
    <>
      <span
        aria-hidden
        className="bg-background text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-xl"
      >
        <Icon className="size-[18px]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-extrabold">{action.label}</span>
        {action.hint && (
          <span className="text-muted-foreground truncate text-xs font-semibold">
            {action.hint}
          </span>
        )}
      </span>
      {action.href && (
        <ExternalLink
          className="text-muted-foreground size-4 shrink-0"
          aria-hidden
        />
      )}
    </>
  )
  const classes =
    'text-foreground pressable flex min-h-[50px] w-full items-center gap-3.5 rounded-xl text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

  if (action.href) {
    return (
      <a
        href={action.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onOpenLink}
        className={classes}
      >
        {body}
      </a>
    )
  }
  return (
    <button type="button" onClick={onRun} className={classes}>
      {body}
    </button>
  )
}

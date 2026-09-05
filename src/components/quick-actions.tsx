'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'
import { useLongPress } from '@/hooks/use-long-press'
import { trackEvent } from '@/lib/analytics/client'
import type {
  QuickAction,
  QuickActionEntity,
  QuickActionIcon,
} from '@/lib/quick-actions'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
  Pointer,
  RotateCcw,
  Search,
  Train,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'

/** Le geste est invisible : on l'annonce une fois, puis on n'y revient plus. */
const HINT_STORAGE_KEY = 'tripbrain:quick-actions-hint'

function markHintSeen() {
  try {
    window.localStorage.setItem(HINT_STORAGE_KEY, 'seen')
  } catch {
    // Stockage refusé (navigation privée) : l'astuce reviendra, tant pis.
  }
}

/**
 * Astuce d'un jour : dit qu'un appui long ouvre le menu, disparaît dès qu'on
 * la ferme ou qu'on a utilisé le geste une fois.
 */
export function QuickActionsHint({ className }: { className?: string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(HINT_STORAGE_KEY) !== 'seen')
    } catch {
      setVisible(false)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className={cn(
        'border-border/60 text-muted-foreground flex items-center gap-2 rounded-xl border border-dashed px-3 py-2',
        className,
      )}
    >
      <Pointer
        className="text-secondary h-3.5 w-3.5 shrink-0"
        strokeWidth={1.75}
      />
      <p className="min-w-0 flex-1 text-[11px] leading-snug">
        Gardez le doigt appuyé sur une information pour la modifier, la copier
        ou l&apos;ouvrir.
      </p>
      <button
        type="button"
        onClick={() => {
          markHintSeen()
          setVisible(false)
        }}
        aria-label="Masquer l'astuce"
        className="hover:text-foreground shrink-0 cursor-pointer transition-colors"
      >
        <X className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
    </div>
  )
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

interface QuickActionsTargetProps {
  /** Élément concerné, pour la mesure d'usage */
  entity: QuickActionEntity
  /** Ce sur quoi portent les actions, repris en tête du menu */
  title: string
  description?: string
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
 * « menu » du clavier — ouvre un panneau listant ce qu'on peut en faire :
 * modifier, changer un statut, copier, ouvrir un lien, supprimer. Les boutons
 * visibles de l'interface restent en place : ce menu est un raccourci, pas le
 * seul chemin.
 */
export function QuickActionsTarget({
  entity,
  title,
  description,
  actions,
  asChild = false,
  className,
  children,
}: QuickActionsTargetProps) {
  const [open, setOpen] = useState(false)
  /** Action fâcheuse en attente de son second appui. */
  const [confirming, setConfirming] = useState<string | null>(null)

  const { pressed, handlers } = useLongPress({
    disabled: actions.length === 0,
    onLongPress: () => {
      setConfirming(null)
      setOpen(true)
      markHintSeen()
      trackEvent('quick_actions_opened', { entity })
    },
  })

  const runAction = (action: QuickAction) => {
    // Une suppression demande un second appui, sur le même bouton devenu rouge.
    if (action.confirm && confirming !== action.id) {
      setConfirming(action.id)
      return
    }

    trackEvent('quick_action_used', { entity, action: action.kind })
    setConfirming(null)
    setOpen(false)
    action.run?.()
  }

  const Target = asChild ? Slot : 'div'

  return (
    <>
      <Target
        data-pressed={pressed}
        className={cn(
          // L'appui long remplace le menu natif (aperçu de lien, sélection de
          // texte) : on le neutralise, et on répond par un léger retrait pour
          // que le geste se voie avant même que le panneau n'arrive.
          'transition-transform duration-200 [-webkit-touch-callout:none] data-[pressed=true]:scale-[0.985] data-[pressed=true]:select-none',
          className,
        )}
        {...handlers}
      >
        {children}
      </Target>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setConfirming(null)
        }}
      >
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[85svh] gap-0 overflow-y-auto rounded-t-2xl p-0 sm:max-w-md"
          // Le panneau se referme au moment où un formulaire s'ouvre : lui
          // rendre le focus le lui arracherait aussitôt.
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <SheetHeader className="border-border/60 border-b pr-12">
            <SheetTitle className="line-clamp-2 text-base">{title}</SheetTitle>
            <SheetDescription className="text-xs">
              {description ?? 'Que faire de cette information ?'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
            {actions.map((action) => {
              const isConfirming = confirming === action.id
              const Icon = isConfirming
                ? Trash2
                : QUICK_ACTION_ICONS[action.icon]
              const label =
                isConfirming && action.confirmLabel
                  ? action.confirmLabel
                  : action.label

              const body = (
                <>
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                      action.destructive
                        ? 'bg-destructive/10'
                        : 'bg-primary/10',
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {label}
                    </span>
                    {action.hint && (
                      <span className="text-muted-foreground block truncate text-[11px] font-normal">
                        {action.hint}
                      </span>
                    )}
                  </span>
                </>
              )

              const rowClass = cn(
                'flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors active:scale-[0.99]',
                action.destructive
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-foreground hover:bg-muted/70',
                isConfirming && 'bg-destructive/10',
              )

              if (action.href) {
                return (
                  <a
                    key={action.id}
                    href={action.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      trackEvent('quick_action_used', {
                        entity,
                        action: action.kind,
                      })
                      setOpen(false)
                    }}
                    className={rowClass}
                  >
                    {body}
                  </a>
                )
              }

              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => runAction(action)}
                  className={cn(rowClass, 'cursor-pointer')}
                >
                  {body}
                </button>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

'use client'

import { useEffect, useState, type ComponentType, type SVGProps } from 'react'
import { List, Map as MapIcon, Sun, Ticket } from 'lucide-react'
import {
  SCREENS_WITH_TAB_BAR,
  useAppNav,
  type AppTab,
} from '@/components/app/navigation'
import { useEditSession } from '@/components/app/edit-session'
import { cn } from '@/lib/utils'

const TABS: {
  id: AppTab
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}[] = [
  { id: 'today', label: 'Aujourd’hui', icon: Sun },
  { id: 'program', label: 'Programme', icon: List },
  { id: 'map', label: 'Carte', icon: MapIcon },
  { id: 'documents', label: 'Documents', icon: Ticket },
]

/** Hauteur réservée en bas des onglets pour ne rien cacher sous la barre. */
export const TAB_BAR_SPACER = 'h-[calc(84px+var(--safe-bottom))]' as const

/**
 * La barre passe-t-elle au-dessus de l'écran empilé du dessus ? Oui pour les
 * écrans de consultation, mode édition compris : la barre d'édition se pose
 * alors juste au-dessus d'elle.
 */
export function useTabBarOverScreens(): boolean {
  const { stack } = useAppNav()
  const top = stack[stack.length - 1]
  return Boolean(top && SCREENS_WITH_TAB_BAR.has(top.kind))
}

/**
 * Barre d'onglets du bas, à portée du pouce. Elle reste accessible depuis les
 * écrans de consultation (journée, fiches, menu…) : toucher un onglet referme
 * les écrans ouverts et y mène directement.
 */
export function BottomTabBar() {
  const { tab, setTab, stack } = useAppNav()
  const overScreens = useTabBarOverScreens()
  const { isEditing, pendingChanges, openReview, stopEditing, reviewOpen } =
    useEditSession()
  // Onglet demandé pendant l'édition : on y va une fois les modifications
  // enregistrées ou annulées ; « Continuer à modifier » l'oublie.
  const [pendingTab, setPendingTab] = useState<AppTab | null>(null)
  useEffect(() => {
    if (!pendingTab) return
    if (!isEditing) {
      setTab(pendingTab)
      setPendingTab(null)
    } else if (!reviewOpen) {
      setPendingTab(null)
    }
  }, [isEditing, reviewOpen, pendingTab, setTab])

  // Quitter la journée en cours d'édition : sans modification, on sort du mode
  // édition et on change d'onglet ; avec des modifications, le récapitulatif
  // s'ouvre d'abord pour enregistrer ou annuler — rien ne se perd en route.
  const goTo = (id: AppTab) => {
    if (isEditing) {
      if (pendingChanges > 0) {
        setPendingTab(id)
        openReview('save')
        return
      }
      stopEditing()
    }
    setTab(id)
  }
  // Sous un parcours ou une vue immersive, la barre est couverte : on la
  // retire aussi de l'ordre de tabulation et des lecteurs d'écran.
  const covered = stack.length > 0 && !overScreens
  return (
    <nav
      aria-label="Navigation principale"
      aria-hidden={covered || undefined}
      inert={covered || undefined}
      className={cn(
        'bg-card/95 border-border animate-fade fixed inset-x-0 bottom-0 border-t backdrop-blur-xl',
        // Les écrans empilés vont de z-41 à z-48 ; dialogues et feuilles à z-50.
        overScreens ? 'z-[49]' : 'z-40',
      )}
    >
      <div className="mx-auto flex max-w-xl px-2 pt-2 pb-[calc(var(--safe-bottom)+10px)]">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => goTo(id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'pressable flex min-h-12 flex-1 flex-col items-center gap-[3px] rounded-xl text-[11px] outline-none',
                'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                active
                  ? 'text-primary font-black'
                  : 'text-muted-foreground font-extrabold',
              )}
            >
              <span
                className={cn(
                  'flex h-[30px] w-14 items-center justify-center rounded-full transition-colors',
                  active && 'bg-primary-soft animate-pop',
                )}
              >
                <Icon className="size-5" strokeWidth={2} aria-hidden />
              </span>
              {label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

'use client'

import type { ComponentType, SVGProps } from 'react'
import { List, Map as MapIcon, Sun, Ticket } from 'lucide-react'
import { useAppNav, type AppTab } from '@/components/app/navigation'
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
export const TAB_BAR_SPACER =
  'h-[calc(84px+env(safe-area-inset-bottom))]' as const

/** Barre d'onglets du bas, à portée du pouce. */
export function BottomTabBar() {
  const { tab, setTab } = useAppNav()
  return (
    <nav
      aria-label="Navigation principale"
      className="bg-card/95 border-border animate-fade fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-xl px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+10px)]">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
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

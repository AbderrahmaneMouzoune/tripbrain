'use client'

import type { ComponentType, ReactNode, SVGProps } from 'react'
import { cn } from '@/lib/utils'

/** Pastille à bascule (choix multiple, filtres, suggestions). */
export function Chip({
  pressed,
  onClick,
  icon: Icon,
  children,
  className,
}: {
  /** `undefined` : simple bouton de suggestion, sans état. */
  pressed?: boolean
  onClick?: () => void
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'pressable inline-flex min-h-10 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-sm font-extrabold outline-none',
        'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        pressed
          ? 'border-primary bg-primary-soft text-primary-strong'
          : 'border-border-strong bg-card text-foreground',
        className,
      )}
    >
      {Icon && <Icon className="size-4" aria-hidden />}
      {children}
    </button>
  )
}

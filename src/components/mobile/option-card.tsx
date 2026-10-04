'use client'

import type { ComponentType, ReactNode, SVGProps } from 'react'
import { ChevronRight } from 'lucide-react'
import { IconBadge, type BadgeTone } from '@/components/mobile/icon-badge'
import { cn } from '@/lib/utils'

export interface OptionCardProps {
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  tone?: BadgeTone
  title: ReactNode
  description?: ReactNode
  /** Petite pastille sous la description (« Le plus fréquent »). */
  badge?: ReactNode
  /** Mise en avant (bordure bleue épaisse) : option recommandée ou choisie. */
  selected?: boolean
  /** Rôle radio quand la carte fait partie d'un choix exclusif. */
  role?: 'radio'
  chevron?: boolean
  trailing?: ReactNode
  disabled?: boolean
  onClick?: () => void
  className?: string
}

/** Grande carte d'option tapable de bout en bout. */
export function OptionCard({
  icon,
  tone = 'primary',
  title,
  description,
  badge,
  selected,
  role,
  chevron = true,
  trailing,
  disabled,
  onClick,
  className,
}: OptionCardProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === 'radio' ? Boolean(selected) : undefined}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'pressable bg-card flex w-full items-center gap-3.5 rounded-[20px] p-4 text-left outline-none',
        'focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50',
        'hover:shadow-[0_8px_20px_rgba(14,26,58,0.08)]',
        selected ? 'border-primary border-2 p-[15px]' : 'border-border border',
        className,
      )}
    >
      {icon && <IconBadge icon={icon} tone={tone} size="lg" />}
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="text-base leading-snug font-extrabold">{title}</span>
        {description && (
          <span className="text-muted-foreground text-[13px] leading-snug">
            {description}
          </span>
        )}
        {badge && (
          <span className="bg-primary text-primary-foreground mt-0.5 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold">
            {badge}
          </span>
        )}
      </span>
      {trailing}
      {chevron && !trailing && (
        <ChevronRight
          className="text-muted-foreground size-5 shrink-0"
          aria-hidden
        />
      )}
    </button>
  )
}

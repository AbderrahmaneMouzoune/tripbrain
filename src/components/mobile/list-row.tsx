'use client'

import type { ComponentType, ReactNode, SVGProps } from 'react'
import { ChevronRight } from 'lucide-react'
import { IconBadge, type BadgeTone } from '@/components/mobile/icon-badge'
import { cn } from '@/lib/utils'

/**
 * Ligne de menu ou de feuille d'actions : pastille d'icône, libellé,
 * précision, et à droite un chevron ou un contrôle.
 */
export function ListRow({
  icon,
  tone = 'primary',
  label,
  description,
  trailing,
  chevron,
  destructive,
  onClick,
  disabled,
  className,
}: {
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  tone?: BadgeTone
  label: ReactNode
  description?: ReactNode
  trailing?: ReactNode
  chevron?: boolean
  destructive?: boolean
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  const content = (
    <>
      {icon && (
        <IconBadge
          icon={icon}
          tone={destructive ? 'destructive' : tone}
          size="md"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            'text-[15px] leading-snug font-extrabold',
            destructive && 'text-destructive',
          )}
        >
          {label}
        </span>
        {description && (
          <span className="text-muted-foreground text-[13px] leading-snug">
            {description}
          </span>
        )}
      </span>
      {trailing}
      {(chevron ?? Boolean(onClick && !trailing)) && (
        <ChevronRight
          className="text-muted-foreground size-[18px] shrink-0"
          aria-hidden
        />
      )}
    </>
  )
  const classes = cn(
    'flex min-h-14 w-full items-center gap-3 py-2.5 text-left',
    className,
  )
  if (!onClick) return <div className={classes}>{content}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        classes,
        'pressable focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px] focus-visible:ring-inset disabled:opacity-50',
      )}
    >
      {content}
    </button>
  )
}

/** Carte blanche qui regroupe des lignes séparées par un filet. */
export function ListCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'bg-card border-border divide-border/70 flex flex-col divide-y rounded-[20px] border px-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

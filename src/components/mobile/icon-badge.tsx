import type { ComponentType, SVGProps } from 'react'
import { cn } from '@/lib/utils'

export type BadgeTone =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'success'
  | 'destructive'
  | 'muted'
  | 'ink'

const TONES: Record<BadgeTone, string> = {
  primary: 'bg-primary-soft text-primary-strong',
  secondary: 'bg-secondary-soft text-secondary-strong',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  destructive: 'bg-destructive-soft text-destructive',
  muted: 'bg-muted text-muted-foreground',
  ink: 'bg-ink text-ink-foreground',
}

const SIZES = {
  sm: 'size-7 rounded-full [&_svg]:size-3.5',
  md: 'size-10 rounded-xl [&_svg]:size-5',
  lg: 'size-12 rounded-[14px] [&_svg]:size-[22px]',
} as const

/** Pastille d'icône colorée : l'œil trouve l'option avant de lire. */
export function IconBadge({
  icon: Icon,
  tone = 'primary',
  size = 'md',
  className,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  tone?: BadgeTone
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center',
        TONES[tone],
        SIZES[size],
        className,
      )}
    >
      <Icon strokeWidth={2} />
    </span>
  )
}

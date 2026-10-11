'use client'

import { cn } from '@/lib/utils'

export interface SegmentOption<T extends string> {
  value: T
  label: string
}

/** Sélecteur segmenté : un choix exclusif parmi deux à cinq valeurs courtes. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly SegmentOption<T>[]
  value: T | null | undefined
  onChange: (value: T) => void
  /** Nom accessible du groupe. */
  label: string
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('bg-muted grid gap-1 rounded-[14px] p-1', className)}
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'pressable h-10 rounded-[10px] px-2 text-sm font-extrabold outline-none',
              'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
              active
                ? 'bg-card text-foreground shadow-[0_1px_3px_rgba(14,26,58,0.15)]'
                : 'text-muted-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

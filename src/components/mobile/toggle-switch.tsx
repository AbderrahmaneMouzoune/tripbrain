'use client'

import { cn } from '@/lib/utils'

/**
 * Interrupteur 52 × 32 des réglages. Son nom vient d'un libellé visible
 * (`labelledBy`) ou, à défaut, de `label`.
 */
export function ToggleSwitch({
  checked,
  onCheckedChange,
  labelledBy,
  label,
  disabled,
  className,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  labelledBy?: string
  label?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        // Cible tactile de 44 px autour d'un rail de 32 px.
        'relative flex h-11 w-[52px] shrink-0 items-center outline-none disabled:opacity-50',
        'focus-visible:[&>span]:ring-ring/50 focus-visible:[&>span]:ring-[3px]',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex h-8 w-[52px] items-center rounded-full p-[3px] transition-colors duration-200',
          checked ? 'bg-primary' : 'bg-border-strong',
        )}
      >
        <span
          className={cn(
            'size-[26px] rounded-full bg-white shadow-[0_1px_3px_rgba(14,26,58,0.25)] transition-transform duration-250 ease-[cubic-bezier(.2,.8,.2,1)]',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </button>
  )
}

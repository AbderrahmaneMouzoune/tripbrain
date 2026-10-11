import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Titre de section en petites capitales (« PARTAGER », « À AJOUTER »). */
export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn('flex items-center justify-between gap-3 px-1', className)}
    >
      <h2 className="text-muted-foreground text-xs font-black tracking-[0.08em] uppercase">
        {children}
      </h2>
      {action}
    </div>
  )
}

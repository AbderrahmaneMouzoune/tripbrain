'use client'

import type { ReactNode } from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { cn } from '@/lib/utils'

/**
 * Feuille du bas : glisse depuis le bas, se ferme d'un geste. Titre et
 * description restent lisibles par les lecteurs d'écran même masqués.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  hideHeader,
  children,
  footer,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  /** Titre réservé aux lecteurs d'écran (feuilles à en-tête personnalisé). */
  hideHeader?: boolean
  children?: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className={cn(
          'bg-card mx-auto max-h-[92dvh] max-w-xl rounded-t-[28px] border-0',
          className,
        )}
      >
        <DrawerHeader
          className={cn('px-5 pt-3 pb-2 text-left', hideHeader && 'sr-only')}
        >
          <DrawerTitle className="text-lg font-black">{title}</DrawerTitle>
          {description ? (
            <DrawerDescription className="text-muted-foreground text-sm">
              {description}
            </DrawerDescription>
          ) : (
            <DrawerDescription className="sr-only">{title}</DrawerDescription>
          )}
        </DrawerHeader>
        <div className="stagger overflow-y-auto px-5 pb-4">{children}</div>
        {footer && (
          <DrawerFooter className="px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+20px)]">
            {footer}
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  )
}

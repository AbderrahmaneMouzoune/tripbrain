'use client'

import type { ReactNode } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StepProgress } from '@/components/mobile/step-progress'
import { cn } from '@/lib/utils'

export interface MobileScreenProps {
  /** Titre principal (H1, police d'affichage). */
  title?: ReactNode
  /** Sourcil au-dessus du titre, en petites capitales orange. */
  eyebrow?: ReactNode
  /** Texte sous le titre. */
  description?: ReactNode
  /** Bouton retour (flèche) ou fermeture (croix) en haut à gauche. */
  onBack?: () => void
  backIcon?: 'back' | 'close'
  backLabel?: string
  /** Barre de parcours en segments, à droite du bouton retour. */
  progress?: { step: number; total: number }
  /** Actions en haut à droite (boutons icône ronds). */
  actions?: ReactNode
  /** Zone collée en bas : boutons principaux. */
  footer?: ReactNode
  children?: ReactNode
  className?: string
  bodyClassName?: string
  /** Fait apparaître les blocs du corps en cascade. */
  stagger?: boolean
}

/**
 * Gabarit d'un écran mobile plein : en-tête (retour, progression, actions),
 * titre, corps défilant et pied collé en bas, avec les marges des zones sûres.
 */
export function MobileScreen({
  title,
  eyebrow,
  description,
  onBack,
  backIcon = 'back',
  backLabel,
  progress,
  actions,
  footer,
  children,
  className,
  bodyClassName,
  stagger = true,
}: MobileScreenProps) {
  const hasTopBar = Boolean(onBack || progress || actions)
  return (
    <div
      className={cn(
        'bg-background text-foreground flex min-h-dvh flex-col',
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        {hasTopBar && (
          <div className="flex items-center gap-3.5 px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
            {onBack ? (
              <Button
                variant="outline"
                size="icon-round"
                onClick={onBack}
                aria-label={
                  backLabel ?? (backIcon === 'close' ? 'Fermer' : 'Retour')
                }
                className="border-border bg-card shrink-0 shadow-none"
              >
                {backIcon === 'close' ? <X /> : <ArrowLeft />}
              </Button>
            ) : (
              progress && <span className="w-11 shrink-0" aria-hidden />
            )}
            {progress ? (
              <>
                <StepProgress step={progress.step} total={progress.total} />
                <span className="text-muted-foreground w-11 shrink-0 text-right text-[13px] font-extrabold tabular-nums">
                  {progress.step}/{progress.total}
                </span>
              </>
            ) : (
              <span className="flex-1" />
            )}
            {actions && (
              <div className="flex shrink-0 items-center gap-2">{actions}</div>
            )}
          </div>
        )}

        <div
          className={cn(
            'flex flex-1 flex-col px-5 pb-6',
            hasTopBar ? 'pt-6' : 'pt-[calc(env(safe-area-inset-top)+24px)]',
            stagger && 'stagger',
            bodyClassName,
          )}
        >
          {(title || eyebrow || description) && (
            <header className="mb-5 flex flex-col gap-1.5">
              {eyebrow && (
                <p className="text-secondary-strong text-xs font-black tracking-[0.08em] uppercase">
                  {eyebrow}
                </p>
              )}
              {title && (
                <h1 className="font-display text-[28px] leading-[1.15]">
                  {title}
                </h1>
              )}
              {description && (
                <p className="text-muted-foreground text-[15px] leading-relaxed">
                  {description}
                </p>
              )}
            </header>
          )}
          {children}
        </div>

        {footer && (
          <div className="bg-background/95 sticky bottom-0 z-10 flex flex-col gap-1.5 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+20px)] backdrop-blur">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

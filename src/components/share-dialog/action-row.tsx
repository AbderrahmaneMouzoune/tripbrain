'use client'

import type {
  ComponentProps,
  ComponentType,
  MouseEvent,
  ReactNode,
} from 'react'
import Link from 'next/link'
import { IconChevronRight } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Teinte de la pastille : elle situe la nature de l'action d'un coup d'œil. */
type ActionRowTone = 'primary' | 'secondary' | 'neutral' | 'destructive'

const toneClasses: Record<ActionRowTone, string> = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  neutral: 'bg-muted text-muted-foreground',
  destructive: 'bg-destructive/10 text-destructive',
}

interface ActionRowProps extends Omit<
  ComponentProps<'button'>,
  'children' | 'onClick'
> {
  icon: ComponentType<{ className?: string }>
  label: string
  description?: string
  tone?: ActionRowTone
  /**
   * Rendue en lien quand une destination est fournie. Une adresse absolue
   * (le site vitrine) s'ouvre dans un nouvel onglet : on quitte l'app.
   */
  href?: string
  /** Pictogramme de droite : un chevron par défaut, pour dire « ça continue ». */
  trailing?: ReactNode
  /** Reçoit le clic, que la ligne soit un bouton ou un lien. */
  onClick?: (event: MouseEvent<HTMLElement>) => void
}

/**
 * Ligne d'action des dialogs de partage : pastille, libellé, explication.
 *
 * Le texte y est volontairement libre de passer à la ligne — un bouton ne le
 * fait pas par défaut, et c'est ce qui débordait sur les petits écrans.
 */
export function ActionRow({
  icon: Icon,
  label,
  description,
  tone = 'neutral',
  href,
  trailing,
  className,
  onClick,
  ...props
}: ActionRowProps) {
  const content = (
    <>
      <span
        className={cn(
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
          toneClasses[tone],
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="text-foreground text-sm leading-snug font-medium">
          {label}
        </span>
        {description && (
          <span className="text-muted-foreground text-xs leading-snug">
            {description}
          </span>
        )}
      </span>
      {trailing ?? (
        <IconChevronRight className="text-muted-foreground/60 mt-1 h-4 w-4 shrink-0" />
      )}
    </>
  )

  const classes = cn(
    'border-border bg-muted/40 hover:bg-muted/70 h-auto w-full items-start justify-start gap-3 px-3 py-3 whitespace-normal',
    className,
  )

  if (href) {
    return (
      <Button asChild variant="outline" className={classes}>
        {/^https?:/.test(href) ? (
          <a href={href} target="_blank" rel="noreferrer" onClick={onClick}>
            {content}
          </a>
        ) : (
          <Link href={href} onClick={onClick}>
            {content}
          </Link>
        )}
      </Button>
    )
  }

  return (
    <Button variant="outline" className={classes} onClick={onClick} {...props}>
      {content}
    </Button>
  )
}

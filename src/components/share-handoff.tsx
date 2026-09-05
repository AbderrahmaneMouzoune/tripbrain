'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AppIcon } from '@/components/app-icon'
import { Button } from '@/components/ui/button'
import { IconArrowRight } from '@tabler/icons-react'

interface ShareHandoffProps {
  /** Code de partage, tel qu'il figure dans l'URL. */
  code: string
  title: string
  /** Ce qui se passe pendant la bascule, en une ligne. */
  waiting: string
  /** Libellé du filet de sécurité. */
  cta: string
}

/**
 * Passe la main à l'application, qui sait déjà proposer l'import d'un `?code=`.
 *
 * La bascule est faite côté navigateur, et non par une redirection serveur :
 * les robots d'aperçu s'arrêtent à la page rendue et lisent ses métadonnées
 * Open Graph, tandis qu'une personne enchaîne directement sur l'import.
 *
 * La destination est la même pour un itinéraire et pour des documents : c'est
 * le serveur qui dit, à la résolution du code, ce que le partage contient.
 */
export function ShareHandoff({ code, title, waiting, cta }: ShareHandoffProps) {
  const router = useRouter()
  const target = `/?code=${encodeURIComponent(code)}`

  useEffect(() => {
    router.replace(target)
  }, [router, target])

  return (
    <main className="bg-background flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <AppIcon size="lg" pulse />

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-xl font-semibold text-balance">
          {title}
        </h1>
        <p className="text-muted-foreground max-w-sm text-sm text-pretty">
          {waiting}
        </p>
      </div>

      {/* Filet de sécurité : sans JavaScript, ou si la bascule tarde. */}
      <Button asChild variant="outline" className="gap-2">
        <Link href={target} replace>
          {cta}
          <IconArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </main>
  )
}

/**
 * Habillage commun aux pages légales : même en-tête, même largeur de lecture,
 * mêmes styles de titres. Les pages n'ont plus qu'à écrire leur texte.
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { formatLegalDate, legalConfig } from '@/lib/legal-config'

export function LegalShell({
  title,
  intro,
  children,
}: {
  title: string
  intro?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-background min-h-dvh">
      <header className="border-border/60 bg-card/85 sticky top-0 z-10 border-b backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Link>
          <div className="bg-border h-4 w-px" />
          <h1 className="font-display text-base font-semibold">{title}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {intro && (
          <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
            {intro}
          </p>
        )}

        <div className="space-y-8">{children}</div>

        <p className="text-muted-foreground mt-10 border-t pt-4 text-xs">
          Dernière mise à jour : {formatLegalDate(legalConfig.updatedAt)}.
        </p>

        <nav
          aria-label="Pages légales"
          className="text-muted-foreground mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs"
        >
          <Link
            href="/mentions-legales"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Mentions légales
          </Link>
          <Link
            href="/politique-de-confidentialite"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Politique de confidentialité
          </Link>
          <Link
            href="/guide"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Guide d’import
          </Link>
        </nav>
      </main>
    </div>
  )
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="font-display text-foreground text-base font-semibold">
        {title}
      </h2>
      <div className="text-muted-foreground mt-2 space-y-3 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  )
}

/** Liste de définitions : « donnée → ce qu'on en fait », lisible sur mobile. */
export function LegalDefinitionList({
  items,
}: {
  items: readonly { term: string; description: React.ReactNode }[]
}) {
  return (
    <dl className="border-border/70 divide-border/70 divide-y rounded-xl border">
      {items.map((item) => (
        <div key={item.term} className="px-3 py-2.5">
          <dt className="text-foreground text-sm font-medium">{item.term}</dt>
          <dd className="text-muted-foreground mt-0.5 text-sm leading-relaxed">
            {item.description}
          </dd>
        </div>
      ))}
    </dl>
  )
}

import type { Metadata } from 'next'
import { BackLink } from '@/components/legal/back-link'
import { ImportFormatGuideContent } from '@/components/import-format-guide'

export const metadata: Metadata = {
  title: 'Guide de format — TripBrain',
  description:
    "Guide complet des formats d'import TripBrain : Excel, CSV et JSON.",
}

export default function GuidePage() {
  return (
    <div className="bg-background min-h-dvh">
      {/* Header */}
      <header className="border-border/60 sticky top-0 z-10 border-b bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 pt-[calc(var(--safe-top)+0.75rem)] pr-[max(1rem,var(--safe-right))] pb-3 pl-[max(1rem,var(--safe-left))]">
          <BackLink />
          <div className="bg-border h-4 w-px" />
          <h1 className="font-display text-base font-semibold">
            Guide de format d&apos;import
          </h1>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-muted-foreground mb-6 text-sm">
          Choisissez votre format ci-dessous pour voir les instructions et
          télécharger un modèle.
        </p>
        <ImportFormatGuideContent />
      </main>
    </div>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
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
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Link>
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

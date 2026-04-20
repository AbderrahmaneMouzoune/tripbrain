'use client'

import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DemoBannerProps {
  onQuitDemo: () => void
}

export function DemoBanner({ onQuitDemo }: DemoBannerProps) {
  return (
    <div className="bg-amber-500/15 border-amber-500/40 text-amber-900 dark:text-amber-200 border-b px-4 py-2">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="text-xs font-medium sm:text-sm">
            Vous êtes en mode démo — les données affichées sont fictives.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onQuitDemo}
          className="border-amber-500/50 hover:bg-amber-500/20 text-amber-900 dark:text-amber-200 h-7 shrink-0 gap-1 text-xs"
        >
          <X className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Quitter la démo</span>
          <span className="sm:hidden">Quitter</span>
        </Button>
      </div>
    </div>
  )
}

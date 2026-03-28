'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Check, X, Pencil, History, RotateCcw } from 'lucide-react'
import type { ItineraryVersion } from '@/hooks/use-itinerary-editor'

interface EditModeBarProps {
  isEditMode: boolean
  isDirty: boolean
  versions: ItineraryVersion[]
  onEnterEdit: () => void
  onValidate: () => void
  onCancel: () => void
  onRestoreVersion: (versionId: string) => void
}

export function EditModeBar({
  isEditMode,
  isDirty,
  versions,
  onEnterEdit,
  onValidate,
  onCancel,
  onRestoreVersion,
}: EditModeBarProps) {
  const [historyOpen, setHistoryOpen] = useState(false)

  if (!isEditMode) {
    return (
      <div className="flex items-center gap-1">
        {versions.length > 0 && (
          <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Historique des versions"
              >
                <History className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto max-h-[60vh]">
              <SheetHeader>
                <SheetTitle>Historique des versions</SheetTitle>
              </SheetHeader>
              <div className="mt-4 flex flex-col gap-2 overflow-y-auto pb-8">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                  >
                    <p className="text-sm">{v.label}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5"
                      onClick={() => {
                        onRestoreVersion(v.id)
                        setHistoryOpen(false)
                      }}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restaurer
                    </Button>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onEnterEdit}
          className="gap-1.5"
        >
          <Pencil className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Modifier</span>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      {isDirty && (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
          Modifié
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={onCancel}
        className="gap-1 text-muted-foreground"
      >
        <X className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Annuler</span>
      </Button>
      <Button
        size="sm"
        onClick={onValidate}
        className="gap-1"
        disabled={!isDirty}
      >
        <Check className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Valider</span>
      </Button>
    </div>
  )
}

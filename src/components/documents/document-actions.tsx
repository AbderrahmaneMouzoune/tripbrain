'use client'

import { useState } from 'react'
import { useTrip } from '@/components/app/trip-provider'
import { BottomSheet } from '@/components/mobile/bottom-sheet'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  downloadStoredFile,
  useDocuments,
  type StoredFile,
} from '@/hooks/use-documents'
import { trackEvent } from '@/lib/analytics/client'
import { documentKind } from '@/lib/analytics/metrics'
import {
  documentCategory,
  sameLink,
  type DocumentLink,
} from '@/lib/document-organize'
import type { DocumentCategory } from '@/lib/documents-db'
import { LinkPicker } from './link-picker'
import { CategoryPicker } from './category-picker'

function linkTarget(link: DocumentLink) {
  if (!link.dayId) return 'trip' as const
  return link.linkedTo ?? ('day' as const)
}

/** Feuille « Classer » : le type du document et ce qu'il justifie. */
export function LinkDocumentSheet({
  file,
  open,
  onOpenChange,
}: {
  file: StoredFile
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { itinerary } = useTrip()
  const { updateDocumentLink, updateDocumentCategory } = useDocuments()
  const current: DocumentLink = {
    dayId: file.dayId,
    linkedTo: file.linkedTo,
    activityId: file.activityId,
  }
  const [draft, setDraft] = useState<DocumentLink>(current)
  const currentCategory = file.category ?? null
  const [category, setCategory] = useState<DocumentCategory | null>(
    currentCategory,
  )
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const linkChanged = !sameLink(draft, current)
    const categoryChanged = category !== currentCategory
    if (!linkChanged && !categoryChanged) {
      onOpenChange(false)
      return
    }
    setSaving(true)
    try {
      if (linkChanged) {
        await updateDocumentLink(file.id, draft)
        trackEvent('document_link_changed', { target: linkTarget(draft) })
      }
      if (categoryChanged) {
        await updateDocumentCategory(file.id, category)
        trackEvent('document_category_changed', {
          category: category ?? 'auto',
        })
      }
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(current)
          setCategory(currentCategory)
        }
        onOpenChange(next)
      }}
      title="Classer ce document"
      description="Son type le range dans le bon filtre ; son association l’affiche avec la journée, le trajet ou l’hébergement choisi."
      footer={
        <Button size="xl" className="w-full" onClick={save} disabled={saving}>
          Enregistrer
        </Button>
      }
    >
      <h3 className="text-muted-foreground mb-2 text-xs font-black tracking-[0.08em] uppercase">
        Type de document
      </h3>
      <CategoryPicker
        value={category}
        onChange={setCategory}
        detected={documentCategory({ ...file, ...draft, category: undefined })}
      />
      <h3 className="text-muted-foreground mt-5 mb-2 text-xs font-black tracking-[0.08em] uppercase">
        Associer à
      </h3>
      <LinkPicker
        itinerary={itinerary}
        value={draft}
        onChange={setDraft}
        defaultOpen
      />
    </BottomSheet>
  )
}

/** Confirmation avant de supprimer un document : il n'existe que sur ce téléphone. */
export function DeleteDocumentDialog({
  file,
  open,
  onOpenChange,
  onDeleted,
}: {
  file: StoredFile
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  const { deleteFile } = useDocuments()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer ce document ?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="text-foreground font-bold">{file.name}</span> sera
            effacé de ce téléphone. S’il n’existe nulle part ailleurs, il sera
            perdu.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90 text-white"
            onClick={async () => {
              await deleteFile(file.id)
              trackEvent('document_deleted')
              onDeleted?.()
            }}
          >
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Télécharge le document sur l'appareil (et le mesure, sans son nom). */
export function downloadDocument(file: StoredFile) {
  trackEvent('document_downloaded', { kind: documentKind(file.type) })
  downloadStoredFile(file)
}

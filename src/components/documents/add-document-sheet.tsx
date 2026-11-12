'use client'

import { useRef, useState } from 'react'
import type { ScreenProps } from '@/components/app/screen-props'
import { useTrip } from '@/components/app/trip-provider'
import { BottomSheet } from '@/components/mobile/bottom-sheet'
import { useDocuments } from '@/hooks/use-documents'
import { trackEvent } from '@/lib/analytics/client'
import { documentKindOf } from '@/lib/analytics/metrics'
import {
  categoryOfKind,
  classifyDocument,
  type AddKind,
  type Classification,
} from '@/lib/document-classify'
import type { DocumentLink } from '@/lib/document-organize'
import { extractDocumentsText } from '@/lib/document-text'
import { triggerHaptic } from '@/lib/native-app'
import { useDocumentPickers } from './document-pickers'
import {
  ChooseStep,
  DoneStep,
  ReadingStep,
  SourceStep,
  TypeStep,
  type ReadingProgress,
} from './add-document-steps'

/** Les fichiers d'un même ajout, tels qu'enregistrés. */
interface Batch {
  ids: string[]
  names: string[]
  text: string
  fileLabel: string
}

type Step =
  | { name: 'type' }
  | { name: 'source'; kind: AddKind }
  | { name: 'reading'; kind: AddKind; progress: ReadingProgress }
  | {
      name: 'choose' | 'done'
      kind: AddKind
      batch: Batch
      classification: Classification
      link: DocumentLink
    }

/** Le temps de lire ce qui se passe, même quand tout est instantané. */
const MIN_READING_MS = 700

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Ajouter un document : on dit ce que c'est, on choisit le fichier, et l'app
 * le lit pour le ranger au bon trajet, hébergement ou jour. Elle ne pose une
 * question que lorsqu'elle hésite.
 */
export function AddDocumentSheet({
  screen,
  onClose,
}: ScreenProps<'add-document'>) {
  const { itinerary } = useTrip()
  const {
    files: existing,
    addFiles,
    importZip,
    updateDocumentLink,
    updateDocumentCategory,
    deleteFile,
  } = useDocuments()
  const [step, setStep] = useState<Step>(() =>
    screen.preset ? { name: 'source', kind: screen.preset } : { name: 'type' },
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Le type choisi au moment où le sélecteur de fichiers s'ouvre.
  const pendingKind = useRef<AddKind>('unknown')

  const classify = (kind: AddKind, batch: Batch) =>
    classifyDocument({
      kind,
      names: batch.names,
      text: batch.text,
      itinerary,
      focusDayIndex: screen.dayIndex,
      existing,
    })

  const relink = (ids: string[], link: DocumentLink) =>
    Promise.all(ids.map((id) => updateDocumentLink(id, link)))

  const handleFiles = async (files: File[]) => {
    const kind = pendingKind.current
    const fileLabel =
      files.length > 1 ? `${files.length} fichiers` : (files[0]?.name ?? '')
    const size = files.reduce((total, file) => total + file.size, 0)
    const started = Date.now()
    setError(null)
    setStep({
      name: 'reading',
      kind,
      progress: { fileLabel, size, saved: false, read: false },
    })
    const progress = (patch: Partial<ReadingProgress>) =>
      setStep((current) =>
        current.name === 'reading'
          ? { ...current, progress: { ...current.progress, ...patch } }
          : current,
      )

    // 1. Le fichier est d'abord mis à l'abri, rangé dans « Tout le voyage ».
    let ids: string[]
    try {
      const stored = await addFiles(files, {}, categoryOfKind(kind))
      ids = stored.map((record) => record.id)
    } catch {
      triggerHaptic('error')
      setError('Le document n’a pas pu être enregistré sur ce téléphone.')
      setStep({ name: 'source', kind })
      return
    }
    trackEvent('document_added', {
      count: files.length,
      kind: documentKindOf(files.map((file) => file.type)),
    })
    progress({ saved: true })

    // 2. Lecture, puis recherche du bon endroit.
    const text = await extractDocumentsText(files)
    progress({ read: true })
    const batch: Batch = {
      ids,
      names: files.map((file) => file.name),
      text,
      fileLabel,
    }
    const classification = classify(kind, batch)
    try {
      if (kind === 'unknown' && classification.category !== 'other') {
        await Promise.all(
          ids.map((id) => updateDocumentCategory(id, classification.category)),
        )
      }
      if (classification.confident && classification.link.dayId) {
        await relink(ids, classification.link)
      }
    } catch {
      // Le document reste enregistré dans « Tout le voyage » : rien de perdu.
    }

    await wait(Math.max(0, MIN_READING_MS - (Date.now() - started)))
    triggerHaptic(classification.confident ? 'success' : 'selection')
    setStep({
      name: classification.confident ? 'done' : 'choose',
      kind,
      batch,
      classification,
      link: classification.confident ? classification.link : {},
    })
  }

  const handleZip = async (file: File) => {
    setError(null)
    setBusy('Restauration de l’archive…')
    try {
      const { imported } = await importZip(file, (progress) =>
        setBusy(progress.message),
      )
      if (imported > 0) {
        trackEvent('document_added', { count: imported, kind: 'mixed' })
      }
      triggerHaptic('success')
      onClose()
    } catch (err) {
      triggerHaptic('error')
      setError(
        err instanceof Error && err.message
          ? `Archive illisible : ${err.message.toLowerCase()}.`
          : 'Archive illisible.',
      )
      setBusy(null)
    }
  }

  const { open, inputs } = useDocumentPickers({
    onFiles: (files) => void handleFiles(files),
    onZip: (file) => void handleZip(file),
  })

  const content = (() => {
    switch (step.name) {
      case 'type':
        return (
          <TypeStep
            busy={busy}
            error={error}
            onClose={onClose}
            onZip={() => open('zip')}
            onPick={(kind) => {
              setError(null)
              setStep({ name: 'source', kind })
            }}
          />
        )
      case 'source':
        return (
          <SourceStep
            kind={step.kind}
            error={error}
            onBack={() => {
              setError(null)
              setStep({ name: 'type' })
            }}
            onPick={(picker) => {
              pendingKind.current = step.kind
              open(picker)
            }}
          />
        )
      case 'reading':
        return <ReadingStep kind={step.kind} progress={step.progress} />
      case 'choose':
        return (
          <ChooseStep
            key={`${step.classification.category}-${step.kind}`}
            classification={step.classification}
            itinerary={itinerary}
            onConfirm={(link) => {
              void relink(step.batch.ids, link)
              triggerHaptic('success')
              setStep({ ...step, name: 'done', link })
            }}
            onRetype={(kind) => {
              const classification: Classification =
                kind === 'unknown'
                  ? {
                      category: 'other',
                      link: {},
                      confident: true,
                      choices: [],
                    }
                  : classify(kind, step.batch)
              void Promise.all(
                step.batch.ids.map((id) =>
                  updateDocumentCategory(id, categoryOfKind(kind)),
                ),
              )
              if (classification.confident) {
                void relink(step.batch.ids, classification.link)
              }
              setStep({
                name: classification.confident ? 'done' : 'choose',
                kind,
                batch: step.batch,
                classification,
                link: classification.confident ? classification.link : {},
              })
            }}
          />
        )
      case 'done':
        return (
          <DoneStep
            kind={step.kind}
            category={step.classification.category}
            fileLabel={step.batch.fileLabel}
            count={step.batch.ids.length}
            link={step.link}
            itinerary={itinerary}
            onChangeLink={(link) => {
              void relink(step.batch.ids, link)
              setStep({ ...step, link })
            }}
            onDone={onClose}
            onAnother={() => setStep({ name: 'source', kind: step.kind })}
            onUndo={() => {
              void Promise.all(step.batch.ids.map((id) => deleteFile(id)))
              triggerHaptic('warning')
              setStep({ name: 'type' })
            }}
          />
        )
    }
  })()

  return (
    <BottomSheet
      open
      onOpenChange={(next) => !next && onClose()}
      title="Ajouter un document"
      description="Choisissez le type de document : l’app le lit et le range au bon endroit."
      hideHeader
      className="bg-background"
    >
      {inputs}
      {content}
    </BottomSheet>
  )
}

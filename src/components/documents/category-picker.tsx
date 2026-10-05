'use client'

import { BedDouble, File, IdCard, Ticket } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import type { DocumentCategory } from '@/lib/documents-db'
import { DOCUMENT_CATEGORY_CHOICES } from '@/lib/document-organize'
import { Chip } from '@/components/mobile/chip'

const ICONS: Record<
  DocumentCategory,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  ticket: Ticket,
  hotel: BedDouble,
  identity: IdCard,
  other: File,
}

/**
 * Choix du type d'un document : il range le document dans le bon filtre
 * (Billets, Hôtels, Visas & passeports, Autres). Toucher le type choisi le
 * retire, et l'app revient à sa détection d'après le nom du fichier.
 */
export function CategoryPicker({
  value,
  onChange,
  detected,
}: {
  value: DocumentCategory | null
  onChange: (value: DocumentCategory | null) => void
  /** Type deviné par l'app, rappelé quand rien n'est choisi. */
  detected?: DocumentCategory
}) {
  const detectedLabel = DOCUMENT_CATEGORY_CHOICES.find(
    (choice) => choice.id === detected,
  )?.label
  return (
    <div>
      <div
        role="group"
        aria-label="Type de document"
        className="flex flex-wrap gap-2"
      >
        {DOCUMENT_CATEGORY_CHOICES.map(({ id, label }) => {
          const Icon = ICONS[id]
          const selected = value === id
          return (
            <Chip
              key={id}
              icon={Icon}
              pressed={selected}
              onClick={() => onChange(selected ? null : id)}
            >
              {label}
            </Chip>
          )
        })}
      </div>
      {!value && (
        <p className="text-muted-foreground mt-1.5 text-xs">
          {detectedLabel
            ? `Sans choix, l’app le range dans « ${detectedLabel} » d’après son nom.`
            : 'Sans choix, l’app devine le type d’après le nom du fichier.'}
        </p>
      )}
    </div>
  )
}

'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { cn } from '@/lib/utils'
import type { EditField, EditFormSchema } from '@/lib/edit-fields'
import {
  countFilledFields,
  fromDraft,
  toDraft,
  validateDraft,
  type DraftValue,
  type EntityDraft,
} from '@/lib/entity-draft'
import { EditFieldControl } from '@/components/edit/edit-field-control'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ChevronDown, Trash2 } from 'lucide-react'

/** Types dont le libellé ne peut pas pointer vers un contrôle unique. */
const COMPOSITE_TYPES: ReadonlySet<EditField['type']> = new Set([
  'icon-choice',
  'choice',
  'lines',
  'chips',
  'rating',
])

interface EntityEditSheetProps<T extends object> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  schema: EditFormSchema
  /** Entité éditée, base du brouillon à chaque ouverture */
  value: T
  onSubmit: (value: T) => void
  /** Affiche un bouton de suppression (avec confirmation) dans le pied */
  onDelete?: () => void
}

export function EntityEditSheet<T extends object>({
  open,
  onOpenChange,
  title,
  description,
  schema,
  value,
  onSubmit,
  onDelete,
}: EntityEditSheetProps<T>) {
  const formId = useId()
  const scrollArea = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)

  const [draft, setDraft] = useState<EntityDraft>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  // Change à chaque ouverture pour repartir de contrôles vierges (saisie en
  // cours dans les tags, sélecteur d'heure natif ou non…).
  const [draftVersion, setDraftVersion] = useState(0)

  useEffect(() => {
    if (!open) return

    const initial = toDraft(value, schema.fields)
    setDraft(initial)
    setErrors({})
    setConfirmingDelete(false)
    setDraftVersion((current) => current + 1)
    setOpenSections(
      Object.fromEntries(
        schema.sections.map((section, index) => [
          section.id,
          index === 0 ||
            countFilledFields(fieldsOfSection(schema, section.id), initial) > 0,
        ]),
      ),
    )
  }, [open, value, schema])

  /**
   * Amène la section fraîchement dépliée en haut de la zone de défilement :
   * sans ça, l'ouverture se joue hors écran et passe inaperçue.
   */
  const scrollSectionIntoView = (sectionId: string) => {
    requestAnimationFrame(() => {
      const area = scrollArea.current
      const section = area?.querySelector<HTMLElement>(
        `[data-section="${sectionId}"]`,
      )
      if (!area || !section) return

      const offset =
        section.getBoundingClientRect().top - area.getBoundingClientRect().top

      area.scrollBy({ top: offset - 8, behavior: 'smooth' })
    })
  }

  const setFieldValue = (key: string, next: DraftValue) => {
    setDraft((current) => ({ ...current, [key]: next }))
    setErrors((current) => {
      if (!current[key]) return current
      const { [key]: _cleared, ...rest } = current
      return rest
    })
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()

    const nextErrors = validateDraft(schema.fields, draft)
    const firstErrorKey = schema.fields.find(
      (field) => nextErrors[field.key],
    )?.key

    if (firstErrorKey) {
      setErrors(nextErrors)
      // Une erreur dans une section repliée resterait invisible.
      setOpenSections((current) => ({
        ...current,
        ...Object.fromEntries(
          schema.sections
            .filter((section) =>
              fieldsOfSection(schema, section.id).some(
                (field) => nextErrors[field.key],
              ),
            )
            .map((section) => [section.id, true]),
        ),
      }))
      requestAnimationFrame(() => {
        scrollArea.current
          ?.querySelector(`[data-field="${firstErrorKey}"]`)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
      return
    }

    onSubmit(fromDraft(value, schema.fields, draft))
    onOpenChange(false)
  }

  const renderField = (field: EditField) => {
    const controlId = `${formId}-${field.key}`
    const error = errors[field.key]

    return (
      <div
        key={field.key}
        data-field={field.key}
        className={cn('flex flex-col gap-1.5', !field.half && 'sm:col-span-2')}
      >
        {COMPOSITE_TYPES.has(field.type) ? (
          <p className="text-foreground text-xs font-medium">
            {field.label}
            {field.required && (
              <span className="text-destructive ml-0.5" aria-hidden>
                *
              </span>
            )}
          </p>
        ) : (
          <Label htmlFor={controlId} className="text-xs">
            {field.label}
            {field.required && (
              <span className="text-destructive -ml-0.5" aria-hidden>
                *
              </span>
            )}
          </Label>
        )}

        <EditFieldControl
          id={controlId}
          field={field}
          draft={draft}
          invalid={Boolean(error)}
          onChange={setFieldValue}
        />

        {error ? (
          <p className="text-destructive text-[11px]">{error}</p>
        ) : (
          field.hint && (
            <p className="text-muted-foreground text-[11px]">{field.hint}</p>
          )
        )}
      </div>
    )
  }

  const [firstSection, ...foldedSections] = schema.sections

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={content}
        side="bottom"
        className="mx-auto max-h-[92svh] gap-0 rounded-t-2xl p-0 sm:max-w-2xl"
        onOpenAutoFocus={(event) => {
          // Le focus automatique sur le premier champ ouvre le clavier mobile
          // et masque le formulaire : on se contente du panneau lui-même, qui
          // garde le piège de focus (tabulation, Échap) fonctionnel.
          event.preventDefault()
          content.current?.focus({ preventScroll: true })
        }}
      >
        <SheetHeader className="border-border/60 border-b pr-12">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {description ??
              'Les modifications sont enregistrées sur cet appareil.'}
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div
            ref={scrollArea}
            key={draftVersion}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
          >
            {firstSection && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {fieldsOfSection(schema, firstSection.id).map(renderField)}
              </div>
            )}

            {foldedSections.map((section) => {
              const sectionFields = fieldsOfSection(schema, section.id)
              const filled = countFilledFields(sectionFields, draft)

              return (
                <Collapsible
                  key={section.id}
                  data-section={section.id}
                  open={openSections[section.id] ?? false}
                  onOpenChange={(isOpen) => {
                    setOpenSections((current) => ({
                      ...current,
                      [section.id]: isOpen,
                    }))
                    if (isOpen) scrollSectionIntoView(section.id)
                  }}
                  className="border-border/60 mt-4 border-t pt-4"
                >
                  <CollapsibleTrigger className="group/section flex w-full items-center gap-2 text-left">
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground text-sm font-semibold">
                        {section.title}
                      </p>
                      <p className="text-muted-foreground truncate text-[11px]">
                        {filled > 0
                          ? `${filled} information${filled > 1 ? 's' : ''} renseignée${filled > 1 ? 's' : ''}`
                          : (section.description ?? 'Rien de renseigné')}
                      </p>
                    </div>
                    <ChevronDown
                      className="text-muted-foreground h-4 w-4 shrink-0 transition-transform group-data-[state=open]/section:rotate-180"
                      strokeWidth={1.75}
                    />
                  </CollapsibleTrigger>

                  <CollapsibleContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
                    {sectionFields.map(renderField)}
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
          </div>

          <div className="border-border/60 flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {onDelete && (
              <Button
                type="button"
                variant={confirmingDelete ? 'destructive' : 'ghost'}
                size="sm"
                className="mr-auto gap-1.5"
                onClick={() => {
                  if (!confirmingDelete) {
                    setConfirmingDelete(true)
                    return
                  }
                  onDelete()
                  onOpenChange(false)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                {confirmingDelete ? 'Confirmer' : 'Supprimer'}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button type="submit" size="sm">
              Enregistrer
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/** Champs d'une section ; sans section explicite, ils vont dans la première. */
function fieldsOfSection(
  schema: EditFormSchema,
  sectionId: string,
): readonly EditField[] {
  const fallback = schema.sections[0]?.id

  return schema.fields.filter(
    (field) => (field.section ?? fallback) === sectionId,
  )
}

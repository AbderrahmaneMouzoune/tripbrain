'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import type { EditField, EditFormSchema, EditSection } from '@/lib/edit-fields'
import {
  countFilledFields,
  fromDraft,
  summarizeSection,
  toDraft,
  validateDraft,
  type DraftValue,
  type EntityDraft,
} from '@/lib/entity-draft'
import {
  EditFieldControl,
  FieldError,
  RangeControl,
  RequiredMark,
  SwapControl,
} from '@/components/edit/edit-field-control'
import { FIELD_ICONS } from '@/components/edit/field-icons'
import { IconBadge } from '@/components/mobile/icon-badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown, Trash2 } from 'lucide-react'

/**
 * Types dont le libellé nomme un groupe (cartes, segments, étoiles…) plutôt
 * qu'une saisie unique : il devient un texte relié par `aria-labelledby`.
 */
const GROUP_TYPES: ReadonlySet<EditField['type']> = new Set([
  'icon-choice',
  'choice',
  'chip-choice',
  'chips',
  'rating',
  'coordinates',
])

/** Types qui affichent eux-mêmes leur libellé (interrupteur, liste titrée). */
const SELF_LABELLED_TYPES: ReadonlySet<EditField['type']> = new Set([
  'switch',
  'lines',
])

interface EntityEditSheetProps<T extends object> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Note en bas du formulaire ; par défaut, rappel de l'enregistrement local */
  description?: string
  schema: EditFormSchema
  /** Entité éditée, base du brouillon à chaque ouverture */
  value: T
  onSubmit: (value: T) => void
  /** Affiche un bouton de suppression (avec confirmation) en bas du formulaire */
  onDelete?: () => void
  /** Sourcil au-dessus du titre, ex. « Jour 5 · Étape 3 » */
  eyebrow?: string
  /**
   * Création ou modification : décide du bouton « Ajouter » / « Enregistrer ».
   * Sans précision, un titre en « Nouveau… / Nouvelle… » vaut création.
   */
  mode?: 'create' | 'edit'
}

/**
 * Formulaire d'édition d'une entité du voyage, en plein écran : en-tête collé
 * (Annuler / titre / Enregistrer), sections repliables résumées, suppression
 * discrète tout en bas. La forme du formulaire vient de `edit-fields.ts`.
 */
export function EntityEditSheet<T extends object>({
  open,
  onOpenChange,
  title,
  description,
  schema,
  value,
  onSubmit,
  onDelete,
  eyebrow,
  mode,
}: EntityEditSheetProps<T>) {
  const formId = useId()
  const scrollArea = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const keepButton = useRef<HTMLButtonElement>(null)

  const [draft, setDraft] = useState<EntityDraft>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [announcement, setAnnouncement] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  // Change à chaque ouverture pour repartir de contrôles vierges (saisie en
  // cours dans les tags, sélecteur d'heure natif ou non…).
  const [draftVersion, setDraftVersion] = useState(0)

  const creating = mode ? mode === 'create' : /^nouve/i.test(title.trim())
  const hasRequired = schema.fields.some((field) => field.required)

  useEffect(() => {
    if (!open) return

    const initial = toDraft(value, schema.fields)
    setDraft(initial)
    setErrors({})
    setAnnouncement('')
    setConfirmingDelete(false)
    setDraftVersion((current) => current + 1)
    // Une section déjà renseignée s'ouvre d'elle-même : ce qu'on vient
    // modifier est souvent dedans. Les sections `collapsed` s'en tiennent à
    // leur résumé.
    setOpenSections(
      Object.fromEntries(
        schema.sections.map((section, index) => [
          section.id,
          index === 0 ||
            (!section.collapsed &&
              countFilledFields(fieldsOfSection(schema, section.id), initial) >
                0),
        ]),
      ),
    )
  }, [open, value, schema])

  useEffect(() => {
    if (confirmingDelete) keepButton.current?.focus()
  }, [confirmingDelete])

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

      area.scrollBy({ top: offset - 12, behavior: 'smooth' })
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
    const invalidFields = schema.fields.filter((field) => nextErrors[field.key])
    const firstInvalid = invalidFields[0]

    if (firstInvalid) {
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
      // Annoncé aux lecteurs d'écran, puis focus sur le premier champ fautif.
      setAnnouncement(
        `${invalidFields.length} champ${invalidFields.length > 1 ? 's' : ''} à corriger. ${firstInvalid.label} : ${nextErrors[firstInvalid.key]}`,
      )
      requestAnimationFrame(() => {
        const wrapper = scrollArea.current?.querySelector<HTMLElement>(
          `[data-field="${firstInvalid.key}"]`,
        )
        const target = wrapper?.querySelector<HTMLElement>(
          'input, textarea, [role="radio"], button',
        )
        target?.focus({ preventScroll: true })
        wrapper?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
      return
    }

    onSubmit(fromDraft(value, schema.fields, draft))
    onOpenChange(false)
  }

  const renderField = (field: EditField) => {
    const controlId = `${formId}-${field.key}`
    const labelId = `${controlId}-label`
    const messageId = `${controlId}-message`
    const error = errors[field.key]
    const message = error ?? field.hint

    let label = null
    if (GROUP_TYPES.has(field.type)) {
      label = (
        <p
          id={labelId}
          className="text-muted-foreground text-[13px] font-extrabold"
        >
          {field.label}
          {field.required && <RequiredMark />}
        </p>
      )
    } else if (!SELF_LABELLED_TYPES.has(field.type)) {
      label = (
        <label
          id={labelId}
          htmlFor={controlId}
          className="text-muted-foreground text-[13px] font-extrabold"
        >
          {field.label}
          {field.required && <RequiredMark />}
        </label>
      )
    }

    return (
      <div
        key={field.key}
        data-field={field.key}
        className="flex min-w-0 flex-col gap-1.5"
      >
        {label}

        <EditFieldControl
          id={controlId}
          field={field}
          draft={draft}
          invalid={Boolean(error)}
          labelId={labelId}
          describedBy={message ? messageId : undefined}
          onChange={setFieldValue}
        />

        {error ? (
          <FieldError id={messageId}>{error}</FieldError>
        ) : (
          field.hint && (
            <p id={messageId} className="text-muted-foreground text-xs">
              {field.hint}
            </p>
          )
        )}
      </div>
    )
  }

  const renderBlocks = (fields: readonly EditField[]) =>
    layoutFields(fields).map((block) => {
      switch (block.kind) {
        case 'range':
          return (
            <RangeControl
              key={block.start.key}
              idPrefix={formId}
              start={block.start}
              end={block.end}
              draft={draft}
              errors={errors}
              onChange={setFieldValue}
            />
          )
        case 'swap':
          return (
            <SwapControl
              key={block.start.key}
              idPrefix={formId}
              start={block.start}
              end={block.end}
              draft={draft}
              errors={errors}
              onChange={setFieldValue}
            />
          )
        case 'row':
          return (
            <div
              key={block.fields[0].key}
              className="grid gap-2.5"
              style={{
                gridTemplateColumns: `repeat(${block.fields.length}, minmax(0, 1fr))`,
              }}
            >
              {block.fields.map(renderField)}
            </div>
          )
        default:
          return renderField(block.field)
      }
    })

  const [firstSection, ...foldedSections] = schema.sections

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          ref={content}
          className="bg-background text-foreground animate-screen fixed inset-0 z-50 flex flex-col outline-none"
          onOpenAutoFocus={(event) => {
            // Le focus automatique sur le premier champ ouvre le clavier mobile
            // et masque le formulaire : on se contente du panneau lui-même, qui
            // garde le piège de focus (tabulation, Échap) fonctionnel.
            event.preventDefault()
            content.current?.focus({ preventScroll: true })
          }}
        >
          <form
            onSubmit={handleSubmit}
            noValidate
            className="flex min-h-0 flex-1 flex-col"
          >
            <header className="bg-card border-border/70 shrink-0 border-b px-2 pt-[calc(env(safe-area-inset-top)+8px)] pb-2.5">
              <div className="mx-auto flex max-w-xl items-center gap-1">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="text-muted-foreground hover:bg-muted focus-visible:ring-ring/50 min-h-11 shrink-0 rounded-xl px-3 text-base font-extrabold outline-none focus-visible:ring-[3px]"
                >
                  Annuler
                </button>
                <div className="min-w-0 flex-1 text-center">
                  {eyebrow && (
                    <p className="text-secondary-strong truncate text-[11px] font-black tracking-[0.1em] uppercase">
                      {eyebrow}
                    </p>
                  )}
                  <DialogPrimitive.Title className="font-display truncate text-[19px] leading-tight font-normal">
                    {title}
                  </DialogPrimitive.Title>
                </div>
                <Button
                  type="submit"
                  className="h-11 shrink-0 rounded-xl px-4 text-[15px] font-extrabold"
                >
                  {creating ? 'Ajouter' : 'Enregistrer'}
                </Button>
              </div>
            </header>

            <div
              ref={scrollArea}
              key={draftVersion}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
              <div className="stagger mx-auto flex max-w-xl flex-col gap-3 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+32px)]">
                {firstSection && (
                  <section
                    aria-labelledby={`${formId}-section-${firstSection.id}`}
                    className="bg-card border-border flex flex-col gap-[18px] rounded-[22px] border px-4 py-[18px]"
                  >
                    <h2
                      id={`${formId}-section-${firstSection.id}`}
                      className="text-secondary-strong text-xs font-black tracking-[0.1em] uppercase"
                    >
                      {firstSection.title}
                    </h2>
                    {renderBlocks(fieldsOfSection(schema, firstSection.id))}
                  </section>
                )}

                {foldedSections.map((section) => (
                  <FoldedSection
                    key={section.id}
                    section={section}
                    summary={summarizeSection(
                      fieldsOfSection(schema, section.id),
                      draft,
                    )}
                    open={openSections[section.id] ?? false}
                    onOpenChange={(isOpen) => {
                      setOpenSections((current) => ({
                        ...current,
                        [section.id]: isOpen,
                      }))
                      if (isOpen) scrollSectionIntoView(section.id)
                    }}
                  >
                    {renderBlocks(fieldsOfSection(schema, section.id))}
                  </FoldedSection>
                ))}

                {onDelete && (
                  <div className="mt-3 flex flex-col items-center">
                    {confirmingDelete ? (
                      <div
                        role="group"
                        aria-labelledby={`${formId}-delete`}
                        className="bg-destructive-soft animate-pop flex w-full flex-col gap-3 rounded-[18px] p-4"
                      >
                        <p
                          id={`${formId}-delete`}
                          className="text-destructive text-[15px] font-extrabold"
                        >
                          {schema.deleteLabel ?? 'Supprimer'} ?
                        </p>
                        <p className="text-foreground -mt-2 text-[13px]">
                          L’élément sera retiré du voyage.
                        </p>
                        <div className="flex gap-2">
                          <Button
                            ref={keepButton}
                            type="button"
                            variant="outline"
                            size="lg2"
                            className="flex-1"
                            onClick={() => setConfirmingDelete(false)}
                          >
                            Garder
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="lg2"
                            className="flex-1"
                            onClick={() => {
                              onDelete()
                              onOpenChange(false)
                            }}
                          >
                            <Trash2 aria-hidden />
                            Supprimer
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(true)}
                        className="pressable bg-destructive-soft text-destructive focus-visible:ring-destructive/40 flex min-h-12 items-center gap-2 rounded-[14px] px-5 text-[15px] font-extrabold outline-none focus-visible:ring-[3px]"
                      >
                        <Trash2 aria-hidden className="size-[18px]" />
                        {schema.deleteLabel ?? 'Supprimer'}…
                      </button>
                    )}
                  </div>
                )}

                <DialogPrimitive.Description className="text-muted-foreground mx-3 mt-1 text-center text-xs leading-relaxed">
                  {hasRequired && (
                    <>
                      Les champs marqués{' '}
                      <span className="text-destructive" aria-hidden>
                        *
                      </span>
                      <span className="sr-only">d’un astérisque</span> sont
                      obligatoires.{' '}
                    </>
                  )}
                  {description ??
                    'Les modifications restent sur votre appareil.'}
                </DialogPrimitive.Description>
              </div>
            </div>

            <p role="status" aria-live="polite" className="sr-only">
              {announcement}
            </p>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

interface FoldedSectionProps {
  section: EditSection
  summary: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

/**
 * Section repliable : l'en-tête dit ce qu'elle contient (« 60 CNY · 4.9 ★ »)
 * quand elle est fermée, et ce qu'on peut y renseigner sinon.
 */
function FoldedSection({
  section,
  summary,
  open,
  onOpenChange,
  children,
}: FoldedSectionProps) {
  const Icon = section.icon ? FIELD_ICONS[section.icon] : null
  const showSummary = !open && summary.length > 0

  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      data-section={section.id}
      className="bg-card border-border overflow-hidden rounded-[22px] border"
    >
      <CollapsibleTrigger className="group/section focus-visible:ring-ring/50 flex min-h-16 w-full items-center gap-3 px-4 py-3.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-inset">
        {Icon && <IconBadge icon={Icon} tone={section.accent ?? 'primary'} />}
        <span className="min-w-0 flex-1">
          <span className="block text-base font-black">{section.title}</span>
          {showSummary ? (
            <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] font-extrabold">
              {summary.map((part, index) => (
                <span key={index} className="flex items-center gap-1.5">
                  {index > 0 && (
                    <span aria-hidden className="text-border-strong">
                      ·
                    </span>
                  )}
                  <span className="max-w-full truncate">{part}</span>
                </span>
              ))}
            </span>
          ) : (
            section.description && (
              <span className="text-muted-foreground block text-[13px]">
                {section.description}
              </span>
            )
          )}
        </span>
        <ChevronDown
          aria-hidden
          className="text-muted-foreground size-5 shrink-0 transition-transform group-data-[state=open]/section:rotate-180"
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="flex flex-col gap-[18px] px-4 pt-0.5 pb-[18px]">
        {children}
      </CollapsibleContent>
    </Collapsible>
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

type FieldBlock =
  | { kind: 'single'; field: EditField }
  | { kind: 'row'; fields: EditField[] }
  | { kind: 'range' | 'swap'; start: EditField; end: EditField }

/**
 * Range les champs d'une section en blocs d'affichage : intervalles (heures,
 * dates), paires inversables (départ / arrivée), lignes de champs courts
 * (moitiés, tiers) et champs seuls.
 */
function layoutFields(fields: readonly EditField[]): FieldBlock[] {
  const byKey = new Map(fields.map((field) => [field.key, field]))
  const consumed = new Set<string>()
  const blocks: FieldBlock[] = []

  for (const field of fields) {
    if (consumed.has(field.key)) continue

    const partnerKey = field.pairWith ?? field.swapWith
    const partner = partnerKey ? byKey.get(partnerKey) : undefined
    if (partner) {
      consumed.add(partner.key)
      blocks.push({
        kind: field.pairWith ? 'range' : 'swap',
        start: field,
        end: partner,
      })
      continue
    }

    const width = field.third ? 3 : field.half ? 2 : 1
    const previous = blocks.at(-1)
    if (
      width > 1 &&
      previous?.kind === 'row' &&
      previous.fields.length < width &&
      rowWidth(previous.fields[0]) === width
    ) {
      previous.fields.push(field)
      continue
    }

    blocks.push(
      width > 1 ? { kind: 'row', fields: [field] } : { kind: 'single', field },
    )
  }

  return blocks
}

function rowWidth(field: EditField): number {
  return field.third ? 3 : field.half ? 2 : 1
}

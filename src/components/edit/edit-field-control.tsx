'use client'

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type SVGProps,
} from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { cn } from '@/lib/utils'
import {
  CURRENCY_SUGGESTIONS,
  type EditField,
  type EditFieldTone,
} from '@/lib/edit-fields'
import {
  countNights,
  formatMinutes,
  minutesBetween,
  pricePerNight,
  type DraftValue,
  type EntityDraft,
} from '@/lib/entity-draft'
import { ACCENT_TEXT_CLASS, FIELD_ICONS } from '@/components/edit/field-icons'
import { Chip } from '@/components/mobile/chip'
import {
  AlertCircle,
  ArrowDownUp,
  ArrowRight,
  Check,
  ChevronDown,
  ExternalLink,
  Link2,
  MapPin,
  Moon,
  Plus,
  Star,
  X,
} from 'lucide-react'

/**
 * Champ de saisie des formulaires d'édition : 52 px de haut, texte de 16 px
 * (en dessous, Safari zoome sur la page au focus), halo bleu au focus et
 * bordure rouge quand le champ est en erreur.
 */
export const FIELD_INPUT_CLASS = cn(
  'border-border-strong bg-card text-foreground placeholder:text-muted-foreground/60 h-[52px] w-full min-w-0 rounded-[14px] border-[1.5px] px-3.5 text-base font-bold outline-none',
  'focus-visible:border-primary focus-visible:ring-primary/20 transition-[border-color,box-shadow] focus-visible:ring-4',
  'aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/15',
)

/** Cadre partagé par une saisie et ses compléments (icône, bouton Carte…). */
const FIELD_SHELL_CLASS = cn(
  'border-border-strong bg-card flex min-w-0 items-center rounded-[14px] border-[1.5px] transition-[border-color,box-shadow]',
  'focus-within:border-primary focus-within:ring-primary/20 focus-within:ring-4',
  'has-[[aria-invalid=true]]:border-destructive',
)

/** Saisie sans bordure, logée dans un `FIELD_SHELL_CLASS`. */
const SHELL_INPUT_CLASS =
  'text-foreground placeholder:text-muted-foreground/60 h-[50px] min-w-0 flex-1 bg-transparent px-2 text-[15px] font-bold outline-none'

/** Petit bouton-lien à droite d'une saisie (« Carte », « Ouvrir »). */
const SHELL_ACTION_CLASS =
  'bg-primary-soft text-primary-strong focus-visible:ring-ring/50 mr-1 flex h-[42px] shrink-0 items-center gap-1 rounded-[10px] px-2.5 text-[13px] font-extrabold outline-none focus-visible:ring-[3px]'

/** Pastille de couleur d'un statut, alignée sur celles du roadbook. */
const TONE_DOT_CLASS: Record<EditFieldTone, string> = {
  neutral: 'bg-muted-foreground/50',
  info: 'bg-primary',
  success: 'bg-success',
  danger: 'bg-destructive',
}

/** Couleur du libellé du statut choisi. */
const TONE_TEXT_CLASS: Record<EditFieldTone, string> = {
  neutral: 'data-[state=checked]:text-foreground',
  info: 'data-[state=checked]:text-primary-strong',
  success: 'data-[state=checked]:text-success',
  danger: 'data-[state=checked]:text-destructive',
}

interface EditFieldControlProps {
  /** Identifiant du contrôle principal, cible du `<label>` associé */
  id: string
  field: EditField
  draft: EntityDraft
  invalid: boolean
  /** Identifiant du libellé visible, qui nomme les groupes (cartes, étoiles…) */
  labelId?: string
  /** Identifiant de l'aide ou de l'erreur affichée sous le champ */
  describedBy?: string
  onChange: (key: string, value: DraftValue) => void
}

/** Aiguille chaque champ vers le contrôle de saisie qui lui correspond. */
export function EditFieldControl({
  id,
  field,
  draft,
  invalid,
  labelId,
  describedBy,
  onChange,
}: EditFieldControlProps) {
  const value = draft[field.key]
  const text = typeof value === 'string' ? value : ''
  const setValue = (next: DraftValue) => onChange(field.key, next)
  const a11y = {
    'aria-invalid': invalid,
    'aria-describedby': describedBy,
  }

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          id={id}
          value={text}
          rows={3}
          placeholder={field.placeholder}
          onChange={(event) => setValue(event.target.value)}
          className={cn(
            FIELD_INPUT_CLASS,
            'field-sizing-content h-auto min-h-[88px] resize-none py-3 text-[15px] leading-[1.45] font-semibold',
          )}
          {...a11y}
        />
      )

    case 'switch':
      return (
        <SwitchRow
          id={id}
          label={field.label}
          checked={value === true}
          describedBy={describedBy}
          onChange={setValue}
        />
      )

    case 'icon-choice':
      return (
        <IconChoiceControl
          field={field}
          value={text}
          labelId={labelId}
          {...a11y}
          onChange={setValue}
        />
      )

    case 'choice':
      return (
        <StatusSegments
          field={field}
          value={text}
          labelId={labelId}
          {...a11y}
          onChange={setValue}
        />
      )

    case 'chip-choice':
      return (
        <ChipChoiceControl
          field={field}
          value={text}
          labelId={labelId}
          describedBy={describedBy}
          onChange={setValue}
        />
      )

    case 'lines':
      return (
        <LinesControl
          label={field.label}
          labelId={labelId}
          items={Array.isArray(value) ? value : []}
          placeholder={field.placeholder}
          onChange={setValue}
        />
      )

    case 'chips':
      return (
        <ChipsControl
          label={field.label}
          labelId={labelId}
          items={Array.isArray(value) ? value : []}
          placeholder={field.placeholder ?? 'Ajouter…'}
          onChange={setValue}
        />
      )

    case 'rating':
      return (
        <RatingControl labelId={labelId} value={text} onChange={setValue} />
      )

    case 'price':
      return (
        <PriceControl
          id={id}
          field={field}
          draft={draft}
          invalid={invalid}
          describedBy={describedBy}
          onAmountChange={setValue}
          onCurrencyChange={(next) => {
            if (field.currencyKey) onChange(field.currencyKey, next)
          }}
        />
      )

    case 'coordinates':
      return (
        <CoordinatesControl
          id={id}
          label={field.label}
          labelId={labelId}
          folded={field.folded === true}
          parts={Array.isArray(value) ? value : ['', '']}
          invalid={invalid}
          describedBy={describedBy}
          onChange={setValue}
        />
      )

    case 'time':
      return (
        <TimeInput
          id={id}
          value={text}
          {...a11y}
          className="text-center text-xl font-black"
          onChange={setValue}
        />
      )

    case 'url':
      return (
        <div className={FIELD_SHELL_CLASS}>
          <Link2
            aria-hidden
            className="text-muted-foreground ml-3 size-5 shrink-0"
            strokeWidth={2}
          />
          <input
            id={id}
            type="url"
            inputMode="url"
            autoComplete="url"
            value={text}
            placeholder={field.placeholder ?? 'https://…'}
            onChange={(event) => setValue(event.target.value)}
            className={SHELL_INPUT_CLASS}
            {...a11y}
          />
          {isOpenableUrl(text) && (
            <a
              href={text.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className={SHELL_ACTION_CLASS}
            >
              Ouvrir
              <ExternalLink aria-hidden className="size-3.5" />
              <span className="sr-only">(nouvel onglet)</span>
            </a>
          )}
        </div>
      )

    case 'address':
      return (
        <div className={FIELD_SHELL_CLASS}>
          <MapPin
            aria-hidden
            className="text-secondary-strong ml-3 size-5 shrink-0"
            strokeWidth={2}
          />
          <input
            id={id}
            value={text}
            autoComplete="street-address"
            placeholder={field.placeholder ?? 'Rue, ville, pays'}
            onChange={(event) => setValue(event.target.value)}
            className={SHELL_INPUT_CLASS}
            {...a11y}
          />
          {text.trim() && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={SHELL_ACTION_CLASS}
            >
              Carte
              <ExternalLink aria-hidden className="size-3.5" />
              <span className="sr-only">(nouvel onglet)</span>
            </a>
          )}
        </div>
      )

    default: {
      const Icon = field.icon ? FIELD_ICONS[field.icon] : null

      return (
        <div className="flex flex-col gap-2">
          <div className="relative">
            {Icon && (
              <Icon
                aria-hidden
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2"
                strokeWidth={2}
              />
            )}
            <input
              id={id}
              type={field.type === 'date' ? 'date' : 'text'}
              inputMode={field.type === 'number' ? 'decimal' : undefined}
              value={text}
              placeholder={field.placeholder}
              onChange={(event) => setValue(event.target.value)}
              className={cn(
                FIELD_INPUT_CLASS,
                Icon && 'pl-11',
                field.third && 'px-2 text-center font-extrabold',
                field.mono &&
                  'font-mono font-semibold tracking-[0.08em] uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case',
              )}
              {...a11y}
            />
          </div>
          {field.suggestions && field.suggestions.length > 0 && (
            <SuggestionChips
              label={field.label}
              suggestions={field.suggestions}
              value={text}
              onPick={setValue}
            />
          )}
        </div>
      )
    }
  }
}

interface SwitchRowProps {
  id: string
  label: string
  checked: boolean
  describedBy?: string
  onChange: (checked: boolean) => void
}

/** Oui / non : toute la ligne est tapable, le libellé fait partie de la cible. */
function SwitchRow({
  id,
  label,
  checked,
  describedBy,
  onChange,
}: SwitchRowProps) {
  return (
    <div
      className={cn(
        'border-border-strong bg-card flex min-h-[56px] items-center gap-3 rounded-[14px] border-[1.5px] pr-2.5 pl-3.5 transition-colors',
        checked && 'border-primary/50 bg-primary-soft/50',
      )}
    >
      <label
        htmlFor={id}
        className="flex min-h-11 flex-1 cursor-pointer items-center text-[15px] font-extrabold"
      >
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={describedBy}
        onClick={() => onChange(!checked)}
        className={cn(
          'focus-visible:ring-ring/50 relative h-8 w-[52px] shrink-0 rounded-full transition-colors outline-none focus-visible:ring-[3px]',
          checked ? 'bg-primary' : 'bg-border-strong',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'bg-card absolute top-[3px] left-[3px] size-[26px] rounded-full shadow-[0_1px_3px_rgba(14,26,58,0.25)] transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  )
}

interface GroupA11yProps {
  labelId?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

interface ChoiceProps extends GroupA11yProps {
  field: EditField
  value: string
  onChange: (value: string) => void
}

/**
 * Choix unique en cartes illustrées. Cinq options se rangent en 3 + 2 (les
 * deux dernières en cartes basses), quatre options sur une seule ligne.
 */
function IconChoiceControl({
  field,
  value,
  labelId,
  onChange,
  ...a11y
}: ChoiceProps) {
  const options = field.options ?? []
  const rows =
    options.length === 5
      ? [options.slice(0, 3), options.slice(3)]
      : [options.slice(0, 4), ...chunk(options.slice(4), 4)]

  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={onChange}
      aria-labelledby={labelId}
      className={cn(
        'flex flex-col gap-2 rounded-2xl',
        a11y['aria-invalid'] && 'ring-destructive/40 ring-2 ring-offset-2',
      )}
      {...a11y}
    >
      {rows.map((row, rowIndex) => {
        // La seconde ligne d'un 3 + 2 passe en cartes basses, icône à gauche.
        const compact = options.length === 5 && rowIndex === 1

        return (
          <div
            key={rowIndex}
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
            }}
          >
            {row.map((option) => {
              const Icon = option.icon ? FIELD_ICONS[option.icon] : null

              return (
                <RadioGroupPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className={cn(
                    'group pressable border-border bg-card text-foreground relative flex min-w-0 items-center justify-center rounded-2xl border-[1.5px] px-1 outline-none',
                    'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                    'data-[state=checked]:border-primary data-[state=checked]:bg-primary-soft data-[state=checked]:text-primary-strong data-[state=checked]:border-2',
                    compact
                      ? 'h-[60px] gap-2'
                      : cn(
                          'flex-col gap-1.5',
                          row.length > 3 ? 'h-20' : 'h-[84px]',
                        ),
                  )}
                >
                  <RadioGroupPrimitive.Indicator className="bg-primary text-primary-foreground absolute top-1.5 right-1.5 flex size-[18px] items-center justify-center rounded-full">
                    <Check aria-hidden className="size-3" strokeWidth={3.5} />
                  </RadioGroupPrimitive.Indicator>
                  {Icon && (
                    <Icon
                      aria-hidden
                      className={cn(
                        'size-6 shrink-0',
                        ACCENT_TEXT_CLASS[option.accent ?? 'primary'],
                        'group-data-[state=checked]:text-primary-strong',
                      )}
                      strokeWidth={2}
                    />
                  )}
                  <span className="max-w-full truncate text-[13px] font-extrabold group-data-[state=checked]:font-black">
                    {option.label}
                  </span>
                </RadioGroupPrimitive.Item>
              )
            })}
          </div>
        )
      })}
    </RadioGroupPrimitive.Root>
  )
}

/**
 * Statut en contrôle segmenté, chaque segment précédé de sa pastille de
 * couleur. Même aspect que `SegmentedControl` (mobile), avec la pastille et des
 * segments de 44 px que la primitive ne propose pas ; la navigation aux
 * flèches vient du groupe radio.
 */
function StatusSegments({
  field,
  value,
  labelId,
  onChange,
  ...a11y
}: ChoiceProps) {
  const options = field.options ?? []
  const dense = options.length > 3

  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={onChange}
      aria-labelledby={labelId}
      orientation="horizontal"
      className="bg-muted flex gap-1 rounded-[14px] p-1"
      {...a11y}
    >
      {options.map((option) => {
        const tone = option.tone ?? 'neutral'

        return (
          <RadioGroupPrimitive.Item
            key={option.value}
            value={option.value}
            className={cn(
              'pressable text-muted-foreground flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[11px] px-1 font-extrabold outline-none',
              'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
              'data-[state=checked]:bg-card data-[state=checked]:font-black data-[state=checked]:shadow-[0_1px_3px_rgba(14,26,58,0.16)]',
              TONE_TEXT_CLASS[tone],
              dense ? 'gap-1 text-xs' : 'text-sm',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'size-2 shrink-0 rounded-full',
                TONE_DOT_CLASS[tone],
              )}
            />
            <span className="truncate">{option.label}</span>
          </RadioGroupPrimitive.Item>
        )
      })}
    </RadioGroupPrimitive.Root>
  )
}

interface ChipChoiceControlProps {
  field: EditField
  value: string
  labelId?: string
  describedBy?: string
  onChange: (value: string) => void
}

/**
 * Choix unique en pastilles. Une valeur hors liste (donnée importée) reste
 * affichée et choisie ; « Autre… » permet d'en saisir une.
 */
function ChipChoiceControl({
  field,
  value,
  labelId,
  describedBy,
  onChange,
}: ChipChoiceControlProps) {
  const options = field.options ?? []
  const isCustom =
    value.trim() !== '' && !options.some((o) => o.value === value)
  const [typing, setTyping] = useState(false)
  const inputId = useId()

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        className="flex flex-wrap gap-2"
      >
        {options.map((option) => {
          const pressed = option.value === value
          return (
            <Chip
              key={option.value}
              pressed={pressed}
              icon={pressed ? CheckIcon : undefined}
              onClick={() => {
                setTyping(false)
                onChange(pressed ? '' : option.value)
              }}
            >
              {option.label}
            </Chip>
          )
        })}
        {isCustom && !typing && (
          <Chip pressed icon={CheckIcon} onClick={() => onChange('')}>
            {value}
          </Chip>
        )}
        <Chip
          pressed={typing ? true : undefined}
          icon={Plus}
          onClick={() => setTyping((current) => !current)}
          className="border-dashed"
        >
          Autre…
        </Chip>
      </div>

      {typing && (
        <div className="animate-fade flex flex-col gap-1.5">
          <label htmlFor={inputId} className="sr-only">
            {field.label} (saisie libre)
          </label>
          <input
            id={inputId}
            autoFocus
            value={isCustom ? value : ''}
            placeholder="Votre libellé"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                setTyping(false)
              }
            }}
            className={FIELD_INPUT_CLASS}
          />
        </div>
      )}
    </div>
  )
}

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return <Check {...props} strokeWidth={3} />
}

interface LinesControlProps {
  label: string
  labelId?: string
  items: string[]
  placeholder?: string
  onChange: (items: string[]) => void
}

/** Au-delà, une liste s'ouvre repliée sur un aperçu de ses entrées. */
const LINES_FOLD_THRESHOLD = 3

/**
 * Liste de phrases : une ligne numérotée par entrée, supprimable, et un bouton
 * « Ajouter ». Entrée crée la ligne suivante, Retour arrière vide la supprime.
 */
function LinesControl({
  label,
  labelId,
  items,
  placeholder,
  onChange,
}: LinesControlProps) {
  const container = useRef<HTMLDivElement>(null)
  const contentId = useId()
  const [expanded, setExpanded] = useState(
    () => items.length <= LINES_FOLD_THRESHOLD,
  )
  const filled = items.filter((item) => item.trim()).length

  const focusRow = (index: number) => {
    requestAnimationFrame(() => {
      const inputs = container.current?.querySelectorAll('input')
      inputs?.[index]?.focus()
    })
  }

  const insertAt = (index: number) => {
    const next = [...items]
    next.splice(index, 0, '')
    onChange(next)
    focusRow(index)
  }

  const removeAt = (index: number) => {
    onChange(items.filter((_, position) => position !== index))
    if (items.length > 1) focusRow(Math.max(0, index - 1))
  }

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      insertAt(index + 1)
      return
    }

    if (event.key === 'Backspace' && items[index] === '' && items.length > 1) {
      event.preventDefault()
      removeAt(index)
    }
  }

  return (
    <div
      ref={container}
      role="group"
      aria-labelledby={labelId}
      className="bg-background flex flex-col gap-2 rounded-[18px] p-3.5"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
        className="focus-visible:ring-ring/50 -m-1.5 flex min-h-11 items-center gap-2 rounded-xl p-1.5 text-left outline-none focus-visible:ring-[3px]"
      >
        <span className="min-w-0 flex-1">
          <span id={labelId} className="block text-[15px] font-black">
            {label}
          </span>
          {!expanded && filled > 0 && (
            <span className="text-muted-foreground block truncate text-xs">
              {items.filter((item) => item.trim()).join(', ')}
            </span>
          )}
        </span>
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-extrabold tabular-nums',
            filled > 0
              ? 'bg-primary-soft text-primary-strong'
              : 'bg-muted text-muted-foreground',
          )}
        >
          <span className="sr-only">Entrées : </span>
          {filled}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            'text-muted-foreground size-5 shrink-0 transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>

      <div id={contentId} hidden={!expanded} className="flex flex-col gap-2">
        {items.length === 0 && (
          <p className="text-muted-foreground text-[13px]">
            Rien pour l’instant.
            {placeholder && ` Exemple : ${placeholder}.`}
          </p>
        )}

        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="text-muted-foreground w-[18px] shrink-0 text-right text-xs font-extrabold tabular-nums"
            >
              {index + 1}
            </span>
            <input
              value={item}
              aria-label={`${label}, entrée ${index + 1}`}
              placeholder={placeholder}
              onChange={(event) => {
                const next = [...items]
                next[index] = event.target.value
                onChange(next)
              }}
              onKeyDown={(event) => handleKeyDown(event, index)}
              enterKeyHint="next"
              className={cn(
                FIELD_INPUT_CLASS,
                'h-[46px] rounded-xl px-3 text-[15px]',
              )}
            />
            <button
              type="button"
              aria-label={
                item.trim()
                  ? `Retirer « ${item.trim()} »`
                  : `Retirer l’entrée ${index + 1}`
              }
              onClick={() => removeAt(index)}
              className="text-muted-foreground hover:text-destructive focus-visible:ring-ring/50 flex size-11 shrink-0 items-center justify-center rounded-xl outline-none focus-visible:ring-[3px]"
            >
              <X aria-hidden className="size-5" strokeWidth={2} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => insertAt(items.length)}
          className={cn(
            'pressable border-primary/40 text-primary-strong focus-visible:ring-ring/50 flex h-11 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed text-sm font-extrabold outline-none focus-visible:ring-[3px]',
            items.length > 0 && 'ml-6',
          )}
        >
          <Plus aria-hidden className="size-4" strokeWidth={2.5} />
          Ajouter<span className="sr-only"> à « {label} »</span>
        </button>
      </div>
    </div>
  )
}

interface ChipsControlProps {
  label: string
  labelId?: string
  items: string[]
  placeholder: string
  onChange: (items: string[]) => void
}

/**
 * Mots-clés en pastilles retirables, et une pastille « Ajouter » qui ouvre la
 * saisie : Entrée ou virgule valide, la sortie du champ aussi.
 */
function ChipsControl({
  label,
  labelId,
  items,
  placeholder,
  onChange,
}: ChipsControlProps) {
  const [adding, setAdding] = useState(false)
  const [pending, setPending] = useState('')

  const commit = (raw: string) => {
    const tag = raw.trim().replace(/,$/, '').trim()
    setPending('')
    if (!tag || items.includes(tag)) return
    onChange([...items, tag])
  }

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex flex-wrap items-center gap-2"
    >
      {items.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className="bg-primary-soft text-primary-strong flex h-10 items-center gap-0.5 rounded-full pr-0.5 pl-3.5 text-sm font-extrabold"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            aria-label={`Retirer ${tag}`}
            className="hover:bg-primary/10 focus-visible:ring-ring/50 flex size-9 items-center justify-center rounded-full outline-none focus-visible:ring-[3px]"
          >
            <X aria-hidden className="size-4" strokeWidth={2.5} />
          </button>
        </span>
      ))}

      {adding ? (
        <input
          autoFocus
          value={pending}
          aria-label={`Nouveau ${label.toLowerCase()}`}
          placeholder={placeholder}
          enterKeyHint="done"
          onChange={(event) => {
            const raw = event.target.value
            if (raw.endsWith(',')) commit(raw)
            else setPending(raw)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit(pending)
            }
          }}
          onBlur={() => {
            commit(pending)
            setAdding(false)
          }}
          className={cn(
            FIELD_INPUT_CLASS,
            'h-10 w-40 flex-none rounded-full px-3.5 text-sm',
          )}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="pressable border-primary/40 text-primary-strong focus-visible:ring-ring/50 flex h-10 items-center gap-1 rounded-full border-[1.5px] border-dashed pr-3.5 pl-2.5 text-sm font-extrabold outline-none focus-visible:ring-[3px]"
        >
          <Plus aria-hidden className="size-4" strokeWidth={2.5} />
          Ajouter
          <span className="sr-only"> un {label.toLowerCase()}</span>
        </button>
      )}
    </div>
  )
}

interface RatingControlProps {
  labelId?: string
  value: string
  onChange: (value: string) => void
}

/**
 * Note sur 5 en étoiles. Toucher l'étoile déjà choisie efface la note ; une
 * note décimale importée (4.9) reste affichée telle quelle.
 */
function RatingControl({ labelId, value, onChange }: RatingControlProps) {
  const parsed = Number(value.replace(',', '.'))
  const rating = Number.isFinite(parsed) && value.trim() ? parsed : 0
  const rounded = Math.round(rating)

  return (
    <div className="flex items-center gap-2">
      <div
        role="group"
        aria-labelledby={labelId}
        className="-ml-1.5 flex items-center"
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(rounded === star ? '' : String(star))}
            aria-label={`${star} sur 5`}
            aria-pressed={rounded === star}
            className="focus-visible:ring-ring/50 flex size-11 items-center justify-center rounded-xl transition-transform outline-none hover:scale-110 focus-visible:ring-[3px]"
          >
            <Star
              aria-hidden
              className={cn(
                'size-7',
                star <= rounded
                  ? 'fill-secondary text-secondary'
                  : 'text-border-strong',
              )}
              strokeWidth={1.75}
            />
          </button>
        ))}
      </div>

      <span
        className="text-muted-foreground text-sm font-extrabold tabular-nums"
        aria-live="polite"
      >
        {rating > 0 ? `${value.trim()}/5` : 'Pas de note'}
      </span>
    </div>
  )
}

interface PriceControlProps {
  id: string
  field: EditField
  draft: EntityDraft
  invalid: boolean
  describedBy?: string
  onAmountChange: (value: string) => void
  onCurrencyChange: (value: string) => void
}

/** Devise toujours proposée en un tap, à côté de celle déjà choisie. */
const DEFAULT_CURRENCY = 'EUR'

/**
 * Montant et devise dans un seul champ : la devise se choisit en segments
 * (l'euro et la devise déjà saisie), « Autre devise » ouvre la saisie libre.
 */
function PriceControl({
  id,
  field,
  draft,
  invalid,
  describedBy,
  onAmountChange,
  onCurrencyChange,
}: PriceControlProps) {
  const listId = useId()
  const otherId = useId()
  const perNightId = useId()
  const rawAmount = draft[field.key]
  const amount = typeof rawAmount === 'string' ? rawAmount : ''
  const currency = field.currencyKey
    ? String(draft[field.currencyKey] ?? '').toUpperCase()
    : ''
  const [typingCurrency, setTypingCurrency] = useState(false)

  const quickCurrencies = Array.from(
    new Set([DEFAULT_CURRENCY, currency].filter(Boolean)),
  )

  const nights = field.perNight
    ? countNights(draft[field.perNight.from], draft[field.perNight.to])
    : null
  const nightly = pricePerNight(amount, nights)

  return (
    <div className="flex flex-col gap-2">
      <div className={cn(FIELD_SHELL_CLASS, 'h-14 overflow-hidden')}>
        <input
          id={id}
          inputMode="decimal"
          value={amount}
          placeholder="0"
          aria-invalid={invalid}
          aria-describedby={
            [describedBy, nightly !== null ? perNightId : null]
              .filter(Boolean)
              .join(' ') || undefined
          }
          onChange={(event) => onAmountChange(event.target.value)}
          className={cn(SHELL_INPUT_CLASS, 'px-3.5 text-xl font-black')}
        />
        {field.currencyKey && (
          <RadioGroupPrimitive.Root
            value={currency}
            onValueChange={(next) => {
              setTypingCurrency(false)
              onCurrencyChange(next)
            }}
            aria-label="Devise"
            orientation="horizontal"
            className="bg-muted mr-1 flex shrink-0 gap-0.5 rounded-[11px] p-[3px]"
          >
            {quickCurrencies.map((code) => (
              <RadioGroupPrimitive.Item
                key={code}
                value={code}
                className="text-muted-foreground data-[state=checked]:bg-card data-[state=checked]:text-primary-strong focus-visible:ring-ring/50 h-11 w-[52px] rounded-[9px] font-mono text-[13px] font-semibold outline-none focus-visible:ring-[3px] data-[state=checked]:shadow-[0_1px_3px_rgba(14,26,58,0.16)]"
              >
                {code}
              </RadioGroupPrimitive.Item>
            ))}
            <button
              type="button"
              aria-label="Autre devise"
              aria-expanded={typingCurrency}
              aria-controls={otherId}
              onClick={() => setTypingCurrency((current) => !current)}
              className="text-muted-foreground focus-visible:ring-ring/50 flex h-11 w-9 items-center justify-center rounded-[9px] outline-none focus-visible:ring-[3px]"
            >
              <ChevronDown
                aria-hidden
                className={cn(
                  'size-4 transition-transform',
                  typingCurrency && 'rotate-180',
                )}
              />
            </button>
          </RadioGroupPrimitive.Root>
        )}
      </div>

      <div id={otherId} hidden={!typingCurrency}>
        {typingCurrency && (
          <div className="animate-fade flex items-center gap-2">
            <label
              htmlFor={`${otherId}-input`}
              className="text-muted-foreground text-[13px] font-extrabold"
            >
              Code de devise
            </label>
            <input
              id={`${otherId}-input`}
              autoFocus
              list={listId}
              value={currency}
              maxLength={4}
              placeholder="USD"
              autoCapitalize="characters"
              onChange={(event) =>
                onCurrencyChange(event.target.value.toUpperCase())
              }
              className={cn(
                FIELD_INPUT_CLASS,
                'h-11 w-28 font-mono font-semibold uppercase',
              )}
            />
            <datalist id={listId}>
              {CURRENCY_SUGGESTIONS.map((code) => (
                <option key={code} value={code} />
              ))}
            </datalist>
          </div>
        )}
      </div>

      {nightly !== null && (
        <p id={perNightId} className="text-muted-foreground text-xs">
          Soit environ {nightly.toLocaleString('fr-FR')}
          {currency ? ` ${currency}` : ''} la nuit.
        </p>
      )}
    </div>
  )
}

interface CoordinatesControlProps {
  id: string
  label: string
  labelId?: string
  folded: boolean
  parts: string[]
  invalid: boolean
  describedBy?: string
  onChange: (parts: string[]) => void
}

/**
 * Latitude / longitude, avec collage direct d'un couple « lat, lng ». Repliées
 * (`folded`), elles se lisent en une ligne et ne se déplient qu'à la demande :
 * on les retouche rarement, mais une erreur les rouvre d'office.
 */
function CoordinatesControl({
  id,
  label,
  labelId,
  folded,
  parts,
  invalid,
  describedBy,
  onChange,
}: CoordinatesControlProps) {
  const [latitude = '', longitude = ''] = parts
  const hasValue = latitude.trim() !== '' && longitude.trim() !== ''
  const [editing, setEditing] = useState(!folded || !hasValue)
  const inputsId = useId()
  const showInputs = editing || invalid
  const mapUrl = hasValue
    ? `https://www.google.com/maps?q=${latitude.trim()},${longitude.trim()}`
    : null

  const handlePaste = (clipboard: string): boolean => {
    const match = clipboard
      .trim()
      .match(/^(-?\d+(?:[.,]\d+)?)\s*[,;]\s*(-?\d+(?:[.,]\d+)?)$/)
    if (!match) return false

    onChange([match[1].replace(',', '.'), match[2].replace(',', '.')])
    return true
  }

  const coordinateInput = (
    axis: 'Lat' | 'Lng',
    value: string,
    placeholder: string,
    update: (next: string) => void,
  ) => (
    <div className={cn(FIELD_SHELL_CLASS, 'flex-1')}>
      <span
        aria-hidden
        className="text-muted-foreground pl-3 text-[11px] font-extrabold tracking-wide uppercase"
      >
        {axis}
      </span>
      <input
        id={axis === 'Lat' ? id : undefined}
        inputMode="decimal"
        value={value}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        aria-label={`${label}, ${axis === 'Lat' ? 'latitude' : 'longitude'}`}
        placeholder={placeholder}
        onPaste={(event) => {
          if (handlePaste(event.clipboardData.getData('text'))) {
            event.preventDefault()
          }
        }}
        onChange={(event) => update(event.target.value)}
        className={cn(SHELL_INPUT_CLASS, 'font-mono text-[15px]')}
      />
    </div>
  )

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      {!showInputs && (
        <div className="bg-background flex min-h-[52px] items-center gap-2 rounded-[14px] pr-1 pl-3.5">
          <MapPin
            aria-hidden
            className="text-accent size-5 shrink-0"
            strokeWidth={2}
          />
          <span className="min-w-0 flex-1 truncate font-mono text-sm">
            {latitude.trim()}, {longitude.trim()}
          </span>
          <button
            type="button"
            aria-expanded={false}
            aria-controls={inputsId}
            onClick={() => setEditing(true)}
            className="text-primary-strong focus-visible:ring-ring/50 min-h-11 rounded-xl px-3 text-sm font-extrabold outline-none focus-visible:ring-[3px]"
          >
            Modifier<span className="sr-only"> {label.toLowerCase()}</span>
          </button>
        </div>
      )}

      <div id={inputsId} hidden={!showInputs} className="flex flex-col gap-2">
        {showInputs && (
          <div className="flex gap-2">
            {coordinateInput('Lat', latitude, '31.2304', (next) =>
              onChange([next, longitude]),
            )}
            {coordinateInput('Lng', longitude, '121.4737', (next) =>
              onChange([latitude, next]),
            )}
          </div>
        )}
      </div>

      {mapUrl && (
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-strong inline-flex min-h-11 w-fit items-center gap-1 text-[13px] font-extrabold hover:underline"
        >
          Vérifier sur la carte
          <ExternalLink aria-hidden className="size-3.5" />
          <span className="sr-only">(nouvel onglet)</span>
        </a>
      )}
    </div>
  )
}

interface TimeInputProps {
  id?: string
  value: string
  className?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  onChange: (value: string) => void
}

/**
 * Sélecteur d'heure natif quand la valeur s'y prête, saisie libre sinon :
 * une donnée importée comme « vers midi » ne doit pas être perdue.
 */
function TimeInput({ value, className, onChange, ...rest }: TimeInputProps) {
  const [useNativePicker] = useState(() => /^(\d{1,2}:\d{2})?$/.test(value))

  return (
    <input
      type={useNativePicker ? 'time' : 'text'}
      value={value}
      placeholder="07:53"
      onChange={(event) => onChange(event.target.value)}
      className={cn(FIELD_INPUT_CLASS, 'px-2', className)}
      {...rest}
    />
  )
}

interface PairControlProps {
  /** Préfixe des identifiants (celui du formulaire) */
  idPrefix: string
  start: EditField
  end: EditField
  draft: EntityDraft
  errors: Record<string, string>
  onChange: (key: string, value: DraftValue) => void
}

/**
 * Intervalle saisi d'un bloc : heures de départ et d'arrivée avec la durée
 * calculée entre les deux, ou dates d'arrivée et de départ avec le nombre de
 * nuits. Chaque moitié garde son libellé, son erreur et son `data-field`.
 */
export function RangeControl({
  idPrefix,
  start,
  end,
  draft,
  errors,
  onChange,
}: PairControlProps) {
  const isDate = start.type === 'date'
  const startValue = String(draft[start.key] ?? '')
  const endValue = String(draft[end.key] ?? '')
  const messages = [start, end].flatMap((field) =>
    errors[field.key]
      ? [
          {
            id: `${idPrefix}-${field.key}-message`,
            field,
            text: errors[field.key],
          },
        ]
      : [],
  )
  const messageIdFor = (field: EditField) =>
    errors[field.key] ? `${idPrefix}-${field.key}-message` : undefined

  if (isDate) {
    const nights = countNights(startValue, endValue)

    return (
      <div className="flex flex-col gap-2">
        <div className="border-border-strong bg-card flex items-stretch overflow-hidden rounded-[18px] border-[1.5px]">
          {[start, end].map((field, index) => (
            <div key={field.key} className="contents">
              {index === 1 && (
                <div
                  aria-hidden
                  className="border-border/70 bg-background text-muted-foreground flex w-11 shrink-0 items-center justify-center border-x"
                >
                  <ArrowRight className="size-5" />
                </div>
              )}
              <div
                data-field={field.key}
                className="flex min-w-0 flex-1 flex-col gap-0.5 px-3.5 py-3"
              >
                <label
                  htmlFor={`${idPrefix}-${field.key}`}
                  className="text-muted-foreground text-xs font-extrabold"
                >
                  {field.label}
                  {field.required && <RequiredMark />}
                </label>
                <input
                  id={`${idPrefix}-${field.key}`}
                  type="date"
                  value={String(draft[field.key] ?? '')}
                  aria-invalid={Boolean(errors[field.key])}
                  aria-describedby={messageIdFor(field)}
                  onChange={(event) => onChange(field.key, event.target.value)}
                  className="text-foreground aria-[invalid=true]:text-destructive focus-visible:ring-ring/50 h-11 w-full min-w-0 rounded-lg bg-transparent text-[17px] font-black outline-none focus-visible:ring-[3px]"
                />
              </div>
            </div>
          ))}
        </div>

        {nights !== null && nights >= 0 && (
          <p className="text-primary-strong flex items-center gap-1.5 text-[13px] font-extrabold">
            <Moon aria-hidden className="size-4" />
            {nights === 0
              ? 'Même jour · aucune nuit'
              : `${nights} nuit${nights > 1 ? 's' : ''} · calculé à partir des dates`}
          </p>
        )}
        <FieldMessages messages={messages} />
      </div>
    )
  }

  const minutes = minutesBetween(startValue, endValue)

  return (
    <div className="flex flex-col gap-2">
      <div className="bg-background flex items-end gap-2 rounded-[18px] p-3.5">
        {[start, end].map((field, index) => (
          <div key={field.key} className="contents">
            {index === 1 && (
              <div
                aria-hidden={minutes === null}
                className="text-muted-foreground flex shrink-0 flex-col items-center gap-0.5 pb-2"
              >
                {minutes !== null && (
                  <span className="text-[11px] font-extrabold">
                    <span className="sr-only">Durée calculée : </span>
                    {formatMinutes(minutes)}
                  </span>
                )}
                <ArrowRight aria-hidden className="size-5" />
              </div>
            )}
            <div
              data-field={field.key}
              className="flex min-w-0 flex-1 flex-col gap-1.5"
            >
              <label
                htmlFor={`${idPrefix}-${field.key}`}
                className="text-muted-foreground text-xs font-extrabold"
              >
                {field.label}
                {field.required && <RequiredMark />}
              </label>
              <TimeInput
                id={`${idPrefix}-${field.key}`}
                value={String(draft[field.key] ?? '')}
                aria-invalid={Boolean(errors[field.key])}
                aria-describedby={messageIdFor(field)}
                className="text-center text-xl font-black"
                onChange={(next) => onChange(field.key, next)}
              />
            </div>
          </div>
        ))}
      </div>
      <FieldMessages messages={messages} />
    </div>
  )
}

/**
 * Départ et arrivée l'un sous l'autre, avec un bouton rond pour les inverser
 * (le trajet retour se saisit en un geste).
 */
export function SwapControl({
  idPrefix,
  start,
  end,
  draft,
  errors,
  onChange,
}: PairControlProps) {
  const messages = [start, end].flatMap((field) =>
    errors[field.key]
      ? [
          {
            id: `${idPrefix}-${field.key}-message`,
            field,
            text: errors[field.key],
          },
        ]
      : [],
  )

  const swap = () => {
    const first = draft[start.key] ?? ''
    const second = draft[end.key] ?? ''
    onChange(start.key, second)
    onChange(end.key, first)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex flex-col gap-2">
        {[start, end].map((field) => (
          <div
            key={field.key}
            data-field={field.key}
            className="flex flex-col gap-1.5"
          >
            <label
              htmlFor={`${idPrefix}-${field.key}`}
              className="text-muted-foreground text-[13px] font-extrabold"
            >
              {field.label}
              {field.required && <RequiredMark />}
            </label>
            <input
              id={`${idPrefix}-${field.key}`}
              value={String(draft[field.key] ?? '')}
              placeholder={field.placeholder}
              aria-invalid={Boolean(errors[field.key])}
              aria-describedby={
                errors[field.key]
                  ? `${idPrefix}-${field.key}-message`
                  : undefined
              }
              onChange={(event) => onChange(field.key, event.target.value)}
              className={cn(FIELD_INPUT_CLASS, 'h-14 pr-16 font-extrabold')}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={swap}
          aria-label={`Inverser « ${start.label} » et « ${end.label} »`}
          className="pressable border-border-strong bg-card text-primary focus-visible:ring-ring/50 absolute top-1/2 right-2.5 flex size-11 translate-y-[2px] items-center justify-center rounded-full border-[1.5px] shadow-[0_4px_12px_rgba(14,26,58,0.12)] outline-none focus-visible:ring-[3px]"
        >
          <ArrowDownUp aria-hidden className="size-5" strokeWidth={2.25} />
        </button>
      </div>
      <FieldMessages messages={messages} />
    </div>
  )
}

/** Astérisque des champs obligatoires, expliqué en bas du formulaire. */
export function RequiredMark() {
  return (
    <span className="text-destructive ml-0.5" aria-hidden>
      *
    </span>
  )
}

/** Message d'erreur relié à son champ par `aria-describedby`. */
export function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p
      id={id}
      className="text-destructive flex items-start gap-1.5 text-[13px] font-bold"
    >
      <AlertCircle aria-hidden className="mt-px size-4 shrink-0" />
      {children}
    </p>
  )
}

function FieldMessages({
  messages,
}: {
  messages: { id: string; field: EditField; text: string }[]
}) {
  return messages.map((message) => (
    <FieldError key={message.id} id={message.id}>
      {message.text}
    </FieldError>
  ))
}

interface SuggestionChipsProps {
  label: string
  suggestions: readonly string[]
  value: string
  onPick: (value: string) => void
}

/** Valeurs fréquentes proposées en un tap, sans empêcher la saisie libre. */
function SuggestionChips({
  label,
  suggestions,
  value,
  onPick,
}: SuggestionChipsProps) {
  // Jusqu'à six suggestions tiennent sur une ligne de largeurs égales.
  const fitsOneRow = suggestions.length <= 6

  return (
    <div
      role="group"
      aria-label={`Suggestions pour « ${label} »`}
      className={fitsOneRow ? 'grid gap-1.5' : 'flex flex-wrap gap-1.5'}
      style={
        fitsOneRow
          ? {
              gridTemplateColumns: `repeat(${suggestions.length}, minmax(0, 1fr))`,
            }
          : undefined
      }
    >
      {suggestions.map((suggestion) => {
        const isActive = value.trim() === suggestion

        return (
          <Chip
            key={suggestion}
            pressed={isActive}
            onClick={() => onPick(isActive ? '' : suggestion)}
            className={cn(
              'justify-center text-[13px]',
              !isActive && 'text-muted-foreground',
              fitsOneRow && 'px-0',
              suggestion.length > 5 && 'text-xs',
            )}
          >
            {suggestion}
          </Chip>
        )
      })}
    </div>
  )
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size))
  }
  return rows
}

function isOpenableUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim())
}

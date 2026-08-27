'use client'

import { useId, useRef, useState, type KeyboardEvent } from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { cn } from '@/lib/utils'
import {
  CURRENCY_SUGGESTIONS,
  type EditField,
  type EditFieldTone,
} from '@/lib/edit-fields'
import type { DraftValue, EntityDraft } from '@/lib/entity-draft'
import { FIELD_ICONS } from '@/components/edit/field-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  ExternalLink,
  Link2,
  MapPin,
  Plus,
  Star,
  Trash2,
  X,
} from 'lucide-react'

const TONE_DOT_CLASS: Record<EditFieldTone, string> = {
  neutral: 'bg-muted-foreground/40',
  info: 'bg-blue-500',
  success: 'bg-green-500',
  danger: 'bg-red-500',
}

interface EditFieldControlProps {
  /** Identifiant du contrôle principal, cible du `<label>` associé */
  id: string
  field: EditField
  draft: EntityDraft
  invalid: boolean
  onChange: (key: string, value: DraftValue) => void
}

/** Aiguille chaque champ vers le contrôle de saisie qui lui correspond. */
export function EditFieldControl({
  id,
  field,
  draft,
  invalid,
  onChange,
}: EditFieldControlProps) {
  const value = draft[field.key]
  const text = typeof value === 'string' ? value : ''
  const setValue = (next: DraftValue) => onChange(field.key, next)

  switch (field.type) {
    case 'textarea':
      return (
        <Textarea
          id={id}
          value={text}
          aria-invalid={invalid}
          placeholder={field.placeholder}
          onChange={(event) => setValue(event.target.value)}
          className="min-h-20"
        />
      )

    case 'switch':
      return (
        <label
          htmlFor={id}
          className={cn(
            'border-input hover:bg-muted/40 flex h-9 cursor-pointer items-center gap-2.5 rounded-md border px-3 transition-colors',
            value === true && 'border-primary/40 bg-primary/5',
          )}
        >
          <Switch
            id={id}
            checked={value === true}
            onCheckedChange={(checked) => setValue(checked)}
          />
          <span className="text-muted-foreground text-xs">
            {value === true ? 'Oui' : 'Non'}
          </span>
        </label>
      )

    case 'icon-choice':
      return (
        <IconChoiceControl
          field={field}
          value={text}
          invalid={invalid}
          onChange={setValue}
        />
      )

    case 'choice':
      return (
        <ToggleGroup
          type="single"
          variant="outline"
          value={text}
          onValueChange={(next) => {
            if (next) setValue(next)
          }}
          className="w-full"
          aria-label={field.label}
        >
          {field.options?.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              className="data-[state=on]:border-primary/40 data-[state=on]:bg-primary/10 data-[state=on]:text-primary gap-1.5 px-1.5 text-[11px]"
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  TONE_DOT_CLASS[option.tone ?? 'neutral'],
                )}
              />
              <span className="truncate">{option.label}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )

    case 'lines':
      return (
        <LinesControl
          label={field.label}
          items={Array.isArray(value) ? value : []}
          placeholder={field.placeholder}
          onChange={setValue}
        />
      )

    case 'chips':
      return (
        <ChipsControl
          label={field.label}
          items={Array.isArray(value) ? value : []}
          placeholder={field.placeholder ?? 'Ajouter…'}
          onChange={setValue}
        />
      )

    case 'rating':
      return (
        <RatingControl label={field.label} value={text} onChange={setValue} />
      )

    case 'price':
      return (
        <PriceControl
          id={id}
          amount={text}
          currency={
            field.currencyKey
              ? ((draft[field.currencyKey] as string | undefined) ?? '')
              : ''
          }
          invalid={invalid}
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
          parts={Array.isArray(value) ? value : ['', '']}
          invalid={invalid}
          onChange={setValue}
        />
      )

    case 'time':
      return (
        <TimeControl
          id={id}
          value={text}
          invalid={invalid}
          onChange={setValue}
        />
      )

    case 'url':
      return (
        <InputGroup
          className={cn(invalid && 'border-destructive')}
          data-slot="input-group"
        >
          <InputGroupAddon>
            <Link2 className="text-muted-foreground/70" strokeWidth={1.75} />
          </InputGroupAddon>
          <InputGroupInput
            id={id}
            type="url"
            inputMode="url"
            value={text}
            placeholder={field.placeholder ?? 'https://…'}
            onChange={(event) => setValue(event.target.value)}
          />
          {isOpenableUrl(text) && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton asChild size="xs">
                <a href={text} target="_blank" rel="noopener noreferrer">
                  Ouvrir
                  <ExternalLink />
                </a>
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
      )

    case 'address':
      return (
        <InputGroup>
          <InputGroupAddon>
            <MapPin className="text-secondary" strokeWidth={1.75} />
          </InputGroupAddon>
          <InputGroupInput
            id={id}
            value={text}
            placeholder={field.placeholder ?? 'Rue, ville, pays'}
            onChange={(event) => setValue(event.target.value)}
          />
          {text.trim() && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton asChild size="xs">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Carte
                  <ExternalLink />
                </a>
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
      )

    default:
      return (
        <div className="flex flex-col gap-1.5">
          <Input
            id={id}
            type={field.type === 'date' ? 'date' : 'text'}
            inputMode={field.type === 'number' ? 'decimal' : undefined}
            value={text}
            aria-invalid={invalid}
            placeholder={field.placeholder}
            onChange={(event) => setValue(event.target.value)}
          />
          {field.suggestions && field.suggestions.length > 0 && (
            <SuggestionChips
              suggestions={field.suggestions}
              value={text}
              onPick={setValue}
            />
          )}
        </div>
      )
  }
}

interface IconChoiceControlProps {
  field: EditField
  value: string
  invalid: boolean
  onChange: (value: string) => void
}

/** Choix unique présenté en cartes illustrées, une par catégorie. */
function IconChoiceControl({
  field,
  value,
  invalid,
  onChange,
}: IconChoiceControlProps) {
  const options = field.options ?? []

  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={onChange}
      aria-label={field.label}
      aria-invalid={invalid}
      className={cn(
        'grid gap-2',
        options.length <= 4
          ? 'grid-cols-2 sm:grid-cols-4'
          : 'grid-cols-3 sm:grid-cols-5',
        invalid && 'ring-destructive/30 rounded-xl ring-2',
      )}
    >
      {options.map((option) => {
        const Icon = option.icon ? FIELD_ICONS[option.icon] : null

        return (
          <RadioGroupPrimitive.Item
            key={option.value}
            value={option.value}
            className={cn(
              'border-input hover:bg-muted/50 flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 transition-colors outline-none',
              'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
              'data-[state=checked]:border-primary data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary',
            )}
          >
            {Icon && <Icon className="h-5 w-5" strokeWidth={1.75} />}
            <span className="text-[11px] leading-none font-medium">
              {option.label}
            </span>
          </RadioGroupPrimitive.Item>
        )
      })}
    </RadioGroupPrimitive.Root>
  )
}

interface LinesControlProps {
  label: string
  items: string[]
  placeholder?: string
  onChange: (items: string[]) => void
}

/** Liste de phrases : une ligne numérotée par entrée, ajout au clavier. */
function LinesControl({
  label,
  items,
  placeholder,
  onChange,
}: LinesControlProps) {
  const container = useRef<HTMLDivElement>(null)

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
    focusRow(Math.max(0, index - 1))
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
      aria-label={label}
      className="flex flex-col gap-2"
    >
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="text-muted-foreground/60 font-display w-4 shrink-0 text-right text-[11px] tabular-nums">
            {index + 1}
          </span>
          <Input
            value={item}
            placeholder={placeholder}
            onChange={(event) => {
              const next = [...items]
              next[index] = event.target.value
              onChange(next)
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground/60 hover:text-destructive h-8 w-8 shrink-0"
            aria-label={`Supprimer la ligne ${index + 1}`}
            onClick={() => removeAt(index)}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit gap-1.5 text-xs"
        onClick={() => insertAt(items.length)}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        {items.length === 0 ? 'Ajouter une entrée' : 'Ajouter'}
      </Button>
    </div>
  )
}

interface ChipsControlProps {
  label: string
  items: string[]
  placeholder: string
  onChange: (items: string[]) => void
}

/** Mots-clés courts : validation à Entrée ou virgule, retrait au clic. */
function ChipsControl({
  label,
  items,
  placeholder,
  onChange,
}: ChipsControlProps) {
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
      aria-label={label}
      className="border-input focus-within:border-ring focus-within:ring-ring/50 dark:bg-input/30 flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 transition-[color,box-shadow] focus-within:ring-[3px]"
    >
      {items.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className="bg-secondary/15 text-foreground inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            aria-label={`Retirer ${tag}`}
            className="text-muted-foreground/70 hover:text-destructive rounded-full transition-colors"
          >
            <X className="h-3 w-3" strokeWidth={2} />
          </button>
        </span>
      ))}

      <input
        value={pending}
        placeholder={items.length === 0 ? placeholder : ''}
        onChange={(event) => {
          const raw = event.target.value
          if (raw.endsWith(',')) commit(raw)
          else setPending(raw)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit(pending)
            return
          }
          if (event.key === 'Backspace' && !pending && items.length > 0) {
            onChange(items.slice(0, -1))
          }
        }}
        onBlur={() => commit(pending)}
        className="placeholder:text-muted-foreground min-w-24 flex-1 bg-transparent text-base outline-none md:text-sm"
      />
    </div>
  )
}

interface RatingControlProps {
  label: string
  value: string
  onChange: (value: string) => void
}

/** Note sur 5, en étoiles cliquables. */
function RatingControl({ label, value, onChange }: RatingControlProps) {
  const parsed = Number(value)
  const rating = Number.isFinite(parsed) && value.trim() ? parsed : 0

  return (
    <div
      role="group"
      aria-label={label}
      className="flex h-9 items-center gap-0.5"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(rating === star ? '' : String(star))}
          aria-label={`Noter ${star} sur 5`}
          aria-pressed={star <= Math.round(rating)}
          className="rounded-md p-1 transition-transform hover:scale-110"
        >
          <Star
            className={cn(
              'h-5 w-5',
              star <= Math.round(rating)
                ? 'fill-amber-400 text-amber-400'
                : 'text-muted-foreground/30',
            )}
            strokeWidth={1.5}
          />
        </button>
      ))}

      {rating > 0 && (
        <span className="text-muted-foreground ml-1.5 text-xs tabular-nums">
          {value}/5
        </span>
      )}
    </div>
  )
}

interface PriceControlProps {
  id: string
  amount: string
  currency: string
  invalid: boolean
  onAmountChange: (value: string) => void
  onCurrencyChange: (value: string) => void
}

/** Montant et devise réunis dans un seul contrôle. */
function PriceControl({
  id,
  amount,
  currency,
  invalid,
  onAmountChange,
  onCurrencyChange,
}: PriceControlProps) {
  const listId = useId()

  return (
    <>
      <InputGroup>
        <InputGroupInput
          id={id}
          inputMode="decimal"
          value={amount}
          aria-invalid={invalid}
          placeholder="0"
          onChange={(event) => onAmountChange(event.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <input
            list={listId}
            value={currency}
            onChange={(event) =>
              onCurrencyChange(event.target.value.toUpperCase())
            }
            maxLength={4}
            aria-label="Devise"
            placeholder="EUR"
            className="text-muted-foreground placeholder:text-muted-foreground/60 w-12 bg-transparent text-right text-sm uppercase outline-none"
          />
        </InputGroupAddon>
      </InputGroup>
      <datalist id={listId}>
        {CURRENCY_SUGGESTIONS.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>
    </>
  )
}

interface CoordinatesControlProps {
  id: string
  label: string
  parts: string[]
  invalid: boolean
  onChange: (parts: string[]) => void
}

/** Latitude / longitude, avec collage direct d'un couple « lat, lng ». */
function CoordinatesControl({
  id,
  label,
  parts,
  invalid,
  onChange,
}: CoordinatesControlProps) {
  const [latitude = '', longitude = ''] = parts
  const mapUrl =
    latitude.trim() && longitude.trim()
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

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <InputGroup>
          <InputGroupAddon>
            <span className="text-[11px] tracking-wide uppercase">Lat</span>
          </InputGroupAddon>
          <InputGroupInput
            id={id}
            inputMode="decimal"
            value={latitude}
            aria-invalid={invalid}
            aria-label={`${label}, latitude`}
            placeholder="31.2304"
            onPaste={(event) => {
              if (handlePaste(event.clipboardData.getData('text'))) {
                event.preventDefault()
              }
            }}
            onChange={(event) => onChange([event.target.value, longitude])}
          />
        </InputGroup>
        <InputGroup>
          <InputGroupAddon>
            <span className="text-[11px] tracking-wide uppercase">Lng</span>
          </InputGroupAddon>
          <InputGroupInput
            inputMode="decimal"
            value={longitude}
            aria-invalid={invalid}
            aria-label={`${label}, longitude`}
            placeholder="121.4737"
            onPaste={(event) => {
              if (handlePaste(event.clipboardData.getData('text'))) {
                event.preventDefault()
              }
            }}
            onChange={(event) => onChange([latitude, event.target.value])}
          />
        </InputGroup>
      </div>

      {mapUrl && (
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:text-primary/80 inline-flex w-fit items-center gap-1 text-[11px] font-medium transition-colors hover:underline"
        >
          Vérifier sur la carte
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  )
}

interface TimeControlProps {
  id: string
  value: string
  invalid: boolean
  onChange: (value: string) => void
}

/**
 * Sélecteur d'heure natif quand la valeur s'y prête, saisie libre sinon :
 * une donnée importée comme « vers midi » ne doit pas être perdue.
 */
function TimeControl({ id, value, invalid, onChange }: TimeControlProps) {
  const [useNativePicker] = useState(() => /^(\d{1,2}:\d{2})?$/.test(value))

  return (
    <Input
      id={id}
      type={useNativePicker ? 'time' : 'text'}
      value={value}
      aria-invalid={invalid}
      placeholder="07:53"
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

interface SuggestionChipsProps {
  suggestions: readonly string[]
  value: string
  onPick: (value: string) => void
}

/** Valeurs fréquentes proposées en un tap, sans empêcher la saisie libre. */
function SuggestionChips({ suggestions, value, onPick }: SuggestionChipsProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {suggestions.map((suggestion) => {
        const isActive = value.trim() === suggestion

        return (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(isActive ? '' : suggestion)}
            className={cn(
              'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
              isActive
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/60 text-muted-foreground hover:bg-muted/60',
            )}
          >
            {suggestion}
          </button>
        )
      })}
    </div>
  )
}

function isOpenableUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim())
}

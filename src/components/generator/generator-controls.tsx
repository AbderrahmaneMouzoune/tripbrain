'use client'

import { useId } from 'react'
import { IconCalendarEvent, IconMinus, IconPlus } from '@tabler/icons-react'
import type { BadgeTone } from '@/components/mobile/icon-badge'
import { Chip } from '@/components/mobile/chip'
import { OptionCard } from '@/components/mobile/option-card'
import type { BriefOption } from '@/lib/generator/trip-brief'
import { todayIso } from '@/lib/generator/itinerary-quality'
import {
  MAX_DURATION_DAYS,
  MIN_DURATION_DAYS,
} from '@/lib/generator/requests'
import { cn } from '@/lib/utils'

/**
 * Contrôles partagés par le formulaire express et le questionnaire : date de
 * départ, durée, cartes radio illustrées et pastilles à choix multiple.
 */

/** Libellé de champ, 13 px gras, comme sur les maquettes. */
export function FieldLabel({
  htmlFor,
  id,
  children,
  className,
}: {
  htmlFor?: string
  id?: string
  children: React.ReactNode
  className?: string
}) {
  const classes = cn(
    'text-muted-foreground text-[13px] leading-[19px] font-extrabold',
    className,
  )
  return htmlFor ? (
    <label htmlFor={htmlFor} id={id} className={classes}>
      {children}
    </label>
  ) : (
    <span id={id} className={classes}>
      {children}
    </span>
  )
}

/**
 * Date de départ obligatoire. Le champ natif ouvre le calendrier du
 * téléphone, et `min` empêche d'y choisir un jour passé.
 */
export function StartDateField({
  value,
  onChange,
  describedBy,
}: {
  value: string
  onChange: (value: string) => void
  describedBy?: string
}) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <FieldLabel htmlFor={id}>Date de départ</FieldLabel>
        <span className="bg-secondary-soft text-secondary-strong rounded-full px-[7px] py-0.5 text-[10px] font-black tracking-[0.02em]">
          Obligatoire
        </span>
      </div>
      <div className="border-border-strong bg-card focus-within:border-primary focus-within:ring-ring/40 flex h-[52px] items-center gap-2.5 rounded-[14px] border px-3 focus-within:ring-[3px]">
        <IconCalendarEvent
          className="text-primary size-5 shrink-0"
          aria-hidden
        />
        <input
          id={id}
          type="date"
          required
          min={todayIso()}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={describedBy}
          className="text-foreground min-w-0 flex-1 bg-transparent text-[15px] font-extrabold outline-none"
        />
      </div>
    </div>
  )
}

/** Durée en jours, avec un − et un + de 44 px. */
export function DurationStepper({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  const labelId = useId()
  const set = (next: number) =>
    onChange(Math.min(MAX_DURATION_DAYS, Math.max(MIN_DURATION_DAYS, next)))
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <FieldLabel id={labelId}>Durée</FieldLabel>
      <div
        role="group"
        aria-labelledby={labelId}
        className="border-border-strong bg-card flex h-[52px] items-center justify-between rounded-[14px] border px-1"
      >
        <StepperButton
          label="Un jour de moins"
          disabled={value <= MIN_DURATION_DAYS}
          onClick={() => set(value - 1)}
        >
          <IconMinus />
        </StepperButton>
        <span aria-live="polite" className="text-[15px] font-black">
          {value} jour{value > 1 ? 's' : ''}
        </span>
        <StepperButton
          label="Un jour de plus"
          disabled={value >= MAX_DURATION_DAYS}
          onClick={() => set(value + 1)}
        >
          <IconPlus />
        </StepperButton>
      </div>
    </div>
  )
}

/** Compteur de voyageurs : « 2 adultes », avec − et +. */
export function CountStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  const labelId = useId()
  return (
    <div className="bg-card border-border flex items-center justify-between gap-3 rounded-2xl border py-1 pr-1 pl-4">
      <span id={labelId} className="text-[15px] font-extrabold">
        {label}
      </span>
      <div role="group" aria-labelledby={labelId} className="flex items-center gap-2">
        <StepperButton
          label={`${label} : un de moins`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <IconMinus />
        </StepperButton>
        <span aria-live="polite" className="w-6 text-center text-base font-black tabular-nums">
          {value}
        </span>
        <StepperButton
          label={`${label} : un de plus`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          <IconPlus />
        </StepperButton>
      </div>
    </div>
  )
}

function StepperButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="pressable bg-primary-soft text-primary-strong focus-visible:ring-ring/50 flex size-11 items-center justify-center rounded-xl outline-none focus-visible:ring-[3px] disabled:opacity-40 [&_svg]:size-5"
    >
      {children}
    </button>
  )
}

/** Teintes des pastilles d'icône, dans l'ordre des options. */
const TONES: BadgeTone[] = ['accent', 'primary', 'secondary', 'success']

/**
 * Choix exclusif en grandes cartes illustrées. Retoucher l'option choisie la
 * désélectionne : toutes les questions sont facultatives.
 */
export function RadioCards({
  label,
  labelledBy,
  options,
  value,
  onChange,
  badges = {},
}: {
  /** Nom accessible du groupe, quand aucun titre visible ne le porte. */
  label?: string
  labelledBy?: string
  options: readonly BriefOption[]
  value: string
  onChange: (value: string) => void
  /** Pastille sous une option, par identifiant (« Conseillé »). */
  badges?: Record<string, string>
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      className="flex flex-col gap-2.5"
    >
      {options.map((option, index) => {
        const selected = option.id === value
        return (
          <OptionCard
            key={option.id}
            role="radio"
            selected={selected}
            icon={option.icon}
            tone={TONES[index % TONES.length]}
            title={option.label}
            description={option.hint}
            badge={badges[option.id]}
            onClick={() => onChange(selected ? '' : option.id)}
            className="py-3.5"
            trailing={<RadioRing checked={selected} />}
          />
        )
      })}
    </div>
  )
}

function RadioRing({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-card size-6 shrink-0 rounded-full border-2',
        checked ? 'border-primary border-[7px]' : 'border-border-strong',
      )}
    />
  )
}

/** Pastilles à choix multiple (ou unique avec `single`), illustrées. */
export function ChipGroup({
  label,
  options,
  values,
  onChange,
  single,
  icon: GroupIcon,
}: {
  label: string
  options: readonly BriefOption[]
  values: readonly string[]
  onChange: (values: string[]) => void
  single?: boolean
  icon?: React.ComponentType<{ className?: string }>
}) {
  const labelId = useId()
  return (
    <div className="flex flex-col gap-2">
      <span
        id={labelId}
        className="text-muted-foreground flex items-center gap-1.5 text-[13px] font-extrabold"
      >
        {GroupIcon && <GroupIcon className="size-4" aria-hidden />}
        {label}
      </span>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const pressed = values.includes(option.id)
          return (
            <Chip
              key={option.id}
              pressed={pressed}
              icon={option.icon}
              onClick={() => {
                if (single) onChange(pressed ? [] : [option.id])
                else
                  onChange(
                    pressed
                      ? values.filter((id) => id !== option.id)
                      : [...values, option.id],
                  )
              }}
            >
              {option.label}
            </Chip>
          )
        })}
      </div>
    </div>
  )
}

/** Zone de texte libre du questionnaire. */
export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  maxLength = 300,
  rows = 2,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  rows?: number
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="border-border-strong bg-card text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-ring/40 w-full resize-none rounded-[14px] border px-3.5 py-3 text-[15px] leading-[1.45] font-bold outline-none focus:ring-[3px]"
      />
    </div>
  )
}

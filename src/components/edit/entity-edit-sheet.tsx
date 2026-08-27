'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { cn } from '@/lib/utils'
import type { EditField } from '@/lib/edit-fields'
import {
  fromDraft,
  toDraft,
  validateDraft,
  type EntityDraft,
} from '@/lib/entity-draft'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Plus, Trash2 } from 'lucide-react'

interface EntityEditSheetProps<T extends object> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  fields: readonly EditField[]
  /** Entité éditée — sert de base au brouillon à chaque ouverture */
  value: T
  onSubmit: (value: T) => void
  /** Affiche un bouton de suppression (avec confirmation) dans le pied */
  onDelete?: () => void
  deleteLabel?: string
}

export function EntityEditSheet<T extends object>({
  open,
  onOpenChange,
  title,
  description,
  fields,
  value,
  onSubmit,
  onDelete,
  deleteLabel = 'Supprimer',
}: EntityEditSheetProps<T>) {
  const [draft, setDraft] = useState<EntityDraft>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (!open) return

    setDraft(toDraft(value, fields))
    setErrors({})
    setConfirmingDelete(false)
  }, [open, value, fields])

  const setFieldValue = (key: string, next: EntityDraft[string]) => {
    setDraft((current) => ({ ...current, [key]: next }))
    setErrors((current) => {
      if (!current[key]) return current
      const { [key]: _cleared, ...rest } = current
      return rest
    })
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()

    const nextErrors = validateDraft(fields, draft)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    onSubmit(fromDraft(value, fields, draft))
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92svh] gap-0 rounded-t-2xl p-0 sm:max-w-2xl"
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
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto px-4 py-4 sm:grid-cols-2">
            {fields.map((field) => (
              <div
                key={field.key}
                className={cn(
                  'flex flex-col gap-1.5',
                  !field.half && 'sm:col-span-2',
                )}
              >
                <Label htmlFor={`field-${field.key}`} className="text-xs">
                  {field.label}
                  {field.required && (
                    <span className="text-destructive" aria-hidden>
                      *
                    </span>
                  )}
                </Label>

                <EditFieldControl
                  field={field}
                  value={draft[field.key]}
                  invalid={Boolean(errors[field.key])}
                  onChange={(next) => setFieldValue(field.key, next)}
                />

                {errors[field.key] ? (
                  <p className="text-destructive text-[11px]">
                    {errors[field.key]}
                  </p>
                ) : (
                  field.hint && (
                    <p className="text-muted-foreground text-[11px]">
                      {field.hint}
                    </p>
                  )
                )}
              </div>
            ))}
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
                {confirmingDelete ? 'Confirmer' : deleteLabel}
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

interface EditFieldControlProps {
  field: EditField
  value: EntityDraft[string] | undefined
  invalid: boolean
  onChange: (value: EntityDraft[string]) => void
}

function EditFieldControl({
  field,
  value,
  invalid,
  onChange,
}: EditFieldControlProps) {
  const id = `field-${field.key}`
  const text = typeof value === 'string' ? value : ''

  switch (field.type) {
    case 'textarea':
      return (
        <Textarea
          id={id}
          value={text}
          aria-invalid={invalid}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-20"
        />
      )

    case 'switch':
      return (
        <div className="border-input flex h-9 items-center gap-2 rounded-md border px-3">
          <Switch
            id={id}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked)}
          />
          <span className="text-muted-foreground text-xs">
            {value === true ? 'Oui' : 'Non'}
          </span>
        </div>
      )

    case 'select':
      return (
        <Select
          value={text || undefined}
          onValueChange={(next) => onChange(next)}
        >
          <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
            <SelectValue placeholder="Choisir…" />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    case 'list':
      return (
        <StringListControl
          id={id}
          items={Array.isArray(value) ? value : []}
          placeholder={field.placeholder}
          onChange={onChange}
        />
      )

    case 'coordinates': {
      const parts = Array.isArray(value) ? value : ['', '']
      return (
        <div className="flex gap-2">
          <Input
            id={id}
            value={parts[0] ?? ''}
            inputMode="decimal"
            aria-invalid={invalid}
            aria-label={`${field.label} — latitude`}
            placeholder="Latitude"
            onChange={(event) => onChange([event.target.value, parts[1] ?? ''])}
          />
          <Input
            value={parts[1] ?? ''}
            inputMode="decimal"
            aria-invalid={invalid}
            aria-label={`${field.label} — longitude`}
            placeholder="Longitude"
            onChange={(event) => onChange([parts[0] ?? '', event.target.value])}
          />
        </div>
      )
    }

    default:
      return (
        <Input
          id={id}
          type={field.type === 'date' ? 'date' : 'text'}
          inputMode={field.type === 'number' ? 'decimal' : undefined}
          value={text}
          aria-invalid={invalid}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )
  }
}

interface StringListControlProps {
  id: string
  items: string[]
  placeholder?: string
  onChange: (items: string[]) => void
}

function StringListControl({
  id,
  items,
  placeholder,
  onChange,
}: StringListControlProps) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => (
        <div key={index} className="flex gap-2">
          <Input
            id={index === 0 ? id : undefined}
            value={item}
            placeholder={placeholder}
            onChange={(event) => {
              const next = [...items]
              next[index] = event.target.value
              onChange(next)
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive shrink-0"
            aria-label={`Supprimer la ligne ${index + 1}`}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit gap-1.5"
        onClick={() => onChange([...items, ''])}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Ajouter
      </Button>
    </div>
  )
}

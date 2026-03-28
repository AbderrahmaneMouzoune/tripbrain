'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  formatDate,
  getDayStatus,
  type DayItinerary,
  type Activity,
  type Accommodation,
} from '@/lib/itinerary-data'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  MapPin,
  Hotel,
  Train,
  Car,
  Plane,
  Camera,
  Utensils,
  ShoppingBag,
  Sparkles,
  ExternalLink,
  Clock,
  Navigation,
  Star,
  Footprints,
  StickyNote,
  Backpack,
  Lightbulb,
  Tag,
  Pencil,
  Check,
  X,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Copy,
  History,
} from 'lucide-react'
import type { VersionEntry } from '@/hooks/use-itinerary-editor'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditableDayDetailProps {
  day: DayItinerary
  dayIndex: number
  isEditMode: boolean
  onSaveField: (
    fieldKey: string,
    previousValue: unknown,
    updatedDay: DayItinerary,
  ) => Promise<void>
  getVersionHistory: (fieldKey: string) => VersionEntry[]
  onRestoreVersion: (
    fieldKey: string,
    versionIndex: number,
    currentValue: unknown,
    applyFn: (day: DayItinerary, restored: unknown) => DayItinerary,
  ) => Promise<void>
}

// ─── Helper icons ─────────────────────────────────────────────────────────────

function getActivityIcon(type: string) {
  switch (type) {
    case 'visit':
      return Camera
    case 'transport':
      return Train
    case 'food':
      return Utensils
    case 'shopping':
      return ShoppingBag
    case 'experience':
      return Sparkles
    default:
      return MapPin
  }
}

function getTransportIcon(type: string) {
  switch (type) {
    case 'train':
      return Train
    case 'car':
      return Car
    case 'plane':
      return Plane
    default:
      return Train
  }
}

// ─── DirtyDot ─────────────────────────────────────────────────────────────────

function DirtyDot() {
  return (
    <span
      className="bg-amber-400 inline-block h-2 w-2 animate-pulse rounded-full"
      title="Modification en cours"
      aria-label="Modification non validée"
    />
  )
}

// ─── VersionHistoryPopover ────────────────────────────────────────────────────

interface VersionHistoryProps {
  versions: VersionEntry[]
  onRestore: (index: number) => void
  renderValue: (value: unknown) => string
}

function VersionHistoryPopover({
  versions,
  onRestore,
  renderValue,
}: VersionHistoryProps) {
  if (versions.length === 0) return null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground h-6 w-6 shrink-0"
          title="Historique des versions"
          aria-label="Voir l'historique des versions"
        >
          <History className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <p className="text-muted-foreground mb-2 px-1 text-[11px] font-semibold tracking-widest uppercase">
          Historique ({versions.length})
        </p>
        <ul className="flex flex-col gap-1">
          {versions.map((v, i) => (
            <li
              key={i}
              className="hover:bg-muted flex items-center gap-2 rounded-md px-2 py-1.5"
            >
              <span className="text-foreground min-w-0 flex-1 truncate text-xs">
                {renderValue(v.value)}
              </span>
              <span className="text-muted-foreground shrink-0 text-[10px]">
                {new Date(v.timestamp).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 px-2 text-[11px]"
                onClick={() => onRestore(i)}
              >
                Restaurer
              </Button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

// ─── EditableTextField ────────────────────────────────────────────────────────

interface EditableTextFieldProps {
  value: string
  fieldKey: string
  label: string
  multiline?: boolean
  isEditMode: boolean
  versions: VersionEntry[]
  onSave: (newValue: string) => Promise<void>
  onRestore: (index: number) => void
  children: React.ReactNode // read-only render
  className?: string
}

function EditableTextField({
  value,
  fieldKey: _fieldKey,
  label,
  multiline = false,
  isEditMode,
  versions,
  onSave,
  onRestore,
  children,
  className,
}: EditableTextFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [pendingValue, setPendingValue] = useState(value)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const startEdit = () => {
    setPendingValue(value)
    setIsDirty(false)
    setIsEditing(true)
  }

  const handleChange = (v: string) => {
    setPendingValue(v)
    setIsDirty(v !== value)
  }

  const handleValidate = async () => {
    if (!isDirty) {
      setIsEditing(false)
      return
    }
    setIsSaving(true)
    try {
      await onSave(pendingValue)
      setIsEditing(false)
      setIsDirty(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setPendingValue(value)
    setIsDirty(false)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className={cn('animate-fade-up flex flex-col gap-2', className)}>
        <div className="flex items-center gap-1.5">
          {isDirty && <DirtyDot />}
          <span className="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">
            {label}
          </span>
        </div>
        {multiline ? (
          <textarea
            className="border-border bg-background focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm leading-relaxed focus:ring-2 focus:outline-none"
            rows={4}
            value={pendingValue}
            onChange={(e) => handleChange(e.target.value)}
            autoFocus
          />
        ) : (
          <input
            type="text"
            className="border-border bg-background focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            value={pendingValue}
            onChange={(e) => handleChange(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleValidate()
              if (e.key === 'Escape') handleCancel()
            }}
          />
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-7 gap-1 px-3 text-xs"
            onClick={handleValidate}
            disabled={isSaving}
          >
            <Check className="h-3 w-3" />
            Valider
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-3 text-xs"
            onClick={handleCancel}
            disabled={isSaving}
          >
            <X className="h-3 w-3" />
            Annuler
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('group/field relative', className)}>
      {isEditMode && (
        <div className="absolute top-0 right-0 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover/field:opacity-100">
          <VersionHistoryPopover
            versions={versions}
            onRestore={onRestore}
            renderValue={(v) => String(v)}
          />
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground h-6 w-6"
            onClick={startEdit}
            aria-label={`Modifier ${label}`}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      )}
      {children}
    </div>
  )
}

// ─── EditableStringList ───────────────────────────────────────────────────────

interface EditableStringListProps {
  items: string[]
  fieldKey: string
  isEditMode: boolean
  versions: VersionEntry[]
  onSave: (newItems: string[]) => Promise<void>
  onRestore: (index: number) => void
  renderList: (items: string[]) => React.ReactNode
  addLabel?: string
  itemLabel?: string
}

function EditableStringList({
  items,
  fieldKey: _fieldKey,
  isEditMode,
  versions,
  onSave,
  onRestore,
  renderList,
  addLabel = 'Ajouter',
  itemLabel = 'élément',
}: EditableStringListProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [pendingItems, setPendingItems] = useState<string[]>(items)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const startEdit = () => {
    setPendingItems([...items])
    setIsEditing(true)
    setEditingIndex(null)
  }

  const startItemEdit = (i: number) => {
    setEditingIndex(i)
    setEditingValue(pendingItems[i])
  }

  const commitItemEdit = () => {
    if (editingIndex === null) return
    const updated = [...pendingItems]
    updated[editingIndex] = editingValue
    setPendingItems(updated)
    setEditingIndex(null)
    setEditingValue('')
  }

  const addItem = () => {
    const updated = [...pendingItems, '']
    setPendingItems(updated)
    setEditingIndex(updated.length - 1)
    setEditingValue('')
  }

  const removeItem = (i: number) => {
    setPendingItems(pendingItems.filter((_, idx) => idx !== i))
    if (editingIndex === i) setEditingIndex(null)
  }

  const moveItem = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= pendingItems.length) return
    const updated = [...pendingItems]
    ;[updated[i], updated[j]] = [updated[j], updated[i]]
    setPendingItems(updated)
    if (editingIndex === i) setEditingIndex(j)
    else if (editingIndex === j) setEditingIndex(i)
  }

  const duplicateItem = (i: number) => {
    const updated = [...pendingItems]
    updated.splice(i + 1, 0, pendingItems[i])
    setPendingItems(updated)
  }

  const handleValidate = async () => {
    if (editingIndex !== null) commitItemEdit()
    setIsSaving(true)
    try {
      await onSave(pendingItems)
      setIsEditing(false)
      setEditingIndex(null)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setPendingItems([...items])
    setIsEditing(false)
    setEditingIndex(null)
  }

  const isDirty = JSON.stringify(pendingItems) !== JSON.stringify(items)

  if (!isEditMode) return <>{renderList(items)}</>

  if (!isEditing) {
    return (
      <div className="group/list relative">
        <div className="absolute top-0 right-0 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover/list:opacity-100">
          <VersionHistoryPopover
            versions={versions}
            onRestore={onRestore}
            renderValue={(v) =>
              Array.isArray(v) ? `${(v as string[]).length} élément(s)` : String(v)
            }
          />
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground h-6 w-6"
            onClick={startEdit}
            aria-label={`Modifier la liste`}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
        {renderList(items)}
      </div>
    )
  }

  return (
    <div className="animate-fade-up flex flex-col gap-2">
      {isDirty && (
        <div className="flex items-center gap-1.5">
          <DirtyDot />
          <span className="text-amber-600 text-[10px] font-semibold">
            Modifications en attente
          </span>
        </div>
      )}
      <ul className="flex flex-col gap-1.5">
        {pendingItems.map((item, i) => (
          <li
            key={i}
            className="border-border bg-background flex items-center gap-1.5 rounded-lg border px-2 py-1.5"
          >
            {editingIndex === i ? (
              <input
                type="text"
                className="bg-transparent min-w-0 flex-1 text-sm focus:outline-none"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={commitItemEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitItemEdit()
                  if (e.key === 'Escape') setEditingIndex(null)
                }}
                autoFocus
                placeholder={`Nouveau ${itemLabel}`}
              />
            ) : (
              <span
                className="min-w-0 flex-1 cursor-pointer text-sm"
                onClick={() => startItemEdit(i)}
                title="Cliquer pour modifier"
              >
                {item || (
                  <span className="text-muted-foreground italic">
                    (vide — cliquer pour modifier)
                  </span>
                )}
              </span>
            )}
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground h-6 w-6"
                onClick={() => moveItem(i, -1)}
                disabled={i === 0}
                aria-label="Remonter"
              >
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground h-6 w-6"
                onClick={() => moveItem(i, 1)}
                disabled={i === pendingItems.length - 1}
                aria-label="Descendre"
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground h-6 w-6"
                onClick={() => duplicateItem(i)}
                aria-label="Dupliquer"
              >
                <Copy className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive h-6 w-6"
                onClick={() => removeItem(i)}
                aria-label="Supprimer"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1 self-start px-3 text-xs"
        onClick={addItem}
      >
        <Plus className="h-3 w-3" />
        {addLabel}
      </Button>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-7 gap-1 px-3 text-xs"
          onClick={handleValidate}
          disabled={isSaving}
        >
          <Check className="h-3 w-3" />
          Valider
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-3 text-xs"
          onClick={handleCancel}
          disabled={isSaving}
        >
          <X className="h-3 w-3" />
          Annuler
        </Button>
      </div>
    </div>
  )
}

// ─── EditableActivity ─────────────────────────────────────────────────────────

const ACTIVITY_TYPES: Activity['type'][] = [
  'visit',
  'transport',
  'food',
  'experience',
  'shopping',
]

const ACTIVITY_TYPE_LABELS: Record<Activity['type'], string> = {
  visit: 'Visite',
  transport: 'Transport',
  food: 'Restauration',
  experience: 'Expérience',
  shopping: 'Shopping',
}

interface EditableActivityListProps {
  activities: Activity[]
  fieldKey: string
  isEditMode: boolean
  versions: VersionEntry[]
  onSave: (activities: Activity[]) => Promise<void>
  onRestore: (index: number) => void
}

function EditableActivityList({
  activities,
  fieldKey: _fieldKey,
  isEditMode,
  versions,
  onSave,
  onRestore,
}: EditableActivityListProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [pendingItems, setPendingItems] = useState<Activity[]>(activities)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const startEdit = () => {
    setPendingItems(activities.map((a) => ({ ...a })))
    setIsEditing(true)
    setEditingIndex(null)
  }

  const updateItem = (i: number, partial: Partial<Activity>) => {
    setPendingItems((prev) =>
      prev.map((a, idx) => (idx === i ? { ...a, ...partial } : a)),
    )
  }

  const addItem = () => {
    const newActivity: Activity = { name: '', type: 'visit' }
    setPendingItems((prev) => [...prev, newActivity])
    setEditingIndex(pendingItems.length)
  }

  const removeItem = (i: number) => {
    setPendingItems((prev) => prev.filter((_, idx) => idx !== i))
    if (editingIndex === i) setEditingIndex(null)
  }

  const moveItem = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= pendingItems.length) return
    const updated = [...pendingItems]
    ;[updated[i], updated[j]] = [updated[j], updated[i]]
    setPendingItems(updated)
    if (editingIndex === i) setEditingIndex(j)
    else if (editingIndex === j) setEditingIndex(i)
  }

  const duplicateItem = (i: number) => {
    const updated = [...pendingItems]
    updated.splice(i + 1, 0, { ...pendingItems[i] })
    setPendingItems(updated)
  }

  const handleValidate = async () => {
    setIsSaving(true)
    try {
      await onSave(pendingItems)
      setIsEditing(false)
      setEditingIndex(null)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setPendingItems(activities.map((a) => ({ ...a })))
    setIsEditing(false)
    setEditingIndex(null)
  }

  const isDirty =
    JSON.stringify(pendingItems) !== JSON.stringify(activities)

  const renderReadOnly = (acts: Activity[]) => (
    <div className="divide-border/40 flex flex-col divide-y">
      {acts.map((activity, index) => {
        const Icon = getActivityIcon(activity.type)
        return (
          <div key={index} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <div className="bg-primary/10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
              <Icon className="text-primary h-3.5 w-3.5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1 leading-none">
              <div className="flex items-start justify-between gap-2">
                <p className="text-foreground text-sm leading-snug font-semibold">
                  {activity.name}
                </p>
                {activity.coordinates && (
                  <a
                    href={`https://www.google.com/maps?q=${activity.coordinates[0]},${activity.coordinates[1]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground/50 hover:text-primary mt-0.5 shrink-0 pt-1.5 pr-1.5 transition-colors"
                  >
                    <Navigation className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </a>
                )}
              </div>
              {activity.description && (
                <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                  {activity.description}
                </p>
              )}
              {activity.duration && (
                <div className="text-muted-foreground/70 mt-1 flex items-center gap-1 text-[11px]">
                  <Clock className="h-3 w-3" strokeWidth={1.75} />
                  <span>{activity.duration}</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  if (!isEditMode) return renderReadOnly(activities)

  if (!isEditing) {
    return (
      <div className="group/activities relative">
        <div className="absolute top-0 right-0 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover/activities:opacity-100">
          <VersionHistoryPopover
            versions={versions}
            onRestore={onRestore}
            renderValue={(v) =>
              Array.isArray(v)
                ? `${(v as Activity[]).length} activité(s)`
                : String(v)
            }
          />
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground h-6 w-6"
            onClick={startEdit}
            aria-label="Modifier les activités"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
        {renderReadOnly(activities)}
      </div>
    )
  }

  return (
    <div className="animate-fade-up flex flex-col gap-2">
      {isDirty && (
        <div className="flex items-center gap-1.5">
          <DirtyDot />
          <span className="text-amber-600 text-[10px] font-semibold">
            Modifications en attente
          </span>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {pendingItems.map((activity, i) => (
          <div
            key={i}
            className="border-border bg-background rounded-lg border p-3"
          >
            <div className="mb-2 flex items-center gap-1.5">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground flex-1 text-left text-xs font-semibold"
                onClick={() =>
                  setEditingIndex(editingIndex === i ? null : i)
                }
              >
                {activity.name || (
                  <span className="italic">Nouvelle activité</span>
                )}
              </button>
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground h-6 w-6"
                  onClick={() => moveItem(i, -1)}
                  disabled={i === 0}
                  aria-label="Remonter"
                >
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground h-6 w-6"
                  onClick={() => moveItem(i, 1)}
                  disabled={i === pendingItems.length - 1}
                  aria-label="Descendre"
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground h-6 w-6"
                  onClick={() => duplicateItem(i)}
                  aria-label="Dupliquer"
                >
                  <Copy className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive h-6 w-6"
                  onClick={() => removeItem(i)}
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {editingIndex === i && (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Nom de l'activité"
                  className="border-border bg-muted/40 w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
                  value={activity.name}
                  onChange={(e) => updateItem(i, { name: e.target.value })}
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="Description (optionnel)"
                  className="border-border bg-muted/40 w-full rounded-md border px-2 py-1.5 text-xs focus:outline-none"
                  value={activity.description ?? ''}
                  onChange={(e) =>
                    updateItem(i, { description: e.target.value || undefined })
                  }
                />
                <div className="flex gap-2">
                  <select
                    className="border-border bg-muted/40 flex-1 rounded-md border px-2 py-1.5 text-xs focus:outline-none"
                    value={activity.type}
                    onChange={(e) =>
                      updateItem(i, {
                        type: e.target.value as Activity['type'],
                      })
                    }
                  >
                    {ACTIVITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ACTIVITY_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Durée (ex: 2h)"
                    className="border-border bg-muted/40 w-28 rounded-md border px-2 py-1.5 text-xs focus:outline-none"
                    value={activity.duration ?? ''}
                    onChange={(e) =>
                      updateItem(i, {
                        duration: e.target.value || undefined,
                      })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1 self-start px-3 text-xs"
        onClick={addItem}
      >
        <Plus className="h-3 w-3" />
        Ajouter une activité
      </Button>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-7 gap-1 px-3 text-xs"
          onClick={handleValidate}
          disabled={isSaving}
        >
          <Check className="h-3 w-3" />
          Valider
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-3 text-xs"
          onClick={handleCancel}
          disabled={isSaving}
        >
          <X className="h-3 w-3" />
          Annuler
        </Button>
      </div>
    </div>
  )
}

// ─── EditableAccommodation ────────────────────────────────────────────────────

interface EditableAccommodationProps {
  accommodation: Accommodation | undefined
  fieldKey: string
  isEditMode: boolean
  versions: VersionEntry[]
  onSave: (acc: Accommodation | undefined) => Promise<void>
  onRestore: (index: number) => void
  renderReadOnly: () => React.ReactNode
}

const EMPTY_ACCOMMODATION: Accommodation = {
  name: '',
  address: '',
  bookingUrl: '',
  checkIn: '',
  checkOut: '',
}

function EditableAccommodation({
  accommodation,
  fieldKey: _fieldKey,
  isEditMode,
  versions,
  onSave,
  onRestore,
  renderReadOnly,
}: EditableAccommodationProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [pending, setPending] = useState<Accommodation>(
    accommodation ?? EMPTY_ACCOMMODATION,
  )
  const [isSaving, setIsSaving] = useState(false)

  const startEdit = () => {
    setPending(accommodation ? { ...accommodation } : { ...EMPTY_ACCOMMODATION })
    setIsEditing(true)
  }

  const handleValidate = async () => {
    setIsSaving(true)
    try {
      const value =
        pending.name.trim() === '' && pending.address.trim() === ''
          ? undefined
          : pending
      await onSave(value)
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setPending(accommodation ? { ...accommodation } : { ...EMPTY_ACCOMMODATION })
    setIsEditing(false)
  }

  const isDirty =
    JSON.stringify(pending) !== JSON.stringify(accommodation ?? EMPTY_ACCOMMODATION)

  if (!isEditMode) return <>{renderReadOnly()}</>

  if (!isEditing) {
    return (
      <div className="group/accommodation relative">
        <div className="absolute top-0 right-0 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover/accommodation:opacity-100">
          <VersionHistoryPopover
            versions={versions}
            onRestore={onRestore}
            renderValue={(v) => {
              const a = v as Accommodation | undefined
              return a ? a.name || '(sans nom)' : '(aucun hébergement)'
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground h-6 w-6"
            onClick={startEdit}
            aria-label="Modifier l'hébergement"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
        {accommodation ? renderReadOnly() : (
          <button
            type="button"
            onClick={startEdit}
            className="text-muted-foreground border-border hover:bg-muted/40 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-4 text-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            Ajouter un hébergement
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="animate-fade-up border-border bg-card/80 flex flex-col gap-3 rounded-xl border p-4">
      {isDirty && (
        <div className="flex items-center gap-1.5">
          <DirtyDot />
          <span className="text-amber-600 text-[10px] font-semibold">
            Modifications en attente
          </span>
        </div>
      )}
      <p className="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">
        Hébergement
      </p>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          placeholder="Nom de l'hébergement"
          className="border-border bg-background w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none"
          value={pending.name}
          onChange={(e) => setPending({ ...pending, name: e.target.value })}
          autoFocus
        />
        <input
          type="text"
          placeholder="Adresse"
          className="border-border bg-background w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none"
          value={pending.address}
          onChange={(e) => setPending({ ...pending, address: e.target.value })}
        />
        <input
          type="text"
          placeholder="URL de réservation"
          className="border-border bg-background w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none"
          value={pending.bookingUrl}
          onChange={(e) =>
            setPending({ ...pending, bookingUrl: e.target.value })
          }
        />
        <div className="flex gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-muted-foreground text-[10px] font-semibold uppercase">
              Check-in
            </label>
            <input
              type="text"
              placeholder="ex: 14h00"
              className="border-border bg-background w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none"
              value={pending.checkIn}
              onChange={(e) =>
                setPending({ ...pending, checkIn: e.target.value })
              }
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-muted-foreground text-[10px] font-semibold uppercase">
              Check-out
            </label>
            <input
              type="text"
              placeholder="ex: 11h00"
              className="border-border bg-background w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none"
              value={pending.checkOut}
              onChange={(e) =>
                setPending({ ...pending, checkOut: e.target.value })
              }
            />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-7 gap-1 px-3 text-xs"
          onClick={handleValidate}
          disabled={isSaving}
        >
          <Check className="h-3 w-3" />
          Valider
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-3 text-xs"
          onClick={handleCancel}
          disabled={isSaving}
        >
          <X className="h-3 w-3" />
          Annuler
        </Button>
        {accommodation && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive ml-auto h-7 gap-1 px-3 text-xs"
            onClick={async () => {
              setIsSaving(true)
              try {
                await onSave(undefined)
                setIsEditing(false)
              } finally {
                setIsSaving(false)
              }
            }}
            disabled={isSaving}
          >
            <Trash2 className="h-3 w-3" />
            Supprimer
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Main EditableDayDetail ───────────────────────────────────────────────────

export function EditableDayDetail({
  day,
  dayIndex,
  isEditMode,
  onSaveField,
  getVersionHistory,
  onRestoreVersion,
}: EditableDayDetailProps) {
  const status = getDayStatus(day.date)

  // Helpers for saving specific fields
  const saveTitle = useCallback(
    async (newTitle: string) => {
      await onSaveField('title', day.title, { ...day, title: newTitle })
    },
    [day, onSaveField],
  )

  const saveNotes = useCallback(
    async (newNotes: string) => {
      await onSaveField('notes', day.notes ?? '', {
        ...day,
        notes: newNotes || undefined,
      })
    },
    [day, onSaveField],
  )

  const saveHighlights = useCallback(
    async (items: string[]) => {
      await onSaveField('highlights', day.highlights ?? [], {
        ...day,
        highlights: items.length > 0 ? items : undefined,
      })
    },
    [day, onSaveField],
  )

  const saveActivities = useCallback(
    async (activities: Activity[]) => {
      await onSaveField('activities', day.activities, {
        ...day,
        activities,
      })
    },
    [day, onSaveField],
  )

  const saveAccommodation = useCallback(
    async (acc: Accommodation | undefined) => {
      await onSaveField('accommodation', day.accommodation, {
        ...day,
        accommodation: acc,
      })
    },
    [day, onSaveField],
  )

  const saveFoodRecommendations = useCallback(
    async (items: string[]) => {
      await onSaveField(
        'foodRecommendations',
        day.foodRecommendations ?? [],
        {
          ...day,
          foodRecommendations: items.length > 0 ? items : undefined,
        },
      )
    },
    [day, onSaveField],
  )

  const saveTips = useCallback(
    async (items: string[]) => {
      await onSaveField('tips', day.tips ?? [], {
        ...day,
        tips: items.length > 0 ? items : undefined,
      })
    },
    [day, onSaveField],
  )

  const savePackingTips = useCallback(
    async (items: string[]) => {
      await onSaveField('packingTips', day.packingTips ?? [], {
        ...day,
        packingTips: items.length > 0 ? items : undefined,
      })
    },
    [day, onSaveField],
  )

  // Restore helpers
  const restoreField = useCallback(
    (
      fieldKey: string,
      versionIndex: number,
      currentValue: unknown,
      applyFn: (d: DayItinerary, v: unknown) => DayItinerary,
    ) => {
      return onRestoreVersion(fieldKey, versionIndex, currentValue, applyFn)
    },
    [onRestoreVersion],
  )

  // Accommodation read-only render (used by EditableAccommodation)
  const renderAccommodationReadOnly = useCallback(() => {
    const acc = day.accommodation
    if (!acc) return null
    const images = acc.images ?? []
    return (
      <div className="flex items-stretch gap-3 px-3">
        {images.length > 0 && (
          <div className="aspect-square w-28 shrink-0 overflow-hidden rounded-xl">
            <img
              src={images[0]}
              alt={`${acc.name} – photo 1`}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-3 leading-none">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            <Hotel className="text-secondary h-3 w-3" strokeWidth={1.75} />
            Hébergement
          </p>
          <div className="flex items-start justify-between gap-2">
            <p className="text-foreground text-sm leading-snug font-semibold">
              {acc.name}
            </p>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(acc.name + ' ' + acc.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/50 hover:text-primary mt-0.5 shrink-0 pr-1.5 transition-colors"
            >
              <Navigation className="h-3.5 w-3.5" strokeWidth={1.5} />
            </a>
          </div>
          <p className="text-muted-foreground text-xs">{acc.address}</p>
          {acc.bookingUrl && (
            <a
              href={acc.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 mt-0.5 inline-flex items-center gap-1 text-xs font-medium transition-colors hover:underline"
            >
              Voir la réservation
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    )
  }, [day.accommodation])

  return (
    <div className="animate-fade-up flex flex-col gap-5">
      {/* Header */}
      <div className="border-border/60 flex flex-col gap-1.5 border-b pb-4">
        <div className="space-x-1.5">
          {day.dayType && (
            <Badge variant="outline" className="gap-1 font-medium capitalize">
              <Tag className="h-3 w-3" strokeWidth={1.75} />
              {day.dayType}
            </Badge>
          )}
          {day.walkingDistance && (
            <Badge variant="outline" className="gap-1 font-medium">
              <Footprints className="h-3 w-3" strokeWidth={1.75} />
              {day.walkingDistance}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-semibold tracking-wider uppercase',
              status === 'current'
                ? 'bg-primary text-primary-foreground'
                : status === 'past'
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-secondary/20 text-secondary border-secondary/30 border',
            )}
          >
            Jour {day.dayNumber}
          </span>
          <span className="text-muted-foreground text-xs tracking-widest uppercase">
            {formatDate(day.date)}
          </span>
        </div>

        {/* Editable title */}
        <EditableTextField
          value={day.title}
          fieldKey="title"
          label="Titre du jour"
          isEditMode={isEditMode}
          versions={getVersionHistory('title')}
          onSave={saveTitle}
          onRestore={(i) =>
            restoreField('title', i, day.title, (d, v) => ({
              ...d,
              title: v as string,
            }))
          }
        >
          <h2 className="text-foreground font-display text-2xl leading-tight font-bold tracking-[0.03em]">
            {day.title}
          </h2>
        </EditableTextField>

        <div className="text-muted-foreground flex items-center gap-1.5">
          <MapPin className="text-secondary h-3.5 w-3.5" />
          <span className="text-sm font-medium">{day.city}</span>
        </div>
      </div>

      {/* Notes */}
      {(day.notes || isEditMode) && (
        <EditableTextField
          value={day.notes ?? ''}
          fieldKey="notes"
          label="Note"
          multiline
          isEditMode={isEditMode}
          versions={getVersionHistory('notes')}
          onSave={saveNotes}
          onRestore={(i) =>
            restoreField('notes', i, day.notes ?? '', (d, v) => ({
              ...d,
              notes: v as string || undefined,
            }))
          }
          className="border-border/60 border-l pl-3"
        >
          <div>
            <p className="text-muted-foreground/75 mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase">
              <StickyNote className="h-3.5 w-3.5" strokeWidth={1.75} />
              Note
            </p>
            {day.notes ? (
              <p className="text-foreground/85 text-sm leading-relaxed">
                {day.notes}
              </p>
            ) : (
              isEditMode && (
                <p className="text-muted-foreground text-sm italic">
                  Aucune note — cliquer sur Modifier pour en ajouter une
                </p>
              )
            )}
          </div>
        </EditableTextField>
      )}

      {/* Highlights */}
      {(day.highlights?.length || isEditMode) ? (
        <Card className="border-border/70 bg-card/90 bg-tile-pattern relative overflow-hidden shadow-none">
          <div className="bg-background/55 pointer-events-none absolute inset-0" />
          <CardHeader className="relative px-5 pt-4 pb-2">
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-xs font-semibold uppercase">
              <Star className="text-secondary h-3.5 w-3.5" strokeWidth={1.75} />
              Points forts
            </CardTitle>
          </CardHeader>
          <CardContent className="relative px-5 pt-0 pb-5">
            <EditableStringList
              items={day.highlights ?? []}
              fieldKey="highlights"
              isEditMode={isEditMode}
              versions={getVersionHistory('highlights')}
              onSave={saveHighlights}
              onRestore={(i) =>
                restoreField(
                  'highlights',
                  i,
                  day.highlights ?? [],
                  (d, v) => ({ ...d, highlights: v as string[] }),
                )
              }
              addLabel="Ajouter un point fort"
              itemLabel="point fort"
              renderList={(items) => (
                <ol className="divide-border/45 flex flex-col divide-y">
                  {items.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span className="text-muted-foreground/75 font-display mt-0.5 text-xs tracking-[0.16em] tabular-nums">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <p className="text-foreground text-sm leading-relaxed">
                        {item}
                      </p>
                    </li>
                  ))}
                  {items.length === 0 && isEditMode && (
                    <li className="text-muted-foreground py-2 text-sm italic">
                      Aucun point fort
                    </li>
                  )}
                </ol>
              )}
            />
          </CardContent>
        </Card>
      ) : null}

      {/* Transport */}
      {day.transport && (
        <div className="border-border/60 bg-card/80 rounded-xl border px-4 py-3">
          {(() => {
            const transport = day.transport!
            const Icon = getTransportIcon(transport.type)
            const hasRoute = Boolean(transport.from && transport.to)
            return (
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                  <Icon
                    className="text-primary h-4 w-4"
                    strokeWidth={1.75}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
                      Transport
                    </p>
                  </div>
                  <p className="text-foreground text-sm leading-snug font-semibold">
                    {hasRoute
                      ? `${transport.from} → ${transport.to}`
                      : transport.details}
                  </p>
                  {transport.details && hasRoute && (
                    <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                      {transport.details}
                    </p>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Accommodation */}
      <Card className="border-border/60 bg-card/80 overflow-hidden shadow-none">
        <EditableAccommodation
          accommodation={day.accommodation}
          fieldKey="accommodation"
          isEditMode={isEditMode}
          versions={getVersionHistory('accommodation')}
          onSave={saveAccommodation}
          onRestore={(i) =>
            restoreField(
              'accommodation',
              i,
              day.accommodation,
              (d, v) => ({ ...d, accommodation: v as Accommodation | undefined }),
            )
          }
          renderReadOnly={renderAccommodationReadOnly}
        />
      </Card>

      {/* Activities */}
      <Card className="border-border/60 bg-card/80 shadow-none">
        <CardHeader className="px-4 py-2">
          <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
            <Sparkles
              className="text-secondary h-3.5 w-3.5"
              strokeWidth={1.75}
            />
            Programme
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pt-0 pb-4">
          <EditableActivityList
            activities={day.activities}
            fieldKey="activities"
            isEditMode={isEditMode}
            versions={getVersionHistory('activities')}
            onSave={saveActivities}
            onRestore={(i) =>
              restoreField(
                'activities',
                i,
                day.activities,
                (d, v) => ({ ...d, activities: v as Activity[] }),
              )
            }
          />
        </CardContent>
      </Card>

      {/* Food recommendations */}
      {(day.foodRecommendations?.length || isEditMode) ? (
        <Card className="border-border/60 bg-card/80 shadow-none">
          <CardHeader className="px-4 py-2">
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
              <Utensils
                className="text-secondary h-3.5 w-3.5"
                strokeWidth={1.75}
              />
              À goûter
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-0 pb-4">
            <EditableStringList
              items={day.foodRecommendations ?? []}
              fieldKey="foodRecommendations"
              isEditMode={isEditMode}
              versions={getVersionHistory('foodRecommendations')}
              onSave={saveFoodRecommendations}
              onRestore={(i) =>
                restoreField(
                  'foodRecommendations',
                  i,
                  day.foodRecommendations ?? [],
                  (d, v) => ({
                    ...d,
                    foodRecommendations: v as string[],
                  }),
                )
              }
              addLabel="Ajouter"
              itemLabel="recommandation"
              renderList={(items) => (
                <div className="flex flex-wrap gap-2">
                  {items.map((item, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {item}
                    </Badge>
                  ))}
                  {items.length === 0 && isEditMode && (
                    <span className="text-muted-foreground text-sm italic">
                      Aucune recommandation
                    </span>
                  )}
                </div>
              )}
            />
          </CardContent>
        </Card>
      ) : null}

      {/* Packing tips */}
      {(day.packingTips?.length || isEditMode) ? (
        <Card className="border-border/60 bg-card/80 shadow-none">
          <CardHeader className="px-4 py-2">
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
              <Backpack
                className="text-secondary h-3.5 w-3.5"
                strokeWidth={1.75}
              />
              Bagages
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-0 pb-4">
            <EditableStringList
              items={day.packingTips ?? []}
              fieldKey="packingTips"
              isEditMode={isEditMode}
              versions={getVersionHistory('packingTips')}
              onSave={savePackingTips}
              onRestore={(i) =>
                restoreField(
                  'packingTips',
                  i,
                  day.packingTips ?? [],
                  (d, v) => ({ ...d, packingTips: v as string[] }),
                )
              }
              addLabel="Ajouter un conseil bagage"
              itemLabel="conseil"
              renderList={(items) => (
                <ul className="divide-border/40 flex flex-col divide-y">
                  {items.map((tip, i) => (
                    <li
                      key={i}
                      className="text-foreground flex items-center gap-2 py-2 text-sm first:pt-0 last:pb-0"
                    >
                      <span className="bg-secondary/20 h-1.5 w-1.5 shrink-0 rounded-full" />
                      {tip}
                    </li>
                  ))}
                  {items.length === 0 && isEditMode && (
                    <li className="text-muted-foreground py-2 text-sm italic">
                      Aucun conseil bagage
                    </li>
                  )}
                </ul>
              )}
            />
          </CardContent>
        </Card>
      ) : null}

      {/* Tips */}
      {(day.tips?.length || isEditMode) ? (
        <Card className="border-border/60 bg-card/80 shadow-none">
          <CardHeader className="px-4 py-2">
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
              <Lightbulb
                className="text-secondary h-3.5 w-3.5"
                strokeWidth={1.75}
              />
              Conseils pratiques
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-0 pb-4">
            <EditableStringList
              items={day.tips ?? []}
              fieldKey="tips"
              isEditMode={isEditMode}
              versions={getVersionHistory('tips')}
              onSave={saveTips}
              onRestore={(i) =>
                restoreField(
                  'tips',
                  i,
                  day.tips ?? [],
                  (d, v) => ({ ...d, tips: v as string[] }),
                )
              }
              addLabel="Ajouter un conseil"
              itemLabel="conseil"
              renderList={(items) => (
                <ul className="flex flex-col gap-2">
                  {items.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-secondary mt-0.5 shrink-0">→</span>
                      <span className="text-foreground leading-snug">{tip}</span>
                    </li>
                  ))}
                  {items.length === 0 && isEditMode && (
                    <li className="text-muted-foreground text-sm italic">
                      Aucun conseil pratique
                    </li>
                  )}
                </ul>
              )}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

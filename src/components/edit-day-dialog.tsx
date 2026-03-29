'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Pencil,
  Plus,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import type { DayItinerary, Activity } from '@/lib/itinerary-data'

interface EditDayDialogProps {
  day: DayItinerary
  dayIndex: number
  onSave: (dayIndex: number, updatedDay: DayItinerary) => Promise<void>
}

type ActivityType = Activity['type']
type TransportType = 'train' | 'car' | 'plane' | 'bus'

const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: 'visit', label: 'Visite' },
  { value: 'transport', label: 'Transport' },
  { value: 'food', label: 'Repas' },
  { value: 'experience', label: 'Expérience' },
  { value: 'shopping', label: 'Shopping' },
]

const TRANSPORT_TYPES: { value: TransportType; label: string }[] = [
  { value: 'train', label: 'Train' },
  { value: 'car', label: 'Voiture' },
  { value: 'plane', label: 'Avion' },
  { value: 'bus', label: 'Bus' },
]

function ListEditor({
  label,
  items,
  placeholder,
  onChange,
}: {
  label: string
  items: string[]
  placeholder: string
  onChange: (items: string[]) => void
}) {
  const update = (i: number, value: string) => {
    const next = items.map((item, idx) => (idx === i ? value : item))
    onChange(next)
  }

  const remove = (i: number) => {
    onChange(items.filter((_, idx) => idx !== i))
  }

  const add = () => {
    onChange([...items, ''])
  }

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-medium">{label}</Label>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={item}
            onChange={(e) => update(i, e.target.value)}
            placeholder={placeholder}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive h-8 w-8 shrink-0"
            onClick={() => remove(i)}
            aria-label="Supprimer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-1.5"
        onClick={add}
      >
        <Plus className="h-3.5 w-3.5" />
        Ajouter
      </Button>
    </div>
  )
}

function ActivityEditor({
  activities,
  onChange,
}: {
  activities: Activity[]
  onChange: (activities: Activity[]) => void
}) {
  const updateActivity = (i: number, patch: Partial<Activity>) => {
    onChange(activities.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  }

  const removeActivity = (i: number) => {
    onChange(activities.filter((_, idx) => idx !== i))
  }

  const moveActivity = (i: number, direction: -1 | 1) => {
    const next = [...activities]
    const j = i + direction
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  const addActivity = () => {
    onChange([
      ...activities,
      { name: '', type: 'visit' as ActivityType },
    ])
  }

  return (
    <div className="flex flex-col gap-3">
      <Label className="text-sm font-medium">Activités</Label>
      {activities.map((activity, i) => (
        <div
          key={i}
          className="border-border/60 bg-muted/30 flex flex-col gap-2 rounded-lg border p-3"
        >
          <div className="flex items-center gap-2">
            <GripVertical className="text-muted-foreground/40 h-4 w-4 shrink-0" />
            <Input
              value={activity.name}
              onChange={(e) => updateActivity(i, { name: e.target.value })}
              placeholder="Nom de l'activité"
              className="flex-1"
            />
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground h-7 w-7 shrink-0"
                onClick={() => moveActivity(i, -1)}
                disabled={i === 0}
                aria-label="Monter"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground h-7 w-7 shrink-0"
                onClick={() => moveActivity(i, 1)}
                disabled={i === activities.length - 1}
                aria-label="Descendre"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive h-7 w-7 shrink-0"
                onClick={() => removeActivity(i)}
                aria-label="Supprimer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Select
              value={activity.type}
              onValueChange={(v) =>
                updateActivity(i, { type: v as ActivityType })
              }
            >
              <SelectTrigger className="w-36 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={activity.duration ?? ''}
              onChange={(e) =>
                updateActivity(i, {
                  duration: e.target.value || undefined,
                })
              }
              placeholder="Durée (ex: 2h)"
              className="flex-1"
            />
          </div>

          <Textarea
            value={activity.description ?? ''}
            onChange={(e) =>
              updateActivity(i, {
                description: e.target.value || undefined,
              })
            }
            placeholder="Description (optionnelle)"
            className="resize-none text-sm"
            rows={2}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-1.5"
        onClick={addActivity}
      >
        <Plus className="h-3.5 w-3.5" />
        Ajouter une activité
      </Button>
    </div>
  )
}

export function EditDayDialog({ day, dayIndex, onSave }: EditDayDialogProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state — initialized from current day when dialog opens
  const [title, setTitle] = useState(day.title)
  const [city, setCity] = useState(day.city)
  const [notes, setNotes] = useState(day.notes ?? '')
  const [activities, setActivities] = useState<Activity[]>(day.activities)
  const [highlights, setHighlights] = useState<string[]>(
    day.highlights ?? [],
  )
  const [tips, setTips] = useState<string[]>(day.tips ?? [])
  const [transportType, setTransportType] = useState<TransportType | ''>(
    (day.transport?.type as TransportType) ?? '',
  )
  const [transportFrom, setTransportFrom] = useState(
    day.transport?.from ?? '',
  )
  const [transportTo, setTransportTo] = useState(day.transport?.to ?? '')
  const [transportDetails, setTransportDetails] = useState(
    day.transport?.details ?? '',
  )

  const resetForm = () => {
    setTitle(day.title)
    setCity(day.city)
    setNotes(day.notes ?? '')
    setActivities(day.activities)
    setHighlights(day.highlights ?? [])
    setTips(day.tips ?? [])
    setTransportType((day.transport?.type as TransportType) ?? '')
    setTransportFrom(day.transport?.from ?? '')
    setTransportTo(day.transport?.to ?? '')
    setTransportDetails(day.transport?.details ?? '')
  }

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      resetForm()
    }
    setOpen(isOpen)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const transport =
        transportType
          ? {
              type: transportType,
              from: transportFrom || undefined,
              to: transportTo || undefined,
              details: transportDetails || undefined,
            }
          : undefined

      const updatedDay: DayItinerary = {
        ...day,
        title: title.trim() || day.title,
        city: city.trim() || day.city,
        notes: notes.trim() || undefined,
        activities: activities.filter((a) => a.name.trim()),
        highlights: highlights.filter((h) => h.trim()),
        tips: tips.filter((t) => t.trim()),
        transport,
      }

      await onSave(dayIndex, updatedDay)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-border/70 hover:bg-muted/60 gap-1.5"
        >
          <Pencil className="h-3.5 w-3.5" />
          <span>Modifier</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-border/60 shrink-0 border-b px-5 py-4">
          <DialogTitle className="text-base">
            Modifier le programme — Jour {day.dayNumber}
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-5">
            {/* General info */}
            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
                Informations générales
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-title" className="text-sm font-medium">
                  Titre
                </Label>
                <Input
                  id="edit-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Titre de la journée"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-city" className="text-sm font-medium">
                  Ville
                </Label>
                <Input
                  id="edit-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Ville"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-notes" className="text-sm font-medium">
                  Notes
                </Label>
                <Textarea
                  id="edit-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes pour la journée…"
                  className="resize-none"
                  rows={3}
                />
              </div>
            </div>

            <Separator />

            {/* Activities */}
            <ActivityEditor activities={activities} onChange={setActivities} />

            <Separator />

            {/* Transport */}
            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
                Transport
              </p>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium">Type</Label>
                <Select
                  value={transportType}
                  onValueChange={(v) =>
                    setTransportType(v as TransportType | '')
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Aucun transport" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Aucun</SelectItem>
                    {TRANSPORT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {transportType && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm font-medium">Départ</Label>
                      <Input
                        value={transportFrom}
                        onChange={(e) => setTransportFrom(e.target.value)}
                        placeholder="Ville de départ"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm font-medium">Arrivée</Label>
                      <Input
                        value={transportTo}
                        onChange={(e) => setTransportTo(e.target.value)}
                        placeholder="Ville d'arrivée"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium">Détails</Label>
                    <Input
                      value={transportDetails}
                      onChange={(e) => setTransportDetails(e.target.value)}
                      placeholder="Numéro de train, vol…"
                    />
                  </div>
                </>
              )}
            </div>

            <Separator />

            {/* Highlights */}
            <ListEditor
              label="Points forts"
              items={highlights}
              placeholder="Point fort de la journée"
              onChange={setHighlights}
            />

            <Separator />

            {/* Tips */}
            <ListEditor
              label="Conseils pratiques"
              items={tips}
              placeholder="Conseil pour cette journée"
              onChange={setTips}
            />
          </div>
        </div>

        <DialogFooter className="border-border/60 shrink-0 border-t px-5 py-3">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

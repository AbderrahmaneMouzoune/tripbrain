'use client'

import { useEffect, useState } from 'react'
import type { Activity } from '@/lib/itinerary-data'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
  food: 'Repas',
  experience: 'Expérience',
  shopping: 'Shopping',
}

const DEFAULT_ACTIVITY: Activity = {
  name: '',
  type: 'visit',
  duration: '',
  description: '',
}

interface EditActivityDialogProps {
  open: boolean
  activity?: Activity
  onClose: () => void
  onSave: (activity: Activity) => void
}

export function EditActivityDialog({
  open,
  activity,
  onClose,
  onSave,
}: EditActivityDialogProps) {
  const [form, setForm] = useState<Activity>(activity ?? DEFAULT_ACTIVITY)

  useEffect(() => {
    setForm(activity ?? DEFAULT_ACTIVITY)
  }, [activity, open])

  const handleSave = () => {
    if (!form.name.trim()) return
    onSave({
      ...form,
      name: form.name.trim(),
      duration: form.duration?.trim() || undefined,
      description: form.description?.trim() || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {activity ? "Modifier l'activité" : 'Ajouter une activité'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="act-name">Nom *</Label>
            <Input
              id="act-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex : Visite du temple"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="act-type">Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) =>
                setForm({ ...form, type: v as Activity['type'] })
              }
            >
              <SelectTrigger id="act-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ACTIVITY_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="act-duration">Durée</Label>
            <Input
              id="act-duration"
              value={form.duration ?? ''}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
              placeholder="Ex : 2h"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="act-description">Description</Label>
            <Textarea
              id="act-description"
              value={form.description ?? ''}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Notes ou détails sur l'activité…"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={!form.name.trim()}>
            {activity ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useEffect, useState } from 'react'
import type { DayItinerary } from '@/lib/itinerary-data'
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

interface DayFormState {
  title: string
  city: string
  notes: string
  highlights: string
  foodRecommendations: string
  walkingDistance: string
  tips: string
  packingTips: string
}

function toDayForm(day: DayItinerary): DayFormState {
  return {
    title: day.title,
    city: day.city,
    notes: day.notes ?? '',
    highlights: (day.highlights ?? []).join(', '),
    foodRecommendations: (day.foodRecommendations ?? []).join(', '),
    walkingDistance: day.walkingDistance ?? '',
    tips: (day.tips ?? []).join(', '),
    packingTips: (day.packingTips ?? []).join(', '),
  }
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

interface EditDayDialogProps {
  open: boolean
  day: DayItinerary
  onClose: () => void
  onSave: (updates: Partial<DayItinerary>) => void
}

export function EditDayDialog({
  open,
  day,
  onClose,
  onSave,
}: EditDayDialogProps) {
  const [form, setForm] = useState<DayFormState>(toDayForm(day))

  useEffect(() => {
    setForm(toDayForm(day))
  }, [day, open])

  const handleSave = () => {
    if (!form.title.trim() || !form.city.trim()) return
    onSave({
      title: form.title.trim(),
      city: form.city.trim(),
      notes: form.notes.trim() || undefined,
      highlights: splitList(form.highlights),
      foodRecommendations: splitList(form.foodRecommendations),
      walkingDistance: form.walkingDistance.trim() || undefined,
      tips: splitList(form.tips),
      packingTips: splitList(form.packingTips),
    })
  }

  const field = (key: keyof DayFormState) => ({
    value: form[key],
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setForm((f) => ({ ...f, [key]: e.target.value })),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier la journée</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="day-title">Titre *</Label>
              <Input
                id="day-title"
                {...field('title')}
                placeholder="Ex : Arrivée à Shanghai"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="day-city">Ville *</Label>
              <Input
                id="day-city"
                {...field('city')}
                placeholder="Ex : Shanghai"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="day-notes">Notes</Label>
            <Textarea
              id="day-notes"
              {...field('notes')}
              placeholder="Remarques, changements de plan…"
              rows={3}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="day-highlights">
              Points forts{' '}
              <span className="text-muted-foreground text-xs font-normal">
                (séparés par une virgule)
              </span>
            </Label>
            <Input
              id="day-highlights"
              {...field('highlights')}
              placeholder="Ex : Skyline du Bund, Temple Jing'an"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="day-food">
              Recommandations culinaires{' '}
              <span className="text-muted-foreground text-xs font-normal">
                (séparées par une virgule)
              </span>
            </Label>
            <Input
              id="day-food"
              {...field('foodRecommendations')}
              placeholder="Ex : Xiao long bao, Hot pot"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="day-walking">Distance à pied</Label>
              <Input
                id="day-walking"
                {...field('walkingDistance')}
                placeholder="Ex : 8 km"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="day-tips">
              Conseils{' '}
              <span className="text-muted-foreground text-xs font-normal">
                (séparés par une virgule)
              </span>
            </Label>
            <Input
              id="day-tips"
              {...field('tips')}
              placeholder="Ex : Prenez le métro, Réservez à l'avance"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="day-packing">
              À emporter{' '}
              <span className="text-muted-foreground text-xs font-normal">
                (séparé par une virgule)
              </span>
            </Label>
            <Input
              id="day-packing"
              {...field('packingTips')}
              placeholder="Ex : Parapluie, Crème solaire"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            onClick={handleSave}
            disabled={!form.title.trim() || !form.city.trim()}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { cn } from '@/lib/utils'
import { type DayItinerary, type Activity } from '@/lib/itinerary-data'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  Clock,
  Backpack,
  Lightbulb,
  StickyNote,
  Footprints,
  Tag,
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Star,
} from 'lucide-react'

// ---- types ----

interface EditableDayDetailProps {
  day: DayItinerary
  isDirty: boolean
  onUpdateDay: (updates: Partial<DayItinerary>) => void
  onUpdateActivity: (activityIndex: number, updates: Partial<Activity>) => void
  onAddActivity: () => void
  onRemoveActivity: (activityIndex: number) => void
  onDuplicateActivity: (activityIndex: number) => void
  onMoveActivity: (fromIndex: number, toIndex: number) => void
}

// ---- helpers ----

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

const ACTIVITY_TYPES: { value: Activity['type']; label: string }[] = [
  { value: 'visit', label: 'Visite' },
  { value: 'food', label: 'Gastronomie' },
  { value: 'experience', label: 'Expérience' },
  { value: 'transport', label: 'Transport' },
  { value: 'shopping', label: 'Shopping' },
]

// ---- Inline editable field ----

function EditableField({
  value,
  onChange,
  placeholder,
  multiline = false,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
  className?: string
}) {
  const base =
    'w-full rounded-md border border-border/50 bg-background/70 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors'
  if (multiline) {
    return (
      <textarea
        className={cn(base, 'resize-none leading-relaxed', className)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
      />
    )
  }
  return (
    <input
      type="text"
      className={cn(base, className)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  )
}

// ---- DirtyDot ----

function DirtyDot({ title = 'Modifié' }: { title?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
      title={title}
    />
  )
}

// ---- Main component ----

export function EditableDayDetail({
  day,
  isDirty,
  onUpdateDay,
  onUpdateActivity,
  onAddActivity,
  onRemoveActivity,
  onDuplicateActivity,
  onMoveActivity,
}: EditableDayDetailProps) {
  return (
    <div
      className={cn(
        'animate-fade-up flex flex-col gap-5',
        isDirty && 'border-l-2 border-amber-400/60 pl-3',
      )}
    >
      {/* ── Header ─────────────────────────────────── */}
      <div className="border-border/60 flex flex-col gap-3 border-b pb-4">
        <div className="flex items-center gap-2">
          {isDirty && <DirtyDot />}
          <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
            Journée {day.dayNumber} · {day.date}
          </p>
        </div>

        {/* Title */}
        <div>
          <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-[0.14em] uppercase">
            Titre
          </p>
          <EditableField
            value={day.title}
            onChange={(v) => onUpdateDay({ title: v })}
            placeholder="Titre de la journée"
            className="text-base font-bold"
          />
        </div>

        {/* City */}
        <div>
          <p className="text-muted-foreground mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-[0.14em] uppercase">
            <MapPin className="h-3 w-3" strokeWidth={1.75} />
            Ville
          </p>
          <EditableField
            value={day.city}
            onChange={(v) => onUpdateDay({ city: v })}
            placeholder="Ville"
          />
        </div>

        {/* Day type + walking distance */}
        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-muted-foreground mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-[0.14em] uppercase">
              <Tag className="h-3 w-3" strokeWidth={1.75} />
              Type
            </p>
            <EditableField
              value={day.dayType ?? ''}
              onChange={(v) => onUpdateDay({ dayType: v || undefined })}
              placeholder="arrival, transit…"
            />
          </div>
          <div className="flex-1">
            <p className="text-muted-foreground mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-[0.14em] uppercase">
              <Footprints className="h-3 w-3" strokeWidth={1.75} />
              Distance
            </p>
            <EditableField
              value={day.walkingDistance ?? ''}
              onChange={(v) => onUpdateDay({ walkingDistance: v || undefined })}
              placeholder="Ex : 8 km"
            />
          </div>
        </div>
      </div>

      {/* ── Notes ──────────────────────────────────── */}
      <div
        className={cn(
          'border-border/60 border-l pl-3',
          isDirty && 'border-amber-400/40',
        )}
      >
        <p className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase">
          <StickyNote className="h-3.5 w-3.5" strokeWidth={1.75} />
          Note
        </p>
        <EditableField
          value={day.notes ?? ''}
          onChange={(v) => onUpdateDay({ notes: v || undefined })}
          placeholder="Note de la journée…"
          multiline
        />
      </div>

      {/* ── Transport ──────────────────────────────── */}
      {day.transport && (
        <div className="border-border/60 bg-card/80 rounded-xl border px-4 py-3">
          <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase">
            <Train className="h-3.5 w-3.5" strokeWidth={1.75} />
            Transport
          </p>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <p className="text-muted-foreground mb-1 text-[10px]">De</p>
                <EditableField
                  value={day.transport.from ?? ''}
                  onChange={(v) =>
                    onUpdateDay({
                      transport: { ...day.transport!, from: v || undefined },
                    })
                  }
                  placeholder="Départ"
                />
              </div>
              <div className="flex-1">
                <p className="text-muted-foreground mb-1 text-[10px]">À</p>
                <EditableField
                  value={day.transport.to ?? ''}
                  onChange={(v) =>
                    onUpdateDay({
                      transport: { ...day.transport!, to: v || undefined },
                    })
                  }
                  placeholder="Arrivée"
                />
              </div>
            </div>
            <div>
              <p className="text-muted-foreground mb-1 text-[10px]">Détails</p>
              <EditableField
                value={day.transport.details ?? ''}
                onChange={(v) =>
                  onUpdateDay({
                    transport: { ...day.transport!, details: v || undefined },
                  })
                }
                placeholder="Détails du transport"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Accommodation ──────────────────────────── */}
      {day.accommodation && (
        <Card className="border-border/60 bg-card/80 shadow-none">
          <CardHeader className="px-4 py-2">
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
              <Hotel
                className="text-secondary h-3.5 w-3.5"
                strokeWidth={1.75}
              />
              Hébergement
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 px-4 pb-4 pt-0">
            <div>
              <p className="text-muted-foreground mb-1 text-[10px]">Nom</p>
              <EditableField
                value={day.accommodation.name}
                onChange={(v) =>
                  onUpdateDay({
                    accommodation: { ...day.accommodation!, name: v },
                  })
                }
                placeholder="Nom de l'hébergement"
              />
            </div>
            <div>
              <p className="text-muted-foreground mb-1 text-[10px]">Adresse</p>
              <EditableField
                value={day.accommodation.address}
                onChange={(v) =>
                  onUpdateDay({
                    accommodation: { ...day.accommodation!, address: v },
                  })
                }
                placeholder="Adresse"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Activities ─────────────────────────────── */}
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
          <div className="flex flex-col gap-3">
            {day.activities.map((activity, index) => {
              const Icon = getActivityIcon(activity.type)
              return (
                <div
                  key={index}
                  className="border-border/40 rounded-lg border bg-background/50 p-3"
                >
                  {/* Name + move controls */}
                  <div className="mb-2 flex items-center gap-2">
                    <div className="bg-primary/10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                      <Icon
                        className="text-primary h-3.5 w-3.5"
                        strokeWidth={1.75}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <EditableField
                        value={activity.name}
                        onChange={(v) => onUpdateActivity(index, { name: v })}
                        placeholder="Nom de l'activité"
                        className="font-semibold"
                      />
                    </div>
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => onMoveActivity(index, index - 1)}
                        disabled={index === 0}
                        title="Monter"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => onMoveActivity(index, index + 1)}
                        disabled={index === day.activities.length - 1}
                        title="Descendre"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Type + Duration */}
                  <div className="mb-2 flex gap-2">
                    <div className="flex-1">
                      <p className="text-muted-foreground mb-1 text-[10px]">
                        Type
                      </p>
                      <Select
                        value={activity.type}
                        onValueChange={(v) =>
                          onUpdateActivity(index, {
                            type: v as Activity['type'],
                          })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACTIVITY_TYPES.map((t) => (
                            <SelectItem
                              key={t.value}
                              value={t.value}
                              className="text-xs"
                            >
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <p className="text-muted-foreground mb-1 flex items-center gap-1 text-[10px]">
                        <Clock className="h-2.5 w-2.5" strokeWidth={1.75} />
                        Durée
                      </p>
                      <EditableField
                        value={activity.duration ?? ''}
                        onChange={(v) =>
                          onUpdateActivity(index, {
                            duration: v || undefined,
                          })
                        }
                        placeholder="Ex : 2h"
                        className="text-xs"
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div className="mb-2">
                    <p className="text-muted-foreground mb-1 text-[10px]">
                      Description
                    </p>
                    <EditableField
                      value={activity.description ?? ''}
                      onChange={(v) =>
                        onUpdateActivity(index, {
                          description: v || undefined,
                        })
                      }
                      placeholder="Description optionnelle…"
                      multiline
                      className="text-xs"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground h-7 gap-1 text-xs"
                      onClick={() => onDuplicateActivity(index)}
                    >
                      <Copy className="h-3 w-3" />
                      Dupliquer
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive h-7 gap-1 text-xs"
                      onClick={() => onRemoveActivity(index)}
                    >
                      <Trash2 className="h-3 w-3" />
                      Supprimer
                    </Button>
                  </div>
                </div>
              )
            })}

            {/* Add activity */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-dashed"
              onClick={onAddActivity}
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter une activité
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Food recommendations ───────────────────── */}
      {day.foodRecommendations && day.foodRecommendations.length > 0 && (
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
            <div className="flex flex-col gap-2">
              {day.foodRecommendations.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <EditableField
                    value={item}
                    onChange={(v) => {
                      const recs = [...(day.foodRecommendations ?? [])]
                      recs[i] = v
                      onUpdateDay({ foodRecommendations: recs })
                    }}
                    placeholder="Recommandation…"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive h-7 w-7 shrink-0"
                    onClick={() => {
                      const recs = (day.foodRecommendations ?? []).filter(
                        (_, idx) => idx !== i,
                      )
                      onUpdateDay({
                        foodRecommendations:
                          recs.length > 0 ? recs : undefined,
                      })
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-dashed"
                onClick={() =>
                  onUpdateDay({
                    foodRecommendations: [
                      ...(day.foodRecommendations ?? []),
                      '',
                    ],
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Highlights ─────────────────────────────── */}
      {day.highlights && day.highlights.length > 0 && (
        <Card className="border-border/60 bg-card/80 shadow-none">
          <CardHeader className="px-4 py-2">
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
              <Star className="text-secondary h-3.5 w-3.5" strokeWidth={1.75} />
              Points forts
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-0 pb-4">
            <div className="flex flex-col gap-2">
              {day.highlights.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <EditableField
                    value={item}
                    onChange={(v) => {
                      const hl = [...(day.highlights ?? [])]
                      hl[i] = v
                      onUpdateDay({ highlights: hl })
                    }}
                    placeholder="Point fort…"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive h-7 w-7 shrink-0"
                    onClick={() => {
                      const hl = (day.highlights ?? []).filter(
                        (_, idx) => idx !== i,
                      )
                      onUpdateDay({ highlights: hl.length > 0 ? hl : undefined })
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-dashed"
                onClick={() =>
                  onUpdateDay({
                    highlights: [...(day.highlights ?? []), ''],
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tips ───────────────────────────────────── */}
      {day.tips && day.tips.length > 0 && (
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
            <div className="flex flex-col gap-2">
              {day.tips.map((tip, i) => (
                <div key={i} className="flex items-center gap-2">
                  <EditableField
                    value={tip}
                    onChange={(v) => {
                      const tips = [...(day.tips ?? [])]
                      tips[i] = v
                      onUpdateDay({ tips })
                    }}
                    placeholder="Conseil…"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive h-7 w-7 shrink-0"
                    onClick={() => {
                      const tips = (day.tips ?? []).filter(
                        (_, idx) => idx !== i,
                      )
                      onUpdateDay({ tips: tips.length > 0 ? tips : undefined })
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-dashed"
                onClick={() =>
                  onUpdateDay({ tips: [...(day.tips ?? []), ''] })
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Packing tips ───────────────────────────── */}
      {day.packingTips && day.packingTips.length > 0 && (
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
            <div className="flex flex-col gap-2">
              {day.packingTips.map((tip, i) => (
                <div key={i} className="flex items-center gap-2">
                  <EditableField
                    value={tip}
                    onChange={(v) => {
                      const tips = [...(day.packingTips ?? [])]
                      tips[i] = v
                      onUpdateDay({ packingTips: tips })
                    }}
                    placeholder="Conseil bagages…"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive h-7 w-7 shrink-0"
                    onClick={() => {
                      const tips = (day.packingTips ?? []).filter(
                        (_, idx) => idx !== i,
                      )
                      onUpdateDay({
                        packingTips: tips.length > 0 ? tips : undefined,
                      })
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-dashed"
                onClick={() =>
                  onUpdateDay({
                    packingTips: [...(day.packingTips ?? []), ''],
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

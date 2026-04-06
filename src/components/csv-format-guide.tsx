'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { HelpCircle, Download } from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function FieldRow({
  name,
  description,
  example,
  required,
}: {
  name: string
  description: string
  example: string
  required?: boolean
}) {
  return (
    <div className="border-b px-3 py-2 last:border-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <code className="shrink-0 font-mono text-xs font-semibold">{name}</code>
        {required && (
          <span className="text-destructive shrink-0 text-[10px] font-medium uppercase">
            requis
          </span>
        )}
        <span className="text-muted-foreground min-w-0 text-xs">
          {description}
        </span>
      </div>
      <p className="text-muted-foreground/70 mt-0.5 font-mono text-[11px]">
        Ex : {example}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Example CSV (kept in sync with format guide)
// ---------------------------------------------------------------------------

const EXAMPLE_CSV_ROWS = [
  'date,city,title,coordinates,highlights,activities,accommodationName,transportType,transportFrom,transportTo',
  `2025-06-01,Paris,Arrivée à Paris,48.8566|2.3522,Tour Eiffel|Louvre,"[{""name"":""Tour Eiffel"",""type"":""visit"",""duration"":""2h""},{""name"":""Dîner"",""type"":""food"",""duration"":""1h""}]",Hôtel Lumière,train,CDG,Paris`,
  `2025-06-02,Paris,Journée musées,48.8566|2.3522,Louvre|Orsay,"[{""name"":""Louvre"",""type"":""visit"",""duration"":""4h""},{""name"":""Orsay"",""type"":""visit"",""duration"":""2h""}]",Hôtel Lumière,,`,
]

const EXAMPLE_CSV_CONTENT = EXAMPLE_CSV_ROWS.join('\n')

function downloadExampleCsv() {
  const blob = new Blob([EXAMPLE_CSV_CONTENT], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'tripbrain-exemple.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CsvFormatGuide() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto gap-1 px-2 py-1 text-xs"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          Format CSV
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85dvh] w-[calc(100%-1rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Guide du format CSV</DialogTitle>
          <DialogDescription>
            Chaque ligne = une journée. Les colonnes non renseignées sont
            ignorées.
          </DialogDescription>
        </DialogHeader>

        <Accordion
          type="multiple"
          defaultValue={['required', 'activities']}
          className="w-full"
        >
          {/* ── Colonnes obligatoires ────────────────────────────── */}
          <AccordionItem value="required">
            <AccordionTrigger className="font-semibold">
              Colonnes obligatoires
            </AccordionTrigger>
            <AccordionContent>
              <div className="rounded-lg border text-sm">
                <FieldRow
                  name="date"
                  description="Date de la journée"
                  example="2025-06-01"
                  required
                />
                <FieldRow
                  name="city"
                  description="Ville du jour"
                  example="Paris"
                  required
                />
                <FieldRow
                  name="title"
                  description="Titre court du jour"
                  example="Arrivée à Paris"
                  required
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Colonnes optionnelles ────────────────────────────── */}
          <AccordionItem value="optional">
            <AccordionTrigger className="font-semibold">
              Colonnes optionnelles
            </AccordionTrigger>
            <AccordionContent>
              <div className="rounded-lg border text-sm">
                <FieldRow
                  name="coordinates"
                  description="Coordonnées géographiques (lat|lon)"
                  example="48.8566|2.3522"
                />
                <FieldRow
                  name="notes"
                  description="Notes libres sur la journée"
                  example="Journée tranquille"
                />
                <FieldRow
                  name="walkingDistance"
                  description="Distance à pied estimée"
                  example="8 km"
                />
                <FieldRow
                  name="dayType"
                  description="Type de journée"
                  example="arrival"
                />
                <FieldRow
                  name="highlights"
                  description="Points forts séparés par |"
                  example="Tour Eiffel|Louvre"
                />
                <FieldRow
                  name="foodRecommendations"
                  description="Recommandations culinaires séparées par |"
                  example="Croissant|Baguette"
                />
                <FieldRow
                  name="packingTips"
                  description="Conseils bagages séparés par |"
                  example="Parapluie|Chargeur"
                />
                <FieldRow
                  name="tips"
                  description="Conseils pratiques séparés par |"
                  example="Réserver à l'avance"
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Activités ─────────────────────────────────────────── */}
          <AccordionItem value="activities">
            <AccordionTrigger className="font-semibold">
              Activités
            </AccordionTrigger>
            <AccordionContent className="space-y-3">
              <p className="text-muted-foreground text-xs leading-relaxed">
                Colonne{' '}
                <code className="bg-muted rounded px-1 font-mono">
                  activities
                </code>{' '}
                — tableau JSON d&apos;objets. Chaque objet représente une
                activité avec des champs nommés. Le champ{' '}
                <code className="bg-muted rounded px-1 font-mono">name</code>{' '}
                est le seul obligatoire.
              </p>
              <div className="rounded-lg border text-sm">
                <FieldRow
                  name="name"
                  description="Nom de l'activité"
                  example="Tour Eiffel"
                  required
                />
                <FieldRow
                  name="type"
                  description="visit · transport · food · experience · shopping"
                  example="visit"
                />
                <FieldRow name="duration" description="Durée" example="2h" />
                <FieldRow
                  name="description"
                  description="Description"
                  example="Monument emblématique"
                />
                <FieldRow
                  name="address"
                  description="Adresse"
                  example="Champ de Mars, Paris"
                />
                <FieldRow
                  name="price"
                  description="Prix (nombre)"
                  example="29.90"
                />
                <FieldRow name="currency" description="Devise" example="EUR" />
                <FieldRow
                  name="rating"
                  description="Note /5 (nombre)"
                  example="4.5"
                />
                <FieldRow
                  name="status"
                  description="planned · done · skipped"
                  example="planned"
                />
                <FieldRow
                  name="openAt"
                  description="Horaires d'ouverture"
                  example="09:00–18:00"
                />
                <FieldRow
                  name="tips"
                  description="Conseil pratique"
                  example="Arriver tôt"
                />
              </div>
              <div className="bg-muted overflow-x-auto rounded-lg p-3">
                <pre className="text-[11px] leading-relaxed whitespace-pre">
                  {`[
  {"name":"Tour Eiffel","type":"visit","duration":"2h"},
  {"name":"Dîner","type":"food","duration":"1h"}
]`}
                </pre>
              </div>
              <p className="text-muted-foreground text-xs">
                Dans le fichier CSV, cette cellule doit être entourée de
                guillemets doubles et les guillemets internes doublés :{' '}
                <code className="bg-muted rounded px-1 font-mono text-[11px]">
                  {`"[{""name"":""Tour Eiffel""}]"`}
                </code>
                . Les tableurs (Excel, Google Sheets) gèrent cela
                automatiquement.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* ── Hébergement ───────────────────────────────────────── */}
          <AccordionItem value="accommodation">
            <AccordionTrigger className="font-semibold">
              Hébergement
            </AccordionTrigger>
            <AccordionContent>
              <div className="rounded-lg border text-sm">
                <FieldRow
                  name="accommodationName"
                  description="Nom de l'hébergement"
                  example="Hôtel de la Paix"
                />
                <FieldRow
                  name="accommodationAddress"
                  description="Adresse"
                  example="10 Rue de la Paix, Paris"
                />
                <FieldRow
                  name="accommodationCheckIn"
                  description="Heure d'arrivée"
                  example="15:00"
                />
                <FieldRow
                  name="accommodationCheckOut"
                  description="Heure de départ"
                  example="11:00"
                />
                <FieldRow
                  name="accommodationBookingUrl"
                  description="URL de réservation"
                  example="https://booking.com/..."
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Transport ─────────────────────────────────────────── */}
          <AccordionItem value="transport">
            <AccordionTrigger className="font-semibold">
              Transport
            </AccordionTrigger>
            <AccordionContent>
              <div className="rounded-lg border text-sm">
                <FieldRow
                  name="transportType"
                  description="train · car · plane · bus"
                  example="train"
                />
                <FieldRow
                  name="transportFrom"
                  description="Lieu de départ"
                  example="Paris Gare de Lyon"
                />
                <FieldRow
                  name="transportTo"
                  description="Lieu d'arrivée"
                  example="Lyon Part-Dieu"
                />
                <FieldRow
                  name="transportDetails"
                  description="Détails (numéro de train, etc.)"
                  example="TGV 6607"
                />
                <FieldRow
                  name="transportDepartureTime"
                  description="Heure de départ"
                  example="08:30"
                />
                <FieldRow
                  name="transportArrivalTime"
                  description="Heure d'arrivée"
                  example="10:00"
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Exemple complet ───────────────────────────────────── */}
          <AccordionItem value="example">
            <AccordionTrigger className="font-semibold">
              Exemple complet
            </AccordionTrigger>
            <AccordionContent className="space-y-3">
              <div className="bg-muted overflow-x-auto rounded-lg p-3">
                <pre className="text-[11px] leading-relaxed whitespace-pre">
                  {EXAMPLE_CSV_ROWS.join('\n')}
                </pre>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={downloadExampleCsv}
              >
                <Download className="h-3.5 w-3.5" />
                Télécharger l&apos;exemple CSV
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </DialogContent>
    </Dialog>
  )
}


'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Download, HelpCircle, FileSpreadsheet } from 'lucide-react'

// ── Column definitions ────────────────────────────────────────────────────────

interface ColumnDef {
  name: string
  required: boolean
  description: string
  example?: string
}

const DAY_COLUMNS: ColumnDef[] = [
  {
    name: 'id',
    required: true,
    description: 'Identifiant unique du jour',
    example: 'day-1',
  },
  {
    name: 'date',
    required: true,
    description: 'Date ISO 8601',
    example: '2026-05-10',
  },
  { name: 'city', required: true, description: 'Ville du séjour', example: 'Paris' },
  {
    name: 'title',
    required: true,
    description: 'Titre de la journée',
    example: 'Arrivée à Paris',
  },
  {
    name: 'day_number',
    required: false,
    description: 'N° du jour (auto-calculé si absent)',
    example: '1',
  },
  {
    name: 'coordinates',
    required: false,
    description: 'Coordonnées lat|lng de la ville',
    example: '48.8566|2.3522',
  },
  {
    name: 'highlights',
    required: false,
    description: 'Points forts séparés par |',
    example: 'Tour Eiffel|Louvre',
  },
  {
    name: 'food_recommendations',
    required: false,
    description: 'Restos / plats séparés par |',
    example: 'Croissant|Café',
  },
  {
    name: 'walking_distance',
    required: false,
    description: 'Distance de marche',
    example: '5km',
  },
  { name: 'notes', required: false, description: 'Notes libres', example: 'Beau temps' },
  {
    name: 'packing_tips',
    required: false,
    description: 'Conseils bagages séparés par |',
    example: 'Parapluie|Crème solaire',
  },
  {
    name: 'day_type',
    required: false,
    description: 'Type de journée',
    example: 'arrival',
  },
  {
    name: 'tips',
    required: false,
    description: 'Conseils séparés par |',
    example: 'Arriver tôt',
  },
  {
    name: 'accommodation_name',
    required: false,
    description: "Nom de l'hébergement (active toutes les colonnes accommodation_*)",
    example: 'Hôtel de la Paix',
  },
  {
    name: 'accommodation_id',
    required: false,
    description: 'Identifiant hébergement',
    example: 'acc-1',
  },
  {
    name: 'accommodation_address',
    required: false,
    description: "Adresse de l'hébergement",
    example: '1 rue de la Paix',
  },
  {
    name: 'accommodation_booking_url',
    required: false,
    description: 'URL de réservation',
    example: 'https://booking.com',
  },
  {
    name: 'accommodation_check_in',
    required: false,
    description: "Date d'arrivée",
    example: '2026-05-10',
  },
  {
    name: 'accommodation_check_out',
    required: false,
    description: "Date de départ",
    example: '2026-05-12',
  },
  {
    name: 'accommodation_price',
    required: false,
    description: 'Prix (nombre brut)',
    example: '120',
  },
  {
    name: 'accommodation_currency',
    required: false,
    description: 'Devise',
    example: 'EUR',
  },
  {
    name: 'accommodation_booking_reference',
    required: false,
    description: 'Référence de réservation',
    example: 'REF-123',
  },
  {
    name: 'accommodation_status',
    required: false,
    description: 'planned | booked | checked-in | completed',
    example: 'booked',
  },
]

const ACTIVITY_COLUMNS: ColumnDef[] = [
  {
    name: 'id',
    required: true,
    description: "Identifiant unique de l'activité",
    example: 'act-1',
  },
  {
    name: 'day_id',
    required: true,
    description: 'ID du jour parent (doit exister dans Days)',
    example: 'day-1',
  },
  { name: 'name', required: true, description: "Nom de l'activité", example: 'Tour Eiffel' },
  {
    name: 'type',
    required: true,
    description: 'visit | food | transport | experience | shopping',
    example: 'visit',
  },
  { name: 'duration', required: false, description: 'Durée libre', example: '2h' },
  {
    name: 'description',
    required: false,
    description: 'Description',
    example: 'Vue panoramique',
  },
  {
    name: 'coordinates',
    required: false,
    description: 'Coordonnées lat|lng',
    example: '48.8584|2.2945',
  },
  { name: 'address', required: false, description: 'Adresse', example: 'Champ de Mars' },
  {
    name: 'booking_url',
    required: false,
    description: 'URL de réservation',
    example: 'https://example.com',
  },
  {
    name: 'reservation_required',
    required: false,
    description: 'Réservation obligatoire',
    example: 'true',
  },
  { name: 'price', required: false, description: 'Prix (nombre brut)', example: '25' },
  { name: 'currency', required: false, description: 'Devise', example: 'EUR' },
  { name: 'rating', required: false, description: 'Note de 0 à 5', example: '4.8' },
  {
    name: 'tags',
    required: false,
    description: 'Tags séparés par |',
    example: 'monument|paris',
  },
  {
    name: 'status',
    required: false,
    description: 'planned | done | skipped',
    example: 'planned',
  },
  { name: 'tips', required: false, description: 'Conseil', example: "Réserver à l'avance" },
  {
    name: 'open_at',
    required: false,
    description: "Horaires d'ouverture",
    example: '09:00-23:00',
  },
]

const TRANSPORT_COLUMNS: ColumnDef[] = [
  {
    name: 'id',
    required: true,
    description: 'Identifiant unique du transport',
    example: 'tr-1',
  },
  {
    name: 'day_id',
    required: true,
    description: 'ID du jour parent (doit exister dans Days)',
    example: 'day-1',
  },
  {
    name: 'type',
    required: true,
    description: 'train | car | plane | bus',
    example: 'train',
  },
  { name: 'from', required: false, description: 'Ville / lieu de départ', example: 'Paris' },
  {
    name: 'to',
    required: false,
    description: "Ville / lieu d'arrivée",
    example: 'Lyon',
  },
  {
    name: 'details',
    required: false,
    description: 'Détails supplémentaires',
    example: 'TGV direct',
  },
  {
    name: 'departure_address',
    required: false,
    description: 'Adresse de départ',
    example: 'Gare de Lyon',
  },
  {
    name: 'departure_time',
    required: false,
    description: 'Heure de départ',
    example: '08:00',
  },
  {
    name: 'arrival_time',
    required: false,
    description: "Heure d'arrivée",
    example: '10:00',
  },
  { name: 'duration', required: false, description: 'Durée du trajet', example: '2h' },
  {
    name: 'provider',
    required: false,
    description: 'Compagnie / prestataire',
    example: 'SNCF',
  },
  {
    name: 'booking_url',
    required: false,
    description: 'URL de réservation',
    example: 'https://sncf.com',
  },
  {
    name: 'booking_reference',
    required: false,
    description: 'Référence de réservation',
    example: 'REF-456',
  },
  { name: 'price', required: false, description: 'Prix (nombre brut)', example: '50' },
  { name: 'currency', required: false, description: 'Devise', example: 'EUR' },
  { name: 'seat', required: false, description: 'Numéro de siège', example: '12A' },
  { name: 'gate', required: false, description: "Porte d'embarquement", example: '3' },
  { name: 'terminal', required: false, description: 'Terminal', example: '2E' },
  {
    name: 'status',
    required: false,
    description: 'planned | booked | checked-in | completed',
    example: 'booked',
  },
  { name: 'notes', required: false, description: 'Notes libres', example: 'Voiture 5' },
]

// ── Template data ─────────────────────────────────────────────────────────────

const DAYS_HEADERS = [
  'id',
  'date',
  'day_number',
  'city',
  'title',
  'coordinates',
  'highlights',
  'food_recommendations',
  'walking_distance',
  'notes',
  'packing_tips',
  'day_type',
  'tips',
  'accommodation_id',
  'accommodation_name',
  'accommodation_address',
  'accommodation_booking_url',
  'accommodation_check_in',
  'accommodation_check_out',
  'accommodation_price',
  'accommodation_currency',
  'accommodation_booking_reference',
  'accommodation_status',
]
const DAYS_EXAMPLE = [
  'day-1',
  '2026-05-10',
  '1',
  'Paris',
  'Arrivée à Paris',
  '48.8566|2.3522',
  'Tour Eiffel|Louvre',
  'Croissant|Café',
  '5km',
  'Belle journée',
  'Parapluie',
  'arrival',
  'Arriver tôt',
  'acc-1',
  'Hôtel de la Paix',
  '1 rue de la Paix',
  'https://example.com',
  '2026-05-10',
  '2026-05-12',
  '120',
  'EUR',
  'REF-123',
  'booked',
]

const ACTIVITIES_HEADERS = [
  'id',
  'day_id',
  'name',
  'type',
  'duration',
  'description',
  'coordinates',
  'address',
  'booking_url',
  'reservation_required',
  'price',
  'currency',
  'rating',
  'tags',
  'status',
  'tips',
  'open_at',
]
const ACTIVITIES_EXAMPLE = [
  'act-1',
  'day-1',
  'Visite Tour Eiffel',
  'visit',
  '2h',
  'Vue panoramique',
  '48.8584|2.2945',
  'Champ de Mars',
  'https://example.com',
  'true',
  '25',
  'EUR',
  '4.8',
  'monument|paris',
  'planned',
  'Réserver',
  '09:00-23:00',
]

const TRANSPORTS_HEADERS = [
  'id',
  'day_id',
  'type',
  'from',
  'to',
  'details',
  'departure_address',
  'departure_time',
  'arrival_time',
  'duration',
  'provider',
  'booking_url',
  'booking_reference',
  'price',
  'currency',
  'seat',
  'gate',
  'terminal',
  'status',
  'notes',
]
const TRANSPORTS_EXAMPLE = [
  'tr-1',
  'day-1',
  'train',
  'Paris',
  'Lyon',
  'TGV direct',
  'Gare de Lyon',
  '08:00',
  '10:00',
  '2h',
  'SNCF',
  'https://example.com',
  'REF-456',
  '50',
  'EUR',
  '12A',
  '3',
  '',
  'booked',
  'Voiture 5',
]

// ── Download helpers ──────────────────────────────────────────────────────────

function makeCsv(headers: string[], example: string[]): string {
  return [headers.join(','), example.join(',')].join('\n')
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function downloadXlsxTemplate() {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()

  const daysSheet = wb.addWorksheet('Days')
  daysSheet.addRow(DAYS_HEADERS)
  daysSheet.addRow(DAYS_EXAMPLE)

  const actsSheet = wb.addWorksheet('Activities')
  actsSheet.addRow(ACTIVITIES_HEADERS)
  actsSheet.addRow(ACTIVITIES_EXAMPLE)

  const transSheet = wb.addWorksheet('Transports')
  transSheet.addRow(TRANSPORTS_HEADERS)
  transSheet.addRow(TRANSPORTS_EXAMPLE)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'tripbrain-template.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ColumnRow({ name, required, description, example }: ColumnDef) {
  return (
    <div className="border-border/40 border-b py-2 last:border-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <code className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-[11px]">
          {name}
        </code>
        <Badge
          variant={required ? 'default' : 'secondary'}
          className="h-4 px-1.5 py-0 text-[10px]"
        >
          {required ? 'requis' : 'optionnel'}
        </Badge>
        {example && (
          <code className="text-muted-foreground ml-auto font-mono text-[10px]">{example}</code>
        )}
      </div>
      <p className="text-muted-foreground mt-0.5 text-xs leading-snug">{description}</p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const CSV_TEMPLATES = [
  { name: 'days.csv', headers: DAYS_HEADERS, example: DAYS_EXAMPLE },
  { name: 'activities.csv', headers: ACTIVITIES_HEADERS, example: ACTIVITIES_EXAMPLE },
  { name: 'transports.csv', headers: TRANSPORTS_HEADERS, example: TRANSPORTS_EXAMPLE },
] as const

export function ImportFormatGuide() {
  const [xlsxLoading, setXlsxLoading] = useState(false)
  const [xlsxError, setXlsxError] = useState(false)

  const handleXlsxDownload = async () => {
    setXlsxLoading(true)
    setXlsxError(false)
    try {
      await downloadXlsxTemplate()
    } catch {
      setXlsxError(true)
    } finally {
      setXlsxLoading(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5 text-xs">
          <HelpCircle className="h-3.5 w-3.5" />
          Guide de format
        </Button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Guide de format d&apos;import</DialogTitle>
          <DialogDescription>
            Deux formats supportés : fichier Excel (.xlsx) avec 3 onglets, ou 3 fichiers CSV
            distincts.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <Separator className="my-3" />

          {/* Download templates */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Télécharger les modèles</p>

            <div className="grid gap-2 sm:grid-cols-2">
              {/* Excel template */}
              <Button
                variant="outline"
                size="sm"
                className="h-auto justify-start gap-2 py-2.5"
                onClick={handleXlsxDownload}
                disabled={xlsxLoading}
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-green-600" />
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-xs font-medium">
                    {xlsxLoading ? 'Génération…' : xlsxError ? 'Erreur' : 'Modèle Excel'}
                  </p>
                  <p className="text-muted-foreground text-[11px]">tripbrain-template.xlsx</p>
                </div>
                <Download className="text-muted-foreground ml-auto h-3.5 w-3.5 shrink-0" />
              </Button>

              {/* CSV templates */}
              <div className="flex flex-col gap-1">
                {CSV_TEMPLATES.map(({ name, headers, example }) => (
                  <Button
                    key={name}
                    variant="outline"
                    size="sm"
                    className="h-7 justify-start gap-2 px-2"
                    onClick={() => downloadText(name, makeCsv(headers as unknown as string[], example as unknown as string[]))}
                  >
                    <Download className="text-muted-foreground h-3 w-3 shrink-0" />
                    <code className="text-xs">{name}</code>
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <Separator className="my-3" />

          {/* Column documentation */}
          <Accordion type="multiple">
            <AccordionItem value="days">
              <AccordionTrigger className="text-sm font-medium">
                Feuille / Fichier Days
              </AccordionTrigger>
              <AccordionContent>
                {DAY_COLUMNS.map((col) => (
                  <ColumnRow key={col.name} {...col} />
                ))}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="activities">
              <AccordionTrigger className="text-sm font-medium">
                Feuille / Fichier Activities
              </AccordionTrigger>
              <AccordionContent>
                {ACTIVITY_COLUMNS.map((col) => (
                  <ColumnRow key={col.name} {...col} />
                ))}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="transports">
              <AccordionTrigger className="text-sm font-medium">
                Feuille / Fichier Transports
              </AccordionTrigger>
              <AccordionContent>
                {TRANSPORT_COLUMNS.map((col) => (
                  <ColumnRow key={col.name} {...col} />
                ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Separator className="my-3" />

          {/* Conventions */}
          <div className="space-y-2 pb-1">
            <p className="text-sm font-medium">Conventions de saisie</p>
            <ul className="text-muted-foreground space-y-1.5 text-xs">
              <li>
                <span className="text-foreground font-medium">Listes</span> → valeurs séparées par{' '}
                <code className="bg-muted rounded px-1 text-[11px]">|</code> — ex:{' '}
                <code className="bg-muted rounded px-1 text-[11px]">Paris|Lyon|Nice</code>
              </li>
              <li>
                <span className="text-foreground font-medium">Coordonnées</span> →{' '}
                <code className="bg-muted rounded px-1 text-[11px]">lat|lng</code> — ex:{' '}
                <code className="bg-muted rounded px-1 text-[11px]">48.8566|2.3522</code>
              </li>
              <li>
                <span className="text-foreground font-medium">Dates</span> → format ISO 8601 — ex:{' '}
                <code className="bg-muted rounded px-1 text-[11px]">2026-05-10</code>
              </li>
              <li>
                <span className="text-foreground font-medium">Booléens</span> →{' '}
                <code className="bg-muted rounded px-1 text-[11px]">true</code> /{' '}
                <code className="bg-muted rounded px-1 text-[11px]">false</code> ou{' '}
                <code className="bg-muted rounded px-1 text-[11px]">oui</code> /{' '}
                <code className="bg-muted rounded px-1 text-[11px]">non</code>
              </li>
              <li>
                <span className="text-foreground font-medium">Champs optionnels</span> → laisser la
                cellule vide
              </li>
              <li>
                <span className="text-foreground font-medium">Prix</span> → nombre brut — ex:{' '}
                <code className="bg-muted rounded px-1 text-[11px]">120</code> ; devise dans la
                colonne <code className="bg-muted rounded px-1 text-[11px]">currency</code>
              </li>
              <li>
                <span className="text-foreground font-medium">day_id</span> → doit correspondre
                exactement à un <code className="bg-muted rounded px-1 text-[11px]">id</code> de la
                feuille Days
              </li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

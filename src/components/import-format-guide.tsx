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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Download,
  HelpCircle,
  FileSpreadsheet,
  Table,
  Braces,
  Lightbulb,
  TriangleAlert,
} from 'lucide-react'
import type { TripData } from '@/hooks/use-trip-data'
import type {
  DayItinerary,
  Activity,
  Transport,
  Accommodation,
} from '@/lib/itinerary-data'

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
    example: '2026-06-01',
  },
  {
    name: 'city',
    required: true,
    description: 'Ville du séjour',
    example: 'Paris',
  },
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
    example: '8km',
  },
  {
    name: 'notes',
    required: false,
    description: 'Notes libres',
    example: 'Journée tranquille',
  },
  {
    name: 'packing_tips',
    required: false,
    description: 'Conseils bagages séparés par |',
    example: 'Parapluie|Baskets',
  },
  {
    name: 'day_type',
    required: false,
    description: 'arrival | sightseeing | travel | rest',
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
    description: "Nom de l'hébergement (active les colonnes accommodation_*)",
    example: 'Hôtel des Arts',
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
    example: '5 rue Tholozé 75018 Paris',
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
    example: '2026-06-01',
  },
  {
    name: 'accommodation_check_out',
    required: false,
    description: 'Date de départ',
    example: '2026-06-03',
  },
  {
    name: 'accommodation_price',
    required: false,
    description: 'Prix (nombre brut)',
    example: '180',
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
    example: 'HDM-2026-001',
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
  {
    name: 'name',
    required: true,
    description: "Nom de l'activité",
    example: 'Visite Tour Eiffel',
  },
  {
    name: 'type',
    required: true,
    description: 'visit | food | transport | experience | shopping',
    example: 'visit',
  },
  {
    name: 'duration',
    required: false,
    description: 'Durée libre',
    example: '3h',
  },
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
  {
    name: 'address',
    required: false,
    description: 'Adresse',
    example: 'Champ de Mars 75007 Paris',
  },
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
  {
    name: 'price',
    required: false,
    description: 'Prix (nombre brut)',
    example: '32',
  },
  { name: 'currency', required: false, description: 'Devise', example: 'EUR' },
  {
    name: 'rating',
    required: false,
    description: 'Note de 0 à 5',
    example: '4.8',
  },
  {
    name: 'tags',
    required: false,
    description: 'Tags séparés par |',
    example: 'monument|incontournable',
  },
  {
    name: 'status',
    required: false,
    description: 'planned | done | skipped',
    example: 'booked',
  },
  {
    name: 'tips',
    required: false,
    description: 'Conseil',
    example: "Réserver à l'avance",
  },
  {
    name: 'open_at',
    required: false,
    description: "Horaires d'ouverture",
    example: '09:30-23:45',
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
  {
    name: 'from',
    required: false,
    description: 'Ville / lieu de départ',
    example: 'Paris Gare de Lyon',
  },
  {
    name: 'to',
    required: false,
    description: "Ville / lieu d'arrivée",
    example: 'Lyon Part-Dieu',
  },
  {
    name: 'details',
    required: false,
    description: 'Détails supplémentaires',
    example: 'TGV INOUI direct',
  },
  {
    name: 'departure_address',
    required: false,
    description: 'Adresse de départ',
    example: 'Place Louis Armand 75012 Paris',
  },
  {
    name: 'departure_time',
    required: false,
    description: 'Heure de départ',
    example: '09:00',
  },
  {
    name: 'arrival_time',
    required: false,
    description: "Heure d'arrivée",
    example: '10:58',
  },
  {
    name: 'duration',
    required: false,
    description: 'Durée du trajet',
    example: '1h58',
  },
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
    example: 'https://sncf-connect.com',
  },
  {
    name: 'booking_reference',
    required: false,
    description: 'Référence de réservation',
    example: 'TGV-2026-XY9',
  },
  {
    name: 'price',
    required: false,
    description: 'Prix (nombre brut)',
    example: '65',
  },
  { name: 'currency', required: false, description: 'Devise', example: 'EUR' },
  {
    name: 'seat',
    required: false,
    description: 'Numéro de siège',
    example: '42C',
  },
  {
    name: 'gate',
    required: false,
    description: "Porte d'embarquement",
    example: 'Voie 6',
  },
  { name: 'terminal', required: false, description: 'Terminal', example: '2E' },
  {
    name: 'status',
    required: false,
    description: 'planned | booked | checked-in | completed',
    example: 'booked',
  },
  {
    name: 'notes',
    required: false,
    description: 'Notes libres',
    example: 'Voiture 5 côté fenêtre',
  },
]

// ── 3-day sample template data ────────────────────────────────────────────────

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
] as const

const DAYS_ROWS = [
  [
    'day-1',
    '2026-06-01',
    '1',
    'Paris',
    'Arrivée à Paris',
    '48.8566|2.3522',
    'Tour Eiffel|Champs-Élysées|Montmartre',
    'Brasserie Lipp|Café de Flore',
    '8km',
    'Journée de découverte - rythme tranquille',
    'Baskets confortables|Imperméable léger',
    'arrival',
    'Éviter les taxis depuis CDG|Prendre le RER B',
    'acc-1',
    'Hôtel des Arts Montmartre',
    '5 rue Tholozé 75018 Paris',
    'https://hotel-arts.example.com',
    '2026-06-01',
    '2026-06-03',
    '180',
    'EUR',
    'HDM-2026-001',
    'booked',
  ],
  [
    'day-2',
    '2026-06-02',
    '2',
    'Paris',
    'Musées et Montmartre',
    '48.8837|2.3367',
    "Sacré-Cœur|Musée d'Orsay|Place du Tertre",
    'Crêperie Bretonne|Le Consulat',
    '12km',
    "Réserver le musée en ligne à l'avance",
    "Bouteille d'eau|Chapeau de soleil",
    'sightseeing',
    'Arriver tôt au Sacré-Cœur|Éviter la haute saison',
    'acc-1',
    'Hôtel des Arts Montmartre',
    '5 rue Tholozé 75018 Paris',
    'https://hotel-arts.example.com',
    '2026-06-01',
    '2026-06-03',
    '180',
    'EUR',
    'HDM-2026-001',
    'booked',
  ],
  [
    'day-3',
    '2026-06-03',
    '3',
    'Lyon',
    'Route vers Lyon et gastronomie',
    '45.7640|4.8357',
    'Vieux-Lyon|Fourvière|Traboules',
    'Bouchon Lyonnais|Mère Brazier',
    '6km',
    "Arrivée en début d'après-midi - soirée libre",
    'Sac à dos léger',
    'travel',
    "Réserver le TGV à l'avance|Acheter une baguette gare de Lyon",
    'acc-2',
    'Hôtel Le Royal Lyon',
    '20 Place Bellecour 69002 Lyon',
    'https://le-royal.example.com',
    '2026-06-03',
    '2026-06-05',
    '220',
    'EUR',
    'LRL-2026-042',
    'booked',
  ],
] as const

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
] as const

const ACTIVITIES_ROWS = [
  [
    'act-1',
    'day-1',
    'Montée Tour Eiffel 2e étage',
    'visit',
    '3h',
    'Vue panoramique sur Paris depuis le 2e étage',
    '48.8584|2.2945',
    'Champ de Mars 75007 Paris',
    'https://ticket.toureiffel.paris',
    'true',
    '32',
    'EUR',
    '4.8',
    'monument|vue|incontournable',
    'booked',
    "Réserver 2 semaines à l'avance",
    '09:30-23:45',
  ],
  [
    'act-2',
    'day-1',
    'Arc de Triomphe et Champs-Élysées',
    'experience',
    '2h',
    'Promenade sur la plus belle avenue du monde',
    '48.8738|2.2950',
    'Place Charles de Gaulle 75008 Paris',
    'https://arc-de-triomphe.monuments-nationaux.fr',
    'false',
    '13',
    'EUR',
    '4.6',
    'monument|promenade',
    'planned',
    'Coucher de soleil depuis le sommet',
    '10:00-22:30',
  ],
  [
    'act-3',
    'day-2',
    "Musée d'Orsay - Impressionnisme",
    'visit',
    '4h',
    "La plus grande collection d'impressionnisme au monde",
    '48.8600|2.3266',
    "1 Rue de la Légion d'Honneur 75007 Paris",
    'https://www.musee-orsay.fr',
    'true',
    '16',
    'EUR',
    '4.9',
    'musée|art|impressionnisme',
    'booked',
    'Gratuit le 1er dimanche du mois',
    '09:30-18:00',
  ],
  [
    'act-4',
    'day-2',
    'Sacré-Cœur et Montmartre',
    'visit',
    '2h',
    'Basilique emblématique et quartier artiste',
    '48.8867|2.3431',
    '35 Rue du Chevalier de la Barre 75018 Paris',
    '',
    'false',
    '0',
    'EUR',
    '4.7',
    'monument|basilique|panorama',
    'planned',
    'Arriver tôt pour éviter la foule',
    '06:00-22:30',
  ],
  [
    'act-5',
    'day-3',
    'Vieux-Lyon et Traboules',
    'experience',
    '3h',
    'Ruelles médiévales et passages secrets',
    '45.7601|4.8270',
    'Vieux-Lyon 69005 Lyon',
    'https://visiterlyon.example.com',
    'false',
    '8',
    'EUR',
    '4.5',
    'vieux-lyon|traboules|patrimoine',
    'planned',
    'Prendre un guide local',
    '09:00-20:00',
  ],
] as const

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
] as const

const TRANSPORTS_ROWS = [
  [
    'tr-1',
    'day-1',
    'train',
    'Aéroport CDG',
    'Paris Gare du Nord',
    'RER B direction Saint-Rémy-lès-Chevreuse',
    'Terminal 2 CDG',
    '14:30',
    '15:10',
    '40min',
    'RATP',
    '',
    '',
    '11',
    'EUR',
    '',
    '',
    'Terminal 2',
    'planned',
    'Ticket aux distributeurs automatiques en arrivée',
  ],
  [
    'tr-2',
    'day-3',
    'train',
    'Paris Gare de Lyon',
    'Lyon Part-Dieu',
    'TGV INOUI direct',
    'Place Louis Armand 75012 Paris',
    '09:00',
    '10:58',
    '1h58',
    'SNCF',
    'https://www.sncf-connect.com',
    'TGV-2026-XY9',
    '65',
    'EUR',
    '42C',
    'Voie 6',
    '',
    'booked',
    'Voiture 5 côté fenêtre',
  ],
] as const

// ── CSV helpers ───────────────────────────────────────────────────────────────

function quoteCsvCell(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}

function makeCsv(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const lines = [
    headers.map(quoteCsvCell).join(','),
    ...rows.map((row) => row.map(quoteCsvCell).join(',')),
  ]
  return lines.join('\n')
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
  daysSheet.addRow([...DAYS_HEADERS])
  for (const row of DAYS_ROWS) daysSheet.addRow([...row])

  const actsSheet = wb.addWorksheet('Activities')
  actsSheet.addRow([...ACTIVITIES_HEADERS])
  for (const row of ACTIVITIES_ROWS) actsSheet.addRow([...row])

  const transSheet = wb.addWorksheet('Transports')
  transSheet.addRow([...TRANSPORTS_HEADERS])
  for (const row of TRANSPORTS_ROWS) transSheet.addRow([...row])

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
          <code className="text-muted-foreground ml-auto font-mono text-[10px]">
            {example}
          </code>
        )}
      </div>
      <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
        {description}
      </p>
    </div>
  )
}

function ColumnAccordion() {
  return (
    <Accordion type="multiple">
      <AccordionItem value="days">
        <AccordionTrigger className="text-sm font-medium">
          Colonnes — Days
        </AccordionTrigger>
        <AccordionContent>
          {DAY_COLUMNS.map((col) => (
            <ColumnRow key={col.name} {...col} />
          ))}
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="activities">
        <AccordionTrigger className="text-sm font-medium">
          Colonnes — Activities
        </AccordionTrigger>
        <AccordionContent>
          {ACTIVITY_COLUMNS.map((col) => (
            <ColumnRow key={col.name} {...col} />
          ))}
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="transports">
        <AccordionTrigger className="text-sm font-medium">
          Colonnes — Transports
        </AccordionTrigger>
        <AccordionContent>
          {TRANSPORT_COLUMNS.map((col) => (
            <ColumnRow key={col.name} {...col} />
          ))}
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="conventions">
        <AccordionTrigger className="text-sm font-medium">
          Conventions de saisie
        </AccordionTrigger>
        <AccordionContent>
          <ul className="text-muted-foreground space-y-1.5 text-xs">
            <li>
              <span className="text-foreground font-medium">Listes</span> →
              valeurs séparées par{' '}
              <code className="bg-muted rounded px-1 text-[11px]">|</code> — ex:{' '}
              <code className="bg-muted rounded px-1 text-[11px]">
                Paris|Lyon|Nice
              </code>
            </li>
            <li>
              <span className="text-foreground font-medium">Coordonnées</span> →{' '}
              <code className="bg-muted rounded px-1 text-[11px]">lat|lng</code>{' '}
              — ex:{' '}
              <code className="bg-muted rounded px-1 text-[11px]">
                48.8566|2.3522
              </code>
            </li>
            <li>
              <span className="text-foreground font-medium">Dates</span> →
              format ISO 8601 — ex:{' '}
              <code className="bg-muted rounded px-1 text-[11px]">
                2026-06-01
              </code>
            </li>
            <li>
              <span className="text-foreground font-medium">Booléens</span> →{' '}
              <code className="bg-muted rounded px-1 text-[11px]">true</code> /{' '}
              <code className="bg-muted rounded px-1 text-[11px]">false</code>{' '}
              ou <code className="bg-muted rounded px-1 text-[11px]">oui</code>{' '}
              / <code className="bg-muted rounded px-1 text-[11px]">non</code>
            </li>
            <li>
              <span className="text-foreground font-medium">
                Champs optionnels
              </span>{' '}
              → laisser la cellule vide
            </li>
            <li>
              <span className="text-foreground font-medium">Prix</span> → nombre
              brut — ex:{' '}
              <code className="bg-muted rounded px-1 text-[11px]">120</code> ;
              devise dans la colonne{' '}
              <code className="bg-muted rounded px-1 text-[11px]">
                currency
              </code>
            </li>
            <li>
              <span className="text-foreground font-medium">day_id</span> → doit
              correspondre exactement à un{' '}
              <code className="bg-muted rounded px-1 text-[11px]">id</code> de
              la feuille Days
            </li>
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

// ── JSON template ─────────────────────────────────────────────────────────────

const JSON_TEMPLATE: TripData = {
  tripStartDate: '2026-06-01',
  tripEndDate: '2026-06-03',
  itinerary: [
    {
      id: 'day-1',
      date: '2026-06-01',
      dayNumber: 1,
      city: 'Paris',
      title: 'Arrivée à Paris',
      coordinates: [48.8566, 2.3522],
      highlights: ['Tour Eiffel', 'Champs-Élysées', 'Montmartre'],
      foodRecommendations: ['Brasserie Lipp', 'Café de Flore'],
      walkingDistance: '8km',
      notes: 'Journée de découverte - rythme tranquille',
      packingTips: ['Baskets confortables', 'Imperméable léger'],
      dayType: 'arrival',
      tips: ['Éviter les taxis depuis CDG', 'Prendre le RER B'],
      accommodation: {
        id: 'acc-1',
        name: 'Hôtel des Arts Montmartre',
        address: '5 rue Tholozé 75018 Paris',
        bookingUrl: 'https://hotel-arts.example.com',
        checkIn: '2026-06-01',
        checkOut: '2026-06-03',
        price: 180,
        currency: 'EUR',
        bookingReference: 'HDM-2026-001',
        status: 'booked',
      } satisfies Accommodation,
      activities: [
        {
          id: 'act-1',
          name: 'Montée Tour Eiffel 2e étage',
          type: 'visit',
          duration: '3h',
          description: 'Vue panoramique sur Paris depuis le 2e étage',
          coordinates: [48.8584, 2.2945],
          address: 'Champ de Mars 75007 Paris',
          bookingUrl: 'https://ticket.toureiffel.paris',
          reservationRequired: true,
          price: 32,
          currency: 'EUR',
          rating: 4.8,
          tags: ['monument', 'vue', 'incontournable'],
          status: 'planned',
          tips: "Réserver 2 semaines à l'avance",
          openAt: '09:30-23:45',
        },
        {
          id: 'act-2',
          name: 'Arc de Triomphe et Champs-Élysées',
          type: 'experience',
          duration: '2h',
          description: 'Promenade sur la plus belle avenue du monde',
          coordinates: [48.8738, 2.295],
          address: 'Place Charles de Gaulle 75008 Paris',
          bookingUrl: 'https://arc-de-triomphe.monuments-nationaux.fr',
          reservationRequired: false,
          price: 13,
          currency: 'EUR',
          rating: 4.6,
          tags: ['monument', 'promenade'],
          status: 'planned',
          tips: 'Coucher de soleil depuis le sommet',
          openAt: '10:00-22:30',
        },
      ] satisfies Activity[],
      transport: {
        id: 'tr-1',
        type: 'train',
        from: 'Aéroport CDG',
        to: 'Paris Gare du Nord',
        details: 'RER B direction Saint-Rémy-lès-Chevreuse',
        departureAddress: 'Terminal 2 CDG',
        departureTime: '14:30',
        arrivalTime: '15:10',
        duration: '40min',
        provider: 'RATP',
        price: 11,
        currency: 'EUR',
        status: 'planned',
        notes: 'Ticket aux distributeurs automatiques en arrivée',
      } satisfies Transport,
    },
    {
      id: 'day-2',
      date: '2026-06-02',
      dayNumber: 2,
      city: 'Paris',
      title: 'Musées et Montmartre',
      coordinates: [48.8837, 2.3367],
      highlights: ['Sacré-Cœur', "Musée d'Orsay", 'Place du Tertre'],
      foodRecommendations: ['Crêperie Bretonne', 'Le Consulat'],
      walkingDistance: '12km',
      notes: "Réserver le musée en ligne à l'avance",
      packingTips: ["Bouteille d'eau", 'Chapeau de soleil'],
      dayType: 'sightseeing',
      tips: ['Arriver tôt au Sacré-Cœur', 'Éviter la haute saison'],
      accommodation: {
        id: 'acc-1',
        name: 'Hôtel des Arts Montmartre',
        address: '5 rue Tholozé 75018 Paris',
        bookingUrl: 'https://hotel-arts.example.com',
        checkIn: '2026-06-01',
        checkOut: '2026-06-03',
        price: 180,
        currency: 'EUR',
        bookingReference: 'HDM-2026-001',
        status: 'booked',
      } satisfies Accommodation,
      activities: [
        {
          id: 'act-3',
          name: "Musée d'Orsay - Impressionnisme",
          type: 'visit',
          duration: '4h',
          description: "La plus grande collection d'impressionnisme au monde",
          coordinates: [48.86, 2.3266],
          address: "1 Rue de la Légion d'Honneur 75007 Paris",
          bookingUrl: 'https://www.musee-orsay.fr',
          reservationRequired: true,
          price: 16,
          currency: 'EUR',
          rating: 4.9,
          tags: ['musée', 'art', 'impressionnisme'],
          status: 'planned',
          tips: 'Gratuit le 1er dimanche du mois',
          openAt: '09:30-18:00',
        },
        {
          id: 'act-4',
          name: 'Sacré-Cœur et Montmartre',
          type: 'visit',
          duration: '2h',
          description: 'Basilique emblématique et quartier artiste',
          coordinates: [48.8867, 2.3431],
          address: '35 Rue du Chevalier de la Barre 75018 Paris',
          reservationRequired: false,
          price: 0,
          currency: 'EUR',
          rating: 4.7,
          tags: ['monument', 'basilique', 'panorama'],
          status: 'planned',
          tips: 'Arriver tôt pour éviter la foule',
          openAt: '06:00-22:30',
        },
      ] satisfies Activity[],
    },
    {
      id: 'day-3',
      date: '2026-06-03',
      dayNumber: 3,
      city: 'Lyon',
      title: 'Route vers Lyon et gastronomie',
      coordinates: [45.764, 4.8357],
      highlights: ['Vieux-Lyon', 'Fourvière', 'Traboules'],
      foodRecommendations: ['Bouchon Lyonnais', 'Mère Brazier'],
      walkingDistance: '6km',
      notes: "Arrivée en début d'après-midi - soirée libre",
      packingTips: ['Sac à dos léger'],
      dayType: 'travel',
      tips: ["Réserver le TGV à l'avance", 'Acheter une baguette gare de Lyon'],
      accommodation: {
        id: 'acc-2',
        name: 'Hôtel Le Royal Lyon',
        address: '20 Place Bellecour 69002 Lyon',
        bookingUrl: 'https://le-royal.example.com',
        checkIn: '2026-06-03',
        checkOut: '2026-06-05',
        price: 220,
        currency: 'EUR',
        bookingReference: 'LRL-2026-042',
        status: 'booked',
      } satisfies Accommodation,
      activities: [
        {
          id: 'act-5',
          name: 'Vieux-Lyon et Traboules',
          type: 'experience',
          duration: '3h',
          description: 'Ruelles médiévales et passages secrets',
          coordinates: [45.7601, 4.827],
          address: 'Vieux-Lyon 69005 Lyon',
          bookingUrl: 'https://visiterlyon.example.com',
          reservationRequired: false,
          price: 8,
          currency: 'EUR',
          rating: 4.5,
          tags: ['vieux-lyon', 'traboules', 'patrimoine'],
          status: 'planned',
          tips: 'Prendre un guide local',
          openAt: '09:00-20:00',
        },
      ] satisfies Activity[],
      transport: {
        id: 'tr-2',
        type: 'train',
        from: 'Paris Gare de Lyon',
        to: 'Lyon Part-Dieu',
        details: 'TGV INOUI direct',
        departureAddress: 'Place Louis Armand 75012 Paris',
        departureTime: '09:00',
        arrivalTime: '10:58',
        duration: '1h58',
        provider: 'SNCF',
        bookingUrl: 'https://www.sncf-connect.com',
        bookingReference: 'TGV-2026-XY9',
        price: 65,
        currency: 'EUR',
        seat: '42C',
        gate: 'Voie 6',
        status: 'booked',
        notes: 'Voiture 5 côté fenêtre',
      } satisfies Transport,
    },
  ] satisfies DayItinerary[],
}

function downloadJsonTemplate() {
  const json = JSON.stringify(JSON_TEMPLATE, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'tripbrain-template.json'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Template config ───────────────────────────────────────────────────────────

const CSV_TEMPLATES: {
  name: string
  headers: readonly string[]
  rows: readonly (readonly string[])[]
}[] = [
  { name: 'days.csv', headers: DAYS_HEADERS, rows: DAYS_ROWS },
  {
    name: 'activities.csv',
    headers: ACTIVITIES_HEADERS,
    rows: ACTIVITIES_ROWS,
  },
  {
    name: 'transports.csv',
    headers: TRANSPORTS_HEADERS,
    rows: TRANSPORTS_ROWS,
  },
]

// ── Main component ────────────────────────────────────────────────────────────

export function ImportFormatGuide() {
  const [activeTab, setActiveTab] = useState<'xlsx' | 'csv' | 'json'>('xlsx')
  const [xlsxLoading, setXlsxLoading] = useState(false)
  const [xlsxError, setXlsxError] = useState(false)
  const [allLoading, setAllLoading] = useState(false)
  const [allError, setAllError] = useState(false)
  const [jsonLoading, setJsonLoading] = useState(false)
  const [jsonError, setJsonError] = useState(false)

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

  const handleDownloadAll = async () => {
    setAllLoading(true)
    setAllError(false)
    try {
      for (const { name, headers, rows } of CSV_TEMPLATES) {
        downloadText(name, makeCsv(headers, rows))
      }
    } catch {
      setAllError(true)
    } finally {
      setAllLoading(false)
    }
  }

  const handleJsonDownload = () => {
    setJsonLoading(true)
    setJsonError(false)
    try {
      downloadJsonTemplate()
    } catch {
      setJsonError(true)
    } finally {
      setJsonLoading(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground gap-1.5 text-xs"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          Guide de format
        </Button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-xl">
        {/* ── Header ── */}
        <DialogHeader className="shrink-0 border-b px-5 pt-5 pb-4">
          <DialogTitle>Guide de format d&apos;import</DialogTitle>
          <DialogDescription>
            Choisissez votre format ci-dessous pour voir les instructions et
            télécharger un modèle.
          </DialogDescription>
        </DialogHeader>

        {/* ── Format tabs + scrollable content ── */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'xlsx' | 'csv' | 'json')}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <TabsList className="mx-auto mt-4 mb-0 grid shrink-0 grid-cols-3 rounded-none border-b px-5">
            <TabsTrigger value="xlsx" className="gap-1.5 text-xs">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel
            </TabsTrigger>
            <TabsTrigger value="csv" className="gap-1.5 text-xs">
              <Table className="h-3.5 w-3.5" />
              CSV
            </TabsTrigger>
            <TabsTrigger value="json" className="gap-1.5 text-xs">
              <Braces className="h-3.5 w-3.5" />
              JSON
            </TabsTrigger>
          </TabsList>

          {/* ── XLSX tab ── */}
          <TabsContent
            value="xlsx"
            className="mt-0 min-h-0 flex-1 overflow-y-auto px-5 py-4"
          >
            <div className="space-y-4">
              {/* Conseils */}
              <Alert variant="info">
                <Lightbulb className="h-4 w-4" />
                <AlertTitle>Conseils avant de commencer</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    <li>
                      Un seul fichier{' '}
                      <code className="bg-muted rounded px-1 text-[11px]">
                        .xlsx
                      </code>{' '}
                      avec exactement 3 onglets obligatoires.
                    </li>
                    <li>
                      Les onglets doivent se nommer{' '}
                      <code className="bg-muted rounded px-1 text-[11px]">
                        Days
                      </code>
                      ,{' '}
                      <code className="bg-muted rounded px-1 text-[11px]">
                        Activities
                      </code>{' '}
                      et{' '}
                      <code className="bg-muted rounded px-1 text-[11px]">
                        Transports
                      </code>{' '}
                      (respectez la casse).
                    </li>
                    <li>
                      La première ligne de chaque onglet doit être la ligne
                      d&apos;en-têtes.
                    </li>
                    <li>
                      Les activités et transports sont liés aux jours via la
                      colonne{' '}
                      <code className="bg-muted rounded px-1 text-[11px]">
                        day_id
                      </code>
                      .
                    </li>
                    <li>
                      Laissez une cellule vide pour les champs optionnels.
                    </li>
                  </ul>
                </AlertDescription>
              </Alert>

              {/* Erreurs fréquentes */}
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertTitle>Erreurs fréquentes</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    <li>
                      Onglet mal orthographié — ex :{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        day
                      </code>{' '}
                      au lieu de{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        Days
                      </code>
                      .
                    </li>
                    <li>
                      Ligne d&apos;en-tête manquante ou en ligne 2 (et non 1).
                    </li>
                    <li>
                      Valeur{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        day_id
                      </code>{' '}
                      dans Activities / Transports sans correspondance dans
                      Days.
                    </li>
                    <li>
                      Cellule de prix contenant du texte (ex :{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        120€
                      </code>
                      ) au lieu d&apos;un nombre brut (
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        120
                      </code>
                      ).
                    </li>
                  </ul>
                </AlertDescription>
              </Alert>

              <Separator />
              <ColumnAccordion />
            </div>
          </TabsContent>

          {/* ── CSV tab ── */}
          <TabsContent
            value="csv"
            className="mt-0 min-h-0 flex-1 overflow-y-auto px-5 py-4"
          >
            <div className="space-y-4">
              {/* Conseils */}
              <Alert variant="info">
                <Lightbulb className="h-4 w-4" />
                <AlertTitle>Conseils avant de commencer</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    <li>
                      3 fichiers distincts à sélectionner{' '}
                      <strong>simultanément</strong> lors de l&apos;import.
                    </li>
                    <li>
                      Noms obligatoires (sensibles à la casse) :{' '}
                      <code className="bg-muted rounded px-1 text-[11px]">
                        days.csv
                      </code>
                      ,{' '}
                      <code className="bg-muted rounded px-1 text-[11px]">
                        activities.csv
                      </code>
                      ,{' '}
                      <code className="bg-muted rounded px-1 text-[11px]">
                        transports.csv
                      </code>
                      .
                    </li>
                    <li>
                      Séparateur de colonnes :{' '}
                      <code className="bg-muted rounded px-1 text-[11px]">
                        virgule (,)
                      </code>{' '}
                      — pas le point-virgule.
                    </li>
                    <li>Encodage UTF-8 recommandé (pour les accents).</li>
                    <li>
                      La première ligne de chaque fichier doit être la ligne
                      d&apos;en-têtes.
                    </li>
                  </ul>
                </AlertDescription>
              </Alert>

              {/* Erreurs fréquentes */}
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertTitle>Erreurs fréquentes</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    <li>
                      Nom de fichier incorrect — ex :{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        day.csv
                      </code>{' '}
                      au lieu de{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        days.csv
                      </code>
                      .
                    </li>
                    <li>
                      Importer un seul fichier au lieu des 3 simultanément.
                    </li>
                    <li>
                      Utiliser un point-virgule (
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        ;
                      </code>
                      ) comme séparateur (souvent le cas avec Excel en
                      français).
                    </li>
                    <li>
                      Valeur{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        day_id
                      </code>{' '}
                      sans correspondance dans{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        days.csv
                      </code>
                      .
                    </li>
                  </ul>
                </AlertDescription>
              </Alert>

              <Separator />
              <ColumnAccordion />
            </div>
          </TabsContent>

          {/* ── JSON tab ── */}
          <TabsContent
            value="json"
            className="mt-0 min-h-0 flex-1 overflow-y-auto px-5 py-4"
          >
            <div className="space-y-4">
              {/* Conseils */}
              <Alert variant="info">
                <Lightbulb className="h-4 w-4" />
                <AlertTitle>Conseils avant de commencer</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    <li>
                      Un seul fichier{' '}
                      <code className="bg-muted rounded px-1 text-[11px]">
                        .json
                      </code>{' '}
                      contenant l&apos;intégralité du voyage.
                    </li>
                    <li>
                      Structure racine :{' '}
                      <code className="bg-muted rounded px-1 text-[11px]">
                        {'{ itinerary, tripStartDate, tripEndDate }'}
                      </code>
                    </li>
                    <li>
                      Les clés sont en <strong>camelCase</strong> — ex :{' '}
                      <code className="bg-muted rounded px-1 text-[11px]">
                        dayNumber
                      </code>
                      ,{' '}
                      <code className="bg-muted rounded px-1 text-[11px]">
                        bookingUrl
                      </code>
                      .
                    </li>
                    <li>
                      Les coordonnées sont un tableau{' '}
                      <code className="bg-muted rounded px-1 text-[11px]">
                        [lat, lng]
                      </code>{' '}
                      de nombres.
                    </li>
                    <li>
                      Les listes (highlights, tags…) sont des tableaux JSON
                      classiques.
                    </li>
                    <li>
                      Activités et transport sont imbriqués dans chaque jour
                      (pas de{' '}
                      <code className="bg-muted rounded px-1 text-[11px]">
                        day_id
                      </code>
                      ).
                    </li>
                  </ul>
                </AlertDescription>
              </Alert>

              {/* Erreurs fréquentes */}
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertTitle>Erreurs fréquentes</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    <li>
                      Clé{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        itinerary
                      </code>{' '}
                      manquante ou pas un tableau.
                    </li>
                    <li>
                      Dates{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        tripStartDate
                      </code>{' '}
                      /{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        tripEndDate
                      </code>{' '}
                      manquantes.
                    </li>
                    <li>
                      Coordonnées en string{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        &quot;48.85|2.35&quot;
                      </code>{' '}
                      au lieu d&apos;un tableau{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        [48.85, 2.35]
                      </code>
                      .
                    </li>
                    <li>
                      Prix en string{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        &quot;120&quot;
                      </code>{' '}
                      au lieu d&apos;un nombre{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        120
                      </code>
                      .
                    </li>
                    <li>
                      Utiliser{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        snake_case
                      </code>{' '}
                      au lieu de{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        camelCase
                      </code>{' '}
                      (ex :{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        day_number
                      </code>{' '}
                      → doit être{' '}
                      <code className="bg-destructive/10 rounded px-1 text-[11px]">
                        dayNumber
                      </code>
                      ).
                    </li>
                  </ul>
                </AlertDescription>
              </Alert>

              <Separator />

              {/* Structure JSON */}
              <Accordion type="multiple">
                <AccordionItem value="json-structure">
                  <AccordionTrigger className="text-sm font-medium">
                    Structure du fichier
                  </AccordionTrigger>
                  <AccordionContent>
                    <pre className="bg-muted overflow-x-auto rounded-md p-3 font-mono text-[11px] leading-relaxed">
                      {`{
  "tripStartDate": "2026-06-01",
  "tripEndDate": "2026-06-03",
  "itinerary": [
    {
      "id": "day-1",
      "date": "2026-06-01",
      "dayNumber": 1,
      "city": "Paris",
      "title": "Arrivée à Paris",
      "coordinates": [48.8566, 2.3522],
      "highlights": ["Tour Eiffel", "…"],
      "activities": [ { … } ],
      "transport": { … },
      "accommodation": { … }
    }
  ]
}`}
                    </pre>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="json-day">
                  <AccordionTrigger className="text-sm font-medium">
                    Propriétés d&apos;un jour
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="text-muted-foreground space-y-1 text-xs">
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          id
                        </code>{' '}
                        <Badge
                          variant="default"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          requis
                        </Badge>{' '}
                        — Identifiant unique
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          date
                        </code>{' '}
                        <Badge
                          variant="default"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          requis
                        </Badge>{' '}
                        — Date ISO 8601
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          city
                        </code>{' '}
                        <Badge
                          variant="default"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          requis
                        </Badge>{' '}
                        — Ville
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          title
                        </code>{' '}
                        <Badge
                          variant="default"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          requis
                        </Badge>{' '}
                        — Titre de la journée
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          coordinates
                        </code>{' '}
                        <Badge
                          variant="default"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          requis
                        </Badge>{' '}
                        — <code className="text-[10px]">[lat, lng]</code>
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          activities
                        </code>{' '}
                        <Badge
                          variant="default"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          requis
                        </Badge>{' '}
                        — Tableau d&apos;activités
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          dayNumber
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — N° du jour
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          highlights
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Tableau de points forts
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          foodRecommendations
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Tableau de restos
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          walkingDistance
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Distance de marche
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          notes
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Notes libres
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          packingTips
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Conseils bagages
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          dayType
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — arrival | sightseeing | travel | rest
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          tips
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Tableau de conseils
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          transport
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Objet transport
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          accommodation
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Objet hébergement
                      </li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="json-activity">
                  <AccordionTrigger className="text-sm font-medium">
                    Propriétés d&apos;une activité
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="text-muted-foreground space-y-1 text-xs">
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          id
                        </code>{' '}
                        <Badge
                          variant="default"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          requis
                        </Badge>{' '}
                        — Identifiant unique
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          name
                        </code>{' '}
                        <Badge
                          variant="default"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          requis
                        </Badge>{' '}
                        — Nom
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          type
                        </code>{' '}
                        <Badge
                          variant="default"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          requis
                        </Badge>{' '}
                        — visit | food | transport | experience | shopping
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          duration
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Durée libre
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          description
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Description
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          coordinates
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — <code className="text-[10px]">[lat, lng]</code>
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          address
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Adresse
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          bookingUrl
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — URL de réservation
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          reservationRequired
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Booléen
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          price
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Nombre
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          currency
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Devise
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          rating
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Note 0-5
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          tags
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Tableau de tags
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          status
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — planned | done | skipped
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          tips
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Conseil (string)
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          openAt
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Horaires
                      </li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="json-transport">
                  <AccordionTrigger className="text-sm font-medium">
                    Propriétés d&apos;un transport
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="text-muted-foreground space-y-1 text-xs">
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          id
                        </code>{' '}
                        <Badge
                          variant="default"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          requis
                        </Badge>{' '}
                        — Identifiant unique
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          type
                        </code>{' '}
                        <Badge
                          variant="default"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          requis
                        </Badge>{' '}
                        — train | car | plane | bus
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          from
                        </code>{' '}
                        /{' '}
                        <code className="bg-muted rounded px-1 text-[11px]">
                          to
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Départ / Arrivée
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          details
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Détails
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          departureAddress
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Adresse départ
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          departureTime
                        </code>{' '}
                        /{' '}
                        <code className="bg-muted rounded px-1 text-[11px]">
                          arrivalTime
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Horaires
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          duration
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Durée
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          provider
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Compagnie
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          bookingUrl
                        </code>{' '}
                        /{' '}
                        <code className="bg-muted rounded px-1 text-[11px]">
                          bookingReference
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Réservation
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          price
                        </code>{' '}
                        /{' '}
                        <code className="bg-muted rounded px-1 text-[11px]">
                          currency
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Prix
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          seat
                        </code>{' '}
                        /{' '}
                        <code className="bg-muted rounded px-1 text-[11px]">
                          gate
                        </code>{' '}
                        /{' '}
                        <code className="bg-muted rounded px-1 text-[11px]">
                          terminal
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          status
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — planned | booked | checked-in | completed
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          notes
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Notes libres
                      </li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="json-accommodation">
                  <AccordionTrigger className="text-sm font-medium">
                    Propriétés d&apos;un hébergement
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="text-muted-foreground space-y-1 text-xs">
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          id
                        </code>{' '}
                        <Badge
                          variant="default"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          requis
                        </Badge>{' '}
                        — Identifiant unique
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          name
                        </code>{' '}
                        <Badge
                          variant="default"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          requis
                        </Badge>{' '}
                        — Nom
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          address
                        </code>{' '}
                        <Badge
                          variant="default"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          requis
                        </Badge>{' '}
                        — Adresse
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          bookingUrl
                        </code>{' '}
                        <Badge
                          variant="default"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          requis
                        </Badge>{' '}
                        — URL de réservation
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          checkIn
                        </code>{' '}
                        /{' '}
                        <code className="bg-muted rounded px-1 text-[11px]">
                          checkOut
                        </code>{' '}
                        <Badge
                          variant="default"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          requis
                        </Badge>{' '}
                        — Dates
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          price
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Nombre
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          currency
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Devise
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          bookingReference
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — Référence
                      </li>
                      <li>
                        <code className="bg-muted rounded px-1 text-[11px]">
                          status
                        </code>{' '}
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          optionnel
                        </Badge>{' '}
                        — planned | booked | checked-in | completed
                      </li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </TabsContent>
        </Tabs>

        {/* ── Sticky footer — download buttons ── */}
        <div className="bg-background shrink-0 space-y-2 border-t px-5 py-3">
          {activeTab === 'xlsx' && (
            <Button
              className="w-full gap-2"
              onClick={handleXlsxDownload}
              disabled={xlsxLoading}
            >
              <Download className="h-4 w-4" />
              {xlsxLoading
                ? 'Génération…'
                : xlsxError
                  ? 'Erreur — réessayer'
                  : 'Télécharger le modèle Excel (.xlsx)'}
            </Button>
          )}
          {activeTab === 'csv' && (
            <>
              <div className="flex flex-wrap gap-2">
                {CSV_TEMPLATES.map(({ name, headers, rows }) => (
                  <Button
                    key={name}
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={() => downloadText(name, makeCsv(headers, rows))}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {name}
                  </Button>
                ))}
              </div>
              <Button
                className="w-full gap-2"
                onClick={handleDownloadAll}
                disabled={allLoading}
              >
                <Download className="h-4 w-4" />
                {allLoading
                  ? 'Téléchargement…'
                  : allError
                    ? 'Erreur — réessayer'
                    : `Tout télécharger (${CSV_TEMPLATES.length} csv)`}
              </Button>
            </>
          )}
          {activeTab === 'json' && (
            <Button
              className="w-full gap-2"
              onClick={handleJsonDownload}
              disabled={jsonLoading}
            >
              <Download className="h-4 w-4" />
              {jsonLoading
                ? 'Génération…'
                : jsonError
                  ? 'Erreur — réessayer'
                  : 'Télécharger le modèle JSON (.json)'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Download, HelpCircle, AlertTriangle, CheckCircle2, FileJson, FileText } from 'lucide-react'
import { EXAMPLE_CSV } from '@/lib/csv-parser'

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const EXAMPLE_JSON = JSON.stringify(
  {
    tripStartDate: '2026-06-01',
    tripEndDate: '2026-06-05',
    itinerary: [
      {
        date: '2026-06-01',
        dayNumber: 1,
        city: 'Paris',
        title: 'Arrivée à Paris',
        coordinates: [48.8566, 2.3522],
        dayType: 'arrival',
        walkingDistance: '4 km',
        notes: "Journée tranquille pour s'installer.",
        highlights: ['Tour Eiffel', 'Montmartre'],
        tips: ['Prendre le RER B depuis CDG'],
        activities: [
          { name: 'Tour Eiffel', type: 'visit', duration: '2h' },
          { name: 'Dîner quartier latin', type: 'food', duration: '1h30' },
        ],
        accommodation: {
          name: 'Hôtel des Arts',
          address: '12 rue de la Paix, Paris',
          bookingUrl: 'https://booking.com/hotel-des-arts',
          checkIn: '15:00',
          checkOut: '11:00',
        },
        transport: {
          type: 'plane',
          from: 'Lyon',
          to: 'Paris',
          details: 'Vol AF1234 - arrivée 14h00',
        },
      },
    ],
  },
  null,
  2,
)

interface FormatGuideDialogProps {
  trigger?: React.ReactNode
}

export function FormatGuideDialog({ trigger }: FormatGuideDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
            <HelpCircle className="h-3.5 w-3.5" />
            Guide du format
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="text-primary h-5 w-5" />
            Guide d&apos;importation
          </DialogTitle>
          <DialogDescription>
            Tout ce qu&apos;il faut savoir pour importer vos données dans TripBrain.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="csv" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="csv" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Format CSV
            </TabsTrigger>
            <TabsTrigger value="json" className="gap-1.5">
              <FileJson className="h-3.5 w-3.5" />
              Format JSON
            </TabsTrigger>
          </TabsList>

          {/* ────────────────── CSV TAB ────────────────── */}
          <TabsContent value="csv" className="space-y-4 pt-2">
            <p className="text-muted-foreground text-sm">
              Le format CSV est idéal pour créer ou modifier votre itinéraire dans un tableur
              (Excel, Google Sheets, LibreOffice Calc).
            </p>

            {/* Required columns */}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Colonnes obligatoires</h3>
              <div className="space-y-1.5">
                {[
                  { col: 'tripStartDate', desc: 'Date de début du voyage (AAAA-MM-JJ) — première ligne uniquement' },
                  { col: 'tripEndDate', desc: 'Date de fin du voyage (AAAA-MM-JJ) — première ligne uniquement' },
                  { col: 'date', desc: 'Date du jour (AAAA-MM-JJ)' },
                  { col: 'dayNumber', desc: 'Numéro du jour (entier commençant à 1)' },
                  { col: 'city', desc: 'Ville principale du jour' },
                  { col: 'title', desc: 'Titre descriptif de la journée' },
                  { col: 'latitude', desc: 'Latitude en degrés décimaux (ex : 48.8566)' },
                  { col: 'longitude', desc: 'Longitude en degrés décimaux (ex : 2.3522)' },
                ].map(({ col, desc }) => (
                  <div key={col} className="flex gap-2 text-sm">
                    <code className="bg-muted text-foreground shrink-0 rounded px-1.5 py-0.5 font-mono text-xs">
                      {col}
                    </code>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Optional columns */}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Colonnes optionnelles</h3>
              <div className="space-y-1.5">
                {[
                  { col: 'dayType', desc: 'Type de journée : arrival, departure ou vide' },
                  { col: 'walkingDistance', desc: 'Distance de marche estimée (ex : 6 km)' },
                  { col: 'notes', desc: 'Notes libres sur la journée' },
                  { col: 'highlights', desc: 'Points forts séparés par | (ex : Tour Eiffel|Montmartre)' },
                  { col: 'tips', desc: 'Conseils pratiques séparés par |' },
                  { col: 'foodRecommendations', desc: 'Recommandations culinaires séparées par |' },
                  { col: 'packingTips', desc: 'Conseils bagages séparés par |' },
                  {
                    col: 'activities',
                    desc: 'Activités au format nom|type|durée séparées par ; (ex : Tour Eiffel|visit|2h;Déjeuner|food|1h)',
                  },
                  { col: 'accommodationName', desc: "Nom de l'hébergement" },
                  { col: 'accommodationAddress', desc: "Adresse de l'hébergement" },
                  { col: 'accommodationBookingUrl', desc: 'URL de réservation' },
                  { col: 'accommodationCheckIn', desc: "Heure d'arrivée (ex : 15:00)" },
                  { col: 'accommodationCheckOut', desc: 'Heure de départ (ex : 11:00)' },
                  { col: 'transportType', desc: 'Mode de transport : train, car, plane ou bus' },
                  { col: 'transportFrom', desc: 'Ville de départ du transport' },
                  { col: 'transportTo', desc: "Ville d'arrivée du transport" },
                  { col: 'transportDetails', desc: 'Détails du transport (numéro de vol, etc.)' },
                ].map(({ col, desc }) => (
                  <div key={col} className="flex gap-2 text-sm">
                    <code className="bg-muted text-foreground shrink-0 rounded px-1.5 py-0.5 font-mono text-xs">
                      {col}
                    </code>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Activity types */}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Types d&apos;activité valides</h3>
              <div className="flex flex-wrap gap-1.5">
                {['visit', 'transport', 'food', 'experience', 'shopping'].map((t) => (
                  <Badge key={t} variant="secondary" className="font-mono text-xs">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Common errors */}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <AlertTriangle className="text-warning h-4 w-4" />
                Erreurs fréquentes
              </h3>
              <ul className="text-muted-foreground space-y-1.5 text-sm">
                <li className="flex gap-2">
                  <span className="text-destructive shrink-0">✗</span>
                  <span>
                    Oublier <code className="bg-muted rounded px-1 font-mono text-xs">tripStartDate</code> et{' '}
                    <code className="bg-muted rounded px-1 font-mono text-xs">tripEndDate</code> sur la première ligne
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-destructive shrink-0">✗</span>
                  <span>
                    Utiliser <code className="bg-muted rounded px-1 font-mono text-xs">48,8566</code> au lieu de{' '}
                    <code className="bg-muted rounded px-1 font-mono text-xs">48.8566</code> pour les coordonnées (point décimal obligatoire)
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-destructive shrink-0">✗</span>
                  <span>
                    Utiliser un type d&apos;activité non reconnu (ex : <code className="bg-muted rounded px-1 font-mono text-xs">museum</code>) — les types valides sont listés ci-dessus
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-destructive shrink-0">✗</span>
                  <span>
                    Oublier les guillemets autour d&apos;un champ qui contient une virgule (Excel le fait automatiquement)
                  </span>
                </li>
              </ul>
            </div>

            {/* Tips */}
            <div className="bg-primary/5 rounded-lg p-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <CheckCircle2 className="text-primary h-4 w-4" />
                Conseils
              </h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>• Commencez à partir de l&apos;exemple ci-dessous et adaptez-le.</li>
                <li>• Laissez les colonnes vides si vous n&apos;avez pas l&apos;information.</li>
                <li>• Sauvegardez votre tableur en <strong>.csv (UTF-8)</strong>.</li>
                <li>• Toutes les colonnes doivent être présentes même si elles sont vides.</li>
              </ul>
            </div>

            <Button
              className="w-full gap-2"
              onClick={() => downloadFile(EXAMPLE_CSV, 'exemple-tripbrain.csv', 'text/csv;charset=utf-8')}
            >
              <Download className="h-4 w-4" />
              Télécharger l&apos;exemple CSV
            </Button>
          </TabsContent>

          {/* ────────────────── JSON TAB ────────────────── */}
          <TabsContent value="json" className="space-y-4 pt-2">
            <p className="text-muted-foreground text-sm">
              Le format JSON est le format natif de TripBrain. Utilisez l&apos;export depuis l&apos;application pour
              obtenir un fichier valide, ou construisez-le manuellement en respectant la structure ci-dessous.
            </p>

            {/* Top-level structure */}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Structure de haut niveau</h3>
              <div className="space-y-1.5">
                {[
                  { field: 'tripStartDate', type: 'string', desc: 'Date de début — format AAAA-MM-JJ' },
                  { field: 'tripEndDate', type: 'string', desc: 'Date de fin — format AAAA-MM-JJ' },
                  { field: 'itinerary', type: 'DayItinerary[]', desc: 'Tableau des journées du voyage' },
                ].map(({ field, type, desc }) => (
                  <div key={field} className="flex gap-2 text-sm">
                    <code className="bg-muted text-foreground shrink-0 rounded px-1.5 py-0.5 font-mono text-xs">
                      {field}
                    </code>
                    <Badge variant="outline" className="shrink-0 font-mono text-xs">
                      {type}
                    </Badge>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* DayItinerary fields */}
            <div>
              <h3 className="mb-2 text-sm font-semibold">
                Champs d&apos;une journée (<code className="font-mono text-xs">DayItinerary</code>)
              </h3>
              <div className="space-y-1.5">
                {[
                  { field: 'date', type: 'string', req: true, desc: 'Date (AAAA-MM-JJ)' },
                  { field: 'dayNumber', type: 'number', req: true, desc: 'Numéro du jour (commence à 1)' },
                  { field: 'city', type: 'string', req: true, desc: 'Ville principale' },
                  { field: 'title', type: 'string', req: true, desc: 'Titre de la journée' },
                  { field: 'coordinates', type: '[lat, lng]', req: true, desc: 'Coordonnées GPS [latitude, longitude]' },
                  { field: 'activities', type: 'Activity[]', req: true, desc: 'Liste des activités (peut être vide [])' },
                  { field: 'dayType', type: 'string', req: false, desc: 'Type : arrival, departure' },
                  { field: 'walkingDistance', type: 'string', req: false, desc: 'Distance à pied (ex : "6 km")' },
                  { field: 'notes', type: 'string', req: false, desc: 'Notes libres' },
                  { field: 'highlights', type: 'string[]', req: false, desc: 'Points forts' },
                  { field: 'tips', type: 'string[]', req: false, desc: 'Conseils pratiques' },
                  { field: 'foodRecommendations', type: 'string[]', req: false, desc: 'Recommandations culinaires' },
                  { field: 'packingTips', type: 'string[]', req: false, desc: 'Conseils bagages' },
                  { field: 'accommodation', type: 'Accommodation', req: false, desc: "Détails de l'hébergement" },
                  { field: 'transport', type: 'Transport', req: false, desc: 'Détails du transport' },
                ].map(({ field, type, req, desc }) => (
                  <div key={field} className="flex gap-2 text-sm">
                    <code className="bg-muted text-foreground shrink-0 rounded px-1.5 py-0.5 font-mono text-xs">
                      {field}
                    </code>
                    <Badge variant="outline" className="shrink-0 font-mono text-xs">
                      {type}
                    </Badge>
                    {req ? (
                      <Badge variant="destructive" className="shrink-0 text-xs">
                        requis
                      </Badge>
                    ) : null}
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Common errors */}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <AlertTriangle className="text-warning h-4 w-4" />
                Erreurs fréquentes
              </h3>
              <ul className="text-muted-foreground space-y-1.5 text-sm">
                <li className="flex gap-2">
                  <span className="text-destructive shrink-0">✗</span>
                  <span>JSON mal formé (virgule manquante, guillemets incorrects) — validez sur jsonlint.com</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-destructive shrink-0">✗</span>
                  <span>
                    Champ <code className="bg-muted rounded px-1 font-mono text-xs">itinerary</code> absent ou non tableau
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-destructive shrink-0">✗</span>
                  <span>
                    Dates au mauvais format (JJ/MM/AAAA au lieu de AAAA-MM-JJ)
                  </span>
                </li>
              </ul>
            </div>

            <Button
              className="w-full gap-2"
              onClick={() => downloadFile(EXAMPLE_JSON, 'exemple-tripbrain.json', 'application/json')}
            >
              <Download className="h-4 w-4" />
              Télécharger l&apos;exemple JSON
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

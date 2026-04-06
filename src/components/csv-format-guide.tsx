'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { HelpCircle } from 'lucide-react'

// ---------------------------------------------------------------------------
// Responsive field reference row
// ---------------------------------------------------------------------------

function FieldRow({
  name,
  description,
  example,
}: {
  name: string
  description: string
  example: string
}) {
  return (
    <div className="border-b px-3 py-2 last:border-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <code className="shrink-0 font-mono text-xs font-semibold">{name}</code>
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

      <DialogContent className="max-h-[85dvh] w-[calc(100%-1rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Guide du format CSV</DialogTitle>
          <DialogDescription>
            Structure attendue pour l&apos;import d&apos;un itinéraire au format
            CSV.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          {/* Overview */}
          <section className="space-y-1">
            <h3 className="font-semibold">Principe général</h3>
            <p className="text-muted-foreground leading-relaxed">
              Chaque ligne représente <strong>une journée</strong>. La première
              ligne doit être la ligne d&apos;en-têtes. Les dates de début et de
              fin du voyage sont déduites automatiquement du premier et du
              dernier jour.
            </p>
          </section>

          {/* Required columns */}
          <section className="space-y-2">
            <h3 className="font-semibold">Colonnes obligatoires</h3>
            <div className="rounded-lg border">
              <FieldRow
                name="date"
                description="Date de la journée (YYYY-MM-DD)"
                example="2025-06-01"
              />
              <FieldRow
                name="dayNumber"
                description="Numéro du jour (entier)"
                example="1"
              />
              <FieldRow
                name="city"
                description="Ville du jour"
                example="Paris"
              />
              <FieldRow
                name="title"
                description="Titre court du jour"
                example="Arrivée à Paris"
              />
            </div>
          </section>

          {/* Optional columns */}
          <section className="space-y-2">
            <h3 className="font-semibold">Colonnes optionnelles</h3>
            <div className="rounded-lg border">
              <FieldRow
                name="coordinates"
                description="Coordonnées géographiques — lat|lon"
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
                description="Conseils de bagages séparés par |"
                example="Parapluie|Chargeur"
              />
              <FieldRow
                name="tips"
                description="Conseils pratiques séparés par |"
                example="Réserver à l'avance"
              />
            </div>
          </section>

          {/* Activities */}
          <section className="space-y-2">
            <h3 className="font-semibold">Activités</h3>
            <p className="text-muted-foreground leading-relaxed">
              Colonne{' '}
              <code className="bg-muted rounded px-1 font-mono">
                activities
              </code>{' '}
              — plusieurs activités séparées par{' '}
              <strong>
                <code className="bg-muted rounded px-1 font-mono">;</code>
              </strong>
              , chaque activité encodée avec ses champs séparés par{' '}
              <strong>
                <code className="bg-muted rounded px-1 font-mono">|</code>
              </strong>{' '}
              dans l&apos;ordre suivant :
            </p>
            <div className="rounded-lg border">
              {[
                ['name', 'Nom (obligatoire)', 'Tour Eiffel'],
                [
                  'type',
                  'visit · transport · food · experience · shopping',
                  'visit',
                ],
                ['duration', 'Durée', '2h'],
                ['description', 'Description libre', 'Monument emblématique'],
                ['address', 'Adresse', 'Champ de Mars, Paris'],
                ['bookingUrl', 'URL de réservation', 'https://...'],
                ['price', 'Prix (nombre)', '29.90'],
                ['currency', 'Devise', 'EUR'],
                ['rating', 'Note (nombre)', '4.5'],
                ['status', 'planned · done · skipped', 'planned'],
                ['openAt', "Horaires d'ouverture", '09:00–18:00'],
                ['tips', 'Conseil pratique', 'Arriver tôt'],
              ].map(([field, desc, ex]) => (
                <FieldRow
                  key={field}
                  name={field}
                  description={desc}
                  example={ex}
                />
              ))}
            </div>
            <div className="bg-muted break-all rounded-lg p-3 font-mono text-xs overflow-x-auto">
              Tour Eiffel|visit|2h|Monument emblématique|Champ de Mars||29.90|EUR|4.5|planned|09:00–18:00|Arriver tôt;Déjeuner|food|1h30
            </div>
          </section>

          {/* Accommodation */}
          <section className="space-y-2">
            <h3 className="font-semibold">Hébergement</h3>
            <div className="rounded-lg border">
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
          </section>

          {/* Transport */}
          <section className="space-y-2">
            <h3 className="font-semibold">Transport</h3>
            <div className="rounded-lg border">
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
          </section>

          {/* Full example */}
          <section className="space-y-2">
            <h3 className="font-semibold">Exemple complet</h3>
            <div className="bg-muted overflow-x-auto rounded-lg p-3">
              <pre className="text-xs leading-relaxed whitespace-pre">
                {[
                  'date,dayNumber,city,title,coordinates,highlights,activities,accommodationName,transportType,transportFrom,transportTo',
                  '2025-06-01,1,Paris,Arrivée à Paris,48.8566|2.3522,Tour Eiffel|Louvre,Tour Eiffel|visit|2h;Dîner|food|1h,Hôtel Lumière,train,CDG,Paris',
                  '2025-06-02,2,Paris,Journée musées,48.8566|2.3522,Louvre|Orsay,Louvre|visit|4h;Orsay|visit|2h,Hôtel Lumière,,',
                ].join('\n')}
              </pre>
            </div>
            <p className="text-muted-foreground text-xs">
              Les valeurs contenant des virgules doivent être entourées de
              guillemets doubles.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}


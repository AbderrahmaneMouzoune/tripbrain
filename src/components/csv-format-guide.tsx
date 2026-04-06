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

export function CsvFormatGuide() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto gap-1 px-2 py-1 text-xs">
          <HelpCircle className="h-3.5 w-3.5" />
          Format CSV
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Guide du format CSV</DialogTitle>
          <DialogDescription>
            Structure attendue pour l&apos;import d&apos;un itinéraire au format CSV.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          {/* Overview */}
          <section className="space-y-1">
            <h3 className="font-semibold">Principe général</h3>
            <p className="text-muted-foreground leading-relaxed">
              Chaque ligne du fichier CSV représente <strong>une journée</strong> de
              l&apos;itinéraire. La première ligne doit être la ligne d&apos;en-têtes de
              colonnes.
            </p>
          </section>

          {/* Required columns */}
          <section className="space-y-2">
            <h3 className="font-semibold">Colonnes obligatoires</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Colonne</th>
                    <th className="px-3 py-2 text-left font-medium">Description</th>
                    <th className="px-3 py-2 text-left font-medium">Exemple</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="px-3 py-2 font-mono">date</td>
                    <td className="px-3 py-2 text-muted-foreground">Date de la journée</td>
                    <td className="px-3 py-2 font-mono">2025-06-01</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono">dayNumber</td>
                    <td className="px-3 py-2 text-muted-foreground">Numéro du jour (entier)</td>
                    <td className="px-3 py-2 font-mono">1</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono">city</td>
                    <td className="px-3 py-2 text-muted-foreground">Ville du jour</td>
                    <td className="px-3 py-2 font-mono">Paris</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono">title</td>
                    <td className="px-3 py-2 text-muted-foreground">Titre court du jour</td>
                    <td className="px-3 py-2 font-mono">Arrivée à Paris</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Trip dates */}
          <section className="space-y-2">
            <h3 className="font-semibold">Dates du voyage (première ligne de données)</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Colonne</th>
                    <th className="px-3 py-2 text-left font-medium">Description</th>
                    <th className="px-3 py-2 text-left font-medium">Exemple</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="px-3 py-2 font-mono">tripStartDate</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      Début du voyage (YYYY-MM-DD). Si absent, utilise la date du 1er jour.
                    </td>
                    <td className="px-3 py-2 font-mono">2025-06-01</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono">tripEndDate</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      Fin du voyage (YYYY-MM-DD). Si absent, utilise la date du dernier jour.
                    </td>
                    <td className="px-3 py-2 font-mono">2025-06-19</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Optional columns */}
          <section className="space-y-2">
            <h3 className="font-semibold">Colonnes optionnelles</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Colonne</th>
                    <th className="px-3 py-2 text-left font-medium">Format</th>
                    <th className="px-3 py-2 text-left font-medium">Exemple</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="px-3 py-2 font-mono">coordinates</td>
                    <td className="px-3 py-2 text-muted-foreground">lat|lon</td>
                    <td className="px-3 py-2 font-mono">48.8566|2.3522</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono">notes</td>
                    <td className="px-3 py-2 text-muted-foreground">Texte libre</td>
                    <td className="px-3 py-2 font-mono">Journée de visite tranquille</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono">walkingDistance</td>
                    <td className="px-3 py-2 text-muted-foreground">Texte libre</td>
                    <td className="px-3 py-2 font-mono">8 km</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono">dayType</td>
                    <td className="px-3 py-2 text-muted-foreground">Texte libre</td>
                    <td className="px-3 py-2 font-mono">arrival</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono">highlights</td>
                    <td className="px-3 py-2 text-muted-foreground">Liste séparée par |</td>
                    <td className="px-3 py-2 font-mono">Tour Eiffel|Louvre</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono">foodRecommendations</td>
                    <td className="px-3 py-2 text-muted-foreground">Liste séparée par |</td>
                    <td className="px-3 py-2 font-mono">Croissant|Baguette</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono">packingTips</td>
                    <td className="px-3 py-2 text-muted-foreground">Liste séparée par |</td>
                    <td className="px-3 py-2 font-mono">Parapluie|Chargeur</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono">tips</td>
                    <td className="px-3 py-2 text-muted-foreground">Liste séparée par |</td>
                    <td className="px-3 py-2 font-mono">Réserver à l&apos;avance</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Activities */}
          <section className="space-y-2">
            <h3 className="font-semibold">Activités</h3>
            <p className="text-muted-foreground leading-relaxed">
              Colonne <code className="bg-muted rounded px-1 font-mono">activities</code> —
              plusieurs activités séparées par <strong>;</strong>, chaque activité au format{' '}
              <code className="bg-muted rounded px-1 font-mono">nom|type|durée</code>.
            </p>
            <p className="text-muted-foreground">
              Types valides :{' '}
              {['visit', 'transport', 'food', 'experience', 'shopping'].map((t) => (
                <code key={t} className="bg-muted mx-0.5 rounded px-1 font-mono">
                  {t}
                </code>
              ))}
            </p>
            <div className="bg-muted rounded-lg p-3 font-mono text-xs break-all">
              Louvre|visit|3h;Déjeuner|food|1h30;Montmartre|visit|2h
            </div>
          </section>

          {/* Accommodation */}
          <section className="space-y-2">
            <h3 className="font-semibold">Hébergement</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Colonne</th>
                    <th className="px-3 py-2 text-left font-medium">Exemple</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    ['accommodationName', 'Hôtel de la Paix'],
                    ['accommodationAddress', '10 Rue de la Paix, Paris'],
                    ['accommodationCheckIn', '15:00'],
                    ['accommodationCheckOut', '11:00'],
                    ['accommodationBookingUrl', 'https://booking.com/...'],
                  ].map(([col, ex]) => (
                    <tr key={col}>
                      <td className="px-3 py-2 font-mono">{col}</td>
                      <td className="px-3 py-2 text-muted-foreground">{ex}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Transport */}
          <section className="space-y-2">
            <h3 className="font-semibold">Transport</h3>
            <p className="text-muted-foreground">
              Types valides :{' '}
              {['train', 'car', 'plane', 'bus'].map((t) => (
                <code key={t} className="bg-muted mx-0.5 rounded px-1 font-mono">
                  {t}
                </code>
              ))}
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Colonne</th>
                    <th className="px-3 py-2 text-left font-medium">Exemple</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    ['transportType', 'train'],
                    ['transportFrom', 'Paris Gare de Lyon'],
                    ['transportTo', 'Lyon Part-Dieu'],
                    ['transportDetails', 'TGV 6607'],
                    ['transportDepartureTime', '08:30'],
                    ['transportArrivalTime', '10:00'],
                  ].map(([col, ex]) => (
                    <tr key={col}>
                      <td className="px-3 py-2 font-mono">{col}</td>
                      <td className="px-3 py-2 text-muted-foreground">{ex}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Full example */}
          <section className="space-y-2">
            <h3 className="font-semibold">Exemple complet</h3>
            <div className="bg-muted overflow-x-auto rounded-lg p-3">
              <pre className="text-xs leading-relaxed whitespace-pre">
{`tripStartDate,tripEndDate,date,dayNumber,city,title,coordinates,notes,highlights,activities,accommodationName,transportType,transportFrom,transportTo
2025-06-01,2025-06-03,2025-06-01,1,Paris,Arrivée à Paris,48.8566|2.3522,Première journée,Tour Eiffel|Champs-Élysées,Tour Eiffel|visit|2h;Dîner|food|1h,Hôtel Lumière,train,CDG,Paris
,,2025-06-02,2,Paris,Journée musées,48.8566|2.3522,,Louvre|Orsay,Louvre|visit|4h;Orsay|visit|2h,Hôtel Lumière,,`}
              </pre>
            </div>
            <p className="text-muted-foreground text-xs">
              Les valeurs contenant des virgules doivent être entourées de guillemets doubles.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

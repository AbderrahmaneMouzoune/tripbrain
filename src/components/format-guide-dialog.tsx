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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Download,
  HelpCircle,
  AlertTriangle,
  CheckCircle2,
  FileJson,
  FileText,
  CalendarDays,
  MapPin,
  Zap,
  Hotel,
  Bus,
  Star,
} from 'lucide-react'
import { EXAMPLE_CSV, EXAMPLE_JSON } from '@/lib/example-data'

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Shared field row component
function FieldRow({
  name,
  type,
  required,
  desc,
}: {
  name: string
  type?: string
  required?: boolean
  desc: string
}) {
  return (
    <div className="flex flex-wrap items-start gap-1.5 py-1 text-sm">
      <code className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs shrink-0">
        {name}
      </code>
      {type && (
        <Badge variant="outline" className="shrink-0 font-mono text-xs">
          {type}
        </Badge>
      )}
      {required && (
        <Badge variant="destructive" className="shrink-0 text-xs">
          requis
        </Badge>
      )}
      <span className="text-muted-foreground">{desc}</span>
    </div>
  )
}

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
          <TabsContent value="csv" className="space-y-4 pt-3">
            <p className="text-muted-foreground text-sm">
              Le format CSV est idéal pour créer ou modifier votre itinéraire dans un tableur
              (Excel, Google Sheets, LibreOffice Calc).
            </p>

            {/* Conseils — moved to top */}
            <div className="bg-primary/5 border-primary/20 rounded-lg border p-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <CheckCircle2 className="text-primary h-4 w-4" />
                Conseils avant de commencer
              </h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>• Commencez à partir de l&apos;exemple ci-dessous et adaptez-le.</li>
                <li>• Laissez les colonnes vides si vous n&apos;avez pas l&apos;information.</li>
                <li>• Toutes les colonnes doivent être présentes même si elles sont vides.</li>
                <li>• Sauvegardez votre tableur en <strong>.csv (UTF-8)</strong>.</li>
                <li>• Utilisez le <strong>point</strong> comme séparateur décimal pour les coordonnées GPS.</li>
              </ul>
            </div>

            {/* Sections by type — Accordion */}
            <Accordion type="multiple" defaultValue={['header', 'general']} className="w-full">

              {/* ── En-tête du fichier ── */}
              <AccordionItem value="header">
                <AccordionTrigger className="text-sm font-semibold">
                  <span className="flex items-center gap-2">
                    <CalendarDays className="text-primary h-4 w-4 shrink-0" />
                    En-tête du fichier
                    <Badge variant="destructive" className="text-xs">requis</Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-1 pt-1">
                  <p className="text-muted-foreground mb-2 text-xs">
                    Ces deux colonnes doivent être renseignées uniquement sur la <strong>première ligne</strong> de données.
                  </p>
                  <FieldRow name="tripStartDate" desc="Date de début du voyage (AAAA-MM-JJ)" required />
                  <FieldRow name="tripEndDate" desc="Date de fin du voyage (AAAA-MM-JJ)" required />
                </AccordionContent>
              </AccordionItem>

              {/* ── Informations générales ── */}
              <AccordionItem value="general">
                <AccordionTrigger className="text-sm font-semibold">
                  <span className="flex items-center gap-2">
                    <MapPin className="text-primary h-4 w-4 shrink-0" />
                    Informations générales de la journée
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-1 pt-1">
                  <FieldRow name="date" desc="Date du jour (AAAA-MM-JJ)" required />
                  <FieldRow name="dayNumber" desc="Numéro du jour (entier commençant à 1)" required />
                  <FieldRow name="city" desc="Ville principale du jour" required />
                  <FieldRow name="title" desc="Titre descriptif de la journée" required />
                  <FieldRow name="latitude" desc="Latitude en degrés décimaux — point décimal (ex : 48.8566)" required />
                  <FieldRow name="longitude" desc="Longitude en degrés décimaux — point décimal (ex : 2.3522)" required />
                  <FieldRow name="dayType" desc="Type de journée : arrival, departure ou laisser vide" />
                  <FieldRow name="walkingDistance" desc="Distance de marche estimée (ex : 6 km)" />
                  <FieldRow name="notes" desc="Notes libres sur la journée" />
                  <FieldRow name="highlights" desc="Points forts séparés par | (ex : Tour Eiffel|Montmartre)" />
                  <FieldRow name="tips" desc="Conseils pratiques séparés par |" />
                  <FieldRow name="foodRecommendations" desc="Recommandations culinaires séparées par |" />
                  <FieldRow name="packingTips" desc="Conseils bagages séparés par |" />
                </AccordionContent>
              </AccordionItem>

              {/* ── Activités ── */}
              <AccordionItem value="activities">
                <AccordionTrigger className="text-sm font-semibold">
                  <span className="flex items-center gap-2">
                    <Zap className="text-primary h-4 w-4 shrink-0" />
                    Activités
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-1">
                  <FieldRow
                    name="activities"
                    desc="Liste des activités — format : nom|type|durée séparées par ;"
                  />
                  <div className="bg-muted rounded-md p-3 text-xs">
                    <p className="font-semibold mb-1">Exemple :</p>
                    <code className="block break-all">Tour Eiffel|visit|2h;Déjeuner|food|1h</code>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1.5">Types d&apos;activité valides :</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['visit', 'transport', 'food', 'experience', 'shopping'].map((t) => (
                        <Badge key={t} variant="secondary" className="font-mono text-xs">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* ── Hébergement ── */}
              <AccordionItem value="accommodation">
                <AccordionTrigger className="text-sm font-semibold">
                  <span className="flex items-center gap-2">
                    <Hotel className="text-primary h-4 w-4 shrink-0" />
                    Hébergement
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-1 pt-1">
                  <p className="text-muted-foreground mb-2 text-xs">
                    Renseignez <code className="bg-muted rounded px-1">accommodationName</code> pour activer le bloc hébergement. Les autres champs sont optionnels.
                  </p>
                  <FieldRow name="accommodationName" desc="Nom de l'hébergement" />
                  <FieldRow name="accommodationAddress" desc="Adresse complète" />
                  <FieldRow name="accommodationBookingUrl" desc="URL de réservation (Booking, Airbnb…)" />
                  <FieldRow name="accommodationCheckIn" desc="Heure d'arrivée (ex : 15:00)" />
                  <FieldRow name="accommodationCheckOut" desc="Heure de départ (ex : 11:00)" />
                </AccordionContent>
              </AccordionItem>

              {/* ── Transport ── */}
              <AccordionItem value="transport">
                <AccordionTrigger className="text-sm font-semibold">
                  <span className="flex items-center gap-2">
                    <Bus className="text-primary h-4 w-4 shrink-0" />
                    Transport
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-1">
                  <p className="text-muted-foreground text-xs">
                    Renseignez <code className="bg-muted rounded px-1">transportType</code> pour activer le bloc transport de la journée.
                  </p>
                  <FieldRow name="transportType" desc="Mode de transport : train, car, plane ou bus" />
                  <FieldRow name="transportFrom" desc="Ville ou gare de départ" />
                  <FieldRow name="transportTo" desc="Ville ou gare d'arrivée" />
                  <FieldRow name="transportDetails" desc="Informations complémentaires (numéro de vol, horaires…)" />
                  <div>
                    <p className="text-muted-foreground text-xs mb-1.5">Types de transport valides :</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['train', 'car', 'plane', 'bus'].map((t) => (
                        <Badge key={t} variant="secondary" className="font-mono text-xs">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

            </Accordion>

            {/* Erreurs fréquentes */}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <AlertTriangle className="text-amber-500 h-4 w-4" />
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
                    Utiliser une virgule comme séparateur décimal —{' '}
                    <code className="bg-muted rounded px-1 font-mono text-xs">48,8566</code> doit être{' '}
                    <code className="bg-muted rounded px-1 font-mono text-xs">48.8566</code>
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-destructive shrink-0">✗</span>
                  <span>
                    Type d&apos;activité non reconnu (ex :{' '}
                    <code className="bg-muted rounded px-1 font-mono text-xs">museum</code>) — seuls les types valides sont listés dans la section Activités
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-destructive shrink-0">✗</span>
                  <span>
                    Champ contenant une virgule sans guillemets — Excel/Google Sheets le gèrent automatiquement lors de l&apos;export CSV
                  </span>
                </li>
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
          <TabsContent value="json" className="space-y-4 pt-3">
            <p className="text-muted-foreground text-sm">
              Le format JSON est le format natif de TripBrain. Utilisez l&apos;export depuis l&apos;application pour
              obtenir un fichier valide, ou construisez-le manuellement en respectant la structure ci-dessous.
            </p>

            {/* Conseils — at the top */}
            <div className="bg-primary/5 border-primary/20 rounded-lg border p-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <CheckCircle2 className="text-primary h-4 w-4" />
                Conseils avant de commencer
              </h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>• Validez votre JSON sur <strong>jsonlint.com</strong> avant de l&apos;importer.</li>
                <li>• La propriété <code className="bg-muted rounded px-1 font-mono text-xs">itinerary</code> doit être un tableau même s&apos;il ne contient qu&apos;un seul jour.</li>
                <li>• Les dates doivent être au format <strong>AAAA-MM-JJ</strong> (ISO 8601).</li>
              </ul>
            </div>

            {/* JSON structure — Accordion by section */}
            <Accordion type="multiple" defaultValue={['toplevel', 'general']} className="w-full">

              {/* ── Structure de haut niveau ── */}
              <AccordionItem value="toplevel">
                <AccordionTrigger className="text-sm font-semibold">
                  <span className="flex items-center gap-2">
                    <Star className="text-primary h-4 w-4 shrink-0" />
                    Structure de haut niveau
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-1 pt-1">
                  <FieldRow name="tripStartDate" type="string" required desc="Date de début — format AAAA-MM-JJ" />
                  <FieldRow name="tripEndDate" type="string" required desc="Date de fin — format AAAA-MM-JJ" />
                  <FieldRow name="itinerary" type="DayItinerary[]" required desc="Tableau des journées du voyage" />
                </AccordionContent>
              </AccordionItem>

              {/* ── Informations générales ── */}
              <AccordionItem value="general">
                <AccordionTrigger className="text-sm font-semibold">
                  <span className="flex items-center gap-2">
                    <MapPin className="text-primary h-4 w-4 shrink-0" />
                    Informations générales de la journée
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-1 pt-1">
                  <FieldRow name="date" type="string" required desc="Date (AAAA-MM-JJ)" />
                  <FieldRow name="dayNumber" type="number" required desc="Numéro du jour (commence à 1)" />
                  <FieldRow name="city" type="string" required desc="Ville principale" />
                  <FieldRow name="title" type="string" required desc="Titre de la journée" />
                  <FieldRow name="coordinates" type="[lat, lng]" required desc="Coordonnées GPS [latitude, longitude]" />
                  <FieldRow name="dayType" type="string" desc="Type : arrival, departure" />
                  <FieldRow name="walkingDistance" type="string" desc={"Distance à pied (ex : \"6 km\")"} />
                  <FieldRow name="notes" type="string" desc="Notes libres" />
                  <FieldRow name="highlights" type="string[]" desc="Points forts" />
                  <FieldRow name="tips" type="string[]" desc="Conseils pratiques" />
                  <FieldRow name="foodRecommendations" type="string[]" desc="Recommandations culinaires" />
                  <FieldRow name="packingTips" type="string[]" desc="Conseils bagages" />
                </AccordionContent>
              </AccordionItem>

              {/* ── Activités ── */}
              <AccordionItem value="activities">
                <AccordionTrigger className="text-sm font-semibold">
                  <span className="flex items-center gap-2">
                    <Zap className="text-primary h-4 w-4 shrink-0" />
                    Activités
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-1">
                  <FieldRow name="activities" type="Activity[]" required desc="Liste des activités (peut être un tableau vide [])" />
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">Champs d&apos;une activité :</p>
                    <FieldRow name="name" type="string" required desc="Nom de l'activité" />
                    <FieldRow name="type" type="string" required desc="Type d'activité (voir valeurs valides)" />
                    <FieldRow name="duration" type="string" desc={"Durée estimée (ex : \"2h\")"} />
                    <FieldRow name="description" type="string" desc="Description optionnelle" />
                    <FieldRow name="coordinates" type="[lat, lng]" desc="Coordonnées GPS spécifiques à l'activité" />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1.5">Types valides :</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['visit', 'transport', 'food', 'experience', 'shopping'].map((t) => (
                        <Badge key={t} variant="secondary" className="font-mono text-xs">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* ── Hébergement ── */}
              <AccordionItem value="accommodation">
                <AccordionTrigger className="text-sm font-semibold">
                  <span className="flex items-center gap-2">
                    <Hotel className="text-primary h-4 w-4 shrink-0" />
                    Hébergement
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-1 pt-1">
                  <FieldRow name="accommodation" type="Accommodation" desc="Objet hébergement (optionnel)" />
                  <div className="ml-3 mt-2 space-y-1 border-l pl-3">
                    <FieldRow name="name" type="string" required desc="Nom de l'hébergement" />
                    <FieldRow name="address" type="string" required desc="Adresse complète" />
                    <FieldRow name="bookingUrl" type="string" required desc="URL de réservation" />
                    <FieldRow name="checkIn" type="string" required desc="Heure d'arrivée (ex : 15:00)" />
                    <FieldRow name="checkOut" type="string" required desc="Heure de départ (ex : 11:00)" />
                    <FieldRow name="images" type="string[]" desc="URLs des photos de l'hébergement" />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* ── Transport ── */}
              <AccordionItem value="transport">
                <AccordionTrigger className="text-sm font-semibold">
                  <span className="flex items-center gap-2">
                    <Bus className="text-primary h-4 w-4 shrink-0" />
                    Transport
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-1">
                  <FieldRow name="transport" type="Transport" desc="Objet transport pour la journée (optionnel)" />
                  <div className="ml-3 mt-2 space-y-1 border-l pl-3">
                    <FieldRow name="type" type="string" required desc="Mode de transport (voir valeurs valides)" />
                    <FieldRow name="from" type="string" desc="Ville ou gare de départ" />
                    <FieldRow name="to" type="string" desc="Ville ou gare d'arrivée" />
                    <FieldRow name="details" type="string" desc="Informations complémentaires (numéro de vol…)" />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1.5">Types valides :</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['train', 'car', 'plane', 'bus'].map((t) => (
                        <Badge key={t} variant="secondary" className="font-mono text-xs">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

            </Accordion>

            {/* Erreurs fréquentes */}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <AlertTriangle className="text-amber-500 h-4 w-4" />
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
                  <span>Dates au mauvais format (JJ/MM/AAAA au lieu de AAAA-MM-JJ)</span>
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


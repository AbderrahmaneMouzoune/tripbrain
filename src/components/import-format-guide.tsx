'use client'

import { useState } from 'react'
import { Download, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { generateExampleCsv } from '@/lib/csv-parser'

function downloadCsvExample() {
  const csv = generateExampleCsv()
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'tripbrain-exemple.csv'
  a.click()
  URL.revokeObjectURL(url)
}

interface CollapsibleSectionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}

function CollapsibleSection({ title, children, defaultOpen = false }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-border/60 rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {title}
        {open ? (
          <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
        )}
      </button>
      {open && (
        <div className="border-border/60 border-t px-4 pb-4 pt-3 text-sm">
          {children}
        </div>
      )}
    </div>
  )
}

function FieldRow({
  name,
  type,
  required,
  description,
}: {
  name: string
  type: string
  required: boolean
  description: string
}) {
  return (
    <div className="border-border/40 grid grid-cols-[1fr_auto_auto] gap-2 border-b py-2 last:border-0 sm:grid-cols-[1fr_1fr_auto]">
      <div>
        <code className="bg-muted rounded px-1 py-0.5 text-xs">{name}</code>
        <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
      </div>
      <span className="text-muted-foreground text-xs">{type}</span>
      {required ? (
        <CheckCircle2 className="text-green-500 mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <span className="text-muted-foreground/50 mt-0.5 text-xs">—</span>
      )}
    </div>
  )
}

export function ImportFormatGuide({ trigger }: { trigger?: React.ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
            Guide du format
          </Button>
        )}
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-[80%] flex-col gap-0 p-0 sm:max-w-md"
      >
        {/* pr-10 reserves space for the absolute close button (top-4 right-4) */}
        <SheetHeader className="shrink-0 border-b px-4 pb-3 pt-5 pr-10">
          <SheetTitle>Guide d&apos;import des données</SheetTitle>
          <SheetDescription>
            Comment préparer votre fichier pour l&apos;importer dans TripBrain.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="csv" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 mt-3 shrink-0">
            <TabsTrigger value="csv">Format CSV</TabsTrigger>
            <TabsTrigger value="json">Format JSON</TabsTrigger>
            <TabsTrigger value="errors">Erreurs fréquentes</TabsTrigger>
          </TabsList>

          {/* ── CSV Tab ── */}
          <TabsContent value="csv" className="min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="space-y-4 px-4 pb-4 pt-3">
                <p className="text-muted-foreground text-sm">
                  Le format CSV est recommandé pour les utilisateurs souhaitant
                  remplir leur itinéraire dans un tableur (Excel, Google Sheets,
                  LibreOffice Calc, etc.).
                </p>

                <CollapsibleSection title="Structure générale" defaultOpen>
                  <ul className="text-muted-foreground list-disc space-y-1.5 pl-4 text-xs">
                    <li>
                      <strong className="text-foreground">Première ligne</strong> : en-têtes de colonnes (ne pas modifier).
                    </li>
                    <li>
                      <strong className="text-foreground">Lignes suivantes</strong> : une ligne par jour de voyage.
                    </li>
                    <li>
                      <strong className="text-foreground">Séparateur de valeurs multiples</strong> : utilisez le caractère{' '}
                      <code className="bg-muted rounded px-1">|</code> pour séparer plusieurs valeurs dans un champ
                      (ex. highlights : <code className="bg-muted rounded px-1">Tour Eiffel|Louvre</code>).
                    </li>
                    <li>
                      <strong className="text-foreground">Activités</strong> : format{' '}
                      <code className="bg-muted rounded px-1">nom|type|durée</code> avec les activités séparées par{' '}
                      <code className="bg-muted rounded px-1">;</code>
                      {' '}(ex. <code className="bg-muted rounded px-1">Visite musée|visit|2h;Déjeuner|food|1h</code>).
                    </li>
                    <li>
                      <strong className="text-foreground">tripStartDate / tripEndDate</strong> : à renseigner uniquement sur la première ligne.
                    </li>
                  </ul>
                </CollapsibleSection>

                <CollapsibleSection title="Colonnes obligatoires" defaultOpen>
                  <div className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium">
                    <span>Colonne</span>
                    <span>Format</span>
                    <span></span>
                  </div>
                  <FieldRow
                    name="date"
                    type="AAAA-MM-JJ"
                    required
                    description="Date de la journée (ex. 2026-06-01)"
                  />
                  <FieldRow
                    name="dayNumber"
                    type="Entier"
                    required
                    description="Numéro du jour dans le voyage (1, 2, 3…)"
                  />
                  <FieldRow
                    name="city"
                    type="Texte"
                    required
                    description="Ville principale de la journée"
                  />
                  <FieldRow
                    name="title"
                    type="Texte"
                    required
                    description="Titre résumant la journée"
                  />
                  <FieldRow
                    name="latitude"
                    type="Nombre décimal"
                    required
                    description="Latitude GPS (ex. 48.8566)"
                  />
                  <FieldRow
                    name="longitude"
                    type="Nombre décimal"
                    required
                    description="Longitude GPS (ex. 2.3522)"
                  />
                  <FieldRow
                    name="tripStartDate"
                    type="AAAA-MM-JJ"
                    required
                    description="Date de début du voyage (1ère ligne seulement)"
                  />
                  <FieldRow
                    name="tripEndDate"
                    type="AAAA-MM-JJ"
                    required
                    description="Date de fin du voyage (1ère ligne seulement)"
                  />
                </CollapsibleSection>

                <CollapsibleSection title="Colonnes optionnelles">
                  <FieldRow
                    name="dayType"
                    type="Texte"
                    required={false}
                    description="Type de journée : arrival, exploration, coastal, culture…"
                  />
                  <FieldRow
                    name="highlights"
                    type="Texte (séparés par |)"
                    required={false}
                    description="Points forts de la journée"
                  />
                  <FieldRow
                    name="notes"
                    type="Texte"
                    required={false}
                    description="Notes libres sur la journée"
                  />
                  <FieldRow
                    name="tips"
                    type="Texte (séparés par |)"
                    required={false}
                    description="Conseils pratiques"
                  />
                  <FieldRow
                    name="walkingDistance"
                    type="Texte"
                    required={false}
                    description="Distance à pied estimée (ex. 6 km)"
                  />
                  <FieldRow
                    name="activities"
                    type="nom|type|durée ; …"
                    required={false}
                    description="Activités de la journée (types : visit, transport, food, experience, shopping)"
                  />
                  <FieldRow
                    name="accommodation_name"
                    type="Texte"
                    required={false}
                    description="Nom de l'hébergement"
                  />
                  <FieldRow
                    name="accommodation_address"
                    type="Texte"
                    required={false}
                    description="Adresse de l'hébergement"
                  />
                  <FieldRow
                    name="accommodation_checkIn"
                    type="AAAA-MM-JJ"
                    required={false}
                    description="Date d'arrivée à l'hébergement"
                  />
                  <FieldRow
                    name="accommodation_checkOut"
                    type="AAAA-MM-JJ"
                    required={false}
                    description="Date de départ de l'hébergement"
                  />
                  <FieldRow
                    name="transport_type"
                    type="train | car | plane | bus"
                    required={false}
                    description="Mode de transport pour rejoindre la ville"
                  />
                  <FieldRow
                    name="transport_from"
                    type="Texte"
                    required={false}
                    description="Ville ou lieu de départ"
                  />
                  <FieldRow
                    name="transport_to"
                    type="Texte"
                    required={false}
                    description="Ville ou lieu d'arrivée"
                  />
                  <FieldRow
                    name="transport_details"
                    type="Texte"
                    required={false}
                    description="Détails du transport (numéro de train, heure…)"
                  />
                </CollapsibleSection>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ── JSON Tab ── */}
          <TabsContent value="json" className="min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="space-y-4 px-4 pb-4 pt-3">
                <p className="text-muted-foreground text-sm">
                  Le format JSON est le format natif de TripBrain. Il permet de
                  conserver toutes les données, y compris les photos.
                </p>

                <CollapsibleSection title="Structure racine" defaultOpen>
                  <FieldRow
                    name="tripStartDate"
                    type="AAAA-MM-JJ"
                    required
                    description="Date de début du voyage"
                  />
                  <FieldRow
                    name="tripEndDate"
                    type="AAAA-MM-JJ"
                    required
                    description="Date de fin du voyage"
                  />
                  <FieldRow
                    name="itinerary"
                    type="Tableau d'objets"
                    required
                    description="Liste des journées (au moins 1 élément)"
                  />
                </CollapsibleSection>

                <CollapsibleSection title="Chaque journée (itinerary[n])" defaultOpen>
                  <FieldRow name="date" type="AAAA-MM-JJ" required description="Date de la journée" />
                  <FieldRow name="dayNumber" type="Entier" required description="Numéro du jour (1, 2, 3…)" />
                  <FieldRow name="city" type="Texte" required description="Ville principale" />
                  <FieldRow name="title" type="Texte" required description="Titre de la journée" />
                  <FieldRow name="coordinates" type="[lat, lng]" required description="Tableau de deux nombres : latitude puis longitude" />
                  <FieldRow name="activities" type="Tableau d'objets" required description="Au moins un élément recommandé" />
                  <FieldRow name="dayType" type="Texte" required={false} description="Type de journée" />
                  <FieldRow name="highlights" type="Tableau de textes" required={false} description="Points forts" />
                  <FieldRow name="notes" type="Texte" required={false} description="Notes libres" />
                  <FieldRow name="tips" type="Tableau de textes" required={false} description="Conseils" />
                  <FieldRow name="walkingDistance" type="Texte" required={false} description="Distance à pied" />
                  <FieldRow name="accommodation" type="Objet" required={false} description="Informations hébergement" />
                  <FieldRow name="transport" type="Objet" required={false} description="Transport du jour" />
                  <FieldRow name="images" type="Tableau d'objets" required={false} description="Photos \{ url, caption \}" />
                </CollapsibleSection>

                <CollapsibleSection title="Exemple minimal">
                  <pre className="bg-muted overflow-x-auto rounded-lg p-3 text-xs leading-relaxed">
{`{
  "tripStartDate": "2026-06-01",
  "tripEndDate": "2026-06-07",
  "itinerary": [
    {
      "date": "2026-06-01",
      "dayNumber": 1,
      "city": "Paris",
      "title": "Arrivée à Paris",
      "coordinates": [48.8566, 2.3522],
      "activities": [
        {
          "name": "Check-in hôtel",
          "type": "experience",
          "duration": "1h"
        }
      ]
    }
  ]
}`}
                  </pre>
                </CollapsibleSection>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ── Errors Tab ── */}
          <TabsContent value="errors" className="min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="space-y-3 px-4 pb-4 pt-3">
                <p className="text-muted-foreground text-sm">
                  Voici les erreurs les plus courantes et comment les corriger.
                </p>

                {[
                  {
                    title: '« Format invalide : tableau itinerary manquant »',
                    cause: 'Le fichier JSON ne contient pas de clé itinerary ou elle est mal orthographiée.',
                    fix: 'Vérifiez que votre fichier contient bien "itinerary": [ ... ] à la racine.',
                  },
                  {
                    title: '« Format invalide : dates du voyage manquantes »',
                    cause: 'Les champs tripStartDate ou tripEndDate sont absents ou vides.',
                    fix: 'Ajoutez "tripStartDate": "AAAA-MM-JJ" et "tripEndDate": "AAAA-MM-JJ" à la racine du JSON, ou dans la première ligne du CSV.',
                  },
                  {
                    title: '« latitude et longitude doivent être des nombres valides »',
                    cause: 'CSV : les colonnes latitude/longitude contiennent du texte ou sont vides.',
                    fix: 'Utilisez des nombres décimaux avec un point (ex. 48.8566, pas 48,8566).',
                  },
                  {
                    title: '« Les champs date, city et title sont obligatoires »',
                    cause: "CSV : une ligne est incomplète, l'une de ces trois colonnes est vide.",
                    fix: 'Assurez-vous que chaque ligne de données remplit les colonnes date, city et title.',
                  },
                  {
                    title: '« Unexpected token » ou « JSON invalide »',
                    cause: 'Le fichier JSON contient une erreur de syntaxe : virgule manquante, crochet non fermé, etc.',
                    fix: "Collez le contenu de votre fichier dans un validateur en ligne (ex. jsonlint.com) pour localiser l'erreur.",
                  },
                  {
                    title: "Le fichier s'importe mais les données semblent incomplètes",
                    cause: 'Certains champs optionnels ne sont pas reconnus car leur nom est incorrect.',
                    fix: 'Comparez les noms de champs avec le guide ci-dessus et respectez la casse (ex. dayNumber et non DayNumber).',
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="bg-muted/40 border-border/60 rounded-lg border p-3 text-sm"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="text-amber-500 mt-0.5 h-4 w-4 shrink-0" />
                      <div className="space-y-1">
                        <p className="font-medium">{item.title}</p>
                        <p className="text-muted-foreground text-xs">
                          <strong>Cause :</strong> {item.cause}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          <strong>Solution :</strong> {item.fix}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <SheetFooter className="shrink-0 border-t px-4 py-3">
          <Button className="w-full gap-2" onClick={downloadCsvExample}>
            <Download className="h-4 w-4" />
            Télécharger l&apos;exemple CSV
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

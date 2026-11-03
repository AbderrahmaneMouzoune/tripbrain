# Itinéraires modèles — conception technique V1

Complète `docs/itineraire-modele.md` (le besoin produit). Ce document fixe les choix
d'architecture que suivent les tickets de l'epic « Itinéraires modèles — V1 ».

## 1. Vue d'ensemble

```
app (webapp, app.tripbrain.fr)                      site vitrine (tripbrain.fr)
──────────────────────────────                      ───────────────────────────
Partager → Publier (A1–A4)                          /itineraires/[slug]   (ISR 1 h)
  └─ POST/PUT/PATCH/DELETE /api/templates ─┐        /itineraires          (pays)
                                           ▼        sitemap.ts            (ISR 1 h)
                                  R2, préfixe `templates/`                proxy.ts → 410
                                           ▲              │
/m/<id> → /?modele=<id> → reprise (B2–B5)  │              │
  └─ GET /api/templates/<id> ──────────────┘   GET /api/templates/by-slug/<slug>, /index
```

- La webapp est seule propriétaire du stockage : le site vitrine lit des JSON publics
  côté serveur, sans secret ni accès R2.
- L'app native ne change pas : `app.tripbrain.fr/m/*` passe déjà tel quel dans la WebView.
  Il suffit d'ajouter `/m/*` au fichier AASA pour iOS.

## 2. Modèle

### 2.1 Identifiants

- **Id public** : 16 caractères dans l'alphabet base32 Crockford minuscule
  `0123456789abcdefghjkmnpqrstvwxyz`, soit 80 bits. `isTemplateId()` valide `^[0-9a-hjkmnp-tv-z]{16}$`.
  Il apparaît dans les URL : ce n'est pas un secret.
- **Jeton propriétaire** : 32 octets aléatoires en base64url. Le serveur le génère à la
  publication, le renvoie **une seule fois**, et n'en garde que le SHA-256 (hex). La
  comparaison se fait en temps constant. Le jeton voyage dans `Authorization: Bearer`, jamais
  dans l'URL ni dans le corps.
- **Slug** : `<pays>-<n>-jours-<ville1>-<ville2>-<ville3>`. Les accents sont retirés (NFKD), le
  résultat est en minuscules, en mots séparés par `-`, et coupé à 80 caractères sur une
  frontière de mot. Une ville dont le nom ne donne aucun caractère latin est ignorée. Le slug
  est **figé à la première publication**. En cas de collision, il prend un suffixe `-2`, `-3`…,
  réservé via `slugs/<slug>` en `ifAbsent`.

### 2.2 Pays

`DayItinerary` n'a pas de pays. L'auteur **choisit le pays principal** à la publication
(écran A3, liste avec recherche). On stocke le code ISO 3166-1 alpha-2. Le nom français vient
de `Intl.DisplayNames('fr', { type: 'region' })`. Pour un voyage dans plusieurs pays, l'auteur
choisit le principal : c'est une limite assumée en V1.

### 2.3 Types (`src/lib/template-model.ts`)

```ts
interface TemplateOptions {
  includeNotes: boolean
  includePrices: boolean
}

interface TemplateMeta {
  // stocké, jamais renvoyé tel quel
  id
  slug
  version: number
  title
  authorName: string | null
  country: string // ISO alpha-2
  indexable: boolean // interrupteur de l'auteur
  includesNotes
  includesPrices
  dayCount
  cities: string[]
  tripYear: number | null
  publishedAt
  updatedAt
  retiredAt: string | null // ISO
  ownerTokenHash: string
}

type PublicTemplate = Omit<TemplateMeta, 'ownerTokenHash' | 'retiredAt'> & {
  listed: boolean // indexable && dayCount >= 2
  itinerary: DayItinerary[] // déjà nettoyé
}

interface TemplateIndexEntry {
  id
  slug
  title
  country
  dayCount
  cities
  updatedAt
}
```

### 2.4 Sur le téléphone (`StoredTrip`, sans changer le schéma IndexedDB)

Les enregistrements sont stockés entiers : ajouter des champs facultatifs ne demande **aucune
migration**. Il ne faut pas changer `DB_VERSION`.

```ts
type TripSource = … | 'template'

StoredTrip.publishedTemplate?: {    // côté auteur
  id; slug; ownerToken; version; indexable; includesNotes; includesPrices
  authorName: string | null; country: string; publishedAt; updatedAt
}

StoredTrip.origin?: {               // côté repreneur
  templateId; version; title; authorName: string | null
  startDate: string; keptDayIds: string[]
  base: DayItinerary[]              // modèle recalé et filtré au moment de la reprise (fusion V1.1)
  takenAt: number
}
```

- `duplicateTrip` ne copie ni `publishedTemplate` (le jeton ne se duplique jamais) ni `origin`.
- `importSharedItinerary` en mode remplacement retire les deux.
- `exportData` n'exporte déjà que `{ title, itinerary }`.

## 3. Règles métier (modules purs, testés)

### 3.1 Nettoyage — `src/lib/template-clean.ts`

`cleanForTemplate(itinerary, options): DayItinerary[]` applique le §5 de la spec. La fonction
est **idempotente** et appelée deux fois : sur le téléphone pour l'aperçu A2, puis **à nouveau
sur le serveur** avant tout stockage.

- Toujours retirés :
  - `bookingReference`, `seat`, `gate`, `terminal` ;
  - tous les `status` (activité, transport, hébergement).
- `notes` (journée, transport) : retirées sauf si `includeNotes`.
- `price` et `currency` (activité, transport, hébergement) : retirés sauf si `includePrices`.
- `bookingUrl` : retiré s'il ressemble à une confirmation. Le motif cherche dans le chemin ou
  la requête des termes comme `confirmation`, `confirm`, `mybooking`, `manage`, `reservation`,
  `pnr`, `token`, `auth`, `bn=`, ou la `bookingReference` de l'entité. Pour un hébergement on
  met `''` (le champ est requis dans le type) ; ailleurs on supprime la clé.
- Les ids (journées, activités, transports, hébergements) sont conservés à l'identique : la
  fusion V1.1 s'appuie dessus.

`noteExcerpts(itinerary, limit)` sert l'écran A3. Il renvoie des extraits réels
`{ dayNumber, text, spans }`, en privilégiant les notes qui contiennent quelque chose de
sensible. `sensitiveSpans(text, knownPlaces)` repère :

- les suites de 4 chiffres ou plus (codes, digicodes) ;
- les numéros de téléphone et les e-mails ;
- les mots à majuscule qui ne sont ni en début de phrase ni un lieu connu du voyage.

### 3.2 Recalage — `src/lib/template-redate.ts`

`retimeTemplate(itinerary, { startDate, keptDayIds }): DayItinerary[]` est pure et
déterministe : la même entrée donne toujours la même sortie, ce que la V1.1 exige pour
rejouer le recalage.

1. Garder les journées de `keptDayIds`, dans l'ordre du modèle. Il en faut au moins une.
2. La journée de rang `i` prend la date `startDate + i` et le `dayNumber` `i + 1`. Les dates ne
   laissent aucun trou.
3. Toute date `AAAA-MM-JJ` ou date-heure `AAAA-MM-JJTHH:MM…` d'une journée (horaires de
   transport compris) glisse du même écart que sa journée. Les heures ne changent pas.
4. Hébergements : pour chaque suite de journées gardées consécutives au même hébergement
   (même nom), `checkIn` prend la date de la première journée et `checkOut` le lendemain de la
   dernière, en gardant la partie horaire d'origine. Un champ vide reste vide.
5. Le transport d'une journée gardée dont `to` est une ville entièrement retirée est supprimé.
   Si son `from` est une ville entièrement retirée, `from` devient la ville de la journée gardée
   précédente, et les champs propres à l'ancien trajet sont vidés (`departureTime`,
   `arrivalTime`, `duration`, `provider`, `departureAddress`, `details`).
6. Un modèle sans date valide fonctionne de la même façon : le jour 1 prend `startDate`.

`templateTodo(itinerary)` renvoie ce qu'il reste à réserver (B5) :
`{ accommodations: noms distincts sans référence, transports, bookableActivities }`.

Les helpers de date (`toDayNumber`, `fromDayNumber`, `addDays`) sont extraits de
`demo-trip.ts` dans `src/lib/iso-date.ts`, puis partagés. Ils sont sûrs vis-à-vis des fuseaux
horaires. Il ne faut pas réutiliser le `addDays` de `itinerary-edit.ts`, qui passe par
`toISOString`.

## 4. Stockage (serveur)

`getTemplateStore()` crée son propre `Bucket` s3nd, avec les mêmes identifiants R2 que le
partage mais `prefix: 'templates'`. Les modèles ne sont donc **pas** sous `shares/` et
échappent à toute règle de cycle de vie visant les codes d'une heure. On ne passe **jamais**
d'`expiresIn`.

| Clé (sous `templates/`) | Contenu                                                        | Écriture                                 |
| ----------------------- | -------------------------------------------------------------- | ---------------------------------------- |
| `<id>/meta`             | `TemplateMeta`                                                 | `ifAbsent` à la création, puis `ifMatch` |
| `<id>/v/<n>`            | `{ version, title, itinerary }`, en JSON brut (s3nd le gzippe) | `ifAbsent`, immuable                     |
| `slugs/<slug>`          | `{ id }`                                                       | `ifAbsent`, jamais réutilisé             |
| `index`                 | `{ entries: TemplateIndexEntry[] }`, modèles listés uniquement | boucle `ifMatch`, 5 tentatives           |

- Ordre d'écriture : la version, puis la méta, puis l'index. La méta ne pointe donc jamais vers
  une version absente. Si l'index échoue, le modèle manque au sitemap jusqu'à sa prochaine
  écriture.
- **Retrait** : la méta devient une pierre tombale (`retiredAt`). Les versions sont supprimées,
  le slug reste réservé et l'entrée sort de l'index. Les lectures répondent 410.
- La logique vit dans `src/lib/template-store.ts`, derrière une interface étroite
  `{ putSnapshot, getSnapshot, delete }`. Elle est testée contre un faux bucket en mémoire,
  comme `group-sync-engine.ts`. Les routes restent minces.

## 5. API (`src/app/api/templates/…`)

Toutes les routes déclarent `runtime = 'nodejs'` et `dynamic = 'force-dynamic'`. Les erreurs
ont la forme `{ error: '<message français>' }`.

| Route                               | Accès             | Réponse                                                  |
| ----------------------------------- | ----------------- | -------------------------------------------------------- |
| `POST /api/templates`               | public, 10/min/IP | 201 `{ template, ownerToken }`                           |
| `GET /api/templates/[id]`           | public            | 200 `{ template }` · 404 · 410 `{ status: 'retired' }`   |
| `PUT /api/templates/[id]`           | Bearer            | 200 `{ template }` (nouvelle version)                    |
| `PATCH /api/templates/[id]`         | Bearer            | 200 `{ template }` (`indexable`, `authorName`)           |
| `DELETE /api/templates/[id]`        | Bearer            | 200 `{ status: 'retired' }`                              |
| `GET /api/templates/[id]/v/[n]`     | public            | 200 `{ version, itinerary }` (base de fusion V1.1)       |
| `GET /api/templates/by-slug/[slug]` | public            | 200 `{ template }` **seulement si `listed`** · 404 · 410 |
| `GET /api/templates/index`          | public            | 200 `{ entries }`                                        |

- **Écritures** : le corps porte `data`, l'itinéraire compressé au format du partage
  (`compressItinerary`). Le serveur le décompresse, vérifie qu'il y a au moins une journée, le
  **renettoie**, puis stocke du JSON. Plafond : 2 Mo de payload (413). Une erreur
  `FILE_TOO_LARGE` de s3nd est elle aussi renvoyée en 413.
- **Lectures publiques** : `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`
  (`index` et `by-slug` : `s-maxage=300`). Elles n'ont pas de limiteur par IP : toutes les
  régénérations du site vitrine viennent de quelques IP Vercel, et c'est le cache CDN qui
  absorbe la charge.
- **Jamais renvoyés** : `ownerTokenHash`, `retiredAt`, ni une version autre que celle demandée.
- **Client** : `src/lib/template-api.ts` sur le modèle de `group-sync.ts` (`readError`, erreurs
  typées `TemplateNotFoundError`, `TemplateRetiredError`, `cache: 'no-store'`).

## 6. Liens

- **Lien partagé par l'auteur** : `https://app.tripbrain.fr/m/<id>`. Il ouvre l'app si elle est
  installée (iOS, via l'AASA), sinon la webapp.
  - La page `/m/[id]` lit le modèle côté serveur, uniquement pour l'Open Graph « Modèle
    TripBrain ». Elle porte `noindex`, avec `canonical` vers `tripbrain.fr/itineraires/<slug>`
    quand le modèle est listé.
  - Elle bascule ensuite côté client vers `/?modele=<id>`, car la reprise doit tourner sur `/`,
    seul endroit où existent `TripProvider` et `NativeHosts`.
  - **Pas de redirection serveur vers tripbrain.fr** : dans la WebView, elle éjecterait
    l'utilisateur vers Safari.
- `readIncomingTemplate(search)` (`?modele=<id>`) reste **séparé** de `readIncomingShare`.
  `parseNativePath` gagne une intention `template` (`/m/<id>`, `/?modele=<id>`). Un
  `TemplateTakeGate` vit à côté d'`IncomingShareGate`.
- **AASA** : ajouter `/m/*` dans `paths` et `components`. À livrer tôt, car Apple met en cache.
- **Android** : `assetlinks.json` manque aujourd'hui, ce qui casse aussi `/s/`. La route est
  ajoutée et lit les empreintes depuis `ANDROID_CERT_FINGERPRINTS` (une action du propriétaire
  est requise).

## 7. Site vitrine (`tripbrain-landing`)

- **Seuls les modèles listés** (`indexable` et au moins 2 jours) ont une page sur tripbrain.fr.
  - Un modèle non listé n'y apparaît pas du tout (404) : il reste accessible par son lien
    `/m/<id>`.
  - Ce choix évite qu'un slug devinable expose un modèle que l'auteur a voulu « lien seulement ».
- **Routes** :
  - `/itineraires` liste les pays ;
  - `/itineraires/[slug]` distingue modèle et pays sur le motif `-<n>-jours`, qu'un slug de
    pays ne contient jamais.
- **Données** : `fetch` serveur vers l'API de la webapp, avec `next: { revalidate: 3600, tags }`.
  `generateStaticParams` renvoie `[]`, pour que le build ne dépende pas de la webapp. Il ne faut
  jamais appeler `notFound()` sur une erreur 5xx : on lève une exception, pour que l'ISR garde
  la page précédente.
- **SEO** :
  - `canonical` obligatoire, car la mise en page racine hérite de `'/'` ;
  - JSON-LD `TouristTrip` ;
  - Open Graph dynamique ;
  - liens de l'auteur en `rel="ugc nofollow noopener"`.
- **410** : `src/proxy.ts`, avec le matcher `/itineraires/:slug`.
- **Sitemap** : ISR 1 h, à partir de `/api/templates/index`.
- **Bouton « Reprendre cet itinéraire »** : `https://app.tripbrain.fr/m/<id>`, en lien simple,
  sans `target="_blank"`.

## 8. Mesure

Nouveaux événements, dans le catalogue fermé de `src/lib/analytics/events.ts` :

- `template_published { days_count, includes_notes, includes_prices, indexable }`
- `template_publish_failed { reason }`
- `template_updated { days_count }`
- `template_visibility_changed { indexable }`
- `template_retired {}`
- `template_opened { via }`
- `template_taken { days_count, kept_days_count, duration }`
- `template_take_failed { reason }`

Ils ne portent jamais d'id, de slug ni de prénom. Les compteurs « ouvertures / reprises » de
l'écran A4 font l'objet d'un ticket à part (objet `stats` mis à jour au mieux).

## 9. Vérifications

- `bun run test` : tous les modules purs, le store contre son faux bucket, et les routes.
- Le build ignore les erreurs de type. Il faut donc lancer :
  `bunx tsc --noEmit --incremental false 2>&1 | grep 'error TS' | grep -v __tests__`. La sortie
  doit être vide ; c'est le cas sur `main` au 3 nov. 2026.

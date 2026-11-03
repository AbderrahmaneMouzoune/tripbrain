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
  frontière de mot. Les lettres latines que NFKD ne décompose pas sont translittérées
  (`đ ð → d`, `ł → l`, `ø → o`, `œ → oe`, `æ → ae`, `ß → ss`, `þ → th`, `ı → i`…) :
  `Đà Nẵng` donne `da-nang`, pas `a-nang`. Une ville dont le nom ne donne aucun caractère latin
  est ignorée. Le slug est **figé à la première publication**. En cas de collision, il prend un
  suffixe `-2` à `-5`, puis un suffixe tiré de l'id (`-k3x9m2`, puis l'id entier), chacun
  réservé via `slugs/<slug>` en `ifAbsent` : un parcours populaire reste toujours publiable, et
  quelques publications ne suffisent pas à bloquer un slug pour tout le monde.

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
  // modèle en ligne : stocké, jamais renvoyé tel quel
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
  retiredAt: null
  ownerTokenHash: string
}

interface RetiredTemplateMeta {
  // pierre tombale : rien de ce que l'auteur a écrit ou choisi, hors du slug
  id
  slug // reste réservé, à vie : pays, nombre de jours et jusqu'à 3 villes
  version: number // dernière publiée, pour supprimer les versions
  publishedAt
  retiredAt: string // ISO
  ownerTokenHash: string // un second retrait reste autorisé
  wasListed: boolean // calculé au retrait : 410 par le slug si vrai, 404 sinon
}

type StoredTemplateMeta = TemplateMeta | RetiredTemplateMeta // `<id>/meta`

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
  tripYear: number | null           // année du voyage de l'auteur : « prix relevés en 2025 »
  startDate: string; keptDayIds: string[]
  base: DayItinerary[]              // modèle recalé et filtré au moment de la reprise (fusion V1.1)
  takenAt: number
}

StoredTrip.copiedFromDemo?: boolean // copie de la démo (ou d'une telle copie)
```

- `origin` se construit avec `buildTemplateOrigin(template, retimed, input, takenAt)`
  (`template-redate.ts`, pur) : `base` est une copie profonde (JSON) du voyage recalé, et
  `keptDayIds` est rangé dans l'ordre du modèle, sans doublon ni id inconnu.
- `duplicateTrip` suit `tripCopyOf` (`trips.ts`, pur) : le programme, le titre et la provenance,
  mais ni `group`, ni `publishedTemplate` (le jeton ne se duplique jamais), ni `origin`. La copie
  de la démo prend la provenance `share` et `copiedFromDemo: true`, transmis de copie en copie.
- `canPublishTemplate(trip)` (`trips.ts`) : faux pour la démo, une copie de la démo
  (`copiedFromDemo`) ou un voyage sans journée (spec §9).
- `importSharedItinerary` en mode remplacement retire `origin` et `publishedTemplate`. Il garde
  `copiedFromDemo` : un voyage reçu à la place d'une copie de la démo reste non publiable.
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

1. Garder les journées de `keptDayIds`, dans l'ordre du modèle. Il en faut au moins une ; un id
   inconnu est ignoré.
2. La journée de rang `i` prend la date `startDate + i` et le `dayNumber` `i + 1`. Les dates ne
   laissent aucun trou.
3. Toute date `AAAA-MM-JJ` ou date-heure d'une journée (horaires de transport compris) glisse du
   même écart que sa journée. Les heures ne changent pas. Une date-heure s'écrit
   `AAAA-MM-JJTHH:MM…` ou, comme dans les tableurs, `AAAA-MM-JJ HH:MM…` (une espace, puis une
   heure : « 2026-05-10 au matin » reste un texte). Une journée sans date lisible se situe
   d'après la première journée datée. Les ids sont recopiés tels quels, même quand ils ont la
   forme d'une date.
4. Hébergements : pour chaque suite de journées gardées consécutives au même hébergement
   (même nom, à la casse et aux espaces près), `checkIn` prend la date de la première journée
   et `checkOut` le lendemain de la dernière, en gardant la partie horaire d'origine. Un champ
   vide reste vide. Un séjour s'écrit de deux façons : l'hébergement répété sur chaque nuit, ou
   porté par la seule journée d'arrivée, les soirs suivants en relevant tant que son `checkOut`
   n'est pas passé (convention de l'app et de la démo). Si la journée d'arrivée est retirée,
   l'hébergement passe sur la première nuit gardée du séjour.
5. Trajets qui touchent une ville **entièrement** retirée (plus aucune journée gardée). La ville
   se reconnaît aussi dans un nom de gare ou d'aéroport, comme suite de mots entiers, la plus
   longue l'emportant (« PKX Beijing Daxing Intl. » est à Beijing ; « Narita » n'est pas à
   Nara). Un trajet recousu ne garde que son id, son type et ses extrémités : horaires, durée,
   compagnie, adresse de départ, détails, lien de réservation, prix, devise et notes décrivaient
   l'ancien trajet et sont retirés (avec référence, siège, porte, terminal et statut, que le
   nettoyage retire déjà).
   - **Vers** une ville retirée (trajet rangé au jour du départ) : `to` devient la ville de la
     journée gardée suivante (Tokyo → Hakone, sans Hakone, devient Tokyo → Kyoto). Le trajet est
     supprimé s'il n'y a pas de journée gardée suivante (ou qu'elle n'a pas de ville), si cette
     ville est celle de son `from` ou celle de la journée qui le porte (plus rien à parcourir),
     si son `from` est lui aussi une ville retirée, ou si la journée suivante porte un trajet
     venu d'une ville retirée qui sera recousu (conventions mêlées, comme dans la démo : on
     garde celui du jour d'arrivée, qui nomme la vraie gare d'arrivée, plutôt que deux trajets
     identiques).
   - **Depuis** une ville retirée (trajet rangé au jour d'arrivée) : `from` devient la ville de la
     journée gardée précédente ; sans journée précédente (ou sans ville), `from` est retiré. Le
     trajet est supprimé si cette ville précédente est celle de son `to` (Tokyo → Nikko → Tokyo,
     sans Nikko).
6. Un modèle sans date valide fonctionne de la même façon : le jour 1 prend `startDate`, et rien
   d'autre ne glisse.

`templateTodo(itinerary)` renvoie ce qu'il reste à réserver (B5) :
`{ accommodations: noms distincts sans référence, transports, bookableActivities }`.

`durationChoice(templateDays, keptDays)` sert `template_taken.duration` : `'same' | 'shorter'`.
Les journées gardées sont prises dans le modèle, la reprise n'est jamais plus longue ; un compte
égal ou supérieur vaut `'same'`.

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
| `<id>/meta`             | `TemplateMeta`, puis `RetiredTemplateMeta` une fois retiré     | `ifAbsent` à la création, puis `ifMatch` |
| `<id>/v/<n>`            | `{ version, title, itinerary }`, en JSON brut (s3nd le gzippe) | `ifAbsent`, immuable                     |
| `slugs/<slug>`          | `{ id }`                                                       | `ifAbsent`, jamais réutilisé             |
| `index`                 | `{ entries: TemplateIndexEntry[] }`, modèles listés uniquement | boucle `ifMatch`, 5 tentatives           |

- Ordre d'écriture : la version, puis la méta, puis l'index. La méta ne pointe donc jamais vers
  une version absente.
- **Index** : la ligne d'un modèle suit sa méta **stockée**, relue après la lecture de l'index,
  puis revérifiée après l'écriture (une requête concurrente plus lente ne peut pas y remettre
  un modèle masqué ou retiré). Si l'index échoue sur un ajout ou une modification, le modèle
  manque au sitemap jusqu'à sa prochaine écriture. Sur une **sortie** (masqué, ramené à une
  journée, retiré), la requête échoue en 503 « Réessayez » une fois la méta écrite : rejouée,
  elle ne refait que l'index. Un index illisible n'est jamais réécrit, et sa lecture lève (500)
  au lieu de renvoyer une liste vide.
- Villes de la méta et de l'index : les 10 premières, 80 caractères chacune.
- **Mise à jour** : la méta reprend de la nouvelle version le titre (gardé s'il n'est pas
  envoyé), `dayCount`, `cities`, `tripYear`, `includesNotes`, `includesPrices`, et prend un
  nouvel `updatedAt`. Le slug et le pays ne changent jamais. Mise à jour comme changement de
  réglages réévaluent la présence dans l'index : un modèle ramené à une journée en sort (son
  slug répond 404), un modèle rendu visible y rentre.
- **Forme des valeurs** : avant tout stockage, `normalizeItineraryShape`
  (`src/lib/template-shape.ts`) remet chaque valeur à son type. Une journée dont un champ requis
  est faux fait refuser l'itinéraire (400). Ailleurs, une valeur mal typée est retirée : activité
  sans nom en texte, transport sans id ou d'un type inconnu, image autre que http(s), nombre non
  fini. Un hébergement nommé reste ; ses textes requis manquants deviennent `''`.
- **Retrait** : la méta devient une pierre tombale `RetiredTemplateMeta`, qui ne garde ni titre,
  ni prénom, ni année, ni réglages, ni les champs pays et villes. Le slug, lui, reste réservé
  pour toujours, dans la pierre tombale et dans `slugs/<slug>` : il porte le pays (son nom
  français), le nombre de jours et jusqu'à 3 villes saisies par l'auteur, mises en forme de slug
  (`japon-3-jours-tokyo-kyoto`). Les versions sont supprimées et l'entrée sort de l'index. Les
  deux doivent aboutir : si l'index ne suit pas, le retrait échoue en `index` ; si la
  suppression des versions échoue, l'index est tout de même accordé, puis le retrait échoue en
  `versions`. Dans les deux cas la route répond 503 « Réessayez », la pierre tombale étant déjà
  écrite : rejoué, le retrait refait la suppression et l'index. Les lectures répondent 410 ;
  par le slug, seulement si `wasListed` (sinon 404, voir §7). Une pierre tombale de l'ancienne
  forme (méta entière vidée) se lit encore : `wasListed` est alors tiré d'`indexable` et
  `dayCount`.
- **Retrait par l'opérateur** : `retireTemplateAsOperator(bucket, idOuSlug)`, sans jeton, mêmes
  effets. Aucune route n'y mène : seul `scripts/retire-template.ts` l'appelle, avec les
  identifiants R2 de production. Le script vérifie ensuite, par `readTemplateForOperator`, que
  le modèle est retiré, hors de l'index et sans aucune version stockée (`versionsLeft === 0`) ;
  sinon il sort en 1. Procédure : `docs/modeles-moderation.md`.
- La logique vit dans `src/lib/template-store.ts`, derrière une interface étroite
  `{ putSnapshot, getSnapshot, delete }`. Elle est testée contre un faux bucket en mémoire,
  comme `group-sync-engine.ts`. Les routes restent minces.

## 5. API (`src/app/api/templates/…`)

Toutes les routes déclarent `runtime = 'nodejs'` et `dynamic = 'force-dynamic'`. Les erreurs
ont la forme `{ error: '<message français>' }`.

| Route                               | Accès              | Réponse                                                  |
| ----------------------------------- | ------------------ | -------------------------------------------------------- |
| `POST /api/templates`               | public, 10/min/IP  | 201 `{ template, ownerToken }`                           |
| `GET /api/templates/[id]`           | public, sans cache | 200 `{ template }` · 404 · 410 `{ status: 'retired' }`   |
| `PUT /api/templates/[id]`           | Bearer             | 200 `{ template }` (nouvelle version) · 503 (index)      |
| `PATCH /api/templates/[id]`         | Bearer             | 200 `{ template }` (`indexable`, `authorName`) · 503     |
| `DELETE /api/templates/[id]`        | Bearer             | 200 `{ status: 'retired' }` · 503 (index, versions)      |
| `GET /api/templates/[id]/v/[n]`     | public             | 200 `{ version, itinerary }` (base de fusion V1.1)       |
| `GET /api/templates/by-slug/[slug]` | public             | 200 `{ template }` **seulement si `listed`** · 404 · 410 |
| `GET /api/templates/index`          | public             | 200 `{ entries }`                                        |

- **Écritures** : le corps porte `data`, l'itinéraire compressé au format du partage
  (`compressItinerary`). Le serveur le décompresse, remet chaque valeur à son type (§4), vérifie
  qu'il y a au moins une journée, le **renettoie**, puis stocke du JSON. Plafond : 2 Mo de
  payload (413). Une erreur `FILE_TOO_LARGE` de s3nd est elle aussi renvoyée en 413.
- **Décompression bornée** (route publique) : le serveur n'utilise pas `decompressItinerary`
  du navigateur. Il décompresse avec `zlib.inflateRawSync` plafonné à 2 Mio décompressés, puis
  décode le msgpack avec des bornes (tableaux, objets, chaînes de 32 Kio). Au-delà de 180
  journées ou de 100 activités par journée : 413. Le PUT vérifie le jeton contre son empreinte
  **avant** de lire le corps.
- **Nettoyage sur le téléphone** : avant tout envoi, publication comme mise à jour ; une mise
  à jour envoie donc toujours ses réglages (ceux de `publishedTemplate` pour les garder).
- **Lectures publiques** :

  | Route                  | `Cache-Control`                                    | Pourquoi                                                                                     |
  | ---------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
  | `[id]` (200, 404, 410) | `no-store`                                         | lu par l'app pour reprendre : un modèle retiré ne doit pas rester repris pendant des minutes |
  | `[id]/v/[n]`           | `public, s-maxage=60`                              | contenu immuable ; un retrait le fait répondre 410 après une minute de cache, sans rallonge  |
  | `by-slug`, `index`     | `public, s-maxage=300, stale-while-revalidate=300` | lus par le site vitrine, régénéré au plus toutes les heures                                  |

  Elles n'ont pas de limiteur par IP : les régénérations du site vitrine viennent de quelques
  IP Vercel, et lui ne lit que `by-slug` et `index`, en cache.

- **Jamais renvoyés** : `ownerTokenHash`, `retiredAt`, ni une version autre que celle demandée.
- **Client** : `src/lib/template-api.ts` sur le modèle de `group-sync.ts` (`readError`,
  `cache: 'no-store'`). Erreurs typées : `TemplateNotFoundError` (404), `TemplateRetiredError`
  (410), `TemplateForbiddenError` (401, 403), `TemplateTooLargeError` (413),
  `TemplateUnavailableError` (503, dont l'index qui n'a pas suivi et le retrait dont les versions
  n'ont pas été supprimées ; aussi 429, 502, 504),
  `TemplateInvalidError` (400) ; les trois dernières portent le message du serveur.
  `templateFailureReason` et `templateTakeFailureReason` en tirent la cause des événements
  `template_publish_failed` et `template_take_failed`, d'après la classe, jamais le message ;
  une `TypeError` (`fetch` n'a pas abouti) donne `network_error`.

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
- `readIncomingTemplate(search)` (`?modele=<id>`) reste **séparé** de `readIncomingShare`. Il
  renvoie `{ templateId, step, via } | null` :
  - `step` : `'dates'` avec `etape=dates` (la reprise s'ouvre sur le choix de la date de départ,
    B3, sans repasser par l'aperçu), sinon `null` ;
  - `via` : `'site'` avec `from=site`, sinon `'link'` (`'native'` se décide à l'arrivée par
    l'app native, pas dans l'URL).
- `getTemplateTakeUrl(id, { step?, via? }, origin?)` écrit ces paramètres
  (`/?modele=<id>&etape=dates&from=site`) ; une origine vide donne une adresse relative.
  `readTemplateTakeOptions(search)` lit `etape` et `from` seuls, pour que `/m/<id>` les fasse
  suivre jusqu'à la reprise.
- `parseNativePath` gagne une intention `template` (`/m/<id>`, `/?modele=<id>`). Un
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
- `template_opened { via: 'link' | 'site' | 'native' }`
- `template_taken { days_count, kept_days_count, duration: 'same' | 'shorter' }`
- `template_take_failed { reason }`

Deux événements existants gagnent un drapeau `from_template` :

- `edit_changes_saved { changes_count, from_template }` : vrai quand le voyage édité a un
  `origin`. Avec `template_taken`, il donne la part des reprises retouchées dans les 7 jours
  (spec §8).
- `pwa_installed { from_template }` : vrai quand un des voyages enregistrés a un `origin`
  (installations venant d'un lien modèle, spec §8). Une installation avant la reprise compte
  comme hors modèle.

Ils ne portent jamais d'id, de slug ni de prénom. Les compteurs « ouvertures / reprises » de
l'écran A4 font l'objet d'un ticket à part (objet `stats` mis à jour au mieux).

## 9. Vérifications

- `bun run test` : tous les modules purs, le store contre son faux bucket, et les routes.
- Le build ignore les erreurs de type. Il faut donc lancer :
  `bunx tsc --noEmit --incremental false 2>&1 | grep 'error TS' | grep -v __tests__`. La sortie
  doit être vide ; c'est le cas sur `main` au 3 nov. 2026.

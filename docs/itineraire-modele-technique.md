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
- **Jeton propriétaire** : 32 octets aléatoires en base64url. Le téléphone le tire avant la
  publication (`createOwnerTokenForClient()`, `template-api.ts`) ; à défaut, le serveur le tire.
  Il figure dans la réponse de la publication, et chaque rejeu avec le même `Bearer` le rend de
  nouveau (200, §4). Le serveur n'en garde que le SHA-256 (hex). La comparaison se fait en temps
  constant. Le jeton voyage dans `Authorization: Bearer`, jamais dans l'URL ni dans le corps.
- **Slug** : `<pays>-<n>-jours-<ville1>-<ville2>-<ville3>`, la durée accordée : `-1-jour` pour un
  modèle d'un jour (`portugal-1-jour-lisbonne`), `-<n>-jours` à partir de 2. `isTemplateSlug()`
  exige l'une de ces deux formes (`n` sans zéro devant), ce qu'aucun slug de pays ne contient. Les
  accents sont retirés (NFKD), le résultat est en minuscules, en mots séparés par `-`, et coupé
  à 80 caractères sur une frontière de mot. Les lettres latines que NFKD ne décompose pas sont
  translittérées
  (`đ ð → d`, `ł → l`, `ø → o`, `œ → oe`, `æ → ae`, `ß → ss`, `þ → th`, `ı → i`…) :
  `Đà Nẵng` donne `da-nang`, pas `a-nang`. Une ville dont le nom ne donne aucun caractère latin
  est ignorée. Le slug suit la durée et les 3 premières villes ; les anciens slugs mènent au
  modèle (§4). En cas de collision, il prend un suffixe `-2` à `-5`, puis un suffixe tiré de l'id
  (`-k3x9m2`, puis l'id entier), chacun réservé via `slugs/<empreinte du slug>` en `ifAbsent` : un parcours
  populaire reste toujours publiable, et quelques publications ne suffisent pas à bloquer un slug
  pour tout le monde.

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
  privateStays: string[] // clés `stayKey` des hébergements publiés sans adresse (§3.1), [] par défaut
}

interface TemplateMeta {
  // modèle en ligne : stocké, jamais renvoyé tel quel
  id
  slug // l'actuel : il suit la durée et les 3 premières villes (§4), les anciens mènent ici
  version: number
  title // modifiable par PUT ou PATCH
  authorName: string | null
  country: string // ISO alpha-2
  indexable: boolean // interrupteur de l'auteur
  includesNotes
  includesPrices
  privateStays: string[] // gardé pour qu'une mise à jour les masque encore ; jamais public
  dayCount
  cities: string[]
  tripYear: number | null
  publishedAt
  updatedAt
  retiredAt: null
  ownerTokenHash: string
}

interface TemplateTombstone {
  // pierre tombale : rien de ce que l'auteur a écrit ou choisi, ni slug
  id
  version: number // dernière publiée, pour supprimer les versions
  publishedAt
  retiredAt: string // ISO
  ownerTokenHash: string // un second retrait reste autorisé
  wasListed: boolean // calculé au retrait : 410 par le slug si vrai, 404 sinon
}

type StoredTemplateRecord = TemplateMeta | TemplateTombstone // `<id>/meta`, `isTombstone()`

type PublicTemplate = Omit<
  TemplateMeta,
  'ownerTokenHash' | 'retiredAt' | 'privateStays'
> & {
  listed: boolean // indexable && dayCount >= 2
  itinerary: DayItinerary[] // déjà nettoyé, dates floutées (§4)
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

**Clés d'hébergement.** `stayKey(accommodation)` donne la clé d'un hébergement, la même pour
chacune de ses nuits : son nom sans accents, sans casse ni espaces (`Chez  Tante Lurdes` →
`cheztantelurdes`), répété jusqu'à ce qu'il ne bouge plus et coupé à `MAX_STAY_KEY_LENGTH` (200)
unités UTF-16 ; sans nom, `#<id>`. Un hébergement renommé change donc de clé. `privateStays` ne
contient que de telles clés, et le serveur les réapplique telles quelles, sans les recalculer :

- `isStayKey(value)` : non vide, au plus 200 unités, UTF-16 valide, et soit `#…`, soit déjà sous
  sa forme comparable — un nom brut (`Chez Marie`) est refusé ;
- `parsePrivateStays(value)` : un tableau d'au plus `MAX_TEMPLATE_PRIVATE_STAYS` (180, une par
  journée) clés valides, rendu sans doublon dans l'ordre reçu ; `null` pour toute autre valeur,
  `undefined` compris. L'appelant décide de ce que vaut un champ absent : `[]` à la publication
  et pour une méta écrite avant ce champ, les clés de la méta à une mise à jour ;
- `toPublicTemplate` retire `privateStays` : la liste dirait quels hébergements sont des
  logements privés.

**Hébergement privé renommé après la publication.** Renommer « Chez Marie » en « Chez Marie &
Paul » change sa clé : la clé gardée ne désigne plus rien, et sans garde-fou l'adresse, le lien
et les photos partiraient avec la mise à jour suivante. Trois verrous :

- `unmatchedPrivateStays(itinerary, privateStays)` rend les clés qui ne désignent plus aucun
  hébergement du voyage (renommé ou retiré) ;
- sur le téléphone, `checkPrivateStays(itinerary, publishedTemplate)` (A4, avant toute mise à
  jour) rend `{ privateStays, carried, unmatched }`. `carried` donne les nouvelles clés des
  hébergements masqués retrouvés par leur id (`publishedTemplate.privateStayIds`, que
  `privateStayIds(itinerary, privateStays)` calcule à la publication ; les ids ne bougent
  jamais). Si `carried` ou `unmatched` n'est pas vide, l'écran rouvre le choix de A2,
  `privateStays` cochés, fait confirmer, puis envoie la liste confirmée. `updateTemplate`
  (`template-api.ts`) refuse d'ailleurs d'envoyer une liste dont une clé ne désigne plus rien
  (`TemplatePrivateStaysChangedError`, sans requête) ;
- sur le serveur, une mise à jour **sans** `privateStays` dont une clé de la méta ne désigne
  plus rien est refusée (409, rien n'est écrit, §4). Avec une liste envoyée qui contient une
  telle clé, la mise à jour est écrite et la réponse porte `privateStaysUnmatched: true`, jamais
  la clé (§5).

### 2.4 Sur le téléphone (`StoredTrip`, sans changer le schéma IndexedDB)

Les enregistrements sont stockés entiers : ajouter des champs facultatifs ne demande **aucune
migration**. Il ne faut pas changer `DB_VERSION`.

```ts
type TripSource = … | 'template'

StoredTrip.publishedTemplate?: {    // côté auteur
  id; slug; ownerToken; version; indexable; includesNotes; includesPrices
  privateStays: string[]            // envoyées avec la dernière version : à renvoyer à chaque mise à jour
  privateStayIds?: string[]         // ids des hébergements masqués (§2.3), jamais envoyés
  authorName: string | null; country: string; publishedAt; updatedAt
}

StoredTrip.origin?: {               // côté repreneur
  templateId; version; title; authorName: string | null
  tripYear: number | null           // année du voyage de l'auteur : « prix relevés en 2025 »
  startDate: string; keptDayIds: string[]
  base: DayItinerary[]              // modèle recalé et filtré au moment de la reprise : seule base de fusion V1.1
  takenAt: number
}

StoredTrip.copiedFromDemo?: boolean // copie de la démo (ou d'une telle copie)
```

- `origin` se construit avec `buildTemplateOrigin(template, retimed, input, takenAt)`
  (`template-redate.ts`, pur) : `base` est une copie profonde (JSON) du voyage recalé, et
  `keptDayIds` est rangé dans l'ordre du modèle, sans doublon ni id inconnu. Le serveur ne garde
  que la version publiée d'un modèle (§4) : `base` est la seule trace de la version reprise, et
  la V1.1 fusionnera `base`, le voyage du repreneur et la dernière version (`GET [id]`).
- **Publication rejouable** : avant le `POST`, le téléphone tire le jeton propriétaire
  (`createOwnerTokenForClient()`, `template-api.ts`) et le range sur le voyage, puis l'envoie dans
  `Authorization: Bearer`. Il réutilise ce même jeton à chaque nouvel essai de cette publication
  (erreur réseau, 5xx, double appui) : le serveur rend alors le modèle déjà publié (200) au lieu
  d'en créer un second (§4). Une fois la réponse reçue, le jeton passe dans
  `publishedTemplate.ownerToken` ; un nouveau jeton n'est tiré que pour une nouvelle publication
  (après un retrait, par exemple).
- `publishedTemplate.slug` peut changer à chaque mise à jour (§4) : on le reprend de la réponse
  du `PUT`.
- `duplicateTrip` suit `tripCopyOf` (`trips.ts`, pur) : le programme, le titre et la provenance,
  mais ni `group`, ni `publishedTemplate` (le jeton ne se duplique jamais), ni `origin`. La copie
  de la démo prend la provenance `share` et `copiedFromDemo: true`, transmis de copie en copie.
- `templatePublishBlocker(trip)` (`trips.ts`, pur) dit ce qui empêche de publier, ou `null` ;
  `canPublishTemplate(trip)` vaut `templatePublishBlocker(trip) === null`. Dans cet ordre :
  - `'demo'` : la démo (spec §9) ;
  - `'demo-copy'` : une copie de la démo (`copiedFromDemo`) ;
  - `'empty'` : un voyage sans journée ;
  - `'unmodified-take'` : un voyage repris (`origin`) qui n'a pas été retouché — le republier ne
    ferait qu'un doublon du modèle d'un autre (décision du 4 nov. 2026). Retouché, il se
    publie comme un autre voyage.

  « Retouché » se juge sur ce qui partirait : `cleanForTemplate` des deux côtés (le voyage et
  `origin.base`), notes et prix compris, sans hébergement masqué, clés comparées dans l'ordre
  alphabétique. Une journée, une activité, un conseil, un hôtel, un trajet, un prix, une note ou
  l'ordre qui change : retouché. Un statut (« fait », « réservé »), une référence, un siège, un
  lien de confirmation ou une photo restée sur l'appareil : non, ils ne partent jamais. Décaler
  tout le voyage non plus : chaque date y est comptée en jours depuis une date repère
  (`templateDateAnchor`, sinon la première date trouvée), puisque le repreneur suivant recale de
  toute façon le modèle à ses dates ; décaler une seule journée, si. Une `base` illisible ne
  bloque pas. Le titre du voyage ne compte pas. Un voyage de groupe se publie : l'écran A3
  prévient que les retouches des autres voyageurs deviennent publiques (ticket #83). La règle
  vaut pour publier : un voyage déjà publié reste géré depuis A4.
  Limite connue : la copie d'un voyage repris (`duplicateTrip`) perd `origin`, donc la règle.

- `importSharedItinerary` en mode remplacement retire `origin` et `publishedTemplate`. Il garde
  `copiedFromDemo` : un voyage reçu à la place d'une copie de la démo reste non publiable.
- `exportData` n'exporte déjà que `{ title, itinerary }`.
- **Trajets enregistrés avant la normalisation des types** : un import CSV ou XLSX gardait le type
  saisi (« Ferry », « TGV »), un import JSON n'importe quel texte, et l'écran de la journée
  plantait sur l'icône manquante. `normalizeStoredTrip(trip)` (`trips.ts`, pur) applique
  `normalizeItineraryTransports` au voyage et à `origin.base`, et rend le même objet si rien ne
  change. `useTripData` l'applique à la lecture de tous les voyages, puis réécrit au mieux ceux
  qui ont changé. L'ancien `importData` (JSON, sans normalisation, sans appelant) est supprimé.

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
  la requête, accents ignorés (`ma-réservation`), des termes comme `confirmation`, `confirm`,
  `mybooking`, `manage`, `reservation`, `pnr`, `token`, `auth`, `bn=`, des numéros de
  réservation ou de commande (`itineraryId`, `bookingNumber`, `orderNo`, `pincode`…), des
  espaces client (`my-account`, `account/booking`…) ou la forme `/trips/<8 chiffres ou plus>`.
  Il est aussi retiré s'il porte une adresse e-mail ou un numéro de téléphone, quel que soit le
  paramètre (`?mail=`, `?tel=%2B33…`, `/clients/<adresse>/`), ou la `bookingReference` de
  **n'importe quel** transport ou hébergement du voyage : une activité n'a pas de référence, et
  un séjour est souvent saisi avec sa référence sur la première nuit seulement. Pour un
  hébergement on met `''` (le champ est requis dans le type) ; ailleurs on supprime la clé.
- Les ids (journées, activités, transports, hébergements) sont conservés à l'identique : la
  fusion V1.1 s'appuie dessus.
- **Hébergements privés** (« Ne publier que le nom et la ville », écran A2, décision du
  4 nov. 2026) : pour chaque hébergement dont la clé `stayKey` (§2.3) est dans
  `privateStays`, sur toutes ses nuits, `address` et `bookingUrl` deviennent `''` et `images`
  disparaît. Le nom, les dates et le prix (si `includePrices`) partent ; la ville est celle de
  la journée. Une clé qui ne désigne aucun hébergement est sans effet.
- **Adresse masquée effacée partout** : l'adresse d'un hébergement privé, lue sur l'original,
  est retirée de tous les textes du voyage — titres, villes, notes (si incluses), conseils,
  points forts, bagages, légendes, noms, descriptions, horaires, adresses et étiquettes
  d'activité, départ, arrivée, détails, adresse de départ et notes de trajet, nom, adresse et
  dates des autres hébergements. On cherche l'adresse entière et ceux de ses morceaux (coupés
  aux virgules, points-virgules et sauts de ligne) **qui désignent un logement**. Il faut au
  moins 6 caractères, des lettres, et plus que le code postal et une ville du voyage ; un
  morceau doit en plus avoir un chiffre (numéro de rue, étage, code). L'adresse entière, elle,
  est cherchée **même sans numéro dès qu'elle a plusieurs morceaux** : « Quinta das Rosas,
  Sintra », « Le Mas des Oliviers, chemin de la Source » désignent une maison (décision du
  4 nov. 2026 : effacer l'adresse d'origine de tous les textes). « 12 rue des Lilas »,
  « 3e étage », « digicode 4521 » sont cherchés ; un seul morceau sans numéro (un quartier,
  « Montmartre »), le code postal et la ville (« 75011 Paris », « Kyoto 600-8216 » : un code
  postal japonais désigne un pâté de maisons, pas un logement) ou une adresse de moins de
  6 caractères ne le sont pas : la journée publie déjà la ville, et les effacer abîmerait tout
  le quartier. Limite connue : seule l'adresse entière d'une maison sans numéro est cherchée,
  pas « Quinta das Rosas » seule. La recherche ignore casse et accents, prend blancs, virgules et
  points-virgules les uns pour les autres entre deux mots (« 12, rue des lilas »), apostrophes
  et tirets typographiques pour leur forme simple, et ne prend que des mots entiers (« 112 rue
  des Lilas » reste). Chaque passage effacé laisse une espace, puis la ponctuation orpheline est
  rangée (espaces doublées, virgules répétées, parenthèses vides, séparateurs en bout de texte) ;
  un texte sans lettre ni chiffre devient vide, un champ facultatif vide disparaît, une entrée
  de liste vide sort de la liste. Un lien (`bookingUrl`) ou une image dont l'adresse décodée
  contient un morceau part (carte Google Maps, carte statique) ; une activité nommée ou située à
  l'adresse (« Dîner au 12 rue des Lilas ») perd ses coordonnées. Un hébergement dont le nom
  n'était que l'adresse prend le nom « Logement privé » (`PRIVATE_STAY_NAME`).
- **Recherche linéaire et bornée** : le serveur renettoie ce que n'importe qui envoie, et une
  expression régulière en alternative (64 morceaux de 200 caractères) se laissait occuper des
  minutes par une adresse forgée (« 1 ab 1 ab … »). Chaque texte est désormais plié une fois
  (NFD, marques retirées, minuscules, apostrophes et tirets ramenés à `'` et `-`, chaque suite
  de blancs, virgules et points-virgules ramenée à une espace), avec une table qui ramène chaque
  position pliée à l'original. Un automate d'Aho-Corasick y trouve tous les morceaux d'un seul
  passage, vérifie les frontières de mots (ni lettre ni chiffre de part et d'autre, une marque
  suivant son caractère), et les passages trouvés sont effacés du texte original. Au plus
  8 morceaux par hébergement privé (adresse entière comprise), 32 pour le voyage, 120 caractères
  par morceau ; un morceau plus long n'est pas cherché, ses morceaux plus courts le sont.
  Sur le serveur (`cleanForTemplate(…, { maxAddressSearchWork })`, `prepareContent`), le travail
  est compté en caractères parcourus × (morceaux + 24, le coût d'un caractère plié) : les
  textes une fois, liens et images trois fois (brut, `+` en espace, décodé), les noms des autres
  hébergements à chaque tour de la règle d'idempotence ci-dessous, chaque passe de plus d'un
  même texte. La première passe est comptée avant de toucher au moindre texte. Au-delà de
  `MAX_ADDRESS_SEARCH_WORK` (2²⁸, environ un quart de seconde ; 2 Mio de textes face à
  32 morceaux y tiennent), `AddressSearchTooCostlyError` : la publication ou la mise à jour
  répond 400 « Ce voyage est trop long à vérifier avant publication… », rien n'est écrit. La
  recherche n'est jamais sautée. Sur le téléphone, rien n'est compté.
- **Idempotence** : un hébergement dont le nom publié rejoint `privateStays` une fois l'adresse
  effacée (« Chez Marie, 12 rue des Lilas » → « Chez Marie ») est masqué dès le premier passage
  (on repasse jusqu'à ce que plus rien ne bouge ; un tour de plus seulement si les morceaux
  cherchés ont grandi, soit 32 tours au plus). Le second passage, sur le serveur, n'a plus
  d'adresse à chercher : il ne change rien. C'est donc **le téléphone** qui efface l'adresse des
  textes ; le serveur réapplique `privateStays` à l'hébergement lui-même.

`templateStays(itinerary)` sert l'écran A2 : un hébergement par clé, dans l'ordre du voyage,
`{ key, name, cities, address, nights, suggestedPrivate }`. `name` et `address` sont les premiers
non vides (sans espaces autour), `cities` les villes des journées qui le portent, sans doublon.
`nights` compte les nuits de `checkIn` à `checkOut` quand ces dates se lisent (un hôtel porté par
la seule journée d'arrivée compte toutes ses nuits, 180 au plus), sinon une par journée qui le
porte. `suggestedPrivate` (case cochée d'office) vient de `looksLikePrivateStay(accommodation)` :

- toujours pour Airbnb écrit en morceaux (« Air BnB », « Air B&B », « Air B & B ») : lu en
  premier, le `bnb` des chambres d'hôtes ne le fait pas passer pour un hôtel ;
- jamais pour un nom d'hôtel, d'auberge, de ryokan, de camping… (`hôtel`, `hostel`, `auberge`,
  `ryokan`, `camping`, `resort`, `inn`, `B&B`, `guesthouse`, `maison d'hôtes`, `pension`,
  `agriturismo`, `aparthotel`, `ホテル`, `旅館`, `酒店`…) : leur adresse est publique, même avec un
  étage ;
- sinon vrai si le nom annonce un logement privé (`chez`, `famille`, `parents`, `amis`,
  `appartement`, `appart`, `appt`, `apt`, `studio`, `maison`, `house of`, `Airbnb`, `logement`,
  `home`, `flat`, `villa privée`, `民泊`…, en mots entiers, accents ignorés), ou si le nom ou
  l'adresse porte un détail d'accès (`étage`, `bâtiment`, `bât. B`, `porte 12`, `porte n°12`,
  `porte B` — pas « Porte d'Italie » —, `digicode`, `code 4521`, `code porte : 2580`,
  `code A1234`, `interphone`, `escalier B`, `apt`, `app. 34`, `2nd floor`, `floor 12`,
  `unit 12`, `room 302`, `flat 12`, `#12`, `302号室`, `c/o`…) ; les numéros ont un ou plusieurs
  chiffres, parfois une lettre (`unit 4B`).

Ce n'est qu'une suggestion : dans la démo, « Lan Beike Apartment » (un appart-hôtel) est cochée,
l'auteur décoche. `summarizeTemplateCleaning` compte dans `stays.privateStays` les hébergements
distincts masqués, et dans `stays.privateLinks` leurs liens et ceux qui mènent à leur adresse ;
`goes.accommodations` compte les clés `stayKey` (privés compris : leur nom part), et `goes.tips`
ne compte pas un conseil qui n'était que l'adresse.

`noteExcerpts(itinerary, limit = 2, { tripTitle? })` sert l'écran A3. Il renvoie des extraits
réels `{ dayId, dayNumber, source, text, spans }` (`source` : `'day'` ou `'transport'`), une note
identique à une autre n'étant montrée qu'une fois. Les notes sont classées :

1. par gravité, la plus grave d'abord : un téléphone ou un e-mail, puis une suite de 6 chiffres ou
   plus, puis un nom, puis un code de 4 ou 5 chiffres, puis rien ;
2. à gravité égale, par nombre de passages surlignés ;
3. puis par longueur.

Les extraits retenus reviennent dans l'ordre du voyage. Une note longue est coupée autour de sa
donnée la plus grave, celle qui a classé la note (à gravité égale, la première du texte) : cette
donnée est toujours visible et surlignée, même sans espace où couper (japonais, chinois, long
lien), et les données moins graves placées avant elle sortent de l'extrait — une note choisie pour
un téléphone montre ce téléphone, pas seulement le prénom qui le précède. L'extrait n'est jamais
coupé au milieu d'un emoji. `sensitiveSpans(text, knownPlaces)` repère :

- les suites de 4 chiffres ou plus (codes, digicodes), sauf les chiffres d'un numéro de vol ou de
  train, publics par nature : deux lettres majuscules (ou un chiffre et une lettre, ou `TGV`,
  `ICE`…) puis 2 à 4 chiffres, en mot entier (`CA1590`, `AF 274`, `9C8951`, `TGV 6231`) ;
- les numéros de téléphone et les e-mails ; un numéro qui suit un autre nombre (« Chambre 104
  06 12… », deux numéros à la suite) reste surligné en entier ;
- les noms : un mot à majuscule suivi d'au moins deux minuscules (`Rui`, pas `Li` ni `VIP`), ni
  en début de phrase, ni un lieu connu du voyage, ni un mot courant ou une marque (« Visa
  Premier », « Google Traduction » : petite liste fixe). Après un deux-points, le premier mot
  n'est un nom que si le libellé annonce une personne (`Hôte`, `Contact`, `Guide`, `Chauffeur`,
  `Propriétaire`, `Rdv`…) ou qu'un second nom le suit (« Kaori Tanaka ») : « Hôte : Rui » est
  surligné, « Note : Penser à réserver » ne l'est pas. Une suite de mots à majuscule qui touche
  un lieu, un mot de lieu ou un service de transport (« Tobu Limited Express », « Shinkansen
  Hikari ») est un lieu, en entier.

`templateKnownPlaces(itinerary, tripTitle?)` donne ces lieux connus : le titre du voyage et ceux
des journées, les villes, activités, hébergements, départs et arrivées, compagnies et loueurs
(`provider`), et les adresses. Tout cela est publié de toute façon.

`templateNoteStats(itinerary)` renvoie `{ total, onTransports }` : les notes non vides, de
journée et de trajet, que l'interrupteur « notes » publierait, pour le libellé de A3 (« 25 notes,
dont 5 sur des trajets »). Chaque note compte, même identique à une autre.

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
   n'est pas passé (convention de l'app et de la démo). Une nuit gardée que le modèle logeait
   garde son hébergement : si plus rien avant elle dans le séjour ne la couvre, l'hébergement
   qui la couvrait dans le modèle passe sur elle. C'est le cas de la première nuit gardée quand
   la journée d'arrivée est retirée, mais aussi d'une nuit plus loin quand la copie de l'hôtel
   gardée avant elle n'a pas de `checkOut` lisible (vide, il reste vide) et que la copie retirée
   le donnait : l'hôtel noté les 14 et 15 octobre, sans date la 1ʳᵉ fois, départ le 17 la 2ᵉ ;
   sans le 15, la nuit du 16 reçoit la 2ᵉ copie, recalée.
5. Trajets qui touchent une **étape** retirée. Une étape est une suite de journées consécutives
   dans la même ville (la démo passe trois fois par Shanghai : trois étapes) ; elle est retirée
   quand aucune de ses journées n'est gardée, même si la ville revient ailleurs dans le voyage.
   La ville se reconnaît aussi dans un nom de gare ou d'aéroport, comme suite de mots entiers, la
   plus longue l'emportant (« PKX Beijing Daxing Intl. » est à Beijing ; « Narita » n'est pas à
   Nara). Une extrémité de trajet désigne l'étape de sa ville la plus proche dans le sens du
   trajet, en partant de l'étape de la journée qui le porte : la précédente pour `from`, la
   suivante pour `to`. Une ville sans étape de ce côté (un retour vers la ville du départ, hors
   des étapes) ne compte comme retirée que si plus aucune de ses journées n'est gardée. Un `from`
   qui ne nomme aucune étape (« Odawara », « Đà Nẵng », « Cần Thơ ») se déduit de la place du
   trajet : rangé au premier jour d'une étape et arrivant dans sa ville, il vient de l'étape
   d'avant, et il est retiré avec elle. Un trajet recousu ne garde que son id, son type et ses
   extrémités : horaires, durée, compagnie, adresse de départ, détails, lien de réservation, prix,
   devise et notes décrivaient l'ancien trajet et sont retirés (avec référence, siège, porte,
   terminal et statut, que le nettoyage retire déjà). Il relie l'étape gardée précédente à la
   suivante :
   - **Vers** une étape retirée (trajet rangé au jour du départ) : `to` devient la ville de la
     journée gardée suivante (Tokyo → Hakone, sans Hakone, devient Tokyo → Kyoto). Le trajet est
     supprimé s'il n'y a pas de journée gardée suivante (ou qu'elle n'a pas de ville), si cette
     ville est celle de son `from` ou celle de la journée qui le porte (plus rien à parcourir),
     si son `from` est lui aussi une étape retirée, ou si la journée suivante porte un trajet
     venu d'une étape retirée qui sera recousu (conventions mêlées, comme dans la démo : on
     garde celui du jour d'arrivée, qui nomme la vraie gare d'arrivée, plutôt que deux trajets
     identiques).
   - **Depuis** une étape retirée (trajet rangé au jour d'arrivée) : `from` devient la ville de la
     journée gardée précédente ; sans journée précédente (ou sans ville), `from` est retiré. Le
     trajet est supprimé si cette ville précédente est celle de son `to` : il ramènerait là où
     l'on est déjà (Tokyo → Nikko → Tokyo, sans Nikko ; Cần Thơ → Saïgon sans le delta du
     Mékong).
   - Exemples réels : sans le 2ᵉ passage à Shanghai, le vol Shanghai → Taipei devient
     Zhangjiajie → Taipei ; sans Hội An, le vol Đà Nẵng → Hô Chi Minh-Ville devient Baie d'Along
     → Hô Chi Minh-Ville ; sans Hakone, le Shinkansen Odawara → Kyoto devient Tokyo → Kyoto.
   - Un trajet rangé sur une journée retirée part avec elle, même si son étape reste au voyage
     (retirer le jour 1 retire le vol aller).
6. Un modèle sans date valide fonctionne de la même façon : le jour 1 prend `startDate`, et rien
   d'autre ne glisse.
7. Le voyage doit tenir dans le calendrier `AAAA-MM-JJ` : de `startDate` au lendemain de la
   dernière nuit, au plus tard le 9999-12-31, et aucune date de la journée décalée ne sort de
   0000-01-01 … 9999-12-31. Sinon `retimeTemplate` lève une erreur en français, et
   `groupDaysByCity` (B4) ne date aucune journée, comme sans date de départ valide.

`needsBooking(entity: Accommodation | Transport | Activity): boolean` est la seule règle de « à
réserver », pour la pastille de chaque carte comme pour la bannière de B5 :

- hébergement : ni `bookingReference` (non vide), ni statut `booked`, `checked-in` ou
  `completed` — un hôtel marqué « Réservé » sans référence n'est plus à réserver ;
- trajet : de même, et seulement en `train`, `plane`, `bus` ou `boat` (la voiture ne se réserve
  pas forcément, un trajet non classé `other` non plus) ;
- activité : `reservationRequired === true`, et statut ni `done` ni `skipped`.

L'hébergement se reconnaît à son `checkIn` (champ requis), le trajet à son type (`train`, `car`,
`plane`, `bus`, `boat`, `other`), le reste est une activité.

`templateTodo(itinerary)` renvoie ce qu'il reste à réserver (B5), d'après `needsBooking` :
`{ accommodations, transports, bookableActivities }`. `accommodations` liste, dans l'ordre du
voyage, les noms distincts (même nom à la casse et aux espaces près) dont une nuit au moins reste
à réserver ; les deux autres sont des comptes.

`groupDaysByCity(itinerary, keptDayIds, startDate): CityGroup[]` sert B4 : une entrée par étape,
`{ city, entries, days, range }`. `entries` liste les journées de l'étape
(`{ id, dayNumber, title, kept, date }`, `date` étant celle que `retimeTemplate` donnera, ou
`null`) ; `days` est le nombre de journées gardées de l'étape, affiché « 2 jours » (0 : étape
retirée). Ce sont des journées et non des nuits : la dernière étape compte le jour du départ, et
une excursion se dort souvent à l'étape d'avant. `range` donne la première et la dernière date
gardées, `null` sans journée gardée ou sans date de départ valide. La fonction ne lève jamais.

`suggestKeptDayIds(itinerary, count)` propose la sélection de B4 quand la reprise dure moins que
le modèle. Elle garde un voyage complet plutôt qu'amputé de sa fin :

1. le jour 1 (l'arrivée) et le dernier jour (le départ, souvent le vol retour) restent toujours —
   le dernier dès que `count` ≥ 2 ;
2. les journées libres ou de repos (`looksLikeRestDay` : type `free`, `rest`, `libre`… ou titre
   « Journée libre », « Repos ») partent d'abord, en partant de la fin ;
3. puis les plus longs séjours raccourcissent, une journée à la fois : l'étape qui garde le plus
   de journées (la plus tardive à égalité) perd celle du milieu, jamais sa première, jamais en
   dessous d'une journée ;
4. quand chaque étape n'a plus qu'une journée (ou ne peut plus perdre que son arrivée ou le jour
   du départ), des étapes entières partent, en commençant par celle qui comptait le moins de
   journées dans le modèle (la plus tardive à égalité), jamais la première ni la dernière ;
5. s'il faut encore raccourcir (deux ou trois jours demandés), les journées restantes partent en
   partant de la fin.

Les ids sortent dans l'ordre du modèle, tous si `count` couvre le modèle. Une durée qui n'est pas
un entier ≥ 1 lève une erreur en français. Exemple : la démo (20 jours) raccourcie à 14 garde ses
9 étapes et le jour du vol retour.

`durationChoice(templateDays, keptDays)` sert `template_taken.duration` : `'same' | 'shorter'`.
Les journées gardées sont prises dans le modèle, la reprise n'est jamais plus longue ; un compte
égal ou supérieur vaut `'same'`.

Les helpers de date (`toDayNumber`, `fromDayNumber`, `addDays`) sont extraits de
`demo-trip.ts` dans `src/lib/iso-date.ts`, puis partagés. Ils sont sûrs vis-à-vis des fuseaux
horaires, et lèvent `RangeError` hors de 0000-01-01 … 9999-12-31 (au-delà, `toISOString`
écrirait `+010000-01-01`). Il ne faut pas réutiliser le `addDays` de `itinerary-edit.ts`, qui passe par
`toISOString`.

## 4. Stockage (serveur)

`getTemplateStore()` crée son propre `Bucket` s3nd, avec les mêmes identifiants R2 que le
partage mais `prefix: 'templates'`. Les modèles ne sont donc **pas** sous `shares/` et
échappent à toute règle de cycle de vie visant les codes d'une heure. On ne passe **jamais**
d'`expiresIn`.

| Clé (sous `templates/`) | Contenu                                                                    | Écriture                                                      |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `<id>/meta`             | `TemplateMeta`, puis la pierre tombale `TemplateTombstone` une fois retiré | `ifAbsent` à la création, puis `ifMatch`                      |
| `<id>/v/<n>`            | `{ version, title, itinerary }`, en JSON brut (s3nd le gzippe)             | `ifAbsent`, jamais réécrit ; supprimé par la version suivante |
| `slugs/<empreinte>`     | `{ id }`, sous le SHA-256 (hex) du slug ; plusieurs par modèle (anciens)   | `ifAbsent`, jamais réutilisé ni supprimé                      |
| `owners/<empreinte>`    | `{ id }` : publication rejouable, par l'empreinte du jeton                 | `ifAbsent`, avant toute autre écriture ; supprimé au retrait  |
| `index/<c>`             | `{ entries: TemplateIndexEntry[] }`, modèles listés uniquement             | boucle `ifMatch`, 5 tentatives                                |

- **Aucun slug en clair dans les clés** : la réservation d'un slug est `slugs/<SHA-256 du slug>`
  (`templateSlugKey`, `hashTemplateSlug`), sa valeur `{ id }`. Une lecture par le slug
  (`GET by-slug`, l'opérateur) hache le slug demandé pour la retrouver ; personne ne peut lister
  les slugs réservés. Un modèle en ligne garde son slug actuel dans sa méta et dans l'index (il est
  public) ; retiré, il n'en reste plus aucun en clair dans le bucket (voir **Retrait**).
- **Pas de migration** : rien n'était en production avant ces formes (4 nov. 2026). Les formes
  antérieures — slugs en clair (`slugs/<slug>`), pierre tombale avec `slug` ou sans `wasListed`
  — ne sont plus lues : une pierre tombale sans `wasListed` est illisible (500), un slug réservé
  en clair ne mène plus à rien.

- Ordre d'écriture : la version, puis la méta, puis l'index. La méta ne pointe donc jamais vers
  une version absente.
- **Une seule version stockée** : une mise à jour, une fois sa version et la méta écrites,
  supprime toutes les précédentes (`v/1` à `v/<n − 1>`, orphelines comprises). La base de fusion
  de la V1.1 vit sur le téléphone du repreneur (`origin.base`, §2.4) : le serveur n'a plus de
  raison de les garder, et une note ou un prix que l'auteur retire ne doit pas rester en ligne
  dans une version antérieure. Aucune route ne sert d'ailleurs une version précise. Si la
  suppression échoue, l'index est tout de même accordé, puis la mise à jour échoue en `versions`
  (503 « Le modèle est à jour, mais ses versions précédentes n'ont pas pu être effacées.
  Réessaie. ») : la nouvelle version est déjà en ligne, et rejouée, la mise à jour écrit une
  version de plus et supprime toutes les précédentes. `version` ne fait que croître dans la
  méta : une lecture dont la version disparaît sous une mise à jour relit la méta et sert la
  nouvelle, jamais un 404.
- **Dates floutées** (`blurTemplateDates`, `src/lib/template-dates.ts`, pur) : avant tout
  stockage, publication comme mise à jour, tout l'itinéraire recule d'un nombre entier de semaines
  pour que sa journée repère tombe entre le 1er et le 7 de son mois. Chaque date et date-heure
  glisse du même écart (`shiftDatesDeep`) : même jour de la semaine, même mois, même année
  (`tripYear` inchangé), mêmes durées, nuits et heures ; seul le quantième disparaît (un modèle
  publié au samedi 3 avril a pu partir le 3, le 10, le 17 ou le 24). Le modèle d'un voyage à venir
  ne dit donc pas quand son auteur sera absent de chez lui. Les ids ne bougent pas, même quand ils
  ont la forme d'une date. La journée repère (`templateDateAnchor`) est la première datée
  `AAAA-MM-JJ` — la règle de `tripYear` et du recalage —, sinon la première datée d'une date-heure
  (`2027-04-17T00:00`) : un jour 1 « à définir » ne laisse donc pas passer les dates exactes des
  journées suivantes. Sans aucune date de journée, rien ne bouge. La fonction est idempotente. Une
  date écrite dans un texte libre (« Vol du 25 mai ») part telle quelle. Le repreneur recale tout
  à ses dates (§3.2) : le flou ne change rien pour lui. **À reprendre dans les textes légaux
  (W10)** : les dates publiées ne sont pas celles du voyage, seuls le mois, l'année et les jours
  de la semaine le sont.
- **Publication rejouable** : un `POST` qui porte `Authorization: Bearer <jeton>` (tiré par le
  téléphone, §2.4) réserve d'abord `owners/<SHA-256 du jeton>` → `{ id }` en `ifAbsent`, puis
  publie sous cet id. Un envoi qui trouve la réservation :
  - méta en ligne : rend le modèle tel qu'il est stocké, sans rien écrire (200, `ownerToken`
    renvoyé) — réponse perdue, double appui ;
  - pas de méta : l'envoi précédent s'est interrompu ; celui-ci termine la publication sous le
    même id, sa version au premier emplacement libre (au plus 10), puis supprime les versions
    des envois interrompus une fois la méta écrite (201) ;
  - pierre tombale : 410 (le retrait supprime d'ordinaire la réservation).
    Des envois simultanés se départagent sur la méta en `ifAbsent` : un seul 201, les autres 200
    avec le même modèle. Sans l'en-tête, rien ne change : le serveur tire le jeton, et chaque
    envoi publie un modèle. L'id réservé n'est pas vérifié libre : une collision (2⁻⁸⁰) ferait
    échouer ce jeton en 500.
- **Réponse S3 perdue** : le SDK rejoue une écriture dont la réponse s'est perdue, et
  l'écriture conditionnelle rejouée reçoit 412 sur la sienne. Un 412 sur une réservation de
  publication, sur la méta d'une publication, sur un slug ou sur la méta d'une mise à jour est
  donc vérifié en relisant l'objet : s'il est le nôtre (`{ id }`, empreinte du jeton et numéro
  de la version écrite), la requête continue comme si l'écriture avait répondu. Jamais de modèle
  en ligne sans que son auteur ait reçu le jeton.
- **Index en morceaux** : 32 objets `index/<c>`, un par premier caractère de l'id. Un objet
  unique atteignait la taille maximale de s3nd (4 Mio gzippés) après ~1 800 publications
  forgées, et plus aucun modèle listé n'y entrait. Les ids sont tirés au hasard : bloquer un
  modèle donné demande de remplir les 32. `readIndex` lit les 32 en parallèle et les fusionne ;
  `readIndexPage(bucket, page)` en sert des pages de 500 lignes (`GET /api/templates/index`,
  §5), pour qu'une réponse reste petite quel que soit le nombre de modèles. Un morceau qui ne
  peut plus grandir (`FILE_TOO_LARGE`) est journalisé avec l'étiquette `template_index_full`
  et l'id resté dehors, que `scripts/resync-template-index.ts` remet dans l'index une fois de la
  place faite (procédure : `docs/modeles-moderation.md` §5). L'ancien objet `index`, jamais
  publié en production, n'est plus lu.
- **Index** : la ligne d'un modèle suit sa méta **stockée**, relue après la lecture de l'index,
  puis revérifiée après l'écriture (une requête concurrente plus lente ne peut pas y remettre
  un modèle masqué ou retiré). Si l'index échoue sur un ajout ou une modification, le modèle
  manque au sitemap jusqu'à sa prochaine écriture. Sur une **sortie** (masqué, ramené à une
  journée, retiré), la requête échoue en 503 « Réessaie » une fois la méta écrite : rejouée,
  elle ne refait que l'index. Un index illisible n'est jamais réécrit, et sa lecture lève (500)
  au lieu de renvoyer une liste vide.
- Villes de la méta et de l'index : les 10 premières, 80 caractères chacune.
- Titre (120) et prénom (40) sont bornés en unités UTF-16, comme le `maxLength` des champs,
  mais jamais au milieu d'un emoji (`truncateText`, `src/lib/text-limit.ts`) ; une moitié de
  paire isolée envoyée telle quelle devient U+FFFD. Même règle pour les voyages de groupe.
- **Mise à jour** : la méta reprend de la nouvelle version le titre (gardé s'il n'est pas
  envoyé), `dayCount`, `cities`, `tripYear`, `includesNotes`, `includesPrices`, `privateStays`,
  et prend un nouvel `updatedAt`. Le pays ne change jamais. **Chaque réglage absent garde sa
  valeur publiée**, un par un : `options` absent, ou `options` sans `includeNotes`,
  `includePrices` ou `privateStays`, reprend la valeur de la méta. Mise à jour comme changement
  de réglages réévaluent la présence dans l'index : un modèle ramené à une journée en sort (ses
  slugs répondent 404), un modèle rendu visible y rentre.
- **Hébergements privés** (`privateStays`, §2.3, §3.1) : les clés reçues à la publication
  (`parsePrivateStays` : au plus `MAX_TEMPLATE_PRIVATE_STAYS` = 180 clés `stayKey` de
  `MAX_STAY_KEY_LENGTH` = 200 unités, dédoublonnées ; sinon 400 « Hébergements privés
  invalides. », rien n'est écrit) sont gardées dans la méta, puis **réappliquées à chaque mise
  à jour** qui ne renvoie pas la liste : `cleanForTemplate` les masque de nouveau, si bien que
  l'adresse d'un logement privé ne repart jamais avec une mise à jour, même d'un téléphone qui
  aurait oublié de les renvoyer. Une liste envoyée, même vide, remplace celle de la méta
  (l'auteur a décoché un hébergement). **Hébergement renommé** (§2.3) : sa clé ne le désigne
  plus. Une mise à jour sans liste dont une clé de la méta ne désigne plus aucun hébergement est
  refusée en 409 (`conflict`, « Un hébergement masqué a changé de nom ou n'est plus dans le
  voyage : choisis de nouveau ceux à masquer, puis réessaie. »), rien n'est écrit. Avec une
  liste envoyée qui en contient une, le serveur ne peut pas deviner la nouvelle clé : la
  version est écrite et la réponse porte `privateStaysUnmatched: true` (jamais la clé), pour que
  le téléphone prévienne ; le téléphone de cette version ne l'envoie jamais
  (`checkPrivateStays`, `TemplatePrivateStaysChangedError`). Ni une réponse (`toPublicTemplate`), ni l'index, ni une
  version stockée ne les portent : la liste dirait quels hébergements sont des logements
  privés. Une méta écrite sans ce champ se lit avec `[]` ; une liste illisible rend la méta
  illisible (500), plutôt qu'une mise à jour qui publierait l'adresse.
- **Le slug suit la durée** : à chaque mise à jour, le slug est gardé tant qu'il est l'un de
  ceux que le nouveau contenu aurait pu prendre (même tête `<pays>-<n>-jour(s)`, mêmes 3
  premières villes, suffixes de collision compris). Sinon, un nouveau slug est réservé, avec les
  mêmes règles de collision qu'à la publication, et devient `meta.slug`. L'ancien reste réservé
  sous son empreinte et pointe toujours vers le modèle : `GET by-slug/<ancien>` répond le
  modèle avec son slug **actuel**, vers lequel le site vitrine redirige en 301. L'index ne porte
  que le slug actuel. Revenir à une durée passée reprend le slug d'alors, déjà au modèle ; un
  slug d'une ancienne forme (`-1-jours`) est remplacé à la mise à jour suivante. Un slug réservé
  par une mise à jour qui échoue ensuite mène lui aussi au modèle (redirection sans
  conséquence).
- **Titre par PATCH** : `title` renomme le modèle sans nouvelle version (écran A4), borné comme
  à la publication ; vide ou `null`, il est tiré des étapes de la version publiée. Il ne touche
  ni au slug ni à la version ; l'index suit.
- **Forme des valeurs** : avant tout stockage, `normalizeItineraryShape`
  (`src/lib/template-shape.ts`) remet chaque valeur à son type. Une journée dont un champ requis
  est faux fait refuser l'itinéraire (400). Ailleurs, une valeur mal typée est retirée : activité
  sans nom en texte, transport sans id, image autre que http(s), nombre non fini. Un hébergement
  nommé reste ; ses textes requis manquants deviennent `''`. Le type d'un transport n'est jamais
  une raison de le retirer : `normalizeTransportType` (`src/lib/transport-type.ts`) le ramène à
  un type de l'app d'après ses mots, en français ou en anglais (« Ferry » → `boat`, « TGV » →
  `train`, « taxi » → `car`), et ce qu'elle ne reconnaît pas, absent compris, devient `other`
  (« Autre trajet »). Un ferry importé d'un tableur arrive donc au modèle publié.
- **Retrait** : la méta devient une pierre tombale (`TemplateTombstone`, `template-store.ts`) :
  `{ id, version, publishedAt, retiredAt, ownerTokenHash, wasListed }`, rien d'autre — ni
  slug, ni titre, ni prénom, ni année, ni réglages (hébergements privés compris), ni les champs
  pays et villes. `version` dit au retrait rejoué quelles versions supprimer, `ownerTokenHash`
  autorise un second retrait et désigne la réservation `owners/<empreinte>` à supprimer ; aucune
  autre empreinte n'est nécessaire au ménage. Les slugs du modèle, l'actuel comme les anciens,
  restent réservés pour toujours, mais seulement sous leur empreinte (`slugs/<empreinte>`) :
  le bucket ne dit plus quel pays, quelle durée ni quelles villes ils portaient
  (`japon-3-jours-tokyo-kyoto`), et chacun répond comme le slug actuel (410 si le modèle était
  listé, 404 sinon) à qui le demande — l'empreinte du slug demandé mène à la pierre tombale.
  Décision du 4 nov. 2026 : un modèle retiré ne laisse rien de lisible sur son auteur. Limite
  assumée : un slug se devine (pays, durée, villes) ; qui en devine un peut vérifier qu'il a été
  réservé, comme le 410 de la page le dit déjà. Les versions sont supprimées, avec la
  réservation `owners/<empreinte>` si elle désigne ce modèle (le même jeton a pu republier
  depuis un premier retrait), et l'entrée sort de l'index. Les deux doivent aboutir : si
  l'index ne suit pas, le retrait échoue en `index` ; si la suppression échoue, l'index est
  tout de même accordé, puis le retrait échoue en `versions`. Dans les deux cas la route répond
  503 « Réessaie », la pierre tombale étant déjà écrite : rejoué, le retrait refait la
  suppression et l'index. Une mise à jour qui croise un retrait relit la méta juste après avoir
  écrit sa version : si elle trouve la pierre tombale, elle supprime sa version (`versions` si
  la suppression échoue) et répond 410. Aucune version ne survit donc à un retrait annoncé comme
  réussi. Une écriture ou une lecture dont la version disparaît sous un retrait concurrent
  répond de même 410, jamais 404 ni 500. Les lectures répondent 410 ; par le slug, seulement si
  `wasListed` (sinon 404, voir §7).
- **Retrait par l'opérateur** : `retireTemplateAsOperator(bucket, idOuSlug)`, sans jeton, mêmes
  effets ; un ancien slug désigne le modèle comme l'actuel, et un slug désigne encore un modèle
  retiré (il est haché pour retrouver sa réservation). Le résultat donne le slug actuel lu sur
  la méta en ligne, `null` si le modèle était déjà retiré ; `readTemplateForOperator` rend
  `{ status: 'retired', meta: TemplateTombstone }` sans slug, et `resyncTemplateIndex` un
  `slug: null` pour un modèle retiré. Aucune route n'y mène : seul
  `scripts/retire-template.ts` l'appelle, avec les identifiants R2 de production. Le script
  vérifie ensuite, par `readTemplateForOperator`, que le modèle est retiré, hors de l'index et
  sans aucune version stockée (`versionsLeft === 0`) ; sinon il sort en 1. Procédure :
  `docs/modeles-moderation.md`.
- La logique vit dans `src/lib/template-store.ts`, derrière une interface étroite
  `{ putSnapshot, getSnapshot, delete }`. Elle est testée contre un faux bucket en mémoire,
  comme `group-sync-engine.ts`. Les routes restent minces.

## 5. API (`src/app/api/templates/…`)

Toutes les routes déclarent `runtime = 'nodejs'` et `dynamic = 'force-dynamic'`. Les erreurs
ont la forme `{ error: '<message français>' }`, au tutoiement comme toute l'app (« Réessaie »,
« Mets l'application à jour »).

| Route                               | Accès                          | Réponse                                                                                  |
| ----------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- |
| `POST /api/templates`               | public, 10/min/IP, Bearer opt. | 201 `{ template, ownerToken }` · 200 (même jeton : déjà publié) · 401 (jeton mal formé)  |
| `GET /api/templates/[id]`           | public, sans cache             | 200 `{ template }` · 404 · 410 `{ status: 'retired' }`                                   |
| `PUT /api/templates/[id]`           | Bearer                         | 200 `{ template, privateStaysUnmatched? }` (nouvelle version) · 400 · 409 · 410 · 503    |
| `PATCH /api/templates/[id]`         | Bearer                         | 200 `{ template }` (`indexable`, `authorName`, `title`) · 410 · 503                      |
| `DELETE /api/templates/[id]`        | Bearer                         | 200 `{ status: 'retired' }` · 503 (index, versions)                                      |
| `GET /api/templates/by-slug/[slug]` | public                         | 200 `{ template }` **seulement si `listed`**, slug actuel même par un ancien · 404 · 410 |
| `GET /api/templates/index?page=<n>` | public                         | 200 `{ entries, nextPage }` · 400 (page invalide)                                        |

- **Publication** : `Authorization: Bearer <jeton>` est facultatif ; s'il est là, il doit avoir
  la forme d'un jeton (43 caractères base64url), sinon 401 avant toute lecture du corps et toute
  écriture. Avec lui, la publication est rejouable (§4) : 201 au premier envoi, 200 avec le même
  modèle et le même `ownerToken` aux suivants. Sans lui, le serveur tire le jeton (201).
- **Index par pages** : `?page=<n>` (0 par défaut ; tout autre texte qu'un entier de 0 à
  999 999 sans zéro en tête répond 400). Chaque page porte au plus 500 lignes, dans un ordre
  stable : `updatedAt` décroissant, puis l'id. `nextPage` vaut la page suivante, ou `null` après
  la dernière ; au-delà, `{ entries: [], nextPage: null }`. Le site vitrine boucle de la page 0
  jusqu'à `nextPage: null` et dédoublonne par id : un modèle modifié entre deux pages peut en
  changer.
- **PATCH** : `{ indexable?, authorName?, title? }`, au moins un ; `title` est borné comme à la
  publication, vide ou `null` il est tiré des étapes (§4).
- **Réglages** (`options` de POST et de PUT) :
  `{ includeNotes?, includePrices?, privateStays? }`. Un booléen d'un autre type répond 400 « Réglages du modèle invalides. » ;
  `privateStays` passe par `parsePrivateStays` (§2.3 : au plus 180 clés `stayKey` de 200
  unités au plus, dédoublonnées) et répond sinon 400 « Hébergements privés invalides. », avant
  toute écriture. À la publication, un réglage absent prend sa valeur par défaut (notes
  exclues, prix inclus, aucun hébergement privé) ; à une mise à jour, il garde sa valeur
  publiée (§4), `privateStays` compris.

- **Écritures** : le corps porte `data`, l'itinéraire compressé au format du partage
  (`compressItinerary`). Le serveur le décompresse, remet chaque valeur à son type (§4), vérifie
  qu'il y a au moins une journée, le **renettoie** (recherche des adresses masquées bornée,
  400 au-delà, §3.1), puis stocke du JSON. Plafond : 2 Mo de
  payload (413), et 2 Mio + 64 Kio pour le corps entier, compté à la lecture : un envoi sans
  `Content-Length` (chunked) est coupé dès le plafond franchi. Une erreur `FILE_TOO_LARGE` de
  s3nd est elle aussi renvoyée en 413.
- **Décompression bornée** (route publique) : le serveur n'utilise pas `decompressItinerary`
  du navigateur. Il décompresse avec `zlib.inflateRawSync` plafonné à 2 Mio décompressés, puis
  décode le msgpack avec des bornes (tableaux, objets, chaînes de 32 Kio, profondeur 8, mesurée
  en un passage avant tout décodage : un voyage en a 5, et 2 Mio d'imbrication coûtaient
  340 Mo de tas). Au-delà de 180 journées ou de 100 activités par journée : 413. Le PUT
  vérifie le jeton contre son empreinte **avant** de lire le corps.
- **Nettoyage sur le téléphone** : avant tout envoi, publication comme mise à jour ; une mise
  à jour envoie donc toujours ses réglages (ceux de `publishedTemplate` pour les garder,
  `privateStays` compris : c'est le téléphone qui efface l'adresse des textes, §3.1). Le
  serveur réapplique de toute façon les hébergements privés de la méta si la liste manque.
- **Lectures publiques** :

  | Route                               | `Cache-Control`                                    | Pourquoi                                                                                     |
  | ----------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
  | `[id]` (200, 404, 410)              | `no-store`                                         | lu par l'app pour reprendre : un modèle retiré ne doit pas rester repris pendant des minutes |
  | `by-slug` (200, 410), `index` (200) | `public, s-maxage=300, stale-while-revalidate=300` | lus par le site vitrine, régénéré au plus toutes les heures                                  |

  Elles n'ont pas de limiteur par IP : les régénérations du site vitrine viennent de quelques
  IP Vercel, et lui ne lit que `by-slug` et `index`, en cache.

- **Jamais renvoyés** : `ownerTokenHash`, `retiredAt`, `privateStays` (ni dans une réponse, ni
  dans l'index, ni dans une version stockée), ni une version antérieure : aucune route
  ne sert une version précise (l'ancienne `GET /api/templates/[id]/v/[n]` est supprimée), et le
  serveur ne les garde pas (§4). `ownerToken` ne figure que dans les réponses à sa publication.
- **Client** : `src/lib/template-api.ts` sur le modèle de `group-sync.ts` (`readError`,
  `cache: 'no-store'`). Erreurs typées : `TemplateNotFoundError` (404), `TemplateRetiredError`
  (410), `TemplateForbiddenError` (401, 403), `TemplateTooLargeError` (413),
  `TemplateUnavailableError` (503, dont l'index qui n'a pas suivi, et le retrait ou la mise à
  jour dont les versions n'ont pas été supprimées ; aussi 429, 502, 504),
  `TemplateInvalidError` (400) ; les trois dernières portent le message du serveur.
  `TemplatePrivateStaysChangedError` (une `TemplateInvalidError`) est levée par `updateTemplate`
  **avant tout envoi** quand une clé de `privateStays` ne désigne plus aucun hébergement du
  voyage (§2.3) ; elle porte `unmatched`, qui reste sur le téléphone.
  `createOwnerTokenForClient()` tire le jeton d'une publication rejouable (32 octets de
  `crypto.getRandomValues`, base64url) ; `publishTemplate(itinerary, input, { ownerToken? })`
  l'envoie et rend `{ template, ownerToken, created }` (`created: false` pour un 200 :
  publication déjà faite). `patchTemplate` accepte `title`. Il n'y a plus de
  `fetchTemplateVersion`.
  `templateFailureReason` et `templateTakeFailureReason` en tirent la cause des événements
  `template_publish_failed` et `template_take_failed`, d'après la classe, jamais le message ;
  une `TypeError` (`fetch` n'a pas abouti) donne `network_error`.

## 6. Liens

- **Lien partagé par l'auteur** : `https://app.tripbrain.fr/m/<id>`. Il ouvre l'app si elle est
  installée (iOS, via l'AASA), sinon la webapp.
  - La page `/m/[id]` lit le modèle côté serveur, uniquement pour l'Open Graph « Modèle
    TripBrain ». Elle porte `noindex`, avec `canonical` vers `tripbrain.fr/itineraires/<slug>`
    quand le modèle est listé : le slug **actuel** du modèle lu, qui peut changer à une mise à
    jour (§4).
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
- **Anciens slugs** : `tripbrain.fr/itineraires/<ancien slug>` reste une bonne adresse.
  `GET by-slug/<ancien slug>` répond le modèle avec son slug actuel ; quand `template.slug`
  diffère du slug demandé, le site vitrine redirige en 301 vers `/itineraires/<template.slug>`.
  Un modèle retiré répond 410 (ou 404) sur tous ses slugs. Le lien `/m/<id>`, lui, ne change
  jamais.
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

### Tests de bout en bout

`bun run e2e:templates` (`scripts/e2e/run.ts`) joue l'API en HTTP réel, à travers le vrai
`@s3nd/core` et le vrai SDK AWS :

1. un faux S3 en mémoire démarre sur un port libre (`scripts/e2e/fake-s3.ts`) ;
2. `bun run build`, puis `next start`, avec `R2_ENDPOINT` pointé sur ce faux S3 ;
3. les scénarios de `scripts/e2e/templates-e2e.ts` s'enchaînent : cycle de vie, nettoyage,
   slugs, authentification, corps hostiles, limites, Unicode, concurrence, limiteur, pannes
   injectées (index, versions, réponse S3 perdue, S3 hors service), script de retrait, client
   `template-api.ts`, `Cache-Control` de chaque statut, cohérence finale de l'index.

Compter environ 35 s, dont 20 s de build. Le code de sortie vaut 0 si tout passe, 1 sinon, avec le
détail de chaque échec. Trois variables :

- `E2E_SKIP_BUILD=1` réutilise le `.next` existant ;
- `E2E_ONLY=<texte>` ne joue que les scénarios dont le nom contient ce texte ;
- `E2E_VERBOSE=1` affiche le journal du serveur Next.

Rien ne part vers R2 : le serveur et le script de retrait visent le faux S3. Lancé seul
(`bun scripts/e2e/fake-s3.ts 9000`), le faux S3 liste ses clés sur `GET /__keys`.

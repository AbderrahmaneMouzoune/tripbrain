# Itinéraires modèles — besoin raffiné

Maquettes : https://claude.ai/artifact/RJvk8Dzw8kdQ2XjqeNrcbp

## 1. Le besoin d'origine

Retour d'Amar, un utilisateur :

> « Par exemple j'allais te demander de me dire ce que t'as fait au Japon, et au lieu de
> préparer l'itinéraire moi-même, je peux copier le tien dans ton app et le modifier à ma
> sauce. »

## 2. Reformulation

**Job** — Quand quelqu'un a déjà préparé un voyage là où je vais, je veux reprendre son
itinéraire et le caler sur mes dates, pour ne pas tout rechercher moi-même.

Deux rôles :

- **L'auteur** (Yanis) a fait le voyage, ou l'a préparé. Il veut le donner à plusieurs
  personnes, sans leur envoyer ses réservations.
- **Le repreneur** (Amar) part plus tard, à d'autres dates, souvent moins longtemps, avec
  d'autres goûts.

## 3. Pourquoi l'existant ne suffit pas

| | Partage actuel (lien / QR / code) | Voyage de groupe | **Modèle (nouveau)** |
|---|---|---|---|
| Pour qui | celui qui part avec moi | ceux qui partent avec moi | ceux qui veulent refaire le voyage |
| Durée du lien | 1 heure | permanent | permanent, retirable |
| Contenu | copie exacte | copie synchronisée | copie **nettoyée** |
| Dates | identiques | identiques | **recalées** sur le repreneur |
| Après réception | copie figée | modifs partagées | copie indépendante |

Le partage envoie aujourd'hui les références de réservation, les sièges, les statuts
fait / annulé et des dates passées. C'est voulu pour un co-voyageur, et c'est faux pour
un modèle.

## 4. Périmètre

### V1 — publier, reprendre, recaler

**Côté auteur** (écrans A1 → A4)
1. Dans *Partager*, une 4ᵉ option « Publier comme modèle », rangée sous « Avec ceux qui
   veulent le refaire ».
2. Écran de tri : ce qui part / ce qui reste, avec les chiffres réels du voyage. Ce qui
   reste n'est pas réglable.
3. Écran de choix :
   - **Notes de journée** : désactivé par défaut. L'écran montre 2 extraits réels des notes
     du voyage, avec les données sensibles surlignées (chiffres longs, numéros de
     téléphone, e-mails, noms propres hors lieux). L'auteur décide en voyant ce qui partirait.
   - **Prix payés** : activé par défaut, désactivable. Affichés « à titre indicatif » avec
     l'année du voyage.
   - **Visible sur tripbrain.fr et Google** : activé par défaut, désactivable (voir §4.3).
   - **Prénom de l'auteur** : champ libre, prérempli s'il a déjà été saisi, facultatif.
4. Lien permanent : partager, copier, compteurs ouvertures / reprises, interrupteur de
   visibilité, « Mettre le modèle à jour », « Retirer le modèle ».

**Côté repreneur** (écrans B1 → B5)
1. Aperçu Open Graph dédié « Modèle TripBrain ».
2. Page d'aperçu : villes, parcours, jours. Un seul bouton : « Reprendre ce voyage ».
3. Date de départ, puis durée (identique, plus courte, autre).
4. Choix des jours gardés, regroupés par ville. Les dates se resserrent en direct.
5. Voyage créé en local, avec bannière « D'après le voyage de Yanis » et la liste de ce
   qui reste à réserver. Le mode édition existant prend le relais.

### 4.3 V1 — page publique sur tripbrain.fr (écran C1)

Les modèles servent aussi au référencement du site vitrine.

- **Où** : site vitrine (`tripbrain-landing`), `tripbrain.fr/itineraires/<slug>`. Le slug
  est généré depuis le pays, la durée et les villes : `japon-14-jours-tokyo-kyoto-osaka`,
  suffixé en cas de doublon. Le lien de partage court reste une redirection vers cette page.
- **Rendu** : HTML côté serveur, contenu jour par jour réellement lisible (titres, activités,
  conseils), données structurées `TouristTrip`, image Open Graph, `canonical`.
- **Indexation** : si l'auteur laisse « Visible sur tripbrain.fr et Google » activé, la page
  entre dans `sitemap.ts` et dans les listes `/itineraires/<pays>`. Désactivé : la page reste
  accessible par lien, avec `<meta name="robots" content="noindex">`, hors sitemap et hors
  listes. Le réglage se change à tout moment depuis l'app ; le sitemap suit à la prochaine
  régénération.
- **Retrait** : la page répond `410 Gone` et sort du sitemap.
- **Bouton** « Reprendre cet itinéraire » : ouvre l'étape « dates » dans l'app, ou la
  webapp si l'app n'est pas installée.
- **Signalement** : lien en pied de page, retrait manuel.

### 4.4 V1.1 — repartir de la dernière version du modèle (écrans B7, B8)

- **Aucune notification** quand l'auteur met son modèle à jour.
- Dans *Réglages du voyage*, section « Modèle d'origine », une ligne « Repartir de la
  dernière version » apparaît **seulement** si une version plus récente que celle reprise
  existe. Rien ailleurs : pas de badge, pas de bannière.
- Avant de valider, un écran liste :
  - **ce qui arrive** : ajouts et changements de l'auteur ;
  - **ce qui disparaît** : ce que l'auteur a retiré **et** que le repreneur n'avait pas touché ;
  - **tes modifications gardées** : ce que le repreneur a changé, gardé même si l'auteur a
    aussi changé la même chose ;
  - **ce qui ne bouge pas** : dates, jours choisis, réservations, documents, notes.
- Deux boutons : « Mettre à jour mon voyage » et « Garder mon voyage tel quel ».
- **Moteur** : la fusion à trois voies de `trip-merge.ts` déjà utilisée par les voyages de
  groupe, avec base = version du modèle au moment de la reprise (recalée et filtrée sur les
  jours gardés), local = le voyage du repreneur, distant = nouvelle version passée par le
  même recalage et le même filtre. Seule différence : en cas de conflit, **le local gagne**
  (le groupe fait gagner le serveur).

### V2 — Adapter avec l'IA (écran B6)
Consignes libres + raccourcis (moins de marche, budget serré, avec enfants…), branchées
sur `/api/generate/refine`. Aperçu des changements avant application.

### Plus tard
Recherche par destination et filtres (durée, budget, rythme) sur `/itineraires`.

## 5. Règles de nettoyage à la publication

| Champ | Modèle |
|---|---|
| `bookingReference`, `seat`, `gate`, `terminal` | retirés |
| `status` (activité, transport, hébergement) | retiré, le repreneur repart de « prévu » |
| Documents | jamais envoyés |
| `DayItinerary.notes`, `Transport.notes` | retirés par défaut, envoyés si l'auteur active l'interrupteur |
| `price`, `currency` | gardés par défaut, retirés si l'auteur désactive l'interrupteur |
| `bookingUrl` | gardé si c'est une page publique (site de l'hôtel), retiré s'il contient un identifiant de réservation |
| Tout le reste (activités, horaires, adresses, conseils, plats, bagages, coordonnées, images) | gardé |

## 6. Règles de recalage

- Écart = nouvelle date de départ − date du jour 1 de l'auteur. Chaque `date`, `checkIn` et
  `checkOut` glisse de cet écart.
- Les heures (`departureTime`, `openAt`…) ne bougent pas.
- Retirer des jours renumérote `dayNumber` et resserre les dates sans trou.
- Retirer tous les jours d'une ville retire son hébergement et le transport qui y arrive.
- Hébergements et transports arrivent avec le badge « À réserver ».

## 7. Modèle de données (piste)

- Nouvelle source de voyage : `TripSource = … | 'template'`.
- `StoredTrip.origin?: { templateId: string; authorName?: string; publishedAt: number }`.
- Côté repreneur, en plus : `origin.version` et `origin.base` (le snapshot recalé et filtré
  au moment de la reprise, nécessaire à la fusion de §4.4), `origin.keptDayIds`,
  `origin.startDate`.
- Côté auteur : `StoredTrip.publishedTemplate?: { id: string; ownerToken: string }`. Le jeton
  reste sur l'appareil. Il autorise la mise à jour, le changement de visibilité et le retrait
  sans compte.
- Modèle stocké : `{ id, slug, version, authorName?, indexable, includesPrices,
  includesNotes, itinerary, publishedAt, updatedAt }`. Chaque mise à jour incrémente
  `version` et garde l'ancienne version (nécessaire comme base de fusion pour ceux qui
  l'ont reprise).
- Stockage : réutiliser le bucket R2 de `share-store.ts`, sous un préfixe `templates/`, sans
  expiration. Identifiant non devinable (≥ 10 caractères base32). Le site vitrine lit les
  modèles indexables pour son sitemap ; il faut donc un index listable (fichier d'index R2
  ou petite table), à trancher en conception technique.

## 8. Mesure

- Modèles publiés par semaine.
- Taux de reprise = reprises / ouvertures de `/m/[id]`.
- Part des reprises suivies d'au moins une modification dans les 7 jours.
- Installations de l'app venant d'un lien modèle.
- Trafic organique sur `/itineraires/*` (Search Console) et reprises qui en viennent.
- Part des modèles publiés avec l'indexation désactivée.
- Part des repreneurs qui utilisent « Repartir de la dernière version ».

## 9. Cas limites

- Voyage de démo : non publiable.
- Voyage sans dates : on demande une date de départ quand même, et le jour 1 devient
  cette date.
- Modèle retiré : la page affiche « Ce modèle a été retiré », sans bouton.
- Payload > 2 Mo : même limite que le partage, message explicite.
- Contenu signalé : lien en pied de page, retrait manuel (la page est publique et indexée).
- Notes incluses avec des données sensibles : l'aperçu les surligne, l'auteur reste maître.
- Modèle retiré après une reprise : la ligne « Repartir de la dernière version » disparaît,
  le voyage du repreneur n'est pas touché.

## 10. Décisions

Tranchées le 2 nov. 2026 :

1. Prix payés : **inclus par défaut**, désactivables par l'auteur.
2. Signature : **prénom libre**, facultatif.
3. Notes de journée : **exclues par défaut**, option pour les inclure, avec aperçu d'extraits
   réels.
4. Mise à jour du modèle : **jamais de notification**. Option discrète dans les réglages
   du voyage pour repartir de la dernière version, avec ce qui disparaît et ce qui reste.
5. Référencement : modèles affichés sur tripbrain.fr pour le SEO, **indexés par défaut**,
   désactivable par l'auteur.

Encore ouvertes :

1. Faut-il un seuil minimal pour indexer une page (par exemple ≥ 3 jours et ≥ 10 activités),
   pour éviter des pages trop pauvres dans Google ?
2. Les pages indexées passent-elles par une validation manuelle avant d'entrer dans le
   sitemap, au moins au lancement ?

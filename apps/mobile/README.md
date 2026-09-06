# TripBrain — app mobile

Application iOS et Android construite avec [Expo](https://expo.dev). Elle affiche la webapp [app.tripbrain.fr](https://app.tripbrain.fr) (`apps/web`) dans une WebView plein écran, et lui prête ce que le web ne sait pas faire dans une WebView : feuille de partage du système, exports de fichiers, ouverture directe des liens de partage.

Le roadbook, les documents et les images restent dans l'IndexedDB de la webapp, sur l'appareil : l'app native ne stocke rien d'elle-même.

## Démarrer

```bash
bun install
bunx expo start
```

Le projet suit le **SDK Expo 57**, celui de l'Expo Go publié sur les stores : Expo Go n'existe que pour le dernier SDK sur iOS, un projet en retard d'un SDK ne s'y ouvre plus (« Project is incompatible with this version of Expo Go »). Pour monter de version : `bunx expo install expo@latest --fix && bunx expo-doctor`, puis retirer d'`app.json` les champs que le nouveau SDK a supprimés.

Toutes les dépendances natives sont incluses dans [Expo Go](https://expo.dev/go) : scanner le QR code suffit pour développer. Un [build de développement](https://docs.expo.dev/develop/development-builds/introduction/) n'est nécessaire que pour tester le schéma `tripbrain://` et les liens universels.

Par défaut, la WebView charge `http://localhost:3000` (voir `.env`). Sur un téléphone, `localhost` est remplacé automatiquement par l'adresse de la machine qui sert le bundle Expo (`lib/webapp-url.ts`) : il suffit que `bun run dev` tourne dans `apps/web` sur cette machine, et que le téléphone soit sur le même Wi-Fi. Si le chargement échoue, l'écran d'erreur affiche l'URL tentée et la raison, aussi visibles dans la console Expo (`[WebView] Chargement impossible`).

## URL de la webapp / environnements

La WebView charge `process.env.EXPO_PUBLIC_WEBAPP_URL` (voir `app/index.tsx`), fourni par les [fichiers d'environnement Expo](https://docs.expo.dev/guides/environment-variables/) :

| Environnement | Fichier           | URL                         | Chargé quand                                                                  |
| ------------- | ----------------- | --------------------------- | ----------------------------------------------------------------------------- |
| Dev           | `.env`            | `http://localhost:3000`     | Par défaut, avec `npx expo start`                                             |
| Production    | `.env.production` | `https://app.tripbrain.fr`  | Builds de production (`expo export`, `eas build --profile production`, release) |

Pour développer contre la production sans rebuild : `cp .env.production .env.local && npx expo start` (`.env.local` est ignoré par git et prime sur `.env` ; le supprimer pour revenir). Les builds EAS reçoivent l'URL depuis `eas.json` ; le profil `preview` peut viser une préproduction Vercel en changeant `EXPO_PUBLIC_WEBAPP_URL` dans son bloc `env`.

## Ce que fait la partie native

Tout vit dans `app/` et `lib/` :

- **WebView plein écran**, thème clair/sombre suivi, indicateur de chargement aux couleurs de la webapp.
- **Liens externes** (réservations, Google Maps, `mailto:`) : tout ce qui sort de l'origine de la webapp part vers le système, qui ouvre le navigateur ou l'application dédiée (`lib/webapp-links.ts`).
- **Bouton retour Android** : remonte l'historique de la WebView avant de quitter l'app.
- **Réseau** : hors ligne, la WebView tente quand même le chargement (sur Android, le service worker de la webapp sert le roadbook déjà visité). L'écran d'erreur natif n'apparaît que si le chargement échoue, et le rechargement repart seul au retour du réseau.
- **Liens entrants** : `https://app.tripbrain.fr/s/<code>` et `tripbrain://s/<code>` ouvrent la WebView directement sur le partage, à froid comme à chaud.
- **Splash jusqu'à la première peinture** : le logo reste affiché tant que la webapp n'a pas rendu, pas de page blanche.
- **Cartes** : les liens Google Maps de la webapp ouvrent l'app de navigation installée (Google Maps si présent, sinon Plans sur iOS ; l'app par défaut sur Android) — `lib/maps-links.ts`.
- **« Ouvrir avec TripBrain »** : un fichier `.json` ou `.xlsx` reçu par mail, AirDrop ou depuis Fichiers s'importe d'un tap — `lib/incoming-files.ts`, types déclarés dans `app.json`.
- **Scan de QR code** dans l'app (`app/scan.tsx`, expo-camera) : deux voyageurs se passent un itinéraire face à face.
- **Rappels locaux** (`lib/reminders.ts`, expo-notifications) : départs de transports et check-out, calculés par la webapp, planifiés par le téléphone, sans serveur. Un tap ouvre le roadbook.
- **Calendrier** (`lib/calendar.ts`, expo-calendar) : « Ajouter au calendrier » écrit directement les journées dans le calendrier du téléphone au lieu de produire un `.ics`.
- **Retour haptique** (`lib/haptics.ts`) sur l'appui long, le changement de journée et le passage d'une activité à « fait ».
- **Bridge** : la webapp délègue tout cela au natif (ci-dessous).
- **Détection côté webapp** : global `window.TripBrainNative` injecté avant chargement + suffixe user-agent `TripBrainApp/<version>`. Dans l'app, la webapp n'enregistre pas de service worker et ne suit pas l'installation PWA : la page est déjà « installée ».
- **Mises à jour sans les stores** (expo-updates) : le JavaScript de l'app part par `eas update --channel production --environment production` ; seuls les changements de modules natifs demandent un build.

### Bridge WebView ↔ webapp

Dans une WebView, `<a download>` ne fait rien et `navigator.share` n'existe pas sur Android. La webapp confie donc ces gestes au natif :

```
Webapp (WebView)                          App native (Expo)
────────────────                          ─────────────────
src/lib/native-app.ts détecte l'app       lib/bridge-protocol.ts lit la requête
et envoie la requête via postMessage ───▶ lib/share-file.ts écrit le fichier
  { type: "share/link", payload }          dans le cache puis ouvre la feuille
  { type: "file/share", payload }          de partage du système
                              ◀────────── répond via CustomEvent
                                           "tripbrain:native-response"
```

- Protocole : `lib/bridge-protocol.ts` (côté app) et `apps/web/src/lib/native-app.ts` (côté webapp). **Garder les deux synchronisés.** Requêtes : `share/link`, `file/share`, `haptic/trigger`, `qr/scan`, `notifications/sync`, `calendar/add`, `app/openSettings` ; événement spontané `file/import`.
- Côté webapp, tous les téléchargements passent par `saveFile()` (`apps/web/src/lib/save-file.ts`) : téléchargement dans un navigateur, feuille de partage dans l'app.
- Quand un nouveau type de requête arrive, monter `MIN_NATIVE_APP_VERSION` dans `native-app.ts` : les apps trop anciennes affichent une invitation à mettre à jour au lieu d'échouer en silence.

### Liens universels (App Links / Universal Links)

`app.json` déclare déjà `applinks:app.tripbrain.fr` (iOS) et un intent filter `https://app.tripbrain.fr/*` avec `autoVerify` (Android). Pour que les OS ouvrent l'app au lieu du navigateur, la webapp doit servir deux fichiers, à ajouter dans `apps/web/public/.well-known/` :

1. **iOS — `apple-app-site-association`** (sans extension ; `next.config.mjs` le sert déjà en `application/json`) :

   ```json
   {
     "applinks": {
       "apps": [],
       "details": [{ "appID": "<TEAM_ID>.fr.tripbrain.app", "paths": ["*"] }]
     }
   }
   ```

   `<TEAM_ID>` est l'identifiant d'équipe Apple Developer (voir <https://expo.fyi/apple-team>).

2. **Android — `assetlinks.json`** :

   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "fr.tripbrain.app",
         "sha256_cert_fingerprints": ["<SHA256>"]
       }
     }
   ]
   ```

   `<SHA256>` s'obtient avec `eas credentials -p android` (empreinte de la clé de signature du profil de build).

Le schéma `tripbrain://` fonctionne sans cette configuration, dès qu'un build de développement ou de production est installé.

### Hors ligne

TripBrain est pensé pour être consulté sans réseau. Dans l'app :

- **Android** : le System WebView supporte les service workers, la webapp se comporte comme la PWA installée (roadbook, images et documents disponibles hors ligne).
- **iOS** : WKWebView n'expose pas les service workers aux applications tierces. Les données restent sur l'appareil (IndexedDB), mais le chargement de la page elle-même demande le réseau. L'écran d'erreur le dit et réessaie seul au retour de la connexion. Piste pour lever cette limite : embarquer un export statique de la webapp dans l'app.

## Builds

Trois profils dans `eas.json` :

| Profil        | Usage                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| `development` | Build de développement (expo-dev-client) : nécessaire pour tester le schéma `tripbrain://`, les liens universels, « Ouvrir avec », le scan et les rappels. Le JavaScript vient de `bunx expo start`. |
| `preview`     | Distribution interne (TestFlight, piste interne Play), pointe sur la production.                       |
| `production`  | Stores.                                                                                                |

```bash
bun install -g eas-cli
eas login
eas build --profile development --platform ios   # une fois, puis bunx expo start
eas build --profile preview --platform all
eas update --channel preview --environment preview   # livre le JS sans rebuild
```

Permissions demandées au moment utile, jamais au lancement : appareil photo (scan), notifications (premier voyage daté), calendrier (premier ajout). Les textes sont dans `app.json`.

Le guide complet de publication (TestFlight, Play Console, review) est dans [README-stores-deployment.md](./README-stores-deployment.md).

## Vérifications

```bash
bun run typecheck   # tsc
bun run lint        # expo lint
bun run test        # vitest — fonctions pures de lib/ (liens, protocole bridge)
```

## Ce qui nécessite un nouveau build

| Changement                                                   | Nouveau build nécessaire ?         |
| ------------------------------------------------------------ | ---------------------------------- |
| Nouvelle fonctionnalité dans la webapp                       | ❌ Non — déployer la webapp suffit |
| Nouveau type de requête dans le bridge                       | ✅ Oui                             |
| Changement de l'URL de production                            | ✅ Oui                             |
| Modification du code natif (écran d'erreur, liens entrants…) | ✅ Oui                             |
| Mise à jour de dépendances natives / Expo SDK                | ✅ Oui                             |

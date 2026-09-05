# TripBrain

Compagnon de voyage local-first : roadbook jour par jour, carte, documents, consultation hors ligne. Toutes les données restent sur l'appareil.

## Organisation du dépôt

| Dossier                          | Contenu                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`apps/web`](./apps/web)         | La webapp Next.js 16 (PWA), déployée sur [app.tripbrain.fr](https://app.tripbrain.fr). C'est là que vit toute la logique.  |
| [`apps/mobile`](./apps/mobile)   | L'app iOS / Android (Expo). Une WebView plein écran sur la webapp, plus ce que le web ne sait pas faire dans une WebView : partage natif, exports de fichiers, liens de partage ouverts directement dans l'app. |
| [`docs`](./docs)                 | Notes produit, conformité RGPD de la mesure d'audience.                                                                       |

Les deux applications sont indépendantes : chacune a son `package.json`, son `bun.lock` et ses vérifications. Elles ne partagent que le protocole du bridge, décrit dans [`apps/mobile/README.md`](./apps/mobile/README.md).

## Démarrer

```bash
# Webapp
cd apps/web && bun install && bun run dev

# App mobile (charge la webapp locale, voir apps/mobile/.env)
cd apps/mobile && bun install && bunx expo start
```

## Vérifications

```bash
cd apps/web && bun run test
cd apps/mobile && bun run typecheck && bun run lint && bun run test
```

La CI (`.github/workflows/test.yml`) exécute les deux.

## Déploiement

- **Webapp** : Vercel, avec `apps/web` comme *Root Directory* du projet.
- **Stores** : voir [`apps/mobile/README-stores-deployment.md`](./apps/mobile/README-stores-deployment.md).

'use client'

/**
 * Point d'entrée unique vers PostHog.
 *
 * Trois règles tiennent tout le fichier :
 *
 * 1. Sans clé publique configurée, la mesure n'existe pas — aucun script, aucune
 *    requête. L'application fonctionne exactement pareil.
 * 2. Sans consentement, le SDK n'est pas initialisé du tout : `posthog.init()`
 *    contacte PostHog dès l'appel, un simple opt-out ne suffirait pas.
 * 3. Ce qui part passe par `before_send`, qui applique le catalogue et nettoie
 *    les URL. Voir `sanitize.ts`.
 *
 * Tout ce qui pourrait capter du contenu (autocapture, session replay, clics
 * morts, heatmaps, remontée d'exceptions, sondages) est explicitement coupé :
 * l'écran d'un voyage contient des adresses, des noms d'hôtels et des documents.
 */

import posthog from 'posthog-js'
import {
  analyticsEvents,
  type AnalyticsEventName,
  type TrackArgs,
} from '@/lib/analytics/events'
import {
  createBeforeSend,
  sanitizeEventProperties,
} from '@/lib/analytics/sanitize'
import { hasGrantedConsent, type ConsentStatus } from '@/lib/analytics/consent'

/** Instance PostHog EU par défaut : les données restent dans l'Union. */
const DEFAULT_API_HOST = 'https://eu.i.posthog.com'
const DEFAULT_UI_HOST = 'https://eu.posthog.com'

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_API_HOST

let initialized = false

/**
 * La mesure est-elle prévue sur cet environnement ? Sans clé, tout le reste du
 * module devient une suite de fonctions sans effet.
 */
export function isAnalyticsConfigured(): boolean {
  return Boolean(posthogKey)
}

/**
 * Initialise le SDK, et seulement après un consentement.
 *
 * L'option `opt_out_capturing_by_default` ne suffit pas : `posthog.init()`
 * contacte PostHog dès l'appel pour récupérer sa configuration distante et ses
 * drapeaux, ce qui laisse déjà filer une adresse IP et un référent. Tant que
 * le visiteur n'a pas dit oui, on ne l'appelle donc pas du tout.
 */
export function initAnalytics(): void {
  if (initialized || !posthogKey || typeof window === 'undefined') return
  if (!hasGrantedConsent()) return

  initialized = true

  posthog.init(posthogKey, {
    api_host: posthogHost,
    ui_host: DEFAULT_UI_HOST,

    // — Consentement —
    // Ce point du code n'est atteint qu'avec un accord donné ; le retrait
    // repasse par `applyConsent`, qui coupe l'envoi et efface l'identifiant.
    persistence: 'localStorage',
    respect_dnt: true,

    // — Aucune personne identifiée —
    // TripBrain n'a pas de compte : aucun profil n'est créé, `identify` n'est
    // jamais appelé, et les mesures restent des visites anonymes.
    person_profiles: 'never',

    // — Rien qui capte du contenu —
    autocapture: false,
    rageclick: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true,
    // Aucun drapeau de fonctionnalité n'est utilisé : la requête qui les
    // récupère à chaque chargement n'a pas lieu d'être.
    advanced_disable_flags: true,
    mask_all_text: true,
    mask_all_element_attributes: true,

    // — Ce qui est mesuré —
    // Les pages vues et les Web Vitals suffisent à voir où l'on décroche et ce
    // qui rame ; le détail réseau, lui, transporterait des URL de requêtes.
    capture_pageview: 'history_change',
    capture_pageleave: true,
    capture_performance: { web_vitals: true, network_timing: false },

    // — Nettoyage —
    // Deuxième rideau derrière `before_send` : PostHog masque lui-même les
    // paramètres d'URL sensibles, y compris ceux propres à TripBrain.
    mask_personal_data_properties: true,
    custom_personal_data_properties: [
      'import',
      'code',
      'payload',
      'q',
      'email',
      'token',
      'name',
    ],
    property_denylist: ['$ip'],
    before_send: createBeforeSend(),
  })
}

/**
 * Applique un choix de consentement au SDK déjà chargé.
 *
 * Le refus ne se contente pas de couper l'envoi : il efface aussi l'identifiant
 * anonyme et repasse le stockage en mémoire, pour ne rien laisser derrière.
 */
export function applyConsent(status: ConsentStatus): void {
  if (!posthogKey) return

  if (status === 'granted') {
    // Premier accord de la visite : le SDK n'existe pas encore, et son
    // initialisation démarre déjà en capture.
    if (!initialized) {
      initAnalytics()
      return
    }

    posthog.set_config({ persistence: 'localStorage' })
    // `reset()` avant l'opt-in : dans l'autre ordre, PostHog coupe la capture.
    posthog.reset()
    posthog.opt_in_capturing({ captureEventName: false })
    return
  }

  // Jamais initialisé : il n'y a rien à couper ni à effacer.
  if (!initialized) return

  posthog.opt_out_capturing()
  posthog.reset()
  posthog.set_config({ persistence: 'memory' })
}

/**
 * Envoie un événement du catalogue. Un nom absent du catalogue ou une propriété
 * non déclarée ne passe pas : la signature l'interdit à la compilation, et
 * `sanitizeEventProperties` le retire à l'exécution.
 */
export function trackEvent<N extends AnalyticsEventName>(
  name: N,
  ...args: TrackArgs<N>
): void {
  if (!initialized || !posthogKey) return
  if (!Object.hasOwn(analyticsEvents, name)) return
  if (posthog.has_opted_out_capturing()) return

  const [properties] = args as [Record<string, unknown> | undefined]
  posthog.capture(name, sanitizeEventProperties(name, properties))
}

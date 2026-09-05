/**
 * Logique pure de la proposition d'installation PWA.
 *
 * Le composant React ne fait que brancher les API du navigateur ; toutes les
 * règles (plateforme détectée, cadence de relance, opt-out) vivent ici pour
 * rester testables sans DOM.
 */

/** Navigateur/OS du visiteur, du point de vue « installation ». */
export type InstallPlatform =
  | 'ios-safari'
  | 'ios-browser'
  | 'android'
  | 'desktop'

/** Mémoire locale de ce que l'utilisateur a déjà répondu. */
export interface InstallPromptState {
  /** Nombre de fois où la proposition a été repoussée. */
  dismissCount: number
  /** Timestamp (ms) avant lequel on ne propose plus rien automatiquement. */
  snoozedUntil: number
  /** L'utilisateur a demandé à ne plus jamais voir la proposition. */
  optedOut: boolean
  /** L'app a déjà été installée depuis ce navigateur. */
  installed: boolean
}

export const PWA_PROMPT_STORAGE_KEY = 'tripbrain-pwa-install'

/** Délai avant l'ouverture automatique, une fois l'utilisateur « installé » dans l'app. */
export const AUTO_PROMPT_DELAY_MS = 15_000

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Rappels après chaque report : 3 jours, puis 2 semaines. Au-delà on considère
 * que la réponse est « non » et on ne relance plus jamais tout seul.
 */
export const SNOOZE_DURATIONS_MS = [3 * DAY_MS, 14 * DAY_MS]

export const DEFAULT_PROMPT_STATE: InstallPromptState = {
  dismissCount: 0,
  snoozedUntil: 0,
  optedOut: false,
  installed: false,
}

/**
 * Script injecté très tôt dans le document : `beforeinstallprompt` peut se
 * déclencher avant l'hydratation React, il faut donc le capturer côté HTML puis
 * le relire depuis le provider.
 */
export const INSTALL_EVENT_CAPTURE_SCRIPT = `(function(){window.__tbInstallPrompt=window.__tbInstallPrompt||null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__tbInstallPrompt=e;window.dispatchEvent(new Event('tb:install-available'))});window.addEventListener('appinstalled',function(){window.__tbInstallPrompt=null})})()`

/** Événement d'installation Chromium (absent des lib DOM standard). */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt: () => Promise<void>
}

declare global {
  interface Window {
    __tbInstallPrompt?: BeforeInstallPromptEvent | null
  }
}

/** Navigateurs iOS qui ne savent pas ajouter à l'écran d'accueil (WebViews incluses). */
const IOS_NON_SAFARI_TOKENS = [
  'CriOS', // Chrome
  'FxiOS', // Firefox
  'EdgiOS', // Edge
  'OPiOS', // Opera
  'OPT/', // Opera Touch
  'YaBrowser',
  'DuckDuckGo',
  'FBAN', // Facebook
  'FBAV',
  'Instagram',
  'Line/',
  'MicroMessenger', // WeChat
]

/**
 * Détecte la plateforme. `maxTouchPoints` sert à reconnaître un iPad récent,
 * qui s'annonce comme un Mac dans son user-agent.
 */
export function detectInstallPlatform(
  userAgent: string,
  options: { maxTouchPoints?: number; platform?: string } = {},
): InstallPlatform {
  const ua = userAgent || ''
  const { maxTouchPoints = 0, platform = '' } = options

  const isIpadOs =
    (/Macintosh/i.test(ua) || /^Mac/i.test(platform)) && maxTouchPoints > 1
  const isIos = /iPad|iPhone|iPod/i.test(ua) || isIpadOs

  if (isIos) {
    const isOtherBrowser = IOS_NON_SAFARI_TOKENS.some((token) =>
      ua.includes(token),
    )
    return isOtherBrowser ? 'ios-browser' : 'ios-safari'
  }

  if (/Android/i.test(ua)) return 'android'

  return 'desktop'
}

/** Lit l'état stocké en tolérant un contenu absent, corrompu ou d'une ancienne version. */
export function parsePromptState(raw: string | null): InstallPromptState {
  if (!raw) return { ...DEFAULT_PROMPT_STATE }

  try {
    const parsed = JSON.parse(raw) as Partial<InstallPromptState> | null
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_PROMPT_STATE }
    }

    return {
      dismissCount:
        typeof parsed.dismissCount === 'number' && parsed.dismissCount >= 0
          ? Math.floor(parsed.dismissCount)
          : 0,
      snoozedUntil:
        typeof parsed.snoozedUntil === 'number' && parsed.snoozedUntil > 0
          ? parsed.snoozedUntil
          : 0,
      optedOut: parsed.optedOut === true,
      installed: parsed.installed === true,
    }
  } catch {
    return { ...DEFAULT_PROMPT_STATE }
  }
}

export function serializePromptState(state: InstallPromptState): string {
  return JSON.stringify(state)
}

/**
 * « Plus tard » : on repousse d'un cran. Après le dernier palier, la relance
 * automatique s'arrête définitivement (l'entrée manuelle reste disponible).
 */
export function snoozePromptState(
  state: InstallPromptState,
  now: number,
): InstallPromptState {
  const nextCount = state.dismissCount + 1
  const duration = SNOOZE_DURATIONS_MS[state.dismissCount]

  return {
    ...state,
    dismissCount: nextCount,
    snoozedUntil: duration ? now + duration : 0,
    optedOut: duration === undefined,
  }
}

/** « Ne plus proposer » : aucune relance automatique, quelle que soit la suite. */
export function optOutPromptState(
  state: InstallPromptState,
): InstallPromptState {
  return { ...state, optedOut: true, snoozedUntil: 0 }
}

export function markInstalledState(
  state: InstallPromptState,
): InstallPromptState {
  return { ...state, installed: true, snoozedUntil: 0 }
}

export interface AutoPromptContext {
  state: InstallPromptState
  now: number
  /** Écran mobile (ou téléphone/tablette détecté). */
  isMobile: boolean
  /** L'app tourne déjà en mode installé. */
  isStandalone: boolean
  platform: InstallPlatform
  /** Le prompt natif Chromium a été capturé. */
  hasNativePrompt: boolean
  /** L'utilisateur a un voyage chargé : la proposition a du sens. */
  isEngaged: boolean
}

/**
 * Décide si l'on peut ouvrir la proposition **tout seul**.
 *
 * Volontairement conservateur : mobile uniquement, une fois que l'utilisateur a
 * des données dans l'app, jamais en mode installé, et seulement là où
 * l'installation aboutit vraiment (Safari iOS, ou Chromium qui nous a donné son
 * prompt natif — ce qui exclut au passage les appareils où l'app est déjà là).
 */
export function canAutoPrompt({
  state,
  now,
  isMobile,
  isStandalone,
  platform,
  hasNativePrompt,
  isEngaged,
}: AutoPromptContext): boolean {
  if (isStandalone) return false
  if (!isMobile || !isEngaged) return false
  if (state.installed || state.optedOut) return false
  if (state.snoozedUntil > now) return false

  if (platform === 'ios-safari') return true
  if (platform === 'android') return hasNativePrompt

  // iOS hors Safari et desktop : uniquement à la demande, via le menu.
  return false
}

/** Marche à suivre proposée quand aucun prompt natif n'est disponible. */
export type InstallGuide = 'native' | 'ios-safari' | 'ios-browser' | 'manual'

export function resolveInstallGuide(
  platform: InstallPlatform,
  hasNativePrompt: boolean,
): InstallGuide {
  if (hasNativePrompt) return 'native'
  if (platform === 'ios-safari') return 'ios-safari'
  if (platform === 'ios-browser') return 'ios-browser'
  return 'manual'
}

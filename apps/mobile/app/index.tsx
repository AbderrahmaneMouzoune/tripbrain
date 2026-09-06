import NetInfo from '@react-native-community/netinfo'
import Constants from 'expo-constants'
import * as Linking from 'expo-linking'
import * as Notifications from 'expo-notifications'
import { useRouter } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from 'react-native-webview'
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes'

import {
  buildBridgeResponseScript,
  buildInjectedGlobalsScript,
  parseBridgeRequest,
  type BridgeResponse,
} from '@/lib/bridge-protocol'
import { addCalendarEvents } from '@/lib/calendar'
import { triggerHaptic } from '@/lib/haptics'
import { isIncomingFileUrl, readIncomingFile } from '@/lib/incoming-files'
import { nativeMapsUrls, parseMapsUrl } from '@/lib/maps-links'
import { syncReminders } from '@/lib/reminders'
import { waitForScanResult } from '@/lib/scan-result'
import { shareFile, shareLink } from '@/lib/share-file'
import {
  DEFAULT_WEBAPP_URL,
  isWebappRequest,
  resolveWebappUrl,
} from '@/lib/webapp-links'
import { devWebappUrl } from '@/lib/webapp-url'

const CONFIGURED_WEBAPP_URL =
  process.env.EXPO_PUBLIC_WEBAPP_URL ?? DEFAULT_WEBAPP_URL

// En développement, `localhost` devient l'adresse de la machine qui sert le
// bundle : c'est elle qui fait tourner la webapp (`bun run dev` dans apps/web).
const WEBAPP_URL = __DEV__
  ? devWebappUrl(CONFIGURED_WEBAPP_URL, Constants.expoConfig?.hostUri)
  : CONFIGURED_WEBAPP_URL

const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0'

// Suffixe user-agent permettant à la webapp de détecter l'app native
const USER_AGENT_APP_NAME = `TripBrainApp/${APP_VERSION}`

const INJECTED_GLOBALS_SCRIPT = buildInjectedGlobalsScript({
  platform: Platform.OS,
  appVersion: APP_VERSION,
})

// Si la webapp ne répond jamais, le splash ne doit pas rester à l'écran.
const SPLASH_TIMEOUT_MS = 8000

// Couleurs de fond de la webapp (globals.css), pour que l'écran de
// chargement et les erreurs ne tranchent pas avec la page.
const THEME = {
  light: { background: '#f3f7fd', text: '#101a33', muted: '#4b5675' },
  dark: { background: '#0d172b', text: '#f4f4f0', muted: '#a3abbf' },
} as const
const PRIMARY = '#2268c7'

/**
 * Ouvre une intention cartographique dans l'app de navigation installée :
 * Google Maps si présent, sinon Plans (iOS) ou l'app par défaut (Android).
 */
async function openInMapsApp(url: string): Promise<void> {
  const intent = parseMapsUrl(url)
  if (intent) {
    for (const candidate of nativeMapsUrls(intent, Platform.OS)) {
      try {
        // Sur iOS, sonder un schéma tiers demande sa déclaration dans
        // LSApplicationQueriesSchemes (voir app.json) ; sur Android, tenter
        // l'ouverture est plus fiable que `canOpenURL`.
        if (Platform.OS === 'ios' && candidate.startsWith('comgooglemaps:')) {
          if (!(await Linking.canOpenURL(candidate))) continue
        }
        await Linking.openURL(candidate)
        return
      } catch {
        // Pas d'app pour ce schéma : on essaie le suivant.
      }
    }
  }
  await Linking.openURL(url).catch(() => {})
}

export default function Index() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light'
  const colors = THEME[scheme]
  const router = useRouter()

  const [isOffline, setIsOffline] = useState(false)
  const [hasLoadError, setHasLoadError] = useState(false)
  // Ce que le moteur a dit de l'échec, pour l'écran d'erreur et la console
  const [loadErrorDetail, setLoadErrorDetail] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // URL de démarrage quand l'app est ouverte par un lien (cold start)
  const [initialUrl, setInitialUrl] = useState<string | null>(null)

  const webViewRef = useRef<WebView>(null)
  const isWebViewLoadedRef = useRef(false)
  const canGoBackRef = useRef(false)
  const hasLoadErrorRef = useRef(false)
  const splashHiddenRef = useRef(false)
  // Messages pour la webapp arrivés avant qu'elle soit prête (fichier ouvert
  // avec TripBrain pendant le démarrage, par exemple).
  const pendingScriptsRef = useRef<string[]>([])
  // Dernière URL entrante traitée : le hook la renvoie à chaque rendu.
  const handledIncomingUrlRef = useRef<string | null>(null)

  const hideSplash = useCallback(() => {
    if (splashHiddenRef.current) return
    splashHiddenRef.current = true
    void SplashScreen.hideAsync().catch(() => {})
  }, [])

  useEffect(() => {
    const timer = setTimeout(hideSplash, SPLASH_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [hideSplash])

  const reload = useCallback(() => {
    hasLoadErrorRef.current = false
    setHasLoadError(false)
    isWebViewLoadedRef.current = false
    setReloadKey((key) => key + 1)
  }, [])

  /** Injecte un script dans la page, ou le garde pour son prochain chargement. */
  const sendToWebapp = useCallback((script: string) => {
    if (isWebViewLoadedRef.current && webViewRef.current) {
      webViewRef.current.injectJavaScript(script)
    } else {
      pendingScriptsRef.current.push(script)
    }
  }, [])

  const respond = useCallback(
    (response: BridgeResponse) => {
      sendToWebapp(buildBridgeResponseScript(response))
    },
    [sendToWebapp],
  )

  const navigateTo = useCallback((targetUrl: string) => {
    if (isWebViewLoadedRef.current) {
      webViewRef.current?.injectJavaScript(
        `window.location.href = ${JSON.stringify(targetUrl)}; true;`,
      )
    } else {
      setInitialUrl(targetUrl)
    }
  }, [])

  // ─── Réseau : l'écran d'erreur ne s'affiche que si le chargement échoue ────
  //
  // Hors ligne, la WebView tente quand même : sur Android, le service worker
  // de la webapp sert le roadbook déjà visité. Dès que la connexion revient,
  // un échec précédent est retenté sans rien demander.

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      const offline =
        state.isConnected === false || state.isInternetReachable === false
      setIsOffline(offline)
      if (!offline && hasLoadErrorRef.current) reload()
    })
  }, [reload])

  // ─── Liens et fichiers entrants ────────────────────────────────────────────
  //
  // Un lien de partage (universel ou `tripbrain://`) ouvre la WebView dessus.
  // Un fichier ouvert « avec TripBrain » est lu puis remis à la webapp, qui
  // l'importe comme un fichier choisi à la main.

  const incomingUrl = Linking.useLinkingURL()

  useEffect(() => {
    if (!incomingUrl || handledIncomingUrlRef.current === incomingUrl) return
    handledIncomingUrlRef.current = incomingUrl

    if (isIncomingFileUrl(incomingUrl)) {
      void readIncomingFile(incomingUrl).then((file) => {
        if (file) respond({ type: 'file/import', payload: file })
      })
      return
    }

    const targetUrl = resolveWebappUrl(incomingUrl, WEBAPP_URL)
    if (targetUrl) navigateTo(targetUrl)
  }, [incomingUrl, navigateTo, respond])

  // ─── Tap sur un rappel → la webapp s'ouvre sur le roadbook ─────────────────

  const lastNotificationResponse = Notifications.useLastNotificationResponse()

  useEffect(() => {
    const data = lastNotificationResponse?.notification.request.content.data
    const path = typeof data?.path === 'string' ? data.path : null
    if (!path || !path.startsWith('/')) return
    navigateTo(new URL(path, WEBAPP_URL).toString())
  }, [lastNotificationResponse, navigateTo])

  // ─── Bouton retour Android : remonte l'historique de la WebView ────────────

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!canGoBackRef.current) return false
        webViewRef.current?.goBack()
        return true
      },
    )
    return () => subscription.remove()
  }, [])

  // ─── Liens externes : réservations, cartes, mails partent vers le système ──

  const handleShouldStartLoad = useCallback(
    (request: ShouldStartLoadRequest) => {
      if (isWebappRequest(request.url, WEBAPP_URL)) return true
      // Rien à exécuter hors de la page.
      if (request.url.startsWith('javascript:')) return false
      void openInMapsApp(request.url)
      return false
    },
    [],
  )

  // ─── Bridge : la webapp délègue au natif ce que le web ne sait pas faire ───

  const handleWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const request = parseBridgeRequest(event.nativeEvent.data)
      if (!request) return
      const { id } = request

      switch (request.type) {
        case 'share/link':
          void shareLink(request.payload).then((outcome) =>
            respond({ id, type: 'share/result', payload: { outcome } }),
          )
          break
        case 'file/share':
          void shareFile(request.payload).then((outcome) =>
            respond({ id, type: 'share/result', payload: { outcome } }),
          )
          break
        case 'haptic/trigger':
          void triggerHaptic(request.payload.kind)
          break
        case 'qr/scan':
          waitForScanResult((value) => {
            // Un QR code TripBrain est un lien : la WebView s'ouvre dessus.
            const targetUrl = value && resolveWebappUrl(value, WEBAPP_URL)
            if (targetUrl) navigateTo(targetUrl)
            respond({ id, type: 'qr/result', payload: { value } })
          })
          router.push('/scan')
          break
        case 'notifications/sync':
          void syncReminders(request.payload.reminders).then((state) =>
            respond({ id, type: 'notifications/state', payload: state }),
          )
          break
        case 'calendar/add':
          void addCalendarEvents(request.payload.events).then((result) =>
            respond({ id, type: 'calendar/result', payload: result }),
          )
          break
        case 'app/openSettings':
          void Linking.openSettings().catch(() => {})
          break
      }
    },
    [navigateTo, respond, router],
  )

  const handleNavigationStateChange = useCallback(
    (state: WebViewNavigation) => {
      canGoBackRef.current = state.canGoBack
    },
    [],
  )

  const handleLoadEnd = useCallback(() => {
    isWebViewLoadedRef.current = true
    hideSplash()
    const pending = pendingScriptsRef.current
    pendingScriptsRef.current = []
    for (const script of pending) webViewRef.current?.injectJavaScript(script)
  }, [hideSplash])

  const handleLoadError = useCallback(
    (url: string, description: string) => {
      console.warn(`[WebView] Chargement impossible : ${url} — ${description}`)
      hasLoadErrorRef.current = true
      setLoadErrorDetail(`${url}\n${description}`)
      setHasLoadError(true)
      hideSplash()
    },
    [hideSplash],
  )

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={[]}
    >
      {hasLoadError ? (
        <View style={styles.errorContainer} accessibilityRole="alert">
          <Text
            style={[styles.errorTitle, { color: colors.text }]}
            accessibilityRole="header"
          >
            {isOffline
              ? 'Pas de connexion Internet'
              : 'Impossible de charger TripBrain'}
          </Text>
          <Text style={[styles.errorMessage, { color: colors.muted }]}>
            {isOffline
              ? 'Vérifiez votre connexion Wi-Fi ou mobile. L’application reprendra toute seule dès que le réseau reviendra.'
              : 'Une erreur est survenue pendant le chargement. Vérifiez votre connexion, puis réessayez.'}
          </Text>
          <Pressable
            style={styles.retryButton}
            onPress={reload}
            accessibilityRole="button"
          >
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </Pressable>
          <Text style={[styles.errorHint, { color: colors.muted }]}>
            Vos voyages et documents restent enregistrés sur cet appareil.
          </Text>
          {__DEV__ && loadErrorDetail ? (
            <Text
              style={[styles.errorDetail, { color: colors.muted }]}
              selectable
            >
              {loadErrorDetail}
              {'\n'}La webapp tourne-t-elle ? `bun run dev` dans apps/web, sur
              le même réseau Wi-Fi que ce téléphone.
            </Text>
          ) : null}
        </View>
      ) : (
        <WebView
          key={reloadKey}
          ref={webViewRef}
          source={{ uri: initialUrl ?? WEBAPP_URL }}
          style={[styles.webview, { backgroundColor: colors.background }]}
          startInLoadingState
          applicationNameForUserAgent={USER_AGENT_APP_NAME}
          injectedJavaScriptBeforeContentLoaded={INJECTED_GLOBALS_SCRIPT}
          onMessage={handleWebViewMessage}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          onNavigationStateChange={handleNavigationStateChange}
          // Les liens `_blank` restent dans la WebView, puis passent par
          // onShouldStartLoadWithRequest qui les envoie au système.
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          allowsLinkPreview={false}
          pullToRefreshEnabled={false}
          renderLoading={() => (
            <View
              style={[styles.loading, { backgroundColor: colors.background }]}
            >
              <ActivityIndicator size="large" color={PRIMARY} />
            </View>
          )}
          onLoadEnd={handleLoadEnd}
          onError={({ nativeEvent }) =>
            handleLoadError(nativeEvent.url, nativeEvent.description)
          }
          // Une 404 est une page de la webapp (code de partage expiré, par
          // exemple) : seule une panne serveur justifie l'écran natif.
          onHttpError={({ nativeEvent }) => {
            if (nativeEvent.statusCode >= 500) {
              handleLoadError(nativeEvent.url, `HTTP ${nativeEvent.statusCode}`)
            }
          }}
          // iOS : le téléchargement direct d'une réponse non affichable
          // (sans passer par le bridge) est confié au système.
          onFileDownload={({ nativeEvent }) => {
            void Linking.openURL(nativeEvent.downloadUrl).catch(() => {})
          }}
          // Le système peut tuer le processus de rendu en arrière-plan ; sans
          // rechargement, l'app reviendrait sur un écran blanc.
          onContentProcessDidTerminate={reload}
          onRenderProcessGone={reload}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 15,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 8,
    backgroundColor: PRIMARY,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorHint: {
    marginTop: 16,
    fontSize: 13,
    textAlign: 'center',
  },
  errorDetail: {
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
})

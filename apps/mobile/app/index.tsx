import NetInfo from '@react-native-community/netinfo'
import Constants from 'expo-constants'
import * as Linking from 'expo-linking'
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
  type ShareOutcome,
} from '@/lib/bridge-protocol'
import { shareFile, shareLink } from '@/lib/share-file'
import { devWebappUrl } from '@/lib/webapp-url'
import {
  DEFAULT_WEBAPP_URL,
  isWebappRequest,
  resolveWebappUrl,
} from '@/lib/webapp-links'

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

// Couleurs de fond de la webapp (globals.css), pour que l'écran de
// chargement et les erreurs ne tranchent pas avec la page.
const THEME = {
  light: { background: '#f3f7fd', text: '#101a33', muted: '#4b5675' },
  dark: { background: '#0d172b', text: '#f4f4f0', muted: '#a3abbf' },
} as const
const PRIMARY = '#2268c7'

export default function Index() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light'
  const colors = THEME[scheme]

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

  const reload = useCallback(() => {
    hasLoadErrorRef.current = false
    setHasLoadError(false)
    isWebViewLoadedRef.current = false
    setReloadKey((key) => key + 1)
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

  // ─── Liens entrants : partage universel ou schéma tripbrain:// ─────────────

  const incomingUrl = Linking.useURL()

  useEffect(() => {
    const targetUrl = resolveWebappUrl(incomingUrl, WEBAPP_URL)
    if (!targetUrl) return

    if (isWebViewLoadedRef.current) {
      webViewRef.current?.injectJavaScript(
        `window.location.href = ${JSON.stringify(targetUrl)}; true;`,
      )
    } else {
      setInitialUrl(targetUrl)
    }
  }, [incomingUrl])

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
      void Linking.openURL(request.url).catch(() => {})
      return false
    },
    [],
  )

  // ─── Bridge : la webapp délègue partages et exports au natif ───────────────

  const handleWebViewMessage = useCallback((event: WebViewMessageEvent) => {
    const request = parseBridgeRequest(event.nativeEvent.data)
    if (!request) return

    const respond = (outcome: ShareOutcome) => {
      webViewRef.current?.injectJavaScript(
        buildBridgeResponseScript({
          id: request.id,
          type: 'share/result',
          payload: { outcome },
        }),
      )
    }

    switch (request.type) {
      case 'share/link':
        void shareLink(request.payload).then(respond)
        break
      case 'file/share':
        void shareFile(request.payload).then(respond)
        break
    }
  }, [])

  const handleNavigationStateChange = useCallback(
    (state: WebViewNavigation) => {
      canGoBackRef.current = state.canGoBack
    },
    [],
  )

  const handleLoadError = useCallback((url: string, description: string) => {
    console.warn(`[WebView] Chargement impossible : ${url} — ${description}`)
    hasLoadErrorRef.current = true
    setLoadErrorDetail(`${url}\n${description}`)
    setHasLoadError(true)
  }, [])

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={[]}
    >
      {hasLoadError ? (
        <View style={styles.errorContainer}>
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            {isOffline
              ? 'Pas de connexion Internet'
              : 'Impossible de charger TripBrain'}
          </Text>
          <Text style={[styles.errorMessage, { color: colors.muted }]}>
            {isOffline
              ? 'Vérifiez votre connexion Wi-Fi ou mobile. L’application reprendra toute seule dès que le réseau reviendra.'
              : 'Une erreur est survenue pendant le chargement. Vérifiez votre connexion, puis réessayez.'}
          </Text>
          <Pressable style={styles.retryButton} onPress={reload}>
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
          onLoadEnd={() => {
            isWebViewLoadedRef.current = true
          }}
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

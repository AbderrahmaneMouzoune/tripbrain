import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import 'react-native-reanimated'

import { ensureAndroidChannel } from '@/lib/reminders'
import { purgeSharedFiles } from '@/lib/share-file'

// Le splash reste affiché jusqu'à la première peinture de la webapp
// (app/index.tsx le retire) : pas de page blanche entre le logo et le roadbook.
void SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  useEffect(() => {
    // Crée le canal Android au démarrage pour que les rappels planifiés
    // avant toute interaction s'affichent correctement.
    void ensureAndroidChannel()
    // Les exports remis à la feuille de partage n'ont plus d'utilité.
    purgeSharedFiles()
  }, [])

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen
          name="scan"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
      <StatusBar style="auto" />
    </>
  )
}

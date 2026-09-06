import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { deliverScanResult } from '@/lib/scan-result'

const PRIMARY = '#2268c7'

/**
 * Scanne un QR code TripBrain sans quitter l'app : deux voyageurs se passent
 * un itinéraire face à face. Le résultat est remis à l'écran principal, qui
 * le traite au nom de la webapp.
 */
export default function Scan() {
  const router = useRouter()
  const [permission, requestPermission] = useCameraPermissions()
  const handledRef = useRef(false)

  const finish = useCallback(
    (value: string | null) => {
      if (handledRef.current) return
      handledRef.current = true
      deliverScanResult(value)
      router.back()
    },
    [router],
  )

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission()
    }
  }, [permission, requestPermission])

  // Fermé d'un geste sans rien scanner : la webapp n'attend pas pour rien.
  useEffect(() => {
    return () => {
      if (!handledRef.current) {
        handledRef.current = true
        deliverScanResult(null)
      }
    }
  }, [])

  if (!permission) {
    return <View style={styles.container} />
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.title}>Accès à l’appareil photo</Text>
          <Text style={styles.message}>
            TripBrain a besoin de l’appareil photo pour lire le QR code affiché
            sur l’autre appareil. Rien n’est enregistré.
          </Text>
          {permission.canAskAgain ? (
            <Pressable
              style={styles.button}
              onPress={() => void requestPermission()}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Autoriser</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.button}
              onPress={() => void Linking.openSettings()}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Ouvrir les réglages</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.linkButton}
            onPress={() => finish(null)}
            accessibilityRole="button"
          >
            <Text style={styles.linkText}>Annuler</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => finish(data)}
      />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <Text style={styles.overlayTitle} accessibilityRole="header">
          Scanner un QR code TripBrain
        </Text>
        <View style={styles.frame} accessible={false} />
        <Text style={styles.overlayHint}>
          Visez le QR code affiché par « Partager ce voyage » sur l’autre
          appareil.
        </Text>
        <Pressable
          style={styles.cancel}
          onPress={() => finish(null)}
          accessibilityRole="button"
        >
          <Text style={styles.cancelText}>Annuler</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  message: {
    color: '#c8d0e0',
    fontSize: 15,
    textAlign: 'center',
  },
  button: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 8,
    backgroundColor: PRIMARY,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    paddingVertical: 10,
  },
  linkText: {
    color: '#c8d0e0',
    fontSize: 15,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  overlayTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  frame: {
    width: 240,
    height: 240,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  overlayHint: {
    color: '#e6ebf5',
    fontSize: 14,
    textAlign: 'center',
  },
  cancel: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  cancelText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
})

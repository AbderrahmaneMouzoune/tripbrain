'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Share2,
  Copy,
  Check,
  QrCode,
  Link as LinkIcon,
  Download,
  CalendarDays,
  CalendarPlus,
} from 'lucide-react'
import type { DayItinerary } from '@/lib/itinerary-data'
import { downloadICS, getGoogleCalendarUrl } from '@/lib/calendar-export'

interface ShareDialogProps {
  itinerary: DayItinerary[]
  selectedDay?: number
  trigger?: React.ReactNode
}

export function ShareDialog({ itinerary, selectedDay, trigger }: ShareDialogProps) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)

  const getShareUrl = () => {
    if (typeof window === 'undefined') return ''
    const url = new URL(window.location.href)
    if (selectedDay !== undefined) {
      url.searchParams.set('day', String(selectedDay + 1))
    }
    return url.toString()
  }

  const shareUrl = getShareUrl()

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleNativeShare = async () => {
    const day = selectedDay !== undefined ? itinerary[selectedDay] : null
    const shareData = {
      title: 'Mon voyage en Ouzbekistan 2026',
      text: day
        ? `Jour ${day.dayNumber}: ${day.title} - ${day.city}`
        : 'Decouvrez mon itineraire de voyage en Ouzbekistan',
      url: shareUrl,
    }

    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch {
        // User cancelled
      }
    }
  }

  const handleDownloadQR = () => {
    const svg = document.getElementById('qr-code')
    if (!svg) return

    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      ctx?.drawImage(img, 0, 0)
      const pngFile = canvas.toDataURL('image/png')

      const downloadLink = document.createElement('a')
      downloadLink.download = 'uzbekistan-trip-qr.png'
      downloadLink.href = pngFile
      downloadLink.click()
    }

    img.crossOrigin = 'anonymous'
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon">
            <Share2 className="h-5 w-5" />
            <span className="sr-only">Partager</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Partager l&apos;itineraire</DialogTitle>
          <DialogDescription>
            Partagez votre voyage avec vos proches
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="link" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="link" className="gap-2">
              <LinkIcon className="h-4 w-4" />
              Lien
            </TabsTrigger>
            <TabsTrigger value="qr" className="gap-2">
              <QrCode className="h-4 w-4" />
              QR Code
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-2">
              <CalendarDays className="h-4 w-4" />
              Calendrier
            </TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
              <Input value={shareUrl} readOnly className="flex-1 text-sm" />
              <Button size="icon" variant="outline" onClick={handleCopy}>
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>

            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <Button onClick={handleNativeShare} className="w-full gap-2">
                <Share2 className="h-4 w-4" />
                Partager via...
              </Button>
            )}
          </TabsContent>

          <TabsContent value="qr" className="mt-4 space-y-4">
            <div className="flex flex-col items-center gap-4">
              <div className="bg-card rounded-lg border p-4">
                <QRCodeSVG
                  id="qr-code"
                  value={shareUrl}
                  size={200}
                  level="M"
                  includeMargin
                  bgColor="transparent"
                  fgColor="currentColor"
                  className="text-foreground"
                />
              </div>
              <p className="text-muted-foreground text-center text-sm">
                Scannez ce QR code pour acceder a l&apos;itineraire
              </p>
              <Button
                variant="outline"
                onClick={handleDownloadQR}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Telecharger le QR code
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="calendar" className="mt-4 space-y-4">
            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground text-sm">
                Exportez votre voyage vers votre application de calendrier
                préférée (Google Calendar, Apple Calendar, Outlook…)
              </p>

              <Button
                onClick={() =>
                  downloadICS(itinerary, 'ouzbekistan-2026-voyage.ics')
                }
                className="w-full gap-2"
              >
                <Download className="h-4 w-4" />
                Télécharger tout le voyage (.ics)
              </Button>

              {selectedDay !== undefined && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const day = itinerary[selectedDay]
                      downloadICS(
                        [day],
                        `ouzbekistan-2026-jour-${day.dayNumber}.ics`,
                      )
                    }}
                    className="w-full gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Télécharger ce jour (.ics)
                  </Button>

                  <a
                    href={getGoogleCalendarUrl(itinerary[selectedDay])}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full"
                  >
                    <Button variant="outline" className="w-full gap-2">
                      <CalendarPlus className="h-4 w-4" />
                      Ajouter ce jour à Google Calendar
                    </Button>
                  </a>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

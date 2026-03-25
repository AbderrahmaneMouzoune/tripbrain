import type { TripData } from '@/hooks/use-trip-data'
import type { Activity, DayItinerary } from '@/lib/itinerary-data'

// ---------------------------------------------------------------------------
// CSV column order (must match EXAMPLE_CSV_HEADER below)
// ---------------------------------------------------------------------------
const COLUMNS = [
  'tripStartDate',
  'tripEndDate',
  'date',
  'dayNumber',
  'city',
  'title',
  'latitude',
  'longitude',
  'dayType',
  'walkingDistance',
  'notes',
  'highlights',
  'tips',
  'foodRecommendations',
  'packingTips',
  'activities',
  'accommodationName',
  'accommodationAddress',
  'accommodationBookingUrl',
  'accommodationCheckIn',
  'accommodationCheckOut',
  'transportType',
  'transportFrom',
  'transportTo',
  'transportDetails',
] as const

// ---------------------------------------------------------------------------
// Low-level CSV tokeniser (handles double-quoted fields with commas/newlines)
// ---------------------------------------------------------------------------

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped double-quote inside a quoted field
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }

  fields.push(current)
  return fields
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  const headerLine = lines[0]
  if (!headerLine) throw new Error('Le fichier CSV est vide.')

  const headers = parseCSVLine(headerLine).map((h) => h.trim())

  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = parseCSVLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? '').trim()
    })
    rows.push(row)
  }

  return rows
}

// ---------------------------------------------------------------------------
// Multi-value helpers
// ---------------------------------------------------------------------------

function splitPipe(value: string): string[] {
  if (!value) return []
  return value
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseActivities(value: string): Activity[] {
  if (!value) return []
  return value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, type, duration] = part.split('|').map((s) => s.trim())
      const validTypes: Activity['type'][] = [
        'visit',
        'transport',
        'food',
        'experience',
        'shopping',
      ]
      return {
        name: name ?? '',
        type: (validTypes.includes(type as Activity['type'])
          ? type
          : 'visit') as Activity['type'],
        ...(duration ? { duration } : {}),
      }
    })
    .filter((a) => a.name)
}

// ---------------------------------------------------------------------------
// Main parser: CSV text → TripData
// ---------------------------------------------------------------------------

export function parseCSVToTripData(text: string): TripData {
  const rows = parseCSV(text)

  if (rows.length === 0) throw new Error('Le fichier CSV ne contient aucune ligne de données.')

  // Validate required columns
  const missingCols = (['date', 'dayNumber', 'city', 'title', 'latitude', 'longitude'] as const).filter(
    (col) => !Object.prototype.hasOwnProperty.call(rows[0], col),
  )
  if (missingCols.length > 0) {
    throw new Error(
      `Colonnes manquantes dans le CSV : ${missingCols.join(', ')}. Vérifiez que votre fichier utilise le bon format TripBrain.`,
    )
  }

  // tripStartDate / tripEndDate are read from the first row only
  const firstRow = rows[0]
  const tripStartDate = firstRow['tripStartDate'] || ''
  const tripEndDate = firstRow['tripEndDate'] || ''

  if (!tripStartDate || !tripEndDate) {
    throw new Error(
      'Les colonnes tripStartDate et tripEndDate sont requises sur la première ligne du CSV.',
    )
  }

  const itinerary: DayItinerary[] = rows.map((row) => {
    const lat = parseFloat(row['latitude'] ?? '')
    const lng = parseFloat(row['longitude'] ?? '')

    if (isNaN(lat) || isNaN(lng)) {
      throw new Error(
        `Ligne ${row['dayNumber'] || '?'} : les colonnes latitude et longitude doivent être des nombres valides.`,
      )
    }

    const day: DayItinerary = {
      date: row['date'] ?? '',
      dayNumber: parseInt(row['dayNumber'] ?? '0', 10),
      city: row['city'] ?? '',
      title: row['title'] ?? '',
      coordinates: [lat, lng],
      activities: parseActivities(row['activities'] ?? ''),
    }

    // Optional scalar fields
    if (row['dayType']) day.dayType = row['dayType']
    if (row['walkingDistance']) day.walkingDistance = row['walkingDistance']
    if (row['notes']) day.notes = row['notes']

    // Optional array fields
    const highlights = splitPipe(row['highlights'] ?? '')
    if (highlights.length) day.highlights = highlights

    const tips = splitPipe(row['tips'] ?? '')
    if (tips.length) day.tips = tips

    const foodRecs = splitPipe(row['foodRecommendations'] ?? '')
    if (foodRecs.length) day.foodRecommendations = foodRecs

    const packingTips = splitPipe(row['packingTips'] ?? '')
    if (packingTips.length) day.packingTips = packingTips

    // Accommodation
    const accName = row['accommodationName'] ?? ''
    if (accName) {
      day.accommodation = {
        name: accName,
        address: row['accommodationAddress'] ?? '',
        bookingUrl: row['accommodationBookingUrl'] ?? '',
        checkIn: row['accommodationCheckIn'] ?? '',
        checkOut: row['accommodationCheckOut'] ?? '',
      }
    }

    // Transport
    const transportType = row['transportType'] ?? ''
    const validTransportTypes = ['train', 'car', 'plane', 'bus'] as const
    if (validTransportTypes.includes(transportType as (typeof validTransportTypes)[number])) {
      day.transport = {
        type: transportType as (typeof validTransportTypes)[number],
        ...(row['transportFrom'] ? { from: row['transportFrom'] } : {}),
        ...(row['transportTo'] ? { to: row['transportTo'] } : {}),
        ...(row['transportDetails'] ? { details: row['transportDetails'] } : {}),
      }
    }

    return day
  })

  return { itinerary, tripStartDate, tripEndDate }
}

// ---------------------------------------------------------------------------
// Example CSV content (used for download and documentation)
// ---------------------------------------------------------------------------

export const CSV_COLUMNS_HEADER = COLUMNS.join(',')

export const EXAMPLE_CSV = `tripStartDate,tripEndDate,date,dayNumber,city,title,latitude,longitude,dayType,walkingDistance,notes,highlights,tips,foodRecommendations,packingTips,activities,accommodationName,accommodationAddress,accommodationBookingUrl,accommodationCheckIn,accommodationCheckOut,transportType,transportFrom,transportTo,transportDetails
2026-06-01,2026-06-05,2026-06-01,1,Paris,Arrivée à Paris,48.8566,2.3522,arrival,4 km,Première journée tranquille pour s'installer.,Tour Eiffel|Montmartre,Prendre le RER B depuis CDG|Valider son pass Navigo,Croissants chez Paul|Steak frites brasserie,Prévoir un adaptateur électrique,Tour Eiffel|visit|2h;Dîner au quartier latin|food|1h30,Hôtel des Arts,12 rue de la Paix Paris,https://booking.com/hotel-des-arts,15:00,11:00,plane,Lyon,Paris,Vol AF1234 - arrivée 14h00
2026-06-01,2026-06-05,2026-06-02,2,Paris,Musées et Marais,48.8566,2.3522,,8 km,Longue journée de visite.,Musée du Louvre|Le Marais,Réserver le Louvre en ligne|Y aller tôt le matin,Falafel L'As du Fallafel|Café de Flore,Chaussures confortables,Louvre|visit|3h;Balade dans le Marais|visit|2h;L'As du Fallafel|food|45min,Hôtel des Arts,12 rue de la Paix Paris,https://booking.com/hotel-des-arts,,,,,
2026-06-01,2026-06-05,2026-06-03,3,Versailles,Château de Versailles,48.8049,2.1204,,6 km,Excursion d'une journée en dehors de Paris.,Château de Versailles|Jardins à la française,Prendre le RER C tôt|Apporter un pique-nique,Boulangerie locale|Café du château,Chapeau pour le soleil,Château de Versailles|visit|4h;Jardins|visit|2h,,,,,,train,Paris,Versailles,RER C direction Versailles-Château-RG
2026-06-01,2026-06-05,2026-06-04,4,Paris,Shopping et Opéra,48.8718,2.3318,,5 km,,Galeries Lafayette|Opéra Garnier,Vérifier les horaires de l'Opéra,Ladurée macarons|Un grand café,,"Galeries Lafayette|shopping|2h;Opéra Garnier|visit|1h30",Hôtel des Arts,12 rue de la Paix Paris,https://booking.com/hotel-des-arts,,,,,
2026-06-01,2026-06-05,2026-06-05,5,Paris,Départ,48.8566,2.3522,departure,2 km,Dernières emplettes et départ.,Dernier café parisien,Prévoir 3h avant le vol,Café croissant aéroport,,Transfert aéroport|transport|1h30,Hôtel des Arts,12 rue de la Paix Paris,https://booking.com/hotel-des-arts,,11:00,plane,Paris,Lyon,Vol AF1235 - départ 16h00`

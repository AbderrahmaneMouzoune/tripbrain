import { describe, it, expect } from 'vitest'
import { parseCSVToTripData, EXAMPLE_CSV } from '../csv-parser'

// ---------------------------------------------------------------------------
// parseCSVToTripData
// ---------------------------------------------------------------------------

const MINIMAL_CSV = `tripStartDate,tripEndDate,date,dayNumber,city,title,latitude,longitude,dayType,walkingDistance,notes,highlights,tips,foodRecommendations,packingTips,activities,accommodationName,accommodationAddress,accommodationBookingUrl,accommodationCheckIn,accommodationCheckOut,transportType,transportFrom,transportTo,transportDetails
2026-06-01,2026-06-05,2026-06-01,1,Paris,Arrivée à Paris,48.8566,2.3522,arrival,4 km,Journée calme.,Tour Eiffel|Montmartre,Prendre le RER B,,Adaptateur,Tour Eiffel|visit|2h;Déjeuner|food|1h,Hôtel des Arts,12 rue de la Paix,https://booking.com/hotel,15:00,11:00,plane,Lyon,Paris,Vol AF1234`

describe('parseCSVToTripData', () => {
  it('parses a minimal valid CSV', () => {
    const result = parseCSVToTripData(MINIMAL_CSV)
    expect(result.tripStartDate).toBe('2026-06-01')
    expect(result.tripEndDate).toBe('2026-06-05')
    expect(result.itinerary).toHaveLength(1)
  })

  it('parses scalar day fields correctly', () => {
    const [day] = parseCSVToTripData(MINIMAL_CSV).itinerary
    expect(day.date).toBe('2026-06-01')
    expect(day.dayNumber).toBe(1)
    expect(day.city).toBe('Paris')
    expect(day.title).toBe('Arrivée à Paris')
    expect(day.dayType).toBe('arrival')
    expect(day.walkingDistance).toBe('4 km')
    expect(day.notes).toBe('Journée calme.')
  })

  it('parses coordinates as a [lat, lng] tuple', () => {
    const [day] = parseCSVToTripData(MINIMAL_CSV).itinerary
    expect(day.coordinates).toEqual([48.8566, 2.3522])
  })

  it('parses pipe-separated multi-value fields', () => {
    const [day] = parseCSVToTripData(MINIMAL_CSV).itinerary
    expect(day.highlights).toEqual(['Tour Eiffel', 'Montmartre'])
    expect(day.tips).toEqual(['Prendre le RER B'])
    expect(day.packingTips).toEqual(['Adaptateur'])
    expect(day.foodRecommendations).toBeUndefined()
  })

  it('parses activities in name|type|duration format', () => {
    const [day] = parseCSVToTripData(MINIMAL_CSV).itinerary
    expect(day.activities).toHaveLength(2)
    expect(day.activities[0]).toMatchObject({ name: 'Tour Eiffel', type: 'visit', duration: '2h' })
    expect(day.activities[1]).toMatchObject({ name: 'Déjeuner', type: 'food', duration: '1h' })
  })

  it('parses accommodation fields', () => {
    const [day] = parseCSVToTripData(MINIMAL_CSV).itinerary
    expect(day.accommodation).toMatchObject({
      name: 'Hôtel des Arts',
      address: '12 rue de la Paix',
      bookingUrl: 'https://booking.com/hotel',
      checkIn: '15:00',
      checkOut: '11:00',
    })
  })

  it('parses transport fields', () => {
    const [day] = parseCSVToTripData(MINIMAL_CSV).itinerary
    expect(day.transport).toMatchObject({
      type: 'plane',
      from: 'Lyon',
      to: 'Paris',
      details: 'Vol AF1234',
    })
  })

  it('parses multiple rows', () => {
    const csv = `tripStartDate,tripEndDate,date,dayNumber,city,title,latitude,longitude,dayType,walkingDistance,notes,highlights,tips,foodRecommendations,packingTips,activities,accommodationName,accommodationAddress,accommodationBookingUrl,accommodationCheckIn,accommodationCheckOut,transportType,transportFrom,transportTo,transportDetails
2026-06-01,2026-06-05,2026-06-01,1,Paris,Jour 1,48.8566,2.3522,,,,,,,,,,,,,,,,,
2026-06-01,2026-06-05,2026-06-02,2,Lyon,Jour 2,45.7640,4.8357,,,,,,,,,,,,,,,,,`
    const result = parseCSVToTripData(csv)
    expect(result.itinerary).toHaveLength(2)
    expect(result.itinerary[1].city).toBe('Lyon')
  })

  it('defaults invalid activity type to "visit"', () => {
    const csv = `tripStartDate,tripEndDate,date,dayNumber,city,title,latitude,longitude,dayType,walkingDistance,notes,highlights,tips,foodRecommendations,packingTips,activities,accommodationName,accommodationAddress,accommodationBookingUrl,accommodationCheckIn,accommodationCheckOut,transportType,transportFrom,transportTo,transportDetails
2026-06-01,2026-06-05,2026-06-01,1,Paris,Jour 1,48.8566,2.3522,,,,,,,,Museum|museum|2h,,,,,,,,,`
    const [day] = parseCSVToTripData(csv).itinerary
    expect(day.activities[0].type).toBe('visit')
  })

  it('omits accommodation when name is empty', () => {
    const csv = `tripStartDate,tripEndDate,date,dayNumber,city,title,latitude,longitude,dayType,walkingDistance,notes,highlights,tips,foodRecommendations,packingTips,activities,accommodationName,accommodationAddress,accommodationBookingUrl,accommodationCheckIn,accommodationCheckOut,transportType,transportFrom,transportTo,transportDetails
2026-06-01,2026-06-05,2026-06-01,1,Paris,Jour 1,48.8566,2.3522,,,,,,,,,,,,,,,,,`
    const [day] = parseCSVToTripData(csv).itinerary
    expect(day.accommodation).toBeUndefined()
  })

  it('omits transport when transportType is invalid', () => {
    const csv = `tripStartDate,tripEndDate,date,dayNumber,city,title,latitude,longitude,dayType,walkingDistance,notes,highlights,tips,foodRecommendations,packingTips,activities,accommodationName,accommodationAddress,accommodationBookingUrl,accommodationCheckIn,accommodationCheckOut,transportType,transportFrom,transportTo,transportDetails
2026-06-01,2026-06-05,2026-06-01,1,Paris,Jour 1,48.8566,2.3522,,,,,,,,,,,,,,taxi,,,`
    const [day] = parseCSVToTripData(csv).itinerary
    expect(day.transport).toBeUndefined()
  })

  it('throws on empty CSV', () => {
    expect(() => parseCSVToTripData('')).toThrow()
  })

  it('throws when tripStartDate or tripEndDate is missing', () => {
    const csv = `date,dayNumber,city,title,latitude,longitude
2026-06-01,1,Paris,Jour 1,48.8566,2.3522`
    expect(() => parseCSVToTripData(csv)).toThrow()
  })

  it('throws when required columns are missing', () => {
    const csv = `tripStartDate,tripEndDate,date,dayNumber
2026-06-01,2026-06-05,2026-06-01,1`
    expect(() => parseCSVToTripData(csv)).toThrow(/Colonnes manquantes/)
  })

  it('throws when latitude is not a number', () => {
    const csv = `tripStartDate,tripEndDate,date,dayNumber,city,title,latitude,longitude,dayType,walkingDistance,notes,highlights,tips,foodRecommendations,packingTips,activities,accommodationName,accommodationAddress,accommodationBookingUrl,accommodationCheckIn,accommodationCheckOut,transportType,transportFrom,transportTo,transportDetails
2026-06-01,2026-06-05,2026-06-01,1,Paris,Jour 1,INVALID,2.3522,,,,,,,,,,,,,,,,,`
    expect(() => parseCSVToTripData(csv)).toThrow()
  })

  it('handles quoted fields containing commas', () => {
    const csv = `tripStartDate,tripEndDate,date,dayNumber,city,title,latitude,longitude,dayType,walkingDistance,notes,highlights,tips,foodRecommendations,packingTips,activities,accommodationName,accommodationAddress,accommodationBookingUrl,accommodationCheckIn,accommodationCheckOut,transportType,transportFrom,transportTo,transportDetails
2026-06-01,2026-06-05,2026-06-01,1,"Paris, France",Arrivée,48.8566,2.3522,,,,,,,,,,,,,,,,,`
    const [day] = parseCSVToTripData(csv).itinerary
    expect(day.city).toBe('Paris, France')
  })

  it('parses the built-in EXAMPLE_CSV without errors', () => {
    const result = parseCSVToTripData(EXAMPLE_CSV)
    expect(result.itinerary.length).toBeGreaterThan(0)
    expect(result.tripStartDate).toBeTruthy()
    expect(result.tripEndDate).toBeTruthy()
  })
})

import { describe, it, expect } from 'vitest'
import { Workbook } from 'exceljs'
import { importFromXlsx, importFromCsv } from '../importItinerary'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal mock File that satisfies arrayBuffer() for xlsx tests. */
async function makeXlsxFile(
  days: unknown[][],
  activities: unknown[][],
  transports: unknown[][],
): Promise<File> {
  const wb = new Workbook()

  const daysSheet = wb.addWorksheet('Days')
  days.forEach((row) => daysSheet.addRow(row))

  const activitiesSheet = wb.addWorksheet('Activities')
  activities.forEach((row) => activitiesSheet.addRow(row))

  const transportsSheet = wb.addWorksheet('Transports')
  transports.forEach((row) => transportsSheet.addRow(row))

  const buffer = await wb.xlsx.writeBuffer()
  return {
    arrayBuffer: async () => buffer as unknown as ArrayBuffer,
    name: 'trip.xlsx',
  } as unknown as File
}

/** Build a mock File with a text() method for CSV tests. */
function makeCsvFile(name: string, content: string): File {
  return {
    name,
    text: async () => content,
  } as unknown as File
}

// ── CSV fixtures ──────────────────────────────────────────────────────────────

const DAYS_CSV = `id,date,day_number,city,title,coordinates,highlights,food_recommendations,notes,accommodation_name,accommodation_id,accommodation_address,accommodation_booking_url,accommodation_check_in,accommodation_check_out,accommodation_price,accommodation_currency,accommodation_status
day-1,2026-05-10,1,Paris,Arrivée à Paris,48.8566|2.3522,Tour Eiffel|Louvre,Croissant|Café,Beau voyage,Hôtel de Ville,acc-1,1 Place de l'Hôtel de Ville,https://example.com,2026-05-10,2026-05-12,120,EUR,booked
day-2,2026-05-11,2,Lyon,Journée à Lyon,45.7640|4.8357,Vieux Lyon,Quenelle,,,,,,,,,,`

const ACTIVITIES_CSV = `id,day_id,name,type,duration,description,coordinates,address,booking_url,reservation_required,price,currency,rating,tags,status,tips,open_at
act-1,day-1,Visite Tour Eiffel,visit,2h,Vue panoramique,48.8584|2.2945,Champ de Mars,https://toureiffel.paris,true,25,EUR,4.8,monument|paris,planned,Réserver à l'avance,09:00-23:00
act-2,day-1,Déjeuner,food,1h,,,,,,15,EUR,,,,`

const TRANSPORTS_CSV = `id,day_id,type,from,to,details,departure_address,departure_time,arrival_time,duration,provider,booking_url,booking_reference,price,currency,seat,gate,terminal,status,notes
tr-1,day-2,train,Paris,Lyon,TGV,Gare de Lyon,08:00,10:00,2h,SNCF,https://sncf.com,REF123,50,EUR,12A,3,,booked,Voiture 5`

// ── importFromCsv ─────────────────────────────────────────────────────────────

describe('importFromCsv', () => {
  it('returns an ImportResult with itinerary', async () => {
    const result = await importFromCsv([
      makeCsvFile('days.csv', DAYS_CSV),
      makeCsvFile('activities.csv', ACTIVITIES_CSV),
      makeCsvFile('transports.csv', TRANSPORTS_CSV),
    ])
    expect(result.itinerary).toHaveLength(2)
  })

  it('maps core day fields correctly', async () => {
    const result = await importFromCsv([
      makeCsvFile('days.csv', DAYS_CSV),
      makeCsvFile('activities.csv', ACTIVITIES_CSV),
      makeCsvFile('transports.csv', TRANSPORTS_CSV),
    ])
    const day = result.itinerary[0]
    expect(day.id).toBe('day-1')
    expect(day.date).toBe('2026-05-10')
    expect(day.dayNumber).toBe(1)
    expect(day.city).toBe('Paris')
    expect(day.title).toBe('Arrivée à Paris')
    expect(day.source).toBe('import')
  })

  it('parses coordinates from lat|lng format', async () => {
    const result = await importFromCsv([
      makeCsvFile('days.csv', DAYS_CSV),
      makeCsvFile('activities.csv', ACTIVITIES_CSV),
      makeCsvFile('transports.csv', TRANSPORTS_CSV),
    ])
    expect(result.itinerary[0].coordinates).toEqual([48.8566, 2.3522])
  })

  it('parses pipe-separated lists', async () => {
    const result = await importFromCsv([
      makeCsvFile('days.csv', DAYS_CSV),
      makeCsvFile('activities.csv', ACTIVITIES_CSV),
      makeCsvFile('transports.csv', TRANSPORTS_CSV),
    ])
    expect(result.itinerary[0].highlights).toEqual(['Tour Eiffel', 'Louvre'])
    expect(result.itinerary[0].foodRecommendations).toEqual([
      'Croissant',
      'Café',
    ])
  })

  it('maps accommodation fields from accommodation_ prefix columns', async () => {
    const result = await importFromCsv([
      makeCsvFile('days.csv', DAYS_CSV),
      makeCsvFile('activities.csv', ACTIVITIES_CSV),
      makeCsvFile('transports.csv', TRANSPORTS_CSV),
    ])
    const acc = result.itinerary[0].accommodation
    expect(acc).toBeDefined()
    expect(acc?.name).toBe('Hôtel de Ville')
    expect(acc?.id).toBe('acc-1')
    expect(acc?.checkIn).toBe('2026-05-10')
    expect(acc?.price).toBe(120)
    expect(acc?.currency).toBe('EUR')
    expect(acc?.status).toBe('booked')
  })

  it('leaves accommodation undefined when accommodation_name is absent', async () => {
    const result = await importFromCsv([
      makeCsvFile('days.csv', DAYS_CSV),
      makeCsvFile('activities.csv', ACTIVITIES_CSV),
      makeCsvFile('transports.csv', TRANSPORTS_CSV),
    ])
    expect(result.itinerary[1].accommodation).toBeUndefined()
  })

  it('links activities to the correct day via day_id', async () => {
    const result = await importFromCsv([
      makeCsvFile('days.csv', DAYS_CSV),
      makeCsvFile('activities.csv', ACTIVITIES_CSV),
      makeCsvFile('transports.csv', TRANSPORTS_CSV),
    ])
    expect(result.itinerary[0].activities).toHaveLength(2)
    expect(result.itinerary[1].activities).toHaveLength(0)
  })

  it('maps activity fields correctly', async () => {
    const result = await importFromCsv([
      makeCsvFile('days.csv', DAYS_CSV),
      makeCsvFile('activities.csv', ACTIVITIES_CSV),
      makeCsvFile('transports.csv', TRANSPORTS_CSV),
    ])
    const act = result.itinerary[0].activities[0]
    expect(act.id).toBe('act-1')
    expect(act.name).toBe('Visite Tour Eiffel')
    expect(act.type).toBe('visit')
    expect(act.duration).toBe('2h')
    expect(act.coordinates).toEqual([48.8584, 2.2945])
    expect(act.price).toBe(25)
    expect(act.rating).toBe(4.8)
    expect(act.tags).toEqual(['monument', 'paris'])
    expect(act.reservationRequired).toBe(true)
    expect(act.source).toBe('import')
  })

  it('links transport to the correct day via day_id', async () => {
    const result = await importFromCsv([
      makeCsvFile('days.csv', DAYS_CSV),
      makeCsvFile('activities.csv', ACTIVITIES_CSV),
      makeCsvFile('transports.csv', TRANSPORTS_CSV),
    ])
    expect(result.itinerary[0].transport).toBeUndefined()
    expect(result.itinerary[1].transport).toBeDefined()
  })

  it('maps transport fields correctly', async () => {
    const result = await importFromCsv([
      makeCsvFile('days.csv', DAYS_CSV),
      makeCsvFile('activities.csv', ACTIVITIES_CSV),
      makeCsvFile('transports.csv', TRANSPORTS_CSV),
    ])
    const tr = result.itinerary[1].transport!
    expect(tr.id).toBe('tr-1')
    expect(tr.type).toBe('train')
    expect(tr.from).toBe('Paris')
    expect(tr.to).toBe('Lyon')
    expect(tr.price).toBe(50)
    expect(tr.bookingReference).toBe('REF123')
    expect(tr.seat).toBe('12A')
    expect(tr.source).toBe('import')
  })

  it('auto-generates id when id column is missing', async () => {
    const csv = `date,city,title\n2026-05-10,Paris,Arrivée`
    const result = await importFromCsv([
      makeCsvFile('days.csv', csv),
      makeCsvFile('activities.csv', 'id,day_id,name,type\n'),
      makeCsvFile('transports.csv', 'id,day_id,type\n'),
    ])
    expect(result.itinerary[0].id).toBe('day-import-1')
  })

  it('auto-generates dayNumber when day_number column is missing', async () => {
    const csv = `id,date,city,title\nday-1,2026-05-10,Paris,J1\nday-2,2026-05-11,Lyon,J2`
    const result = await importFromCsv([
      makeCsvFile('days.csv', csv),
      makeCsvFile('activities.csv', 'id,day_id,name,type\n'),
      makeCsvFile('transports.csv', 'id,day_id,type\n'),
    ])
    expect(result.itinerary[0].dayNumber).toBe(1)
    expect(result.itinerary[1].dayNumber).toBe(2)
  })

  it('falls back to [0,0] coordinates when coordinates column is missing', async () => {
    const csv = `id,date,city,title\nday-1,2026-05-10,Paris,J1`
    const result = await importFromCsv([
      makeCsvFile('days.csv', csv),
      makeCsvFile('activities.csv', 'id,day_id,name,type\n'),
      makeCsvFile('transports.csv', 'id,day_id,type\n'),
    ])
    expect(result.itinerary[0].coordinates).toEqual([0, 0])
  })

  it('handles optional fields as undefined when cells are empty', async () => {
    const csv = `id,date,city,title,notes,highlights\nday-1,2026-05-10,Paris,J1,,`
    const result = await importFromCsv([
      makeCsvFile('days.csv', csv),
      makeCsvFile('activities.csv', 'id,day_id,name,type\n'),
      makeCsvFile('transports.csv', 'id,day_id,type\n'),
    ])
    expect(result.itinerary[0].notes).toBeUndefined()
    expect(result.itinerary[0].highlights).toBeUndefined()
  })

  it('parses CSV with quoted fields containing commas', async () => {
    const csv = `id,date,city,title\nday-1,2026-05-10,"Paris, France","Arrivée, première journée"`
    const result = await importFromCsv([
      makeCsvFile('days.csv', csv),
      makeCsvFile('activities.csv', 'id,day_id,name,type\n'),
      makeCsvFile('transports.csv', 'id,day_id,type\n'),
    ])
    expect(result.itinerary[0].city).toBe('Paris, France')
    expect(result.itinerary[0].title).toBe('Arrivée, première journée')
  })

  it('parses CSV with escaped quotes inside quoted fields', async () => {
    const csv = `id,date,city,title\nday-1,2026-05-10,Paris,"L'hôtel ""Lumière"""`
    const result = await importFromCsv([
      makeCsvFile('days.csv', csv),
      makeCsvFile('activities.csv', 'id,day_id,name,type\n'),
      makeCsvFile('transports.csv', 'id,day_id,type\n'),
    ])
    expect(result.itinerary[0].title).toBe('L\'hôtel "Lumière"')
  })

  it('skips blank lines in CSV', async () => {
    const csv = `id,date,city,title\nday-1,2026-05-10,Paris,J1\n\nday-2,2026-05-11,Lyon,J2\n`
    const result = await importFromCsv([
      makeCsvFile('days.csv', csv),
      makeCsvFile('activities.csv', 'id,day_id,name,type\n'),
      makeCsvFile('transports.csv', 'id,day_id,type\n'),
    ])
    expect(result.itinerary).toHaveLength(2)
  })

  it('handles CRLF line endings', async () => {
    const csv = 'id,date,city,title\r\nday-1,2026-05-10,Paris,J1\r\n'
    const result = await importFromCsv([
      makeCsvFile('days.csv', csv),
      makeCsvFile('activities.csv', 'id,day_id,name,type\n'),
      makeCsvFile('transports.csv', 'id,day_id,type\n'),
    ])
    expect(result.itinerary).toHaveLength(1)
    expect(result.itinerary[0].city).toBe('Paris')
  })

  it('throws when days.csv is missing', async () => {
    await expect(
      importFromCsv([
        makeCsvFile('activities.csv', ACTIVITIES_CSV),
        makeCsvFile('transports.csv', TRANSPORTS_CSV),
      ]),
    ).rejects.toThrow('days.csv')
  })

  it('throws when activities.csv is missing', async () => {
    await expect(
      importFromCsv([
        makeCsvFile('days.csv', DAYS_CSV),
        makeCsvFile('transports.csv', TRANSPORTS_CSV),
      ]),
    ).rejects.toThrow('activities.csv')
  })

  it('throws when transports.csv is missing', async () => {
    await expect(
      importFromCsv([
        makeCsvFile('days.csv', DAYS_CSV),
        makeCsvFile('activities.csv', ACTIVITIES_CSV),
      ]),
    ).rejects.toThrow('transports.csv')
  })

  it('is case-insensitive for file names', async () => {
    await expect(
      importFromCsv([
        makeCsvFile('Days.CSV', DAYS_CSV),
        makeCsvFile('ACTIVITIES.csv', ACTIVITIES_CSV),
        makeCsvFile('Transports.Csv', TRANSPORTS_CSV),
      ]),
    ).resolves.toBeDefined()
  })

  it('returns empty itinerary for header-only CSV files', async () => {
    const result = await importFromCsv([
      makeCsvFile('days.csv', 'id,date,city,title'),
      makeCsvFile('activities.csv', 'id,day_id,name,type'),
      makeCsvFile('transports.csv', 'id,day_id,type'),
    ])
    expect(result.itinerary).toHaveLength(0)
  })
})

// ── importFromXlsx ────────────────────────────────────────────────────────────

describe('importFromXlsx', () => {
  it('returns an ImportResult with itinerary and dates', async () => {
    const file = await makeXlsxFile(
      [
        [
          'id',
          'date',
          'day_number',
          'city',
          'title',
          'coordinates',
          'accommodation_name',
        ],
        ['day-1', '2026-05-10', 1, 'Paris', 'Arrivée', '48.8566|2.3522', ''],
      ],
      [['id', 'day_id', 'name', 'type']],
      [['id', 'day_id', 'type']],
    )
    const result = await importFromXlsx(file)
    expect(result.itinerary).toHaveLength(1)
  })

  it('maps day fields from Excel rows', async () => {
    const file = await makeXlsxFile(
      [
        ['id', 'date', 'day_number', 'city', 'title', 'coordinates'],
        ['day-1', '2026-05-10', 1, 'Paris', 'Arrivée', '48.8566|2.3522'],
      ],
      [['id', 'day_id', 'name', 'type']],
      [['id', 'day_id', 'type']],
    )
    const result = await importFromXlsx(file)
    const day = result.itinerary[0]
    expect(day.id).toBe('day-1')
    expect(day.city).toBe('Paris')
    expect(day.coordinates).toEqual([48.8566, 2.3522])
    expect(day.source).toBe('import')
  })

  it('handles Date objects from Excel date cells', async () => {
    const wb = new Workbook()
    const daysSheet = wb.addWorksheet('Days')
    wb.addWorksheet('Activities').addRow(['id', 'day_id', 'name', 'type'])
    wb.addWorksheet('Transports').addRow(['id', 'day_id', 'type'])

    daysSheet.addRow(['id', 'date', 'city', 'title'])
    const dateCell = new Date('2026-05-10')
    daysSheet.addRow(['day-1', dateCell, 'Paris', 'Arrivée'])

    const buffer = await wb.xlsx.writeBuffer()
    const file = {
      arrayBuffer: async () => buffer as unknown as ArrayBuffer,
      name: 'trip.xlsx',
    } as unknown as File

    const result = await importFromXlsx(file)
    expect(result.itinerary[0].date).toBe('2026-05-10')
  })

  it('links activities to days via day_id', async () => {
    const file = await makeXlsxFile(
      [
        ['id', 'date', 'city', 'title'],
        ['day-1', '2026-05-10', 'Paris', 'Arrivée'],
        ['day-2', '2026-05-11', 'Lyon', 'Journée'],
      ],
      [
        ['id', 'day_id', 'name', 'type'],
        ['act-1', 'day-1', 'Tour Eiffel', 'visit'],
        ['act-2', 'day-1', 'Louvre', 'visit'],
      ],
      [['id', 'day_id', 'type']],
    )
    const result = await importFromXlsx(file)
    expect(result.itinerary[0].activities).toHaveLength(2)
    expect(result.itinerary[1].activities).toHaveLength(0)
  })

  it('links transport to the correct day via day_id', async () => {
    const file = await makeXlsxFile(
      [
        ['id', 'date', 'city', 'title'],
        ['day-1', '2026-05-10', 'Paris', 'Arrivée'],
        ['day-2', '2026-05-11', 'Lyon', 'Journée'],
      ],
      [['id', 'day_id', 'name', 'type']],
      [
        ['id', 'day_id', 'type', 'from', 'to'],
        ['tr-1', 'day-2', 'train', 'Paris', 'Lyon'],
      ],
    )
    const result = await importFromXlsx(file)
    expect(result.itinerary[0].transport).toBeUndefined()
    expect(result.itinerary[1].transport?.type).toBe('train')
  })

  it('maps accommodation from accommodation_ prefixed columns', async () => {
    const file = await makeXlsxFile(
      [
        [
          'id',
          'date',
          'city',
          'title',
          'accommodation_name',
          'accommodation_check_in',
          'accommodation_check_out',
          'accommodation_price',
          'accommodation_currency',
        ],
        [
          'day-1',
          '2026-05-10',
          'Paris',
          'Arrivée',
          'Grand Hôtel',
          '2026-05-10',
          '2026-05-12',
          200,
          'EUR',
        ],
      ],
      [['id', 'day_id', 'name', 'type']],
      [['id', 'day_id', 'type']],
    )
    const result = await importFromXlsx(file)
    const acc = result.itinerary[0].accommodation
    expect(acc?.name).toBe('Grand Hôtel')
    expect(acc?.price).toBe(200)
    expect(acc?.currency).toBe('EUR')
  })

  it('dates are derivable from day dates in itinerary', async () => {
    const file = await makeXlsxFile(
      [
        ['id', 'date', 'city', 'title'],
        ['day-1', '2026-05-10', 'Paris', 'J1'],
        ['day-2', '2026-05-15', 'Nice', 'J2'],
      ],
      [['id', 'day_id', 'name', 'type']],
      [['id', 'day_id', 'type']],
    )
    const result = await importFromXlsx(file)
    expect(result.itinerary[0].date).toBe('2026-05-10')
    expect(result.itinerary[1].date).toBe('2026-05-15')
  })

  it('throws when "Days" sheet is missing', async () => {
    const wb = new Workbook()
    wb.addWorksheet('Activities')
    wb.addWorksheet('Transports')
    const buffer = await wb.xlsx.writeBuffer()
    const file = {
      arrayBuffer: async () => buffer as unknown as ArrayBuffer,
      name: 'trip.xlsx',
    } as unknown as File

    await expect(importFromXlsx(file)).rejects.toThrow('Days')
  })

  it('throws when "Activities" sheet is missing', async () => {
    const wb = new Workbook()
    wb.addWorksheet('Days')
    wb.addWorksheet('Transports')
    const buffer = await wb.xlsx.writeBuffer()
    const file = {
      arrayBuffer: async () => buffer as unknown as ArrayBuffer,
      name: 'trip.xlsx',
    } as unknown as File

    await expect(importFromXlsx(file)).rejects.toThrow('Activities')
  })

  it('throws when "Transports" sheet is missing', async () => {
    const wb = new Workbook()
    wb.addWorksheet('Days')
    wb.addWorksheet('Activities')
    const buffer = await wb.xlsx.writeBuffer()
    const file = {
      arrayBuffer: async () => buffer as unknown as ArrayBuffer,
      name: 'trip.xlsx',
    } as unknown as File

    await expect(importFromXlsx(file)).rejects.toThrow('Transports')
  })

  it('returns empty itinerary when sheets have only headers', async () => {
    const file = await makeXlsxFile(
      [['id', 'date', 'city', 'title']],
      [['id', 'day_id', 'name', 'type']],
      [['id', 'day_id', 'type']],
    )
    const result = await importFromXlsx(file)
    expect(result.itinerary).toHaveLength(0)
  })
})

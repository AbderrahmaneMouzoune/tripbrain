export interface Accommodation {
  name: string
  address: string
  bookingUrl: string
  checkIn: string
  checkOut: string
  images?: string[]
}

export interface Activity {
  id: string
  name: string
  description?: string
  type: 'visit' | 'transport' | 'food' | 'experience' | 'shopping'
  duration?: number // in minutes
  coordinates?: [number, number]
  timeWindow?: {
    start?: string // e.g. "10:00"
    end?: string // e.g. "12:30"
  }
  priority?: 'low' | 'medium' | 'high'
  preRequisites?: string[]
  budget?: number
  link?: string
  images?: string[]
  notes?: string
}

export interface DayImage {
  url: string
  caption: string
}

export interface DayItinerary {
  date: string
  dayNumber: number
  city: string
  title: string
  highlights?: string[]
  foodRecommendations?: string[]
  walkingDistance?: string
  notes?: string
  packingTips?: string[]
  dayType?: string
  tips?: string[]
  accommodation?: Accommodation
  activities: Activity[]
  transport?: {
    type: 'train' | 'car' | 'plane' | 'bus'
    from?: string
    to?: string
    details?: string
  }
  coordinates: [number, number]
  images?: DayImage[]
}

export const tripStartDate = new Date('2026-05-09')
export const tripEndDate = new Date('2026-05-28')

export const itinerary: DayItinerary[] = [
  {
    date: '2026-05-10',
    dayNumber: 1,
    city: 'Shanghai',
    title: 'Arrivée à Shanghai',
    coordinates: [31.2304, 121.4737],
    dayType: 'arrival',
    walkingDistance: '6 km',
    highlights: ['Skyline du Bund', "Temple Jing'an"],
    tips: [
      'Installer Alipay',
      'Utiliser le métro pour les déplacements',
      'Se reposer après le vol',
    ],
    notes: 'Première journée tranquille pour gérer le décalage horaire.',
    images: [
      {
        url: 'https://images.pexels.com/photos/687450/pexels-photo-687450.jpeg',
        caption: 'Shanghai skyline',
      },
      {
        url: 'https://images.pexels.com/photos/650231/pexels-photo-650231.jpeg',
        caption: 'The Bund promenade',
      },
      {
        url: 'https://images.pexels.com/photos/635260/pexels-photo-635260.jpeg',
        caption: "Lobby de l'hôtel",
      },
      {
        url: 'https://images.pexels.com/photos/842654/pexels-photo-842654.jpeg',
        caption: "Vue sur la rue Jing'an",
      },
      {
        url: 'https://images.pexels.com/photos/354941/pexels-photo-354941.jpeg',
        caption: 'Ruelles alentours',
      },
    ],
    accommodation: {
      name: 'Hebergement reserve (anonymise)',
      address: 'Adresse privee masquee',
      bookingUrl: 'https://example.com/reservation-anonymisee',
      checkIn: '2026-05-10',
      checkOut: '2026-05-12',
      images: [
        'https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg',
        'https://images.pexels.com/photos/2869387/pexels-photo-2869387.jpeg',
        'https://images.pexels.com/photos/373488/pexels-photo-373488.jpeg',
        'https://images.pexels.com/photos/246002/pexels-photo-246002.jpeg',
        'https://images.pexels.com/photos/271639/pexels-photo-271639.jpeg',
      ],
    },
    activities: [
      { id: 'act-d1-1', name: 'Check-in hôtel', type: 'experience', duration: 60 },
      {
        id: 'act-d1-2',
        name: "Temple Jing'an",
        type: 'visit',
        duration: 90,
        coordinates: [31.2235, 121.4452],
        priority: 'medium',
        link: 'https://jingantemple.com/',
      },
      {
        id: 'act-d1-3',
        name: 'Promenade sur le Bund',
        type: 'visit',
        duration: 120,
        coordinates: [31.24, 121.49],
        priority: 'high',
        timeWindow: { start: '18:00', end: '21:00' },
        notes: 'Les lumières de nuit sur Pudong sont spectaculaires.',
      },
      { id: 'act-d1-4', name: 'Dîner Xiaolongbao', type: 'food', duration: 90, budget: 15 },
    ],
  },

  {
    date: '2026-05-11',
    dayNumber: 2,
    city: 'Shanghai',
    title: 'Vieille ville et Yu Garden',
    coordinates: [31.2304, 121.4737],
    dayType: 'exploration',
    walkingDistance: '12 km',
    highlights: ['Yu Garden', 'Bazar Yuyuan', 'Concession française'],
    tips: [
      'Arriver tôt au Yu Garden',
      'Prendre de la monnaie locale pour le bazar',
      'Prévoir beaucoup de photos',
    ],
    notes: 'Quartiers historiques très photogéniques.',
    images: [
      {
        url: 'https://images.pexels.com/photos/650222/pexels-photo-650222.jpeg',
        caption: 'Yu Garden architecture',
      },
      {
        url: 'https://images.pexels.com/photos/3972156/pexels-photo-3972156.jpeg',
        caption: 'Shanghai old streets',
      },
      {
        url: 'https://images.pexels.com/photos/4870808/pexels-photo-4870808.jpeg',
        caption: 'Allées pittoresques du bazar',
      },
      {
        url: 'https://images.pexels.com/photos/683419/pexels-photo-683419.jpeg',
        caption: 'Ponts traditionnels',
      },
      {
        url: 'https://images.pexels.com/photos/683940/pexels-photo-683940.jpeg',
        caption: 'Décorations florales du jardin',
      },
    ],
    activities: [
      {
        id: 'act-d2-1',
        name: 'Yu Garden',
        type: 'visit',
        duration: 120,
        coordinates: [31.227, 121.4923],
        priority: 'high',
        timeWindow: { start: '08:30', end: '10:30' },
        preRequisites: ['Billet en ligne recommandé'],
        budget: 10,
        link: 'https://www.yuyuan.com.cn/',
      },
      { id: 'act-d2-2', name: 'Bazar Yuyuan', type: 'shopping', duration: 90, notes: 'Prendre de la monnaie locale pour le bazar.' },
      { id: 'act-d2-3', name: 'Nanxiang Dumpling House', type: 'food', duration: 60, budget: 12 },
      {
        id: 'act-d2-4',
        name: 'Balade concession française',
        type: 'visit',
        duration: 120,
        coordinates: [31.2139, 121.4701],
      },
    ],
    transport: { type: 'train', from: 'Shanghai', to: 'Qingdao' },
  },

  {
    date: '2026-05-12',
    dayNumber: 3,
    city: 'Qingdao',
    title: 'Ville maritime',
    coordinates: [36.0671, 120.3826],
    dayType: 'coastal',
    walkingDistance: '8 km',
    highlights: ['Jetée Zhanqiao', 'Architecture allemande', 'Plage Qingdao'],
    tips: ['Super coucher de soleil sur la mer', 'Se couvrir en soirée'],
    notes: 'Exploration du front de mer et bâtiments historiques allemands.',
    images: [
      {
        url: 'https://images.pexels.com/photos/5851184/pexels-photo-5851184.jpeg',
        caption: 'Qingdao coastline',
      },
      {
        url: 'https://images.pexels.com/photos/4485231/pexels-photo-4485231.jpeg',
        caption: 'Sea pier',
      },
      {
        url: 'https://images.pexels.com/photos/11875331/pexels-photo-11875331.jpeg',
        caption: 'Plage de Qingdao',
      },
      {
        url: 'https://images.pexels.com/photos/2225891/pexels-photo-2225891.jpeg',
        caption: 'Architecture allemande',
      },
      {
        url: 'https://images.pexels.com/photos/16864552/pexels-photo-16864552.jpeg',
        caption: 'Bords de mer animés',
      },
    ],
    accommodation: {
      name: 'Hebergement reserve (anonymise)',
      address: 'Adresse privee masquee',
      bookingUrl: 'https://example.com/reservation-anonymisee',
      checkIn: '2026-05-12',
      checkOut: '2026-05-13',
    },
    activities: [
      {
        id: 'act-d3-1',
        name: 'Jetée Zhanqiao',
        type: 'visit',
        duration: 60,
        coordinates: [36.0605, 120.3203],
        priority: 'high',
      },
      {
        id: 'act-d3-2',
        name: 'Cathédrale Saint-Michel',
        type: 'visit',
        duration: 45,
        coordinates: [36.064, 120.327],
      },
      {
        id: 'act-d3-3',
        name: 'Musée bière Tsingtao',
        type: 'visit',
        duration: 90,
        coordinates: [36.0775, 120.32],
        budget: 8,
        link: 'https://www.tsingtao.com.cn/',
        notes: 'La dégustation de bière est incluse dans le billet.',
      },
      { id: 'act-d3-4', name: 'Dîner fruits de mer', type: 'food', duration: 90, budget: 25 },
    ],
    transport: { type: 'train', from: 'Qingdao', to: 'Beijing' },
  },

  {
    date: '2026-05-13',
    dayNumber: 4,
    city: 'Beijing',
    title: 'Arrivée à Pékin',
    coordinates: [39.9042, 116.4074],
    dayType: 'arrival',
    walkingDistance: '6 km',
    highlights: ['Rue Wangfujing', 'Street food locale'],
    tips: [
      'Tester la street food locale',
      'Prévoir de la monnaie pour les petits achats',
    ],
    notes: 'Première journée dans la capitale, découverte du centre-ville.',
    images: [
      {
        url: 'https://images.pexels.com/photos/16144416/pexels-photo-16144416.jpeg',
        caption: 'Beijing street',
      },
      {
        url: 'https://images.pexels.com/photos/1170262/pexels-photo-1170262.jpeg',
        caption: 'Rues animées de Wangfujing',
      },
      {
        url: 'https://images.pexels.com/photos/302718/pexels-photo-302718.jpeg',
        caption: 'Architecture moderne et traditionnelle',
      },
      {
        url: 'https://images.pexels.com/photos/16228208/pexels-photo-16228208.jpeg',
        caption: 'Places publiques',
      },
      {
        url: 'https://images.pexels.com/photos/2846075/pexels-photo-2846075.jpeg',
        caption: 'Monuments historiques',
      },
    ],
    accommodation: {
      name: 'Hebergement reserve (anonymise)',
      address: 'Adresse privee masquee',
      bookingUrl: 'https://example.com/reservation-anonymisee',
      checkIn: '2026-05-13',
      checkOut: '2026-05-16',
    },
    activities: [
      { id: 'act-d4-1', name: 'Installation hôtel', type: 'experience', duration: 60 },
      {
        id: 'act-d4-2',
        name: 'Balade Wangfujing',
        type: 'visit',
        duration: 90,
        coordinates: [39.9153, 116.404],
      },
      { id: 'act-d4-3', name: 'Marché street food', type: 'food', duration: 90, budget: 10 },
    ],
  },

  {
    date: '2026-05-14',
    dayNumber: 5,
    city: 'Beijing',
    title: 'Cité interdite',
    coordinates: [39.9042, 116.4074],
    dayType: 'culture',
    walkingDistance: '14 km',
    highlights: ['Place Tiananmen', 'Cité interdite', 'Parc Jingshan'],
    tips: ['Visiter tôt le matin', 'Porter des chaussures confortables'],
    notes: 'Exploration des monuments emblématiques et culture impériale.',
    images: [
      {
        url: 'https://images.pexels.com/photos/20694747/pexels-photo-20694747.jpeg',
        caption: 'Forbidden City',
      },
      {
        url: 'https://images.pexels.com/photos/29474218/pexels-photo-29474218.jpeg',
        caption: 'Parc et jardins impériaux',
      },
      {
        url: 'https://images.pexels.com/photos/3229784/pexels-photo-3229784.jpeg',
        caption: 'Monuments historiques',
      },
      {
        url: 'https://images.pexels.com/photos/3587765/pexels-photo-3587765.jpeg',
        caption: 'Architecture classique',
      },
      {
        url: 'https://images.pexels.com/photos/1486577/pexels-photo-1486577.jpeg',
        caption: 'Rues autour de la Cité interdite',
      },
    ],
    activities: [
      {
        id: 'act-d5-1',
        name: 'Place Tiananmen',
        type: 'visit',
        duration: 45,
        coordinates: [39.9056, 116.3976],
        priority: 'high',
        timeWindow: { start: '07:00', end: '08:30' },
        notes: 'Arriver au lever du drapeau pour un moment historique.',
      },
      {
        id: 'act-d5-2',
        name: 'Cité interdite',
        type: 'visit',
        duration: 180,
        coordinates: [39.9163, 116.3972],
        priority: 'high',
        timeWindow: { start: '08:30', end: '17:00' },
        preRequisites: ['Billet en ligne obligatoire', 'Passeport requis'],
        budget: 15,
        link: 'https://www.dpm.org.cn/',
        description: "Ancienne résidence impériale de la dynastie Ming et Qing, l'un des plus grands complexes de palais au monde.",
        notes: "Réserver les billets au moins 2 semaines à l'avance.",
      },
      {
        id: 'act-d5-3',
        name: 'Parc Jingshan',
        type: 'visit',
        duration: 60,
        notes: 'Vue panoramique sur la Cité interdite depuis la colline.',
      },
      { id: 'act-d5-4', name: 'Dîner canard laqué', type: 'food', duration: 90, budget: 30, priority: 'high' },
    ],
  },

  {
    date: '2026-05-15',
    dayNumber: 6,
    city: 'Beijing',
    title: 'Grande Muraille',
    coordinates: [39.9042, 116.4074],
    dayType: 'nature',
    walkingDistance: '10 km',
    highlights: [
      'Grande Muraille Mutianyu',
      'Téléphérique',
      'Descente en luge',
    ],
    tips: [
      'Prévoir chaussures de randonnée',
      'Arriver tôt pour éviter la foule',
    ],
    notes: 'Journée nature et aventure sur la Grande Muraille.',
    images: [
      {
        url: 'https://images.pexels.com/photos/3892447/pexels-photo-3892447.jpeg',
        caption: 'Great Wall',
      },
      {
        url: 'https://images.pexels.com/photos/9274494/pexels-photo-9274494.jpeg',
        caption: 'Vue panoramique sur la muraille',
      },
      {
        url: 'https://images.pexels.com/photos/1653823/pexels-photo-1653823.jpeg',
        caption: 'Sections restaurées',
      },
      {
        url: 'https://images.pexels.com/photos/2981806/pexels-photo-2981806.jpeg',
        caption: 'Téléphérique vers le sommet',
      },
      {
        url: 'https://images.pexels.com/photos/2304791/pexels-photo-2304791.jpeg',
        caption: 'Descente en luge sur la muraille',
      },
    ],
    activities: [
      {
        id: 'act-d6-1',
        name: 'Grande Muraille Mutianyu',
        type: 'visit',
        duration: 240,
        coordinates: [40.4319, 116.5704],
        priority: 'high',
        timeWindow: { start: '08:00', end: '17:00' },
        preRequisites: ['Chaussures de randonnée recommandées'],
        budget: 25,
        link: 'https://www.mutianyugreatwall.com/',
        notes: 'Prendre le téléphérique pour monter, faire la luge pour descendre.',
      },
      {
        id: 'act-d6-2',
        name: 'Téléphérique',
        type: 'experience',
        duration: 20,
        preRequisites: ['Inclus dans le pass Mutianyu'],
      },
      { id: 'act-d6-3', name: 'Descente luge', type: 'experience', duration: 10 },
    ],
    transport: { type: 'plane', from: 'Beijing', to: "Xi'an" },
  },

  {
    date: '2026-05-16',
    dayNumber: 7,
    city: "Xi'an",
    title: 'Quartier musulman',
    coordinates: [34.3416, 108.9398],
    dayType: 'culture',
    walkingDistance: '7 km',
    highlights: ["Street food Xi'an", 'Grande mosquée', 'Souks'],
    tips: ['Prendre de la monnaie locale', 'Tester les spécialités locales'],
    notes: 'Découverte culinaire et culturelle du quartier musulman.',
    images: [
      {
        url: 'https://images.pexels.com/photos/36494135/pexels-photo-36494135.jpeg',
        caption: "Xi'an streets",
      },
      {
        url: 'https://images.pexels.com/photos/5998743/pexels-photo-5998743.jpeg',
        caption: 'Grande mosquée',
      },
      {
        url: 'https://images.pexels.com/photos/5305568/pexels-photo-5305568.jpeg',
        caption: 'Souks et ruelles',
      },
      {
        url: 'https://images.pexels.com/photos/36148228/pexels-photo-36148228.jpeg',
        caption: 'Street food noodles',
      },
      {
        url: 'https://images.pexels.com/photos/3204950/pexels-photo-3204950.jpeg',
        caption: 'Rues historiques',
      },
    ],
    accommodation: {
      name: 'Hebergement reserve (anonymise)',
      address: 'Adresse privee masquee',
      bookingUrl: 'https://example.com/reservation-anonymisee',
      checkIn: '2026-05-16',
      checkOut: '2026-05-18',
    },
    activities: [
      { id: 'act-d7-1', name: 'Quartier musulman', type: 'visit', duration: 120, priority: 'high' },
      { id: 'act-d7-2', name: 'Grande mosquée', type: 'visit', duration: 60 },
      { id: 'act-d7-3', name: 'Street food noodles', type: 'food', duration: 60, budget: 8 },
    ],
  },

  {
    date: '2026-05-17',
    dayNumber: 8,
    city: "Xi'an",
    title: 'Armée de terre cuite',
    coordinates: [34.3416, 108.9398],
    dayType: 'historic',
    walkingDistance: '8 km',
    highlights: [
      'Terracotta Army',
      "Remparts Xi'an",
      "Pagode de l'oie sauvage",
    ],
    tips: ['Prendre un guide audio', 'Apporter de l’eau et des snacks'],
    notes: 'Journée historique à visiter les sites emblématiques de Xi’an.',
    images: [
      {
        url: 'https://images.pexels.com/photos/36340318/pexels-photo-36340318.jpeg',
        caption: 'Terracotta warriors',
      },
      {
        url: 'https://images.pexels.com/photos/36494135/pexels-photo-36494135.jpeg',
        caption: 'Remparts de Xi’an',
      },
      {
        url: 'https://images.pexels.com/photos/5998743/pexels-photo-5998743.jpeg',
        caption: 'Pagode de l’oie sauvage',
      },
      {
        url: 'https://images.pexels.com/photos/5305568/pexels-photo-5305568.jpeg',
        caption: 'Musée Terracotta Army',
      },
      {
        url: 'https://images.pexels.com/photos/36148228/pexels-photo-36148228.jpeg',
        caption: 'Rues historiques',
      },
    ],
    activities: [
      {
        id: 'act-d8-1',
        name: 'Terracotta Army Museum',
        type: 'visit',
        duration: 180,
        coordinates: [34.3849, 109.2786],
        priority: 'high',
        timeWindow: { start: '09:00', end: '17:00' },
        preRequisites: ['Guide audio recommandé', 'Apporter eau et snacks'],
        budget: 20,
        link: 'https://www.bmy.com.cn/',
        description: "L'armée de terre cuite de l'Empereur Qin Shi Huang, l'une des découvertes archéologiques les plus importantes du XXe siècle.",
      },
      { id: 'act-d8-2', name: "Remparts Xi'an vélo", type: 'experience', duration: 120, budget: 8 },
      { id: 'act-d8-3', name: "Pagode de l'oie sauvage", type: 'visit', duration: 60 },
    ],
    transport: { type: 'train', from: "Xi'an", to: 'Chongqing' },
  },

  {
    date: '2026-05-18',
    dayNumber: 9,
    city: 'Chongqing',
    title: 'Ville cyberpunk',
    coordinates: [29.563, 106.5516],
    dayType: 'exploration',
    walkingDistance: '9 km',
    highlights: ['Hongyadong skyline', 'Promenade Yangtze'],
    tips: [
      'Prendre des photos de nuit',
      'Utiliser le téléphérique pour la vue panoramique',
    ],
    notes: 'Découverte de la ville moderne et animée.',
    images: [
      {
        url: 'https://images.pexels.com/photos/11975552/pexels-photo-11975552.jpeg',
        caption: 'Chongqing skyline',
      },
      {
        url: 'https://images.pexels.com/photos/14785197/pexels-photo-14785197.jpeg',
        caption: 'Ruelles animées',
      },
      {
        url: 'https://images.pexels.com/photos/14062523/pexels-photo-14062523.jpeg',
        caption: 'Hongyadong',
      },
      {
        url: 'https://images.pexels.com/photos/34295532/pexels-photo-34295532.jpeg',
        caption: 'Promenade Yangtze',
      },
      {
        url: 'https://images.pexels.com/photos/14062542/pexels-photo-14062542.jpeg',
        caption: 'Rooftop photo spot',
      },
    ],
    accommodation: {
      name: 'Hebergement reserve (anonymise)',
      address: 'Adresse privee masquee',
      bookingUrl: 'https://example.com/reservation-anonymisee',
      checkIn: '2026-05-18',
      checkOut: '2026-05-20',
    },
    activities: [
      { id: 'act-d9-1', name: 'Hongyadong', type: 'visit', duration: 120, priority: 'high' },
      { id: 'act-d9-2', name: 'Promenade Yangtze', type: 'visit', duration: 90 },
      { id: 'act-d9-3', name: 'Rooftop photo spot', type: 'experience', duration: 60, timeWindow: { start: '19:00', end: '21:00' }, notes: 'Idéal au coucher du soleil pour les photos de la skyline.' },
    ],
  },

  {
    date: '2026-05-19',
    dayNumber: 10,
    city: 'Chongqing',
    title: 'Hot pot et métro Liziba',
    coordinates: [29.563, 106.5516],
    dayType: 'culture',
    walkingDistance: '8 km',
    highlights: [
      "Train traversant l'immeuble Liziba",
      'Cuisine épicée du Sichuan',
    ],
    tips: ['Prévoir des vêtements légers : le hot pot est très épicé'],
    notes:
      'Une expérience citadine unique avec l’architecture verticale de Chongqing.',
    images: [
      {
        url: 'https://images.pexels.com/photos/11826841/pexels-photo-11826841.jpeg',
        caption: 'Chongqing skyline de nuit',
      },
      {
        url: 'https://images.pexels.com/photos/11826843/pexels-photo-11826843.jpeg',
        caption: 'Hot pot traditionnel épicé',
      },
      {
        url: 'https://images.pexels.com/photos/32660207/pexels-photo-32660207.jpeg',
        caption: 'Station de métro dans un immeuble',
      },
      {
        url: 'https://images.pexels.com/photos/28883787/pexels-photo-28883787.jpeg',
        caption: 'Ruelles de Ciqikou Ancient Town',
      },
      {
        url: 'https://images.pexels.com/photos/14062523/pexels-photo-14062523.jpeg',
        caption: 'Vue urbaine sur le Yangtsé',
      },
    ],
    activities: [
      { id: 'act-d10-1', name: 'Station Liziba', type: 'visit', duration: 30, notes: 'Le train traverse littéralement un immeuble résidentiel.' },
      { id: 'act-d10-2', name: 'Ciqikou Ancient Town', type: 'visit', duration: 120 },
      { id: 'act-d10-3', name: 'Hot pot traditionnel', type: 'food', duration: 120, budget: 20, priority: 'high', notes: 'Prévoir des vêtements légers : le hot pot est très épicé.' },
    ],
    transport: { type: 'plane', from: 'Chongqing', to: 'Zhangjiajie' },
  },

  {
    date: '2026-05-20',
    dayNumber: 11,
    city: 'Zhangjiajie',
    title: 'Montagnes Avatar',
    coordinates: [29.1171, 110.4792],
    dayType: 'nature',
    walkingDistance: '13 km',
    highlights: ['Zhangjiajie National Forest Park', 'Paysages karstiques'],
    tips: ['Arriver tôt pour la lumière du matin'],
    notes: 'Les piliers rocheux ont inspiré les montagnes du film Avatar.',
    images: [
      {
        url: 'https://images.pexels.com/photos/6139686/pexels-photo-6139686.jpeg',
        caption: 'Paysages spectaculaires de Zhangjiajie',
      },
      {
        url: 'https://images.pexels.com/photos/6139687/pexels-photo-6139687.jpeg',
        caption: 'Falaises et forêts verdoyantes',
      },
      {
        url: 'https://images.pexels.com/photos/34683512/pexels-photo-34683512.jpeg',
        caption: 'Vallées profondes du parc national',
      },
      {
        url: 'https://images.pexels.com/photos/21897331/pexels-photo-21897331.jpeg',
        caption: 'Panorama des montagnes brumeuses',
      },
      {
        url: 'https://images.pexels.com/photos/733174/pexels-photo-733174.jpeg',
        caption: 'Sentiers de randonnée à Zhangjiajie',
      },
    ],
    accommodation: {
      name: 'Hebergement reserve (anonymise)',
      address: 'Adresse privee masquee',
      bookingUrl: 'https://example.com/reservation-anonymisee',
      checkIn: '2026-05-20',
      checkOut: '2026-05-23',
    },
    activities: [
      {
        id: 'act-d11-1',
        name: 'Parc national Zhangjiajie',
        type: 'visit',
        duration: 240,
        priority: 'high',
        preRequisites: ['Pass 3 jours recommandé', 'Bonne condition physique'],
        budget: 30,
        notes: "Ticket valable plusieurs jours. Penser à prendre de l'eau et des snacks.",
      },
      { id: 'act-d11-2', name: 'Bailong Elevator', type: 'experience', duration: 30, notes: "L'ascenseur le plus haut du monde (335m) creusé dans la falaise." },
      { id: 'act-d11-3', name: 'Points de vue Avatar', type: 'visit', duration: 120, priority: 'high' },
    ],
  },

  {
    date: '2026-05-21',
    dayNumber: 12,
    city: 'Zhangjiajie',
    title: 'Mont Tianzi',
    coordinates: [29.1171, 110.4792],
    dayType: 'nature',
    walkingDistance: '12 km',
    highlights: ['Panoramas karstiques', 'Plateaux rocheux'],
    tips: ['Le téléphérique offre une vue incroyable'],
    notes: 'Zone panoramique idéale pour photos et randonnées.',
    images: [
      {
        url: 'https://images.pexels.com/photos/8138726/pexels-photo-8138726.jpeg',
        caption: 'Mont Tianzi, vue aérienne',
      },
      {
        url: 'https://images.pexels.com/photos/34683512/pexels-photo-34683512.jpeg',
        caption: 'Falaises enveloppées de brume',
      },
      {
        url: 'https://images.pexels.com/photos/6139686/pexels-photo-6139686.jpeg',
        caption: 'Panorama montagneux spectaculaire',
      },
      {
        url: 'https://images.pexels.com/photos/6139687/pexels-photo-6139687.jpeg',
        caption: 'Vallée et pics rocheux',
      },
      {
        url: 'https://images.pexels.com/photos/4621011/pexels-photo-4621011.jpeg',
        caption: 'Forêt dense et sommets',
      },
    ],
    activities: [
      { id: 'act-d12-1', name: 'Tianzi Mountain', type: 'visit', duration: 180, priority: 'high' },
      { id: 'act-d12-2', name: 'Téléphérique', type: 'experience', duration: 30 },
      { id: 'act-d12-3', name: 'Randonnée vallée', type: 'experience', duration: 120, preRequisites: ['Chaussures de randonnée'] },
    ],
  },

  {
    date: '2026-05-22',
    dayNumber: 13,
    city: 'Zhangjiajie',
    title: 'Mont Tianmen',
    coordinates: [29.1171, 110.4792],
    dayType: 'adventure',
    walkingDistance: '8 km',
    highlights: ["Heaven's Gate", 'Skywalk en verre'],
    tips: ['La route panoramique est impressionnante'],
    notes: 'Téléphérique spectaculaire et passerelle suspendue.',
    images: [
      {
        url: 'https://images.pexels.com/photos/29073778/pexels-photo-29073778.jpeg',
        caption: 'Mont Tianmen et Heaven’s Gate',
      },
      {
        url: 'https://images.pexels.com/photos/33231949/pexels-photo-33231949.jpeg',
        caption: 'Passerelle en verre dans la falaise',
      },
      {
        url: 'https://images.pexels.com/photos/33231950/pexels-photo-33231950.jpeg',
        caption: 'Vue panoramique du parc Tianmen',
      },
      {
        url: 'https://images.pexels.com/photos/33231951/pexels-photo-33231951.jpeg',
        caption: 'Escalier en lacets vers Heaven’s Gate',
      },
      {
        url: 'https://images.pexels.com/photos/34902901/pexels-photo-34902901.jpeg',
        caption: 'Paysage de montagne brumeux',
      },
    ],
    activities: [
      { id: 'act-d13-1', name: 'Téléphérique Tianmen', type: 'experience', duration: 30, notes: 'Le téléphérique le plus long du monde (7453m).' },
      { id: 'act-d13-2', name: 'Glass skywalk', type: 'experience', duration: 60, priority: 'high', notes: 'Passerelle en verre à flanc de falaise, sensations fortes garanties.' },
      { id: 'act-d13-3', name: "Heaven's Gate stairs", type: 'visit', duration: 60, notes: '999 marches symbolisant le paradis dans la culture chinoise.' },
    ],
    transport: { type: 'plane', from: 'Zhangjiajie', to: 'Shanghai' },
  },

  {
    date: '2026-05-23',
    dayNumber: 14,
    city: 'Shanghai',
    title: 'Retour à Shanghai',
    coordinates: [31.2304, 121.4737],
    dayType: 'relax',
    walkingDistance: '7 km',
    highlights: ['Nanjing Road', 'Skyline Pudong'],
    tips: ['Profite des lumières de la ville le soir'],
    notes: 'Ambiance urbaine et commerciale détendue.',
    images: [
      {
        url: 'https://images.pexels.com/photos/745243/pexels-photo-745243.jpeg',
        caption: 'Skyline de Shanghai la nuit',
      },
      {
        url: 'https://images.pexels.com/photos/19885/pexels-photo.jpg',
        caption: 'Nanjing Road illuminée',
      },
      {
        url: 'https://images.pexels.com/photos/4441989/pexels-photo-4441989.jpeg',
        caption: 'Quartier commerçant animé',
      },
      {
        url: 'https://images.pexels.com/photos/687453/pexels-photo-687453.jpeg',
        caption: 'Pont illuminé sur la rivière Huangpu',
      },
      {
        url: 'https://images.pexels.com/photos/625645/pexels-photo-625645.jpeg',
        caption: 'Magasins et boutiques de luxe',
      },
    ],
    accommodation: {
      name: 'Hebergement reserve (anonymise)',
      address: 'Adresse privee masquee',
      bookingUrl: 'https://example.com/reservation-anonymisee',
      checkIn: '2026-05-23',
      checkOut: '2026-05-25',
    },
    activities: [
      { id: 'act-d14-1', name: 'Nanjing Road', type: 'shopping', duration: 120 },
      { id: 'act-d14-2', name: 'Skyline night photos', type: 'experience', duration: 60, timeWindow: { start: '20:00', end: '22:00' }, priority: 'high' },
    ],
  },

  {
    date: '2026-05-24',
    dayNumber: 15,
    city: 'Shanghai',
    title: 'Shanghai futuriste',
    coordinates: [31.2304, 121.4737],
    dayType: 'exploration',
    walkingDistance: '9 km',
    highlights: [
      'Shanghai Tower',
      'Quartier Lujiazui',
      'Vue panoramique de Pudong',
    ],
    tips: [
      'Aller au sommet de la Shanghai Tower au coucher du soleil pour les meilleures photos',
    ],
    notes: 'Quartier financier spectaculaire et moderne de Shanghai.',
    images: [
      {
        url: 'https://images.pexels.com/photos/354941/pexels-photo-354941.jpeg',
        caption: 'Shanghai Tower vue extérieure',
      },
      {
        url: 'https://images.pexels.com/photos/683419/pexels-photo-683419.jpeg',
        caption: 'Skyscrapers Lujiazui',
      },
      {
        url: 'https://images.pexels.com/photos/635261/pexels-photo-635261.jpeg',
        caption: 'Vue panoramique du quartier financier',
      },
      {
        url: 'https://images.pexels.com/photos/417289/pexels-photo-417289.jpeg',
        caption: 'Pont sur la rivière Huangpu',
      },
      {
        url: 'https://images.pexels.com/photos/4139312/pexels-photo-4139312.jpeg',
        caption: 'Illuminations nocturnes sur Pudong',
      },
    ],
    activities: [
      {
        id: 'act-d15-1',
        name: 'Shanghai Tower observatory',
        type: 'visit',
        duration: 120,
        priority: 'high',
        timeWindow: { start: '16:00', end: '20:00' },
        budget: 20,
        link: 'https://www.shanghaitower.com.cn/',
        notes: 'Aller au coucher du soleil pour les meilleures photos.',
      },
      { id: 'act-d15-2', name: 'Lujiazui district walk', type: 'visit', duration: 90 },
      { id: 'act-d15-3', name: 'Aquarium Shanghai', type: 'visit', duration: 60, budget: 18 },
    ],
    transport: { type: 'plane', from: 'Shanghai', to: 'Taipei' },
  },

  {
    date: '2026-05-25',
    dayNumber: 16,
    city: 'Taipei',
    title: 'Marché de nuit',
    coordinates: [25.033, 121.5654],
    dayType: 'arrival',
    walkingDistance: '6 km',
    highlights: [
      'Shilin Night Market',
      'Street food taïwanaise',
      'Ambiance nocturne animée',
    ],
    tips: ['Tester le bubble tea et les dumplings locaux'],
    notes: 'Un des marchés nocturnes les plus célèbres de Taipei.',
    images: [
      {
        url: 'https://images.pexels.com/photos/704379/pexels-photo-704379.jpeg',
        caption: 'Marché de nuit animé',
      },
      {
        url: 'https://images.pexels.com/photos/1474157/pexels-photo-1474157.jpeg',
        caption: 'Dégustation street food',
      },
      {
        url: 'https://images.pexels.com/photos/2928796/pexels-photo-2928796.jpeg',
        caption: 'Rues bondées du marché',
      },
      {
        url: 'https://images.pexels.com/photos/1717859/pexels-photo-1717859.jpeg',
        caption: 'Étalages de nourriture',
      },
      {
        url: 'https://images.pexels.com/photos/2622171/pexels-photo-2622171.jpeg',
        caption: 'Ambiance nocturne de Taiwan',
      },
    ],
    activities: [{ id: 'act-d16-1', name: 'Shilin Night Market', type: 'food', duration: 120, priority: 'high', timeWindow: { start: '18:00', end: '23:00' }, notes: 'Tester le bubble tea et les dumplings locaux.' }],
  },

  {
    date: '2026-05-26',
    dayNumber: 17,
    city: 'Taipei',
    title: 'Taipei 101 et Elephant Mountain',
    coordinates: [25.033, 121.5654],
    dayType: 'exploration',
    walkingDistance: '10 km',
    highlights: ['Taipei 101', 'Elephant Mountain', 'Vue sur la ville'],
    tips: ['Monter avant le coucher du soleil pour des photos parfaites'],
    notes: 'Panorama incroyable sur Taipei depuis le sommet de la montagne.',
    images: [
      {
        url: 'https://images.pexels.com/photos/1717935/pexels-photo-1717935.jpeg',
        caption: 'Taipei 101 tower',
      },
      {
        url: 'https://images.pexels.com/photos/1717931/pexels-photo-1717931.jpeg',
        caption: 'Skyline de Taipei',
      },
      {
        url: 'https://images.pexels.com/photos/1717934/pexels-photo-1717934.jpeg',
        caption: 'Sentier vers Elephant Mountain',
      },
      {
        url: 'https://images.pexels.com/photos/981152/pexels-photo-981152.jpeg',
        caption: 'Vue panoramique sur la ville depuis la montagne',
      },
      {
        url: 'https://images.pexels.com/photos/1682852/pexels-photo-1682852.jpeg',
        caption: 'Coucher de soleil derrière Taipei 101',
      },
    ],
    activities: [
      {
        id: 'act-d17-1',
        name: 'Taipei 101 observatory',
        type: 'visit',
        duration: 120,
        priority: 'high',
        timeWindow: { start: '16:30', end: '20:00' },
        budget: 20,
        link: 'https://www.taipei-101.com.tw/',
        notes: 'Monter avant le coucher du soleil pour des photos parfaites.',
      },
      { id: 'act-d17-2', name: 'Elephant Mountain hike', type: 'experience', duration: 60, preRequisites: ['Chaussures confortables'] },
    ],
  },

  {
    date: '2026-05-27',
    dayNumber: 18,
    city: 'Taipei',
    title: 'Temples historiques et Dihua Street',
    coordinates: [25.033, 121.5654],
    dayType: 'culture',
    walkingDistance: '8 km',
    highlights: ['Temple Longshan', 'Vieille rue Dihua', 'Thé traditionnel'],
    tips: [
      'Excellent endroit pour acheter du thé taïwanais et souvenirs locaux',
    ],
    notes: 'Ambiance historique et traditionnelle.',
    images: [
      {
        url: 'https://images.pexels.com/photos/16648648/pexels-photo-16648648.jpeg',
        caption: 'Temple Longshan',
      },
      {
        url: 'https://images.pexels.com/photos/11997059/pexels-photo-11997059.jpeg',
        caption: 'Rue historique Dihua Street',
      },
      {
        url: 'https://images.pexels.com/photos/6110620/pexels-photo-6110620.jpeg',
        caption: 'Architecture traditionnelle',
      },
      {
        url: 'https://images.pexels.com/photos/28572036/pexels-photo-28572036.jpeg',
        caption: 'Boutiques et maisons traditionnelles',
      },
      {
        url: 'https://images.pexels.com/photos/33466337/pexels-photo-33466337.jpeg',
        caption: 'Ambiance temple et lanternes',
      },
    ],
    activities: [
      { id: 'act-d18-1', name: 'Temple Longshan', type: 'visit', duration: 60 },
      { id: 'act-d18-2', name: 'Dihua Street', type: 'visit', duration: 60, notes: 'Excellent endroit pour acheter du thé taïwanais et des souvenirs.' },
      { id: 'act-d18-3', name: 'Tea house traditionnel', type: 'food', duration: 60, budget: 15 },
    ],
    transport: { type: 'plane', from: 'Taipei', to: 'Shanghai' },
  },

  {
    date: '2026-05-28',
    dayNumber: 19,
    city: 'Shanghai',
    title: 'Dernier jour et départ',
    coordinates: [31.2304, 121.4737],
    dayType: 'departure',
    walkingDistance: '5 km',
    highlights: [
      'Derniers souvenirs',
      'Skyline finale',
      "Transfert vers l'aéroport",
    ],
    tips: ['Prévoir marge de temps pour le transfert aéroport'],
    notes: 'Fin du voyage avec derniers moments à Shanghai.',
    images: [
      {
        url: 'https://images.pexels.com/photos/650231/pexels-photo-650231.jpeg',
        caption: 'Avion décollant au coucher du soleil',
      },
      {
        url: 'https://images.pexels.com/photos/683940/pexels-photo-683940.jpeg',
        caption: 'Skyline Shanghai au lever du soleil',
      },
      {
        url: 'https://images.pexels.com/photos/745243/pexels-photo-745243.jpeg',
        caption: 'Aéroport moderne pour départ',
      },
      {
        url: 'https://images.pexels.com/photos/687450/pexels-photo-687450.jpeg',
        caption: 'Derniers achats souvenirs',
      },
      {
        url: 'https://images.pexels.com/photos/169647/pexels-photo-169647.jpeg',
        caption: 'Dernier brunch avant le vol',
      },
    ],
    accommodation: {
      name: 'Hebergement reserve (anonymise)',
      address: 'Adresse privee masquee',
      bookingUrl: 'https://example.com/reservation-anonymisee',
      checkIn: '2026-05-28',
      checkOut: '2026-05-29',
    },
    activities: [
      { id: 'act-d19-1', name: 'Brunch', type: 'food', duration: 60 },
      { id: 'act-d19-2', name: 'Derniers achats', type: 'shopping', duration: 60 },
      { id: 'act-d19-3', name: 'Aéroport', type: 'transport', duration: 120, notes: 'Prévoir une large marge de temps pour les contrôles.' },
    ],
  },
]

export function getCurrentDayIndex(): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i < itinerary.length; i++) {
    const dayDate = new Date(itinerary[i].date)
    dayDate.setHours(0, 0, 0, 0)

    if (dayDate.getTime() === today.getTime()) {
      return i
    }
  }

  // If before trip, return first day
  if (today < tripStartDate) return 0
  // If after trip, return last day
  if (today > tripEndDate) return itinerary.length - 1

  return 0
}

export function formatDate(
  dateString: string,
  locale: string = 'fr-FR',
): string {
  const date = new Date(dateString)
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function getDayStatus(dayDate: string): 'past' | 'current' | 'future' {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(dayDate)
  date.setHours(0, 0, 0, 0)

  if (date < today) return 'past'
  if (date.getTime() === today.getTime()) return 'current'
  return 'future'
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

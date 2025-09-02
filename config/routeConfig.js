// config/routeConfig.js

export const ROUTE_TEMPLATES = [
  {
    fromCityName: 'Abidjan',
    toCityName: 'Bouaké',
    schedules: [
      { departureTime: '06:00', arrivalTime: '10:30', duration: '4h 30min' },
      { departureTime: '09:00', arrivalTime: '13:30', duration: '4h 30min' },
      { departureTime: '14:00', arrivalTime: '18:30', duration: '4h 30min' },
      { departureTime: '18:00', arrivalTime: '22:30', duration: '4h 30min' }
    ],
    basePrice: 6500,
    stops: ['Yamoussoukro'],
    amenities: ['Air conditionné', 'WiFi', 'Chargeur USB'],
    features: ['Sièges inclinables', 'Climatisation'],
    isPopularRoute: true
  },
  {
    fromCityName: 'Abidjan',
    toCityName: 'Yamoussoukro',
    schedules: [
      { departureTime: '07:00', arrivalTime: '09:30', duration: '2h 30min' },
      { departureTime: '11:00', arrivalTime: '13:30', duration: '2h 30min' },
      { departureTime: '15:00', arrivalTime: '17:30', duration: '2h 30min' },
      { departureTime: '19:00', arrivalTime: '21:30', duration: '2h 30min' }
    ],
    basePrice: 5000,
    stops: [],
    amenities: ['Air conditionné', 'WiFi'],
    features: ['Sièges confortables'],
    isPopularRoute: false
  },
  {
    fromCityName: 'Bouaké',
    toCityName: 'Korhogo',
    schedules: [
      { departureTime: '08:00', arrivalTime: '12:00', duration: '4h' },
      { departureTime: '16:00', arrivalTime: '20:00', duration: '4h' }
    ],
    basePrice: 9000,
    stops: ['Katiola'],
    amenities: ['Air conditionné'],
    features: ['Sièges standard'],
    isPopularRoute: false
  },
  {
    fromCityName: 'Abidjan',
    toCityName: 'San-Pédro',
    schedules: [
      { departureTime: '08:00', arrivalTime: '12:30', duration: '4h 30min' },
      { departureTime: '15:00', arrivalTime: '19:30', duration: '4h 30min' }
    ],
    basePrice: 6500,
    stops: ['Sassandra'],
    amenities: ['Air conditionné', 'Toilettes', 'WiFi'],
    features: ['Sièges inclinables', 'Climatisation'],
    isPopularRoute: true
  }
];

export const CRON_CONFIG = {
  // Génération quotidienne des trajets
  DAILY_GENERATION: {
    schedule: '0 2 * * *', // 2h du matin
    timezone: 'Africa/Abidjan',
    daysAhead: 7,
    description: 'Génération quotidienne des trajets'
  },
  
  // Nettoyage des anciens trajets
  CLEANUP: {
    schedule: '0 0 * * *', // Minuit
    timezone: 'Africa/Abidjan',
    description: 'Nettoyage des trajets expirés'
  },
  
  // Mise à jour des sièges disponibles (simulation de nouvelles réservations)
  SEAT_UPDATE: {
    schedule: '0 */2 * * *', // Toutes les 2 heures
    timezone: 'Africa/Abidjan',
    description: 'Mise à jour des sièges disponibles'
  }
};

export const PRICING_CONFIG = {
  COMPANY_VARIATION: 0.1, // 10% de variation entre compagnies
  TIME_MULTIPLIER: {
    PEAK_HOURS: 1.1, // Majoration pour heures de pointe
    NORMAL_HOURS: 1.0
  },
  RANDOM_VARIATION: 0.2, // ±20% de variation aléatoire
  WEEKEND_MULTIPLIER: 1.15 // Majoration week-end
};

export const SEAT_CONFIG = {
  MAX_RESERVED_PERCENTAGE: 0.3, // Maximum 30% de sièges pré-réservés
  MIN_AVAILABLE_SEATS: 5 // Minimum de sièges disponibles par trajet
};
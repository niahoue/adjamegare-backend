import cron from 'node-cron';
import Route from '../models/Route.js';
import Bus from '../models/Bus.js';
import Company from '../models/Company.js';
import City from '../models/City.js';
import moment from 'moment';

// Configuration des trajets de base (templates)
const routeTemplates = [
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
    stops: ['Attiguié','Ellibou', 'bodo','Nzianouan','Zingrobo','Pakobo','Toumodi','Yamoussoukro'],
    amenities: ['Air conditionné', 'WiFi', 'Chargeur USB'],
    features: ['Sièges inclinables', 'Climatisation']
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
    features: ['Sièges confortables']
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
    features: ['Sièges standard']
  }
];

class RouteGenerator {
  constructor() {
    this.cities = new Map();
    this.companies = [];
    this.buses = [];
  }

  async initialize() {
    try {
      // Charger les données de base
      const cities = await City.find({});
      cities.forEach(city => {
        this.cities.set(city.name, city._id);
      });

      this.companies = await Company.find({});
      this.buses = await Bus.find({});

      console.log(`✅ Données chargées: ${cities.length} villes, ${this.companies.length} compagnies, ${this.buses.length} bus`);
    } catch (error) {
      console.error('❌ Erreur lors du chargement des données:', error);
      throw error;
    }
  }

  
// Génère des variations de prix selon la compagnie (prix fixes par compagnie)
calculateDynamicPrice(basePrice, companyIndex, scheduleIndex) {
  // Définir des variations fixes par compagnie (0, 500, ou -500 FCFA)
  const companyPriceVariations = [
    0,    // Compagnie 0: prix de base
    500,  // Compagnie 1: +500 FCFA
    0,    // Compagnie 2: prix de base
    -500, // Compagnie 3: -500 FCFA
    500,  // Compagnie 4: +500 FCFA
    0,    // Compagnie 5: prix de base
  ];
  
  // Utiliser l'index de la compagnie pour déterminer la variation
  // Si on a plus de compagnies que de variations définies, on cycle
  const variationIndex = companyIndex % companyPriceVariations.length;
  const priceVariation = companyPriceVariations[variationIndex];
  
  const finalPrice = basePrice + priceVariation;
  return Math.max(finalPrice, basePrice * 0.8); 
}

  // Calcule le nombre de sièges disponibles (simulation de réservations existantes)
  calculateAvailableSeats(totalSeats) {
    const reservedSeats = Math.floor(Math.random() * (totalSeats * 0.3)); // Max 30% déjà réservés
    return totalSeats - reservedSeats;
  }

  async generateDailyRoutes(targetDate) {
    const startTime = Date.now();
    let generatedCount = 0;
    
    try {
      console.log(`🚀 Génération des trajets pour ${targetDate.format('DD/MM/YYYY')}...`);

      // Supprimer les anciens trajets pour cette date (optionnel)
      await Route.deleteMany({
        departureDate: {
          $gte: targetDate.startOf('day').toDate(),
          $lt: targetDate.clone().add(1, 'day').startOf('day').toDate()
        }
      });

      for (const template of routeTemplates) {
        const fromCityId = this.cities.get(template.fromCityName);
        const toCityId = this.cities.get(template.toCityName);

        if (!fromCityId || !toCityId) {
          console.warn(`⚠️ Ville non trouvée: ${template.fromCityName} -> ${template.toCityName}`);
          continue;
        }

        // Générer des trajets pour chaque compagnie
        for (let companyIndex = 0; companyIndex < this.companies.length; companyIndex++) {
          const company = this.companies[companyIndex];
          
          // Générer des trajets pour chaque horaire
          for (let scheduleIndex = 0; scheduleIndex < template.schedules.length; scheduleIndex++) {
            const schedule = template.schedules[scheduleIndex];
            
            // Sélectionner un bus aléatoire pour cette compagnie
            const availableBuses = this.buses.filter(bus => bus.totalSeats > 0);
            if (availableBuses.length === 0) continue;
            
            const selectedBus = availableBuses[Math.floor(Math.random() * availableBuses.length)];
            
            const route = new Route({
              from: fromCityId,
              to: toCityId,
              departureDate: targetDate.toDate(),
              departureTime: schedule.departureTime,
              arrivalTime: schedule.arrivalTime,
              duration: schedule.duration,
              stops: template.stops,
              price: this.calculateDynamicPrice(template.basePrice, companyIndex, scheduleIndex),
              availableSeats: this.calculateAvailableSeats(selectedBus.totalSeats),
              amenities: template.amenities,
              features: template.features,
              companyName: company._id,
              bus: selectedBus._id,
              popular: Math.random() > 0.8 // 20% de chance d'être marqué comme populaire
            });

            await route.save();
            generatedCount++;
          }
        }

        // Générer aussi le trajet retour
        const returnFromCityId = toCityId;
        const returnToCityId = fromCityId;

        for (let companyIndex = 0; companyIndex < this.companies.length; companyIndex++) {
          const company = this.companies[companyIndex];
          
          for (let scheduleIndex = 0; scheduleIndex < template.schedules.length; scheduleIndex++) {
            const schedule = template.schedules[scheduleIndex];
            const selectedBus = this.buses[Math.floor(Math.random() * this.buses.length)];
            
            const returnRoute = new Route({
              from: returnFromCityId,
              to: returnToCityId,
              departureDate: targetDate.toDate(),
              departureTime: schedule.departureTime,
              arrivalTime: schedule.arrivalTime,
              duration: schedule.duration,
              stops: [...template.stops].reverse(),
              price: this.calculateDynamicPrice(template.basePrice, companyIndex, scheduleIndex),
              availableSeats: this.calculateAvailableSeats(selectedBus.totalSeats),
              amenities: template.amenities,
              features: template.features,
              companyName: company._id,
              bus: selectedBus._id,
              popular: Math.random() > 0.8
            });

            await returnRoute.save();
            generatedCount++;
          }
        }
      }

      const duration = Date.now() - startTime;
      console.log(`✅ ${generatedCount} trajets générés pour ${targetDate.format('DD/MM/YYYY')} en ${duration}ms`);
      
      return { success: true, count: generatedCount, duration };
    } catch (error) {
      console.error(`❌ Erreur lors de la génération des trajets pour ${targetDate.format('DD/MM/YYYY')}:`, error);
      return { success: false, error: error.message };
    }
  }

  async generateRoutes(daysAhead = 7) {
    await this.initialize();
    
    const results = [];
    
    for (let i = 0; i <= daysAhead; i++) {
      const targetDate = moment().add(i, 'days');
      const result = await this.generateDailyRoutes(targetDate);
      results.push({ date: targetDate.format('YYYY-MM-DD'), ...result });
    }
    
    return results;
  }

  // Nettoyer les anciens trajets (trajets passés)
  async cleanupOldRoutes() {
    try {
      const yesterday = moment().subtract(1, 'day').endOf('day').toDate();
      const result = await Route.deleteMany({
        departureDate: { $lt: yesterday }
      });
      
      console.log(`🧹 ${result.deletedCount} anciens trajets supprimés`);
      return result.deletedCount;
    } catch (error) {
      console.error('❌ Erreur lors du nettoyage:', error);
      return 0;
    }
  }
}

// Instance globale du générateur
const routeGenerator = new RouteGenerator();

// Cron job pour générer les trajets quotidiennement à 2h du matin
const dailyRouteGeneration = cron.schedule('0 2 * * *', async () => {
  console.log('🕐 Démarrage de la génération quotidienne des trajets...');
  
  try {
    // Générer les trajets pour les 7 prochains jours
    const results = await routeGenerator.generateRoutes(7);
    
    const successCount = results.filter(r => r.success).length;
    const totalRoutes = results.reduce((sum, r) => sum + (r.count || 0), 0);
    
    console.log(`📊 Résumé: ${successCount}/${results.length} jours traités avec succès`);
    console.log(`📈 Total: ${totalRoutes} trajets générés`);
    
    // Nettoyer les anciens trajets
    await routeGenerator.cleanupOldRoutes();
    
  } catch (error) {
    console.error('❌ Erreur dans le cron job:', error);
  }
}, {
  scheduled: false, // Ne démarre pas automatiquement
  timezone: "Africa/Abidjan" // Fuseau horaire de la Côte d'Ivoire
});

// Cron job pour nettoyer les anciens trajets à minuit
const cleanupCron = cron.schedule('0 0 * * *', async () => {
  console.log('🧹 Nettoyage programmé des anciens trajets...');
  await routeGenerator.cleanupOldRoutes();
}, {
  scheduled: false,
  timezone: "Africa/Abidjan"
});

// Fonction pour démarrer tous les cron jobs
export const startCronJobs = () => {
  console.log('⏰ Démarrage des tâches planifiées...');
  dailyRouteGeneration.start();
  cleanupCron.start();
  console.log('✅ Cron jobs démarrés avec succès');
};

// Fonction pour arrêter tous les cron jobs
export const stopCronJobs = () => {
  dailyRouteGeneration.stop();
  cleanupCron.stop();
  console.log('⏹️ Cron jobs arrêtés');
};

// Fonction pour générer manuellement les trajets (utile pour les tests)
export const generateRoutesManually = async (daysAhead = 7) => {
  console.log('🔧 Génération manuelle des trajets...');
  return await routeGenerator.generateRoutes(daysAhead);
};

// Fonction pour nettoyer manuellement
export const cleanupRoutesManually = async () => {
  console.log('🔧 Nettoyage manuel des trajets...');
  return await routeGenerator.cleanupOldRoutes();
};

// Fonction pour obtenir le statut des cron jobs
export const getCronStatus = () => {
  return {
    dailyGeneration: {
      running: dailyRouteGeneration.running,
      schedule: '0 2 * * *', // Tous les jours à 2h du matin
      description: 'Génération quotidienne des trajets'
    },
    cleanup: {
      running: cleanupCron.running,
      schedule: '0 0 * * *', // Tous les jours à minuit
      description: 'Nettoyage des anciens trajets'
    }
  };
};

export default {
  startCronJobs,
  stopCronJobs,
  generateRoutesManually,
  cleanupRoutesManually,
  getCronStatus
};
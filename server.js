// server.js - Version finale adaptée à votre structure
import app from './app.js';
import connectDB from './config/db.js';
import { startCronJobs, generateRoutesManually, getCronStatus, cleanupRoutesManually } from './cron/RouteGenerator.js';
import Route from './models/Route.js';
import moment from 'moment';

const PORT = process.env.PORT || 5000;

// Fonction pour initialiser les trajets si nécessaire
const initializeRoutes = async () => {
  try {
    const today = moment().startOf('day').toDate();
    const tomorrow = moment().add(1, 'day').startOf('day').toDate();
    
    const existingRoutes = await Route.countDocuments({
      departureDate: {
        $gte: today,
        $lt: tomorrow
      }
    });
    
    if (existingRoutes === 0) {
      
      const results = await generateRoutesManually(7);
      
      const successCount = results.filter(r => r.success).length;
      const totalRoutes = results.reduce((sum, r) => sum + (r.count || 0), 0);
    } else {
      console.log(`✅ ${existingRoutes} trajets trouvés pour aujourd'hui`);
    }
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation des trajets:', error);
    // Ne pas arrêter le serveur si la génération échoue
    console.log('⚠️ Le serveur démarre sans trajets initialisés');
  }
};
// Fonction de pré-chargement du cache
const preCache = async () => {
  console.log("Pre-chargement du cache des routes populaires...");
  try {
    // Appelle la logique de votre contrôleur ou réimplémentez la ici
    const popularRoutes = await Route.find({ popular: true })
      .populate("from", "name country")
      .populate("to", "name country")
      .lean();
      
    const result = { success: true, data: popularRoutes };
    await redis.set("routes:popular", JSON.stringify(result), "EX", 1800);
    
    console.log("✅ Cache des routes populaires pré-chargé.");
  } catch (error) {
    console.error("❌ Erreur lors du pré-chargement du cache:", error);
  }
};
// Démarrage du serveur
connectDB()
  .then(async () => {
    console.log('✅ Base de données connectée');
    await initializeRoutes();
    await preCache();
    try {
      startCronJobs();
    } catch (error) {
      console.error('⚠️ Erreur lors du démarrage des cron jobs:', error);
    }
    
    // Démarrer le serveur
    app.listen(PORT, () => {
      console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
      console.log(`📊 API Admin disponible sur:`);
      console.log(`   • Status cron: http://localhost:${PORT}/api/admin/cron/status`);
      console.log(`   • Génération manuelle: POST http://localhost:${PORT}/api/admin/routes/generate`);
      console.log(`   • Nettoyage manuel: POST http://localhost:${PORT}/api/admin/routes/cleanup`);
    });
  })
  .catch(err => {
    console.error('❌ Erreur de connexion à la base de données:', err);
    process.exit(1);
  });

// Gestion propre de l'arrêt du serveur
process.on('SIGTERM', () => {
  console.log('🛑 Arrêt du serveur (SIGTERM)...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Arrêt du serveur (Ctrl+C)...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Exception non gérée:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Promesse rejetée non gérée:', reason);
  process.exit(1);
});
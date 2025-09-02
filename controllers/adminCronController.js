// src/controllers/cronAdminController.js
import { getCronStatus, generateRoutesManually, cleanupRoutesManually } from '../cron/RouteGenerator.js';
import Route from '../models/Route.js';
import City from '../models/City.js';
import Company from '../models/Company.js';
import Bus from '../models/Bus.js';
import moment from 'moment';

// 📌 Obtenir le statut des cron jobs
export const getsCronStatus = async (req, res) => {
  try {
    const cronStatus = getCronStatus();

    const today = moment().startOf('day').toDate();
    const tomorrow = moment().add(1, 'day').startOf('day').toDate();
    const nextWeek = moment().add(7, 'days').startOf('day').toDate();

    const [todayRoutes, weekRoutes, totalRoutes, cities, companies, buses] = await Promise.all([
      Route.countDocuments({ departureDate: { $gte: today, $lt: tomorrow } }),
      Route.countDocuments({ departureDate: { $gte: today, $lt: nextWeek } }),
      Route.countDocuments(),
      City.countDocuments(),
      Company.countDocuments(),
      Bus.countDocuments()
    ]);

    res.json({
      success: true,
      cronJobs: cronStatus,
      statistics: {
        routes: { today: todayRoutes, nextWeek: weekRoutes, total: totalRoutes },
        data: { cities, companies, buses }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération du statut', error: error.message });
  }
};

// 📌 Générer des trajets manuellement
export const generateRoutes = async (req, res) => {
  try {
    const { daysAhead = 7 } = req.body;
    if (!Number.isInteger(daysAhead) || daysAhead < 1 || daysAhead > 30) {
      return res.status(400).json({ success: false, message: 'Le nombre de jours doit être un entier entre 1 et 30' });
    }

    console.log(`🔧 Génération manuelle demandée pour ${daysAhead} jours`);

    const startTime = Date.now();
    const results = await generateRoutesManually(daysAhead);
    const duration = Date.now() - startTime;

    const successCount = results.filter(r => r.success).length;
    const totalRoutes = results.reduce((sum, r) => sum + (r.count || 0), 0);
    const errorResults = results.filter(r => !r.success);

    res.json({
      success: true,
      message: `Trajets générés avec succès pour ${successCount}/${results.length} jours`,
      data: {
        totalRoutes,
        successCount,
        failedCount: errorResults.length,
        duration: `${duration}ms`,
        results,
        errors: errorResults.length > 0 ? errorResults : undefined
      }
    });
  } catch (error) {
    console.error('❌ Erreur génération manuelle:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la génération', error: error.message });
  }
};

// 📌 Nettoyer les trajets expirés
export const cleanupRoutes = async (req, res) => {
  try {
    console.log('🧹 Nettoyage manuel des trajets expirés');
    const startTime = Date.now();
    const deletedCount = await cleanupRoutesManually();
    const duration = Date.now() - startTime;

    res.json({ success: true, message: `${deletedCount} trajets expirés supprimés`, data: { deletedCount, duration: `${duration}ms` } });
  } catch (error) {
    console.error('❌ Erreur nettoyage manuel:', error);
    res.status(500).json({ success: false, message: 'Erreur lors du nettoyage', error: error.message });
  }
};

// 📌 Statistiques détaillées
export const getRoutesStats = async (req, res) => {
  try {
    const today = moment().startOf('day');
    const stats = [];

    for (let i = 0; i < 7; i++) {
      const date = today.clone().add(i, 'days');
      const count = await Route.countDocuments({ departureDate: { $gte: date.toDate(), $lt: date.clone().add(1, 'day').toDate() } });
      stats.push({ date: date.format('YYYY-MM-DD'), dayName: date.format('dddd'), routeCount: count });
    }

    const companiesStats = await Route.aggregate([
      { $match: { departureDate: { $gte: today.toDate() } } },
      { $lookup: { from: 'companies', localField: 'companyName', foreignField: '_id', as: 'company' } },
      { $unwind: '$company' },
      { $group: { _id: '$company.name', routeCount: { $sum: 1 }, totalSeats: { $sum: '$availableSeats' } } },
      { $sort: { routeCount: -1 } }
    ]);

    const popularRoutes = await Route.aggregate([
      { $match: { departureDate: { $gte: today.toDate() } } },
      { $lookup: { from: 'cities', localField: 'from', foreignField: '_id', as: 'fromCity' } },
      { $lookup: { from: 'cities', localField: 'to', foreignField: '_id', as: 'toCity' } },
      { $unwind: '$fromCity' },
      { $unwind: '$toCity' },
      { $group: { _id: { from: '$fromCity.name', to: '$toCity.name' }, routeCount: { $sum: 1 }, averagePrice: { $avg: '$price' } } },
      { $sort: { routeCount: -1 } },
      { $limit: 10 }
    ]);

    res.json({ success: true, data: { dailyStats: stats, companiesStats, popularRoutes, generatedAt: new Date().toISOString() } });
  } catch (error) {
    console.error('❌ Erreur statistiques:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des statistiques', error: error.message });
  }
};

// 📌 Supprimer tous les trajets futurs
export const clearAllRoutes = async (req, res) => {
  try {
    const { confirm } = req.body;
    if (confirm !== 'DELETE_ALL_ROUTES') {
      return res.status(400).json({ success: false, message: 'Confirmation requise. Envoyez { "confirm": "DELETE_ALL_ROUTES" }' });
    }

    const today = moment().startOf('day').toDate();
    const result = await Route.deleteMany({ departureDate: { $gte: today } });

    console.log(`🗑️ ${result.deletedCount} trajets futurs supprimés`);
    res.json({ success: true, message: `${result.deletedCount} trajets futurs supprimés`, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('❌ Erreur suppression totale:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression', error: error.message });
  }
};

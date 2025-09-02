// src/controllers/adminRouteController.js
import asyncHandler from 'express-async-handler';
import Route from '../models/Route.js';
import Bus from '../models/Bus.js';
import User from '../models/User.js';
import Booking from '../models/Booking.js';
import City from '../models/City.js'; 
import Company from '../models/Company.js'; 
import redis from '../config/redisClient.js';

// Helper pour supprimer un pattern de clés Redis
const clearCache = async () => {
  const keys = await redis.keys("cities:*");
  if (keys.length) await redis.del(keys);

  const routeKeys = await redis.keys("routes:*");
  if (routeKeys.length) await redis.del(routeKeys);

  const searchKeys = await redis.keys("search:*");
  if (searchKeys.length) await redis.del(searchKeys);
};


/**
 * @desc    Créer une nouvelle route
 * @route   POST /api/admin/routes
 * @access  Private/Admin
 */
export const createRoute = asyncHandler(async (req, res) => {
  const {
    from,
    to,
    departureDate,
    departureTime,
    arrivalTime,
    duration,
    stops,
    price,
    availableSeats,
    amenities,
    features,
    companyName,
    bus,
  } = req.body;

  if (
    !from || !to || !departureDate || !departureTime || !arrivalTime ||
    !duration || !price || !availableSeats || !companyName || !bus
  ) {
    res.status(400);
    throw new Error('Veuillez fournir toutes les informations requises pour la route.');
  }

  // Vérifications d’existence
  const existingBus = await Bus.findById(bus);
  if (!existingBus) throw new Error('Bus associé introuvable.');

  const existingCompany = await Company.findById(companyName);
  if (!existingCompany) throw new Error('Compagnie associée introuvable.');

  const fromCity = await City.findById(from);
  if (!fromCity) throw new Error('Ville de départ introuvable.');

  const toCity = await City.findById(to);
  if (!toCity) throw new Error('Ville d\'arrivée introuvable.');

  const route = await Route.create({
    from,
    to,
    departureDate,
    departureTime,
    arrivalTime,
    duration,
    stops,
    price,
    availableSeats,
    amenities: amenities || [],
    features: features || [],
    companyName,
    bus,
  });
  await clearCache();

  res.status(201).json({ success: true, data: route });
});

/**
 * @desc    Obtenir toutes les routes
 * @route   GET /api/admin/routes
 * @access  Private/Admin
 */
export const getAllRoutes = asyncHandler(async (req, res) => {
  const routes = await Route.find({})
    .populate('from', 'name country') // Peupler le nom et le pays de la ville de départ
    .populate('to', 'name country')   // Peupler le nom et le pays de la ville d'arrivée
    .populate('bus', 'name')          // Peupler le nom du bus
    .populate('companyName', 'name'); // Peupler le nom de la compagnie
  res.status(200).json({ success: true, data: routes });
});

/**
 * @desc    Obtenir une route par ID (admin)
 * @route   GET /api/admin/routes/:id
 * @access  Private/Admin
 */
export const getRouteByIdAdmin = asyncHandler(async (req, res) => {
  const route = await Route.findById(req.params.id)
    .populate('from', 'name country') // Peupler le nom et le pays de la ville de départ
    .populate('to', 'name country')   // Peupler le nom et le pays de la ville d'arrivée
    .populate('bus', 'name')          // Peupler le nom du bus
    .populate('companyName', 'name'); // Peupler le nom de la compagnie

  if (!route) {
    res.status(404);
    throw new Error('Route introuvable.');
  }
  res.status(200).json({ success: true, data: route });
});

/**
 * @desc    Mettre à jour une route
 * @route   PUT /api/admin/routes/:id
 * @access  Private/Admin
 */
export const updateRoute = asyncHandler(async (req, res) => {
  const {
    from,
    to,
    departureDate,
    departureTime,
    arrivalTime,
    duration,
    stops,
    price,
    availableSeats,
    amenities,
    features,
    companyName,
    bus,
  } = req.body;

  const route = await Route.findById(req.params.id);
  if (!route) {
    res.status(404);
    throw new Error('Route introuvable.');
  }

  // Vérifications similaires à createRoute
  if (bus && bus.toString() !== route.bus.toString()) {
    const existingBus = await Bus.findById(bus);
    if (!existingBus) throw new Error('Nouveau bus associé introuvable.');
  }
  if (companyName && companyName.toString() !== route.companyName.toString()) {
    const existingCompany = await Company.findById(companyName);
    if (!existingCompany) throw new Error('Nouvelle compagnie associée introuvable.');
  }
  if (from && from.toString() !== route.from.toString()) {
    const fromCity = await City.findById(from);
    if (!fromCity) throw new Error('Nouvelle ville de départ introuvable.');
  }
  if (to && to.toString() !== route.to.toString()) {
    const toCity = await City.findById(to);
    if (!toCity) throw new Error('Nouvelle ville d\'arrivée introuvable.');
  }

  // Mise à jour des champs
  route.from = from || route.from;
  route.to = to || route.to;
  route.departureDate = departureDate || route.departureDate;
  route.departureTime = departureTime || route.departureTime;
  route.arrivalTime = arrivalTime || route.arrivalTime;
  route.duration = duration || route.duration;
  route.stops = stops || route.stops;
  route.price = price || route.price;
  route.availableSeats = availableSeats !== undefined ? availableSeats : route.availableSeats;
  route.amenities = amenities || route.amenities;
  route.features = features || route.features;
  route.companyName = companyName || route.companyName;
  route.bus = bus || route.bus;

  const updatedRoute = await route.save();

  // ✅ Nettoyage du cache
  await clearCache();

  res.status(200).json({ success: true, data: updatedRoute });
});

/**
 * @desc    Supprimer une route
 * @route   DELETE /api/admin/routes/:id
 * @access  Private/Admin
 */
export const deleteRoute = asyncHandler(async (req, res) => {
  const route = await Route.findById(req.params.id);

  if (!route) {
    res.status(404);
    throw new Error('Route introuvable.');
  }

  await route.deleteOne();

  // ✅ Nettoyage du cache
  await clearCache();

  res.status(200).json({ success: true, message: 'Route supprimée avec succès.' });
});


// ==========================
// 📊 ENDPOINTS STATISTIQUES
// ==========================

/**
 * @desc    Compter les utilisateurs
 * @route   GET /api/admin/users/count
 * @access  Private/Admin
 */
export const getUsersCount = asyncHandler(async (req, res) => {
  try {
    const count = await User.countDocuments();
    res.json({ success: true, count });
  } catch (error) {
    console.error('Error counting users:', error);
    res.status(500).json({ success: false, message: 'Erreur lors du comptage des utilisateurs' });
  }
});

/**
 * @desc    Compter les routes
 * @route   GET /api/admin/routes/count
 * @access  Private/Admin
 */
export const getRoutesCount = asyncHandler(async (req, res) => {
  try {
    const count = await Route.countDocuments();
    res.json({ success: true, count });
  } catch (error) {
    console.error('Error counting routes:', error);
    res.status(500).json({ success: false, message: 'Erreur lors du comptage des routes' });
  }
});

/**
 * @desc    Compter les bus
 * @route   GET /api/admin/buses/count
 * @access  Private/Admin
 */
export const getBusesCount = asyncHandler(async (req, res) => {
  try {
    const count = await Bus.countDocuments();
    res.json({ success: true, count });
  } catch (error) {
    console.error('Error counting buses:', error);
    res.status(500).json({ success: false, message: 'Erreur lors du comptage des bus' });
  }
});

/**
 * @desc    Compter les réservations par statut
 * @route   GET /api/admin/bookings/counts
 * @access  Private/Admin
 */
export const getBookingCounts = asyncHandler(async (req, res) => {
  try {
    const total = await Booking.countDocuments();
    const pendingPayment = await Booking.countDocuments({ status: 'pending' });
    const confirmed = await Booking.countDocuments({ status: 'confirmed' });
    const cancelled = await Booking.countDocuments({ status: 'cancelled' });
    const completed = await Booking.countDocuments({ status: 'completed' });

    res.json({
      success: true,
      data: { total, pendingPayment, confirmed, cancelled, completed },
    });
  } catch (error) {
    console.error('Error counting bookings:', error);
    res.status(500).json({ success: false, message: 'Erreur lors du comptage des réservations' });
  }
});

/**
 * @desc    Revenu total
 * @route   GET /api/admin/revenue/total
 * @access  Private/Admin
 */
export const getTotalRevenue = asyncHandler(async (req, res) => {
  try {
    // Alternative approach using find and reduce for better error handling
    const confirmedBookings = await Booking.find({ status: 'confirmed' }).select('totalPrice');
    const totalRevenue = confirmedBookings.reduce((sum, booking) => {
      return sum + (booking.totalPrice || 0);
    }, 0);

    res.json({ success: true, totalRevenue });
  } catch (error) {
    console.error('Error calculating total revenue:', error);
    
    // Fallback: try with aggregation but with better error handling
    try {
      const result = await Booking.aggregate([
        { $match: { status: 'confirmed' } },
        { 
          $group: { 
            _id: 'total_revenue', // Use a string instead of null
            total: { $sum: '$totalPrice' } 
          } 
        },
      ]);

      const totalRevenue = result.length > 0 ? result[0].total : 0;
      res.json({ success: true, totalRevenue });
    } catch (aggregateError) {
      console.error('Error with aggregation fallback:', aggregateError);
      res.status(500).json({ success: false, message: 'Erreur lors du calcul du revenu total' });
    }
  }
});

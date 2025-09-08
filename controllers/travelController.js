// src/controllers/travelController.js
import asyncHandler from 'express-async-handler';
import Route from '../models/Route.js';
import Bus from '../models/Bus.js';
import Booking from '../models/Booking.js';
import Company from '../models/Company.js';
import City from '../models/City.js'; 
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { isValidObjectId } from 'mongoose';
import redis from '../config/redisClient.js';
import { memoryCache } from '../utils/memoryCache.js';
/**
 * @desc    Rechercher des trajets disponibles
 * @route   GET /api/travel/routes/search
 * @access  Public
 */
export const searchRoutes = asyncHandler(async (req, res) => {
  const { from, to, departureDate, returnDate, passengers, departureTime, companyName } = req.query;

  // Cache plus granulaire avec TTL différentiel
  const cacheKey = `search:${from}:${to}:${departureDate}:${returnDate || 'none'}:${passengers}:${departureTime || 'any'}:${companyName || 'any'}`;
  
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log("⚡ searchRoutes depuis Redis");
      return res.json(JSON.parse(cached));
    }
  } catch (redisError) {
    console.warn("Redis indisponible, continuant sans cache:", redisError.message);
  }

  if (!from || !to || !departureDate || !passengers) {
    return res.status(400).json({
      success: false,
      message: "Veuillez fournir les lieux de départ, d'arrivée, la date et le nombre de passagers."
    });
  }

  const depDate = new Date(departureDate);
  if (isNaN(depDate.getTime())) {
    return res.status(400).json({
      success: false,
      message: "Format de date de départ invalide."
    });
  }

  // Recherche parallèle des villes avec cache local
  const [fromCity, toCity] = await Promise.all([
    City.findOne({ name: new RegExp(from, "i") }, "_id name").lean(),
    City.findOne({ name: new RegExp(to, "i") }, "_id name").lean()
  ]);

  if (!fromCity || !toCity) {
    const result = { 
      success: true, 
      data: { outbound: [], return: [] }, 
      message: "Ville introuvable." 
    };
    // Cache court pour les résultats vides
    try {
      await redis.set(cacheKey, JSON.stringify(result), "EX", 300);
    } catch (redisError) {
      console.warn("Erreur cache:", redisError.message);
    }
    return res.json(result);
  }

  // Pipeline d'agrégation optimisé
  const baseMatch = {
    from: fromCity._id,
    to: toCity._id,
    departureDate: {
      $gte: new Date(depDate.setHours(0, 0, 0, 0)),
      $lt: new Date(depDate.setHours(23, 59, 59, 999)),
    },
    availableSeats: { $gte: parseInt(passengers) }
  };

  if (departureTime) baseMatch.departureTime = departureTime;
  if (companyName) {
    const company = await Company.findOne({ name: new RegExp(companyName, "i") }, "_id").lean();
    if (company) baseMatch.companyName = company._id;
    else {
      const result = { success: true, data: { outbound: [], return: [] } };
      try {
        await redis.set(cacheKey, JSON.stringify(result), "EX", 300);
      } catch (redisError) {
        console.warn("Erreur cache:", redisError.message);
      }
      return res.json(result);
    }
  }

  // Agrégation optimisée avec lookup
  const pipeline = [
    { $match: baseMatch },
    {
      $lookup: {
        from: "cities",
        localField: "from",
        foreignField: "_id",
        as: "fromCity",
        pipeline: [{ $project: { name: 1, country: 1 } }]
      }
    },
    {
      $lookup: {
        from: "cities",
        localField: "to",
        foreignField: "_id",
        as: "toCity",
        pipeline: [{ $project: { name: 1, country: 1 } }]
      }
    },
    {
      $lookup: {
        from: "buses",
        localField: "bus",
        foreignField: "_id",
        as: "busInfo"
      }
    },
    {
      $lookup: {
        from: "companies",
        localField: "companyName",
        foreignField: "_id",
        as: "company",
        pipeline: [{ $project: { name: 1, logo: 1, description: 1 } }]
      }
    },
    {
      $project: {
        from: { $arrayElemAt: ["$fromCity", 0] },
        to: { $arrayElemAt: ["$toCity", 0] },
        bus: { $arrayElemAt: ["$busInfo", 0] },
        companyName: { $arrayElemAt: ["$company", 0] },
        departureDate: 1,
        departureTime: 1,
        arrivalTime: 1,
        duration: 1,
        price: 1,
        availableSeats: 1,
        amenities: 1,
        features: 1,
        stops: 1
      }
    }
  ];

  const outboundRoutes = await Route.aggregate(pipeline);

  let searchResults = { outbound: outboundRoutes, return: [] };

  // Trajet retour si demandé
  if (returnDate) {
    const retDate = new Date(returnDate);
    if (!isNaN(retDate.getTime())) {
      const returnMatch = {
        ...baseMatch,
        from: toCity._id,
        to: fromCity._id,
        departureDate: {
          $gte: new Date(retDate.setHours(0, 0, 0, 0)),
          $lt: new Date(retDate.setHours(23, 59, 59, 999)),
        }
      };

      const returnPipeline = [...pipeline];
      returnPipeline[0] = { $match: returnMatch };
      searchResults.return = await Route.aggregate(returnPipeline);
    }
  }

  const result = { success: true, data: searchResults };
  
  // Cache adaptatif basé sur la quantité de résultats
  const ttl = searchResults.outbound.length > 0 ? 1800 : 300; // 30min si résultats, 5min sinon
  try {
    await redis.set(cacheKey, JSON.stringify(result), "EX", ttl);
  } catch (redisError) {
    console.warn("Erreur cache:", redisError.message);
  }
  
  res.json(result);
});

/**
 * @desc    Obtenir le layout d'un bus spécifique et les sièges réservés pour une route et date données
 * @route   GET /api/travel/buses/:busId/layout
 * @access  Public
 * @params  busId (from path), routeId (from query), departureDate (from query)
 */
export const getBusLayout = asyncHandler(async (req, res) => {
  const { busId } = req.params;
  const { routeId, departureDate } = req.query;

  if (!isValidObjectId(busId)) {
    res.status(400);
    throw new Error('ID de bus invalide.');
  }
  if (!isValidObjectId(routeId)) {
    res.status(400);
    throw new Error('ID de route invalide.');
  }
  if (!departureDate) {
    res.status(400);
    throw new Error('Date de départ manquante.');
  }

  const bus = await Bus.findById(busId);
  if (!bus) {
    res.status(404);
    throw new Error('Bus introuvable.');
  }

  // Vérifier si la route existe et correspond au bus
  const route = await Route.findById(routeId)
    .populate('from', 'name') // Peupler les noms des villes
    .populate('to', 'name');   // Peupler les noms des villes
  if (!route || route.bus.toString() !== busId) {
    res.status(404);
    throw new Error('Route introuvable ou ne correspondant pas au bus spécifié.');
  }

  // Trouver tous les sièges déjà réservés pour cette route et cette date
  const selectedDepDate = new Date(departureDate);
  const bookings = await Booking.find({
    $or: [
      { outboundRoute: routeId },
      { returnRoute: routeId }
    ],
    status: { $ne: 'cancelled' }
  })
    .populate({
      path: 'outboundRoute',
      populate: [{ path: 'from', select: 'name' }, { path: 'to', select: 'name' }]
    })
    .populate({
      path: 'returnRoute',
      populate: [{ path: 'from', select: 'name' }, { path: 'to', select: 'name' }]
    });

  // Extraire tous les sièges réservés pour la route et la date de départ actuelles
  const reservedSeatNumbers = new Set();
  bookings.forEach(booking => {
    let isBookingRelevant = false;

    if (booking.outboundRoute && booking.outboundRoute._id.toString() === routeId &&
      new Date(booking.outboundRoute.departureDate).toDateString() === selectedDepDate.toDateString()) {
      isBookingRelevant = true;
    }

    if (booking.returnRoute && booking.returnRoute._id.toString() === routeId &&
      new Date(booking.returnRoute.departureDate).toDateString() === selectedDepDate.toDateString()) {
      isBookingRelevant = true;
    }

    if (isBookingRelevant) {
      booking.selectedSeats.forEach(seat => reservedSeatNumbers.add(seat));
    }
  });

  // Créer la disposition détaillée des sièges
  const seats = [];
  for (let i = 1; i <= bus.totalSeats; i++) {
    seats.push({
      number: i,
      status: reservedSeatNumbers.has(i) ? 'reserved' : 'available',
    });
  }

  res.status(200).json({
    success: true,
    data: {
      busId: bus._id,
      name: bus.name,
      totalSeats: bus.totalSeats,
      layout: bus.layout,
      amenities: bus.amenities,
      seats: seats,
      fromCity: route.from.name, // Nom de la ville de départ
      toCity: route.to.name,     // Nom de la ville d'arrivée
    },
  });
});

/**
 * @desc    Obtenir les détails d'une route par ID
 * @route   GET /api/travel/routes/:id
 * @access  Public
 */
export const getRouteById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    res.status(400);
    throw new Error('ID de route invalide.');
  }

  const route = await Route.findById(id)
    .populate('from', 'name country') // Peupler le champ 'from'
    .populate('to', 'name country')   // Peupler le champ 'to'
    .populate('bus')
    .populate('companyName', 'name logo description address phone email website');

  if (!route) {
    res.status(404);
    throw new Error('Route introuvable.');
  }

  res.status(200).json({
    success: true,
    data: route,
  });
});

/**
 * @desc    Créer une nouvelle réservation
 * @route   POST /api/travel/bookings
 * @access  Private
 */
export const createBooking = asyncHandler(async (req, res) => {
  const {
    outboundRouteId,
    returnRouteId,
    tripType,
    selectedSeats,
    passengerDetails,
    totalPrice,
  } = req.body;

  // Validation de base
  if (!outboundRouteId || !tripType || !selectedSeats || selectedSeats.length === 0 || !passengerDetails || !totalPrice) {
    res.status(400);
    throw new Error('Veuillez fournir toutes les informations de réservation requises.');
  }

  if (!isValidObjectId(outboundRouteId)) {
    res.status(400);
    throw new Error('ID de route aller invalide.');
  }

  if (returnRouteId && !isValidObjectId(returnRouteId)) {
    res.status(400);
    throw new Error('ID de route retour invalide.');
  }

  // Récupérer la route aller avec toutes les informations nécessaires
  const outboundRoute = await Route.findById(outboundRouteId)
    .populate('from', 'name')
    .populate('to', 'name')
    .populate('companyName', 'name')
    .populate('bus', 'busNumber model plateNumber');

  if (!outboundRoute) {
    res.status(404);
    throw new Error('Route aller introuvable.');
  }

  // Vérifier les sièges disponibles
  if (outboundRoute.availableSeats < selectedSeats.length) {
    res.status(400);
    throw new Error('Pas assez de sièges disponibles sur le trajet aller.');
  }

  // Sauvegarder les informations de la route aller
  const outboundRouteSnapshot = {
    routeId: outboundRoute._id,
    from: {
      id: outboundRoute.from._id,
      name: outboundRoute.from.name
    },
    to: {
      id: outboundRoute.to._id,
      name: outboundRoute.to.name
    },
    departureDate: outboundRoute.departureDate,
    departureTime: outboundRoute.departureTime,
    arrivalTime: outboundRoute.arrivalTime,
    duration: outboundRoute.duration,
    stops: outboundRoute.stops || [],
    price: outboundRoute.price,
    amenities: outboundRoute.amenities || [],
    features: outboundRoute.features || [],
    companyName: {
      id: outboundRoute.companyName._id,
      name: outboundRoute.companyName.name
    },
    bus: {
      id: outboundRoute.bus._id,
      busNumber: outboundRoute.bus.busNumber || 'N/A',
      model: outboundRoute.bus.model || 'Standard',
      plateNumber: outboundRoute.bus.plateNumber || ''
    }
  };

  let returnRoute = null;
  let returnRouteSnapshot = null;

  if (tripType === 'roundTrip' && returnRouteId) {
    returnRoute = await Route.findById(returnRouteId)
      .populate('from', 'name')
      .populate('to', 'name')
      .populate('companyName', 'name')
      .populate('bus', 'busNumber model plateNumber');

    if (!returnRoute) {
      res.status(404);
      throw new Error('Route retour introuvable.');
    }

    if (returnRoute.availableSeats < selectedSeats.length) {
      res.status(400);
      throw new Error('Pas assez de sièges disponibles sur le trajet retour.');
    }

    // Sauvegarder les informations de la route retour
    returnRouteSnapshot = {
      routeId: returnRoute._id,
      from: {
        id: returnRoute.from._id,
        name: returnRoute.from.name
      },
      to: {
        id: returnRoute.to._id,
        name: returnRoute.to.name
      },
      departureDate: returnRoute.departureDate,
      departureTime: returnRoute.departureTime,
      arrivalTime: returnRoute.arrivalTime,
      duration: returnRoute.duration,
      stops: returnRoute.stops || [],
      price: returnRoute.price,
      amenities: returnRoute.amenities || [],
      features: returnRoute.features || [],
      companyName: {
        id: returnRoute.companyName._id,
        name: returnRoute.companyName.name
      },
      bus: {
        id: returnRoute.bus._id,
        busNumber: returnRoute.bus.busNumber || 'N/A',
        model: returnRoute.bus.model || 'Standard',
        plateNumber: returnRoute.bus.plateNumber || ''
      }
    };
  } else if (tripType === 'roundTrip' && !returnRouteId) {
    res.status(400);
    throw new Error('Une route de retour est requise pour un voyage aller-retour.');
  }

  // Décrémenter les sièges disponibles
  outboundRoute.availableSeats -= selectedSeats.length;
  await outboundRoute.save();

  if (returnRoute) {
    returnRoute.availableSeats -= selectedSeats.length;
    await returnRoute.save();
  }

  // Créer la réservation avec les snapshots des routes
  const booking = await Booking.create({
    user: req.user._id,
    outboundRoute: outboundRouteId, // Garder la référence pour les requêtes existantes
    returnRoute: returnRouteId,
    outboundRouteSnapshot, // Nouvelles données sauvegardées
    returnRouteSnapshot,   // Nouvelles données sauvegardées
    tripType,
    selectedSeats,
    passengerDetails,
    totalPrice,
    status: 'pending_payment',
  });

  res.status(201).json({
    success: true,
    message: 'Réservation créée avec succès. En attente de paiement.',
    data: booking,
  });
});

/**
 * @desc    Obtenir les réservations de l'utilisateur connecté
 * @route   GET /api/travel/bookings/my
 * @access  Private
 */
export const getUserBookings = asyncHandler(async (req, res) => {
  const bookings = await Booking.find({ user: req.user._id })
    .populate({
      path: 'outboundRoute',
      populate: [
        { path: 'companyName', select: 'name logo' },
        { path: 'from', select: 'name country' }, // Peupler la ville de départ
        { path: 'to', select: 'name country' }    // Peupler la ville d'arrivée
      ]
    })
    .populate({
      path: 'returnRoute',
      populate: [
        { path: 'companyName', select: 'name logo' },
        { path: 'from', select: 'name country' }, // Peupler la ville de départ
        { path: 'to', select: 'name country' }    // Peupler la ville d'arrivée
      ]
    })
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: bookings,
  });
});

/**
 * @desc    Obtenir une réservation par ID
 * @route   GET /api/travel/bookings/:id
 * @access  Private
 */
export const getBookingById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    res.status(400);
    throw new Error('ID de réservation invalide.');
  }

  const booking = await Booking.findById(id)
    .populate({
      path: 'outboundRoute',
      populate: [
        { path: 'companyName', select: 'name logo description' },
        { path: 'from', select: 'name country' },
        { path: 'to', select: 'name country' }
      ]
    })
    .populate({
      path: 'returnRoute',
      populate: [
        { path: 'companyName', select: 'name logo description' },
        { path: 'from', select: 'name country' },
        { path: 'to', select: 'name country' }
      ]
    });

  if (!booking) {
    res.status(404);
    throw new Error('Réservation introuvable.');
  }

  // Vérifier les permissions
  if (booking.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Non autorisé à accéder à cette réservation.');
  }

  res.status(200).json({
    success: true,
    data: booking,
  });
});

/**
 * @desc    Mettre à jour le statut d'une réservation
 * @route   PUT /api/travel/bookings/:id/status
 * @access  Private
 */
export const updateBookingStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!isValidObjectId(id)) {
    res.status(400);
    throw new Error('ID de réservation invalide.');
  }

  const booking = await Booking.findById(id);

  if (!booking) {
    res.status(404);
    throw new Error('Réservation introuvable.');
  }

  // Vérifier les permissions
  if (booking.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Non autorisé à modifier cette réservation.');
  }

  // Logique pour l'annulation
  if (status === 'cancelled' && booking.status !== 'cancelled' && booking.status !== 'completed') {
    booking.status = 'cancelled';

    // Incrémenter les sièges disponibles
    const outboundRoute = await Route.findById(booking.outboundRoute);
    if (outboundRoute) {
      outboundRoute.availableSeats += booking.selectedSeats.length;
      await outboundRoute.save();
    }
    if (booking.returnRoute) {
      const returnRoute = await Route.findById(booking.returnRoute);
      if (returnRoute) {
        returnRoute.availableSeats += booking.selectedSeats.length;
        await returnRoute.save();
      }
    }

    await booking.save();
    return res.status(200).json({
      success: true,
      message: 'Réservation annulée avec succès.',
      data: booking
    });
  }

  // Pour les admins
  if (req.user.role === 'admin' && ['pending_payment', 'confirmed', 'completed', 'cancelled'].includes(status)) {
    booking.status = status;
    await booking.save();
    return res.status(200).json({
      success: true,
      message: `Statut de réservation mis à jour en ${status}.`,
      data: booking
    });
  }

  res.status(400);
  throw new Error('Impossible de mettre à jour le statut de la réservation avec les paramètres fournis.');
});

/**
 * @desc    Obtenir toutes les réservations (Admin)
 * @route   GET /api/travel/admin/bookings
 * @access  Private/Admin
 */
export const getAllBookings = asyncHandler(async (req, res) => {
  const bookings = await Booking.find({})
    .populate('user', 'firstName lastName email phone')
    .populate({
      path: 'outboundRoute',
      populate: [
        { path: 'companyName', select: 'name logo' },
        { path: 'from', select: 'name country' },
        { path: 'to', select: 'name country' }
      ]
    })
    .populate({
      path: 'returnRoute',
      populate: [
        { path: 'companyName', select: 'name logo' },
        { path: 'from', select: 'name country' },
        { path: 'to', select: 'name country' }
      ]
    })
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: bookings,
  });
});

/**
 * @desc    Obtenir le nombre de réservations (Admin)
 * @route   GET /api/travel/admin/bookings/count
 * @access  Private/Admin
 */
export const getBookingCounts = asyncHandler(async (req, res) => {
  const totalBookings = await Booking.countDocuments();
  const pendingPayment = await Booking.countDocuments({ status: 'pending_payment' });
  const confirmedBookings = await Booking.countDocuments({ status: 'confirmed' });
  const cancelledBookings = await Booking.countDocuments({ status: 'cancelled' });
  const completedBookings = await Booking.countDocuments({ status: 'completed' });

  res.status(200).json({
    success: true,
    data: {
      total: totalBookings,
      pendingPayment,
      confirmed: confirmedBookings,
      cancelled: cancelledBookings,
      completed: completedBookings,
    },
  });
});

/**
 * @desc    Routes suggérées
 * @route   GET /api/travel/routes/suggested
 */
export const getSuggestedRoutes = asyncHandler(async (req, res) => {
  const cacheKey = "routes:suggested";
  const cached = await redis.get(cacheKey);

  if (cached) {
    console.log("⚡ getSuggestedRoutes depuis Redis");
    return res.json(JSON.parse(cached));
  }

  const suggestedRoutes = await Route.find({})
    .populate("companyName", "name logo")
    .populate("from", "name country")
    .populate("to", "name country")
    .limit(5)
    .select("from to companyName price");

  const result = { success: true, data: suggestedRoutes };
  await redis.set(cacheKey, JSON.stringify(result), "EX", 1800); // 30 min
  res.json(result);
});

/**
 * @desc    Obtenir la liste des compagnies de transport
 * @route   GET /api/travel/companies
 * @access  Public
 */
export const getCompanies = asyncHandler(async (req, res) => {
  try {
    const companies = await Company.find({}, 'name logo description address phone email website');

    res.status(200).json({
      success: true,
      data: companies,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des compagnies :', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des compagnies.'
    });
  }
});

/**
 * @desc    Suivre une réservation par son ID
 * @route   GET /api/travel/bookings/:id/track
 * @access  Public
 */
export const trackBooking = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    res.status(400);
    throw new Error('ID de réservation invalide.');
  }

  const booking = await Booking.findById(id)
    .populate({
      path: 'outboundRoute',
      populate: [
        { path: 'bus' },
        { path: 'companyName', select: 'name logo' },
        { path: 'from', select: 'name country' }, // Peupler la ville de départ
        { path: 'to', select: 'name country' }    // Peupler la ville d'arrivée
      ]
    })
    .populate({
      path: 'returnRoute',
      populate: [
        { path: 'bus' },
        { path: 'companyName', select: 'name logo' },
        { path: 'from', select: 'name country' }, // Peupler la ville de départ
        { path: 'to', select: 'name country' }    // Peupler la ville d'arrivée
      ]
    });

  if (!booking) {
    res.status(404);
    throw new Error('Réservation introuvable.');
  }

  // Simulation du suivi en temps réel
  let currentStatus = 'unknown';
  let estimatedArrivalTime = null;
  let currentLocation = null;
  let departureInfo = null;
  let arrivalInfo = null;
  let busDetails = null;

  const now = new Date();
  const departureDateTime = new Date(booking.outboundRoute.departureDate);
  const [depHours, depMinutes] = booking.outboundRoute.departureTime.split(':').map(Number);
  departureDateTime.setHours(depHours, depMinutes, 0, 0);

  if (now < departureDateTime) {
    currentStatus = 'scheduled';
    estimatedArrivalTime = departureDateTime;
    currentLocation = booking.outboundRoute.from.name; // Utiliser le nom de la ville populée
    busDetails = booking.outboundRoute.bus;
  } else if (now >= departureDateTime) {
    const [durationHours, durationMinutes] = booking.outboundRoute.duration.split(/[hm]/).map(Number);
    const arrivalDateTime = new Date(departureDateTime.getTime() + (durationHours * 60 + durationMinutes) * 60 * 1000);

    if (now < arrivalDateTime) {
      currentStatus = 'in_transit';
      estimatedArrivalTime = arrivalDateTime;
      currentLocation = 'Entre ' + booking.outboundRoute.from.name + ' et ' + booking.outboundRoute.to.name; // Utiliser les noms populés
      busDetails = booking.outboundRoute.bus;

      const timeElapsed = now.getTime() - departureDateTime.getTime();
      const totalDuration = arrivalDateTime.getTime() - departureDateTime.getTime();
      const progress = totalDuration > 0 ? timeElapsed / totalDuration : 0;

      if (progress > 0.5) {
        currentLocation = `Proche de ${booking.outboundRoute.to.name}`;
      } else if (progress > 0.2) {
        currentLocation = `En route vers ${booking.outboundRoute.to.name}`;
      } else {
        currentLocation = `Quittant ${booking.outboundRoute.from.name}`;
      }
    } else {
      currentStatus = 'completed';
      estimatedArrivalTime = arrivalDateTime;
      currentLocation = booking.outboundRoute.to.name; // Utiliser le nom de la ville populée
      busDetails = booking.outboundRoute.bus;
    }
  }

  departureInfo = {
    city: booking.outboundRoute.from.name, // Utiliser le nom de la ville populée
    time: booking.outboundRoute.departureTime,
    date: booking.outboundRoute.departureDate,
  };

  arrivalInfo = {
    city: booking.outboundRoute.to.name, // Utiliser le nom de la ville populée
    time: booking.outboundRoute.arrivalTime,
    date: booking.outboundRoute.departureDate,
  };

  res.status(200).json({
    success: true,
    data: {
      bookingId: booking._id,
      outboundRoute: {
        from: booking.outboundRoute.from.name, // Utiliser le nom de la ville
        to: booking.outboundRoute.to.name,     // Utiliser le nom de la ville
        departureDate: booking.outboundRoute.departureDate,
        departureTime: booking.outboundRoute.departureTime,
        arrivalTime: booking.outboundRoute.arrivalTime,
        companyName: booking.outboundRoute.companyName?.name || 'N/A',
        companyLogo: booking.outboundRoute.companyName?.logo || '',
        busName: booking.outboundRoute.bus ? booking.outboundRoute.bus.name : 'N/A',
        busLayout: booking.outboundRoute.bus ? booking.outboundRoute.bus.layout : 'N/A',
      },
      returnRoute: booking.returnRoute ? {
        from: booking.returnRoute.from.name, // Utiliser le nom de la ville
        to: booking.returnRoute.to.name,     // Utiliser le nom de la ville
        departureDate: booking.returnRoute.departureDate,
        departureTime: booking.returnRoute.departureTime,
        arrivalTime: booking.returnRoute.arrivalTime,
        companyName: booking.returnRoute.companyName?.name || 'N/A',
        companyLogo: booking.returnRoute.companyName?.logo || '',
        busName: booking.returnRoute.bus ? booking.returnRoute.bus.name : 'N/A',
        busLayout: booking.returnRoute.bus ? booking.returnRoute.bus.layout : 'N/A',
      } : null,
      passengerDetails: booking.passengerDetails,
      currentTracking: {
        status: currentStatus,
        currentLocation: currentLocation,
        estimatedArrivalTime: estimatedArrivalTime,
        departureInfo: departureInfo,
        arrivalInfo: arrivalInfo,
        busDetails: busDetails,
      },
    },
  });
});

/**
 * @desc    Générer et télécharger un ticket PDF
 * @route   GET /api/travel/bookings/:id/ticket
 * @access  Private
 */
export const downloadTicket = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  if (!isValidObjectId(id)) {
    res.status(400);
    throw new Error('ID de réservation invalide.');
  }

  const booking = await Booking.findById(id)
    .populate({
      path: 'outboundRoute',
      populate: [
        { path: 'companyName', select: 'name logo' },
        { path: 'from', select: 'name' }, // Peupler le nom de la ville
        { path: 'to', select: 'name' }    // Peupler le nom de la ville
      ]
    })
    .populate({
      path: 'returnRoute',
      populate: [
        { path: 'companyName', select: 'name logo' },
        { path: 'from', select: 'name' }, // Peupler le nom de la ville
        { path: 'to', select: 'name' }    // Peupler le nom de la ville
      ]
    })
    .populate('user');

  if (!booking) {
    res.status(404);
    throw new Error('Réservation introuvable.');
  }

  // Génération du PDF
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 400]);
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText('Ticket de Réservation', {
    x: 50,
    y: height - 50,
    size: 30,
    font: font,
    color: rgb(0, 0.5, 0.5),
  });

  const bookingDetails = [
    `Numéro de réservation: ${booking._id}`,
    `Nom du passager: ${booking.passengerDetails.fullName}`,
    `Email: ${booking.passengerDetails.email}`,
    `Téléphone: ${booking.passengerDetails.phone}`,
    `Route: ${booking.outboundRoute.from.name} -> ${booking.outboundRoute.to.name}`, // Utiliser les noms populés
    `Date de départ: ${booking.outboundRoute.departureDate.toISOString().split('T')[0]}`,
    `Heure de départ: ${booking.outboundRoute.departureTime}`,
    `Sièges: ${booking.selectedSeats.join(', ')}`,
    `Prix total: ${booking.totalPrice} F CFA`,
    `Statut: ${booking.status}`,
    `Compagnie: ${booking.outboundRoute.companyName?.name || 'N/A'}`,
  ];

  let yOffset = 250;
  for (const detail of bookingDetails) {
    page.drawText(detail, {
      x: 50,
      y: height - yOffset,
      size: 14,
      font: font,
      color: rgb(0, 0, 0),
    });
    yOffset += 20;
  }

  const pdfBytes = await pdfDoc.save();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=ticket-reservation-${booking._id}.pdf`);
  res.send(Buffer.from(pdfBytes));
});

/**
 * @desc    Obtenir toutes les stations (basées sur les compagnies)
 * @route   GET /api/travel/stations
 * @access  Public
 */
export const getAllStations = asyncHandler(async (req, res) => {
  try {
    // Récupérer toutes les compagnies avec leurs informations
    const companies = await Company.find({});

    if (!companies || companies.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aucune station trouvée.'
      });
    }

    // Pour chaque compagnie, récupérer les statistiques des routes
    const stationsPromises = companies.map(async (company) => {
      // Les routes doivent être populées pour obtenir les noms de villes
      const routes = await Route.find({ companyName: company._id })
        .populate('from', 'name')
        .populate('to', 'name');

      // Extraire les villes uniques (noms de villes populés)
      const allCityNames = [];
      routes.forEach(route => {
        if (route.from && route.from.name) allCityNames.push(route.from.name);
        if (route.to && route.to.name) allCityNames.push(route.to.name);
      });
      const uniqueCities = [...new Set(allCityNames)];

      // Calculer les statistiques
      const prices = routes.map(route => route.price);
      const minPrice = prices.length ? Math.min(...prices) : 0;
      const maxPrice = prices.length ? Math.max(...prices) : 0;
      const averagePrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;

      return {
        _id: company._id,
        name: `Station ${company.name}`,
        companyName: company.name,
        description: company.description || `Station de bus de la compagnie ${company.name}. Dessert ${uniqueCities.length} ville(s) avec ${routes.length} route(s) disponible(s).`,
        address: company.address || `Adresse principale - ${company.name}`,
        phone: company.phone || '+225 0767758052',
        email: company.email || `contact@${company.name.toLowerCase().replace(/\s+/g, '')}.com`,
        website: company.website || '',
        logo: company.logo || '',
        city: uniqueCities[0] || 'Non spécifié',
        servedCities: uniqueCities,
        routeCount: routes.length,
        priceRange: {
          min: minPrice,
          max: maxPrice,
          average: averagePrice
        },
        services: [
          'Transport de passagers',
          'Bagages inclus',
          routes.length > 5 ? 'Réseau étendu' : 'Service local'
        ],
        amenities: [
          'Sièges confortables',
          'Climatisation',
          averagePrice > 10000 ? 'Service premium' : 'Service standard'
        ],
        coordinates: {
          latitude: company.stations?.latitude || 5.3364, // Coordonnées par défaut (Abidjan)
          longitude: company.stations?.longitude || -4.0267
        }
      };
    });

    const stations = await Promise.all(stationsPromises);

    res.status(200).json({
      success: true,
      count: stations.length,
      data: stations,
      message: `${stations.length} station(s) trouvée(s) basée(s) sur les compagnies de transport.`
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des stations:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des stations.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @desc    Récupérer une station spécifique par ID (companyId)
 * @route   GET /api/travel/stations/:id
 * @access  Public
 */
export const getStationById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      res.status(400);
      throw new Error('ID de station invalide.');
    }

    // Rechercher la compagnie par ID
    const company = await Company.findById(id);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Station non trouvée.'
      });
    }

    // Rechercher toutes les routes de cette compagnie et peupler les villes
    const routes = await Route.find({ companyName: id })
      .populate('bus', 'name capacity type amenities')
      .populate('from', 'name country') // Peupler le nom et le pays de la ville de départ
      .populate('to', 'name country')   // Peupler le nom et le pays de la ville d'arrivée
      .lean();

    // Créer les détails de la station
    const uniqueCities = [...new Set([
      ...routes.map(route => route.from?.name).filter(Boolean), // Utiliser le nom populé
      ...routes.map(route => route.to?.name).filter(Boolean)    // Utiliser le nom populé
    ])];

    const station = {
      _id: company._id,
      name: `Station ${company.name}`,
      companyName: company.name,
      description: company.description || `Station principale de la compagnie ${company.name}`,
      address: company.address || `Adresse principale - ${company.name}`,
      phone: company.phone || '+225 XX XX XX XX',
      email: company.email || `contact@${company.name.toLowerCase().replace(/\s+/g, '')}.com`,
      website: company.website || '',
      logo: company.logo || '',
      servedCities: uniqueCities,
      routes: routes.map(route => ({
        _id: route._id,
        from: route.from?.name, // Accéder au nom de la ville populée
        to: route.to?.name,     // Accéder au nom de la ville populée
        departureTime: route.departureTime,
        arrivalTime: route.arrivalTime,
        duration: route.duration,
        price: route.price,
        availableSeats: route.availableSeats,
        stops: route.stops,
        amenities: route.amenities,
        features: route.features,
        bus: route.bus
      })),
      routeCount: routes.length,
      coordinates: {
        latitude: company.stations?.latitude || 5.3364,
        longitude: company.stations?.longitude || -4.0267
      }
    };

    res.status(200).json({
      success: true,
      data: station
    });

  } catch (error) {
    console.error('Erreur lors de la récupération de la station:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération de la station.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @desc    Récupérer toutes les routes
 * @route   GET /api/travel/routes/all
 * @access  Public
 */
export const getAllRoutes = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, from, to, company } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Cache basé sur les paramètres de pagination
  const cacheKey = `routes:all:${page}:${limit}:${from || 'any'}:${to || 'any'}:${company || 'any'}`;
  
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log("⚡ getAllRoutes depuis Redis");
      return res.json(JSON.parse(cached));
    }
  } catch (redisError) {
    console.warn("Redis indisponible:", redisError.message);
  }

  const now = new Date();
  let matchConditions = {
    $or: [
      { departureDate: { $gt: now } },
      { 
        departureDate: { 
          $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate())
        }
      }
    ]
  };

  // Filtres additionnels
  if (from) {
    const fromCity = await City.findOne({ name: new RegExp(from, "i") }, "_id").lean();
    if (fromCity) matchConditions.from = fromCity._id;
  }
  
  if (to) {
    const toCity = await City.findOne({ name: new RegExp(to, "i") }, "_id").lean();
    if (toCity) matchConditions.to = toCity._id;
  }

  if (company) {
    const companyObj = await Company.findOne({ name: new RegExp(company, "i") }, "_id").lean();
    if (companyObj) matchConditions.companyName = companyObj._id;
  }

  // Pipeline d'agrégation avec pagination
  const pipeline = [
    { $match: matchConditions },
    {
      $lookup: {
        from: "cities",
        localField: "from",
        foreignField: "_id",
        as: "fromCity",
        pipeline: [{ $project: { name: 1, country: 1 } }]
      }
    },
    {
      $lookup: {
        from: "cities",
        localField: "to",
        foreignField: "_id",
        as: "toCity",
        pipeline: [{ $project: { name: 1, country: 1 } }]
      }
    },
    {
      $lookup: {
        from: "companies",
        localField: "companyName",
        foreignField: "_id",
        as: "company",
        pipeline: [{ $project: { name: 1, logo: 1 } }]
      }
    },
    {
      $lookup: {
        from: "buses",
        localField: "bus",
        foreignField: "_id",
        as: "busInfo",
        pipeline: [{ $project: { name: 1, totalSeats: 1, amenities: 1 } }]
      }
    },
    {
      $addFields: {
        from: { $arrayElemAt: ["$fromCity", 0] },
        to: { $arrayElemAt: ["$toCity", 0] },
        companyName: { $arrayElemAt: ["$company", 0] },
        bus: { $arrayElemAt: ["$busInfo", 0] }
      }
    },
    { $sort: { departureDate: 1, departureTime: 1 } },
    { $skip: skip },
    { $limit: parseInt(limit) }
  ];

  // Exécution parallèle de la requête et du comptage
  const [routes, totalCount] = await Promise.all([
    Route.aggregate(pipeline),
    Route.countDocuments(matchConditions)
  ]);

  // Post-filtrage pour l'heure (seulement pour aujourd'hui)
  const filteredRoutes = routes.filter(route => {
    const depDate = new Date(route.departureDate);
    const today = new Date();

    if (depDate.toDateString() > today.toDateString()) return true;

    if (depDate.toDateString() === today.toDateString()) {
      if (!route.departureTime) return false;

      const [h, m] = route.departureTime.split(':').map(Number);
      const depTime = new Date(depDate);
      depTime.setHours(h, m, 0, 0);

      return depTime >= today;
    }

    return false;
  });

  const result = {
    success: true,
    data: filteredRoutes,
    pagination: {
      current_page: parseInt(page),
      per_page: parseInt(limit),
      total_items: totalCount,
      total_pages: Math.ceil(totalCount / parseInt(limit)),
      has_next: parseInt(page) * parseInt(limit) < totalCount,
      has_prev: parseInt(page) > 1
    },
    count: filteredRoutes.length
  };

  // Cache adaptatif
  const ttl = filteredRoutes.length > 0 ? 900 : 300; // 15min si résultats, 5min sinon
  try {
    await redis.set(cacheKey, JSON.stringify(result), "EX", ttl);
  } catch (redisError) {
    console.warn("Erreur cache:", redisError.message);
  }

  res.json(result);
});


// 6. MIDDLEWARE DE CACHE HYBRIDE (Redis + Mémoire)

export const hybridCache = (ttl = 3600) => {
  return async (req, res, next) => {
    const cacheKey = `${req.originalUrl || req.url}`;
    
    try {
      // Essayer Redis d'abord
      let cached = null;
      try {
        cached = await redis.get(cacheKey);
      } catch (redisError) {
        // Fallback vers cache mémoire
        cached = memoryCache.get(cacheKey);
        if (cached) {
          console.log("⚡ Cache mémoire utilisé");
          return res.json(JSON.parse(cached));
        }
      }
      
      if (cached) {
        console.log("⚡ Cache Redis utilisé");
        return res.json(JSON.parse(cached));
      }
    } catch (error) {
      console.warn("Erreur cache:", error.message);
    }

    // Intercepter la réponse pour la mettre en cache
    const originalJson = res.json;
    res.json = function(data) {
      const dataStr = JSON.stringify(data);
      
      // Stocker dans Redis
      redis.set(cacheKey, dataStr, "EX", ttl).catch(err => {
        console.warn("Erreur Redis cache:", err.message);
        // Fallback vers cache mémoire
        memoryCache.set(cacheKey, dataStr, ttl);
      });

      return originalJson.call(this, data);
    };

    next();
  };
};

/**
 * @desc    Villes de départ uniques
 * @route   GET /api/travel/cities/departure
 */
export const getDepartureCities = asyncHandler(async (req, res) => {
  const cacheKey = "cities:departure";
  const cached = await redis.get(cacheKey);

  if (cached) {
    console.log("⚡ getDepartureCities depuis Redis");
    return res.json(JSON.parse(cached));
  }

  const routes = await Route.find({}).distinct("from");
  const cities = await City.find({ _id: { $in: routes } }).select("name").lean();
  const cityNames = cities.map(city => city.name).filter(Boolean);

  const result = { success: true, data: cityNames.sort() };
  await redis.set(cacheKey, JSON.stringify(result), "EX", 3600);
  res.json(result);
});

/**
 * @desc    Villes d'arrivée uniques
 * @route   GET /api/travel/cities/arrival
 */
export const getArrivalCities = asyncHandler(async (req, res) => {
  const cacheKey = "cities:arrival";
  const cached = await redis.get(cacheKey);

  if (cached) {
    console.log("⚡ getArrivalCities depuis Redis");
    return res.json(JSON.parse(cached));
  }

  const routes = await Route.find({}).distinct("to");
  const cities = await City.find({ _id: { $in: routes } }).select("name").lean();
  const cityNames = cities.map(city => city.name).filter(Boolean);

  const result = { success: true, data: cityNames.sort() };
  await redis.set(cacheKey, JSON.stringify(result), "EX", 3600);
  res.json(result);
});

/**
 * @desc    Obtenir toutes les villes
 * @route   GET /api/travel/cities/all
 */
export const getAllCities = asyncHandler(async (req, res) => {
  const cacheKey = "cities:all";
  
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log("⚡ getAllCities depuis Redis");
      return res.json(JSON.parse(cached));
    }
  } catch (redisError) {
    console.warn("Redis indisponible:", redisError.message);
  }

  // Projection optimisée - ne récupérer que les champs nécessaires
  const cities = await City.find({}, "name country").lean();
  const cityNames = cities.map(city => city.name).filter(Boolean).sort();

  const result = { 
    success: true, 
    data: cityNames,
    count: cityNames.length
  };
  
  // Cache long pour les données statiques
  try {
    await redis.set(cacheKey, JSON.stringify(result), "EX", 7200); // 2h
  } catch (redisError) {
    console.warn("Erreur cache:", redisError.message);
  }
  
  res.json(result);
});


/**
 * @desc    Routes populaires
 * @route   GET /api/travel/routes/popular
 */
export const getPopularRoutes = asyncHandler(async (req, res) => {
  const cacheKey = "routes:popular";
  const cached = await redis.get(cacheKey);

  if (cached) {
    console.log("⚡ getPopularRoutes depuis Redis");
    return res.json(JSON.parse(cached));
  }

  const popularRoutes = await Route.find({ popular: true })
    .populate("from", "name country")
    .populate("to", "name country");

  const result = { success: true, data: popularRoutes };
  await redis.set(cacheKey, JSON.stringify(result), "EX", 1800);
  res.json(result);
});
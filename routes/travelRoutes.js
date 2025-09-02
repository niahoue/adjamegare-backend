// src/routes/travelRoutes.js
import express from 'express';
import { protect, authorizeRoles } from '../middlewares/authMiddleware.js';
import {
  searchRoutes,
  getBusLayout,
  createBooking,
  getUserBookings,
  getBookingById,
  updateBookingStatus,
  getAllBookings,
  getBookingCounts,
  getRouteById,
  getSuggestedRoutes,
  trackBooking,
  getCompanies,
  downloadTicket,
  getAllStations,
  getAllRoutes,
  getStationById,
  getPopularRoutes,
  getArrivalCities, 
  getAllCities,
  getDepartureCities, // Ajout de la nouvelle fonction
} from '../controllers/travelController.js';

const router = express.Router();

// Routes publiques pour la recherche et les détails des trajets
router.get('/routes/search', searchRoutes);
router.get('/routes/all', getAllRoutes);
router.get('/routes/popular', getPopularRoutes);
router.get('/routes/suggested', getSuggestedRoutes);
router.get('/routes/:id', getRouteById);
router.get('/buses/:busId/layout', getBusLayout);
router.get('/companies', getCompanies);
router.get('/stations', getAllStations);
router.get('/stations/:id', getStationById);
router.get('/bookings/:id/track', trackBooking);
router.get('/cities/arrival', getArrivalCities);
router.get('/cities/all', getAllCities);
router.get('/cities/departure', getDepartureCities); // Nouvelle route ajoutée

// Routes protégées pour les utilisateurs authentifiés
router.post('/bookings', protect, createBooking);
router.get('/bookings/my', protect, getUserBookings);
router.get('/bookings/:id', protect, getBookingById);
router.put('/bookings/:id/status', protect, updateBookingStatus);
router.get('/bookings/:id/ticket', protect, downloadTicket);

// Routes protégées pour les administrateurs
router.get('/admin/bookings', protect, authorizeRoles('admin'), getAllBookings);
router.get('/admin/bookings/count', protect, authorizeRoles('admin'), getBookingCounts);


export default router;
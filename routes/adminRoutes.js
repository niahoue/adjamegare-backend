// src/routes/adminRoutes.js
import express from 'express';
import { protect, authorizeRoles } from '../middlewares/authMiddleware.js';

// Importation des contrôleurs administratifs
import {
    createUser,
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser,
    getUsersCount,
    toggleUserBan,
} from '../controllers/adminUserController.js';

import {
    createBus,
    getAllBuses,
    getBusById,
    updateBus,
    deleteBus,
    getBusesCount, 
} from '../controllers/adminBusController.js';

import {
    createRoute,
    getAllRoutes,
    getRouteByIdAdmin,
    updateRoute,
    deleteRoute,
    getRoutesCount,
    getTotalRevenue, 
} from '../controllers/adminRouteController.js';

import {
    getAllBookingsAdmin,
    getBookingByIdAdmin,
    updateBookingStatusAdmin,
    deleteBooking,
    deleteOldBookings,
    getBookingCounts,
} from '../controllers/adminBookingController.js';

import {
  getCompaniesCount,
  //getCompanies,
  getAllCompaniesAdmin, 
  getCompanyById,
  createCompany,
  updateCompany,
  deleteCompany,
} from '../controllers/adminCompanyController.js';

import {
    createCity,
    getCitiesAdmin,
    getCityById,
    updateCity,
    deleteCity,
    getCitiesCount,
} from '../controllers/adminCityController.js';
import{
    getsCronStatus,
    generateRoutes,
    cleanupRoutes,
    getRoutesStats,
    clearAllRoutes
} from '../controllers/adminCronController.js';

import {
getPartnersCount,
  getAllPartners,
  approvePartner,
  rejectPartner,
  deletePartner,
  addPartnerDirectly,
  updatePartner
} from "../controllers/adminPartnerController.js";

const router = express.Router();

// Toutes les routes d'administration nécessitent la protection et le rôle 'admin'
router.use(protect, authorizeRoles('admin'));

// --- Gestion des Utilisateurs (Admin) ---
// IMPORTANT: Les routes spécifiques (/count) doivent être AVANT les routes avec paramètres (/:id)
router.get('/users/count', getUsersCount);
router.route('/users')
    .post(createUser)
    .get(getAllUsers);
router.route('/users/:id')
    .get(getUserById)
    .put(updateUser)
    .delete(deleteUser);
router.post('/users/:id/toggle-ban', toggleUserBan);

// --- Gestion des Bus (Admin) ---
router.get('/buses/count', getBusesCount); // Route spécifique AVANT /:id
router.route('/buses')
    .post(createBus)
    .get(getAllBuses);
router.route('/buses/:id')
    .get(getBusById)
    .put(updateBus)
    .delete(deleteBus);

// --- Gestion des Routes (Admin) ---
router.get('/routes/count', getRoutesCount); // Route spécifique AVANT /:id
router.route('/routes')
    .post(createRoute)
    .get(getAllRoutes);
router.route('/routes/:id')
    .get(getRouteByIdAdmin)
    .put(updateRoute)
    .delete(deleteRoute);

// --- Gestion des Réservations (Admin) ---
router.get('/bookings/count', getBookingCounts);
router.route('/bookings')
    .get(getAllBookingsAdmin);
router.route('/bookings/:id')
    .get(getBookingByIdAdmin)
    .put(updateBookingStatusAdmin)
    .delete(deleteBooking);

router.delete('/bookings/old', deleteOldBookings);

// --- Revenus ---
router.get('/revenue/total', getTotalRevenue);

// --- Gestion des Compagnies (Admin) ---

router.route('/companies')
  .get(protect, authorizeRoles('admin'), getAllCompaniesAdmin)
  .post(protect, authorizeRoles('admin'), createCompany);
// Route pour obtenir le nombre de compagnies
router.get('/companies/count', protect, authorizeRoles('admin'), getCompaniesCount);
router.route('/companies/:id')
  .get(protect, authorizeRoles('admin'), getCompanyById)
  .put(protect, authorizeRoles('admin'), updateCompany)
  .delete(protect, authorizeRoles('admin'), deleteCompany);

router.get('/cities/count',protect, authorizeRoles('admin'), getCitiesCount); 
router.route('/cities')
    .post(protect, authorizeRoles('admin'),createCity)
    .get(protect, authorizeRoles('admin'),getCitiesAdmin);
router.route('/cities/:id')
    .get(protect, authorizeRoles('admin'),getCityById)
    .put(protect, authorizeRoles('admin'),updateCity)
    .delete(protect,authorizeRoles('admin'),deleteCity);

// --- Gestion des Cron Jobs (Admin) ---
router.get('/cron/status', getsCronStatus);
router.post('/routes/generate', generateRoutes);
router.post('/routes/cleanup', cleanupRoutes);
router.get('/routes/stats', getRoutesStats);
router.delete('/routes/clear', clearAllRoutes);

// --- Gestion des Partenaires (Admin) ---
router.get("/partners/count", protect, authorizeRoles('admin') ,getPartnersCount);
router.get("/partners", protect, authorizeRoles('admin') ,getAllPartners);
router.post("/partners", protect, authorizeRoles('admin') ,addPartnerDirectly);
router.put("/partners/i=:id", protect, authorizeRoles('admin'),updatePartner);
router.put("/partners/:id/approve", protect, authorizeRoles('admin') ,approvePartner);
router.put("/partners/:id/reject", protect, authorizeRoles('admin') ,rejectPartner);
router.delete("/partners/:id", protect, authorizeRoles('admin') ,deletePartner);

export default router;
// src/controllers/adminBookingController.js
import asyncHandler from 'express-async-handler';
import Booking from '../models/Booking.js';
import Route from '../models/Route.js';
import { isValidObjectId } from 'mongoose';


const revertSeatsOnDeletion = async (booking) => {
  if (booking && booking.status === 'confirmed') {
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
  }
};
/**
 * @desc    Obtenir toutes les réservations (pour l'admin)
 * @route   GET /api/admin/bookings
 * @access  Private/Admin
 */
export const getAllBookingsAdmin = asyncHandler(async (req, res) => {
  const bookings = await Booking.find({})
    .populate('user', 'firstName lastName email phone') // Populer les infos utilisateur
    .populate('outboundRoute')
    .populate('returnRoute')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: bookings,
  });
});

/**
 * @desc    Obtenir le nombre de réservations par statut (pour l'admin)
 * @route   GET /api/admin/bookings/count
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
 * @desc    Obtenir une réservation par ID (pour l'admin)
 * @route   GET /api/admin/bookings/:id
 * @access  Private/Admin
 */
export const getBookingByIdAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    res.status(400);
    throw new Error('ID de réservation invalide.');
  }

  const booking = await Booking.findById(id)
    .populate('user', 'firstName lastName email phone')
    .populate('outboundRoute')
    .populate('returnRoute');

  if (!booking) {
    res.status(404);
    throw new Error('Réservation introuvable.');
  }

  res.status(200).json({ success: true, data: booking });
});

/**
 * @desc    Mettre à jour le statut d'une réservation (pour l'admin)
 * @route   PUT /api/admin/bookings/:id
 * @access  Private/Admin
 */
export const updateBookingStatusAdmin = asyncHandler(async (req, res) => {
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

  // Ne pas permettre de modifier une réservation si le statut est déjà 'completed' ou 'cancelled' (sauf si admin souhaite forcer)
  // Une logique plus fine peut être ajoutée ici. Pour l'instant, l'admin peut tout changer.
  if (!['pending_payment', 'confirmed', 'cancelled', 'completed'].includes(status)) {
    res.status(400);
    throw new Error('Statut de réservation invalide.');
  }

  // Si le statut passe à 'cancelled' et qu'il ne l'était pas
  if (status === 'cancelled' && booking.status !== 'cancelled' && booking.status !== 'completed') {
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
  }
  // Si le statut passe de 'cancelled' à autre chose, il faudrait potentiellement réajuster les sièges
  // Mais c'est une logique plus complexe qui dépend des règles métier exactes.

  booking.status = status;
  await booking.save();

  res.status(200).json({ success: true, message: `Statut de réservation mis à jour en '${status}'.`, data: booking });
});


/**
 * @desc    Supprimer une réservation spécifique par ID
 * @route   DELETE /api/admin/bookings/:id
 * @access  Private/Admin
 */
export const deleteBooking = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    res.status(400);
    throw new Error('ID de réservation invalide.');
  }

  const booking = await Booking.findById(id).populate('outboundRoute').populate('returnRoute');

  if (!booking) {
    res.status(404);
    throw new Error('Réservation introuvable.');
  }

  await revertSeatsOnDeletion(booking); // Remet les sièges en disponibilité
  await booking.deleteOne();

  res.status(200).json({ success: true, message: 'Réservation supprimée avec succès.' });
});

/**
 * @desc    Supprimer les anciennes réservations (plus de 3 mois)
 * @route   DELETE /api/admin/bookings/old
 * @access  Private/Admin
 */
export const deleteOldBookings = asyncHandler(async (req, res) => {
  // Définir la date limite, soit 3 mois dans le passé
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const result = await Booking.deleteMany({ 
    createdAt: { $lt: threeMonthsAgo } 
  });

  res.status(200).json({ 
    success: true, 
    message: `${result.deletedCount} réservations de plus de 3 mois ont été supprimées.`,
    deletedCount: result.deletedCount,
  });
});

/**
 * Fonction utilitaire pour remettre les sièges en disponibilité sur les routes
 * associées à une réservation.
 */

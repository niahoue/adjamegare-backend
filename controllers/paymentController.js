// src/controllers/paymentController.js
import dotenv from 'dotenv';
import asyncHandler from 'express-async-handler';
import paydunya from 'paydunya';
import Booking from '../models/Booking.js';

dotenv.config();

// Configuration de PayDunya selon la documentation officielle
const setupPaydunya = () => {
  const requiredKeys = ['PAYDUNYA_MASTER_KEY', 'PAYDUNYA_PRIVATE_KEY', 'PAYDUNYA_PUBLIC_KEY', 'PAYDUNYA_TOKEN'];
  const missingKeys = requiredKeys.filter(key => !process.env[key]);

  if (missingKeys.length > 0) {
    throw new Error(`Variables d'environnement PayDunya manquantes: ${missingKeys.join(', ')}`);
  }

  const setup = new paydunya.Setup({
    masterKey: process.env.PAYDUNYA_MASTER_KEY,
    privateKey: process.env.PAYDUNYA_PRIVATE_KEY,
    publicKey: process.env.PAYDUNYA_PUBLIC_KEY,
    token: process.env.PAYDUNYA_TOKEN,
    mode: process.env.NODE_ENV === 'production' ? 'live' : 'test'
  });

  const store = new paydunya.Store({
    name: 'Adjamegare',
    tagline: 'Votre plateforme de réservation de billets de bus',
    phoneNumber: '+225 0161556509',
    postalAddress: 'Abidjan, Côte d\'Ivoire',
    logoURL: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/logoAg.png` : undefined,
    returnURL: process.env.FRONTEND_PAYMENT_RETURN_URL,
    cancelURL: process.env.FRONTEND_PAYMENT_CANCEL_URL || process.env.FRONTEND_PAYMENT_RETURN_URL,
  });

  return { setup, store };
};

// Configuration globale PayDunya
let paydunyaConfig;
try {
  paydunyaConfig = setupPaydunya();
  console.log('Configuration PayDunya initialisée.');
} catch (error) {
  console.error('Erreur de configuration PayDunya:', error.message);
}

/**
 * @desc    Initier le paiement Paydunya pour une réservation existante
 * @route   POST /api/payment/initiate
 * @access  Private
 */
export const initiatePaydunyaPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;

  if (!bookingId) {
    res.status(400);
    throw new Error('ID de réservation manquant.');
  }

  if (!paydunyaConfig) {
    res.status(500);
    throw new Error('Le service de paiement PayDunya n\'est pas configuré.');
  }

  const booking = await Booking.findById(bookingId)
    .populate('user', 'email firstName')
    .populate('outboundRoute');

  if (!booking) {
    res.status(404);
    throw new Error('Réservation introuvable.');
  }

  // Vérifier si l'utilisateur est le propriétaire de la réservation
  if (booking.user._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Non autorisé à initier le paiement pour cette réservation.');
  }
  // Vérifier le statut de la réservation
  if (booking.status !== 'pending_payment') {
    res.status(400);
    throw new Error('Le paiement a déjà été initié ou la réservation n\'est pas en attente de paiement.');
  }
  // Validation des données de réservation
  if (!booking.totalPrice || booking.totalPrice <= 0) {
    res.status(400);
    throw new Error('Montant de la réservation invalide.');
  }
  try {
    // Créer une nouvelle instance d'invoice pour chaque paiement
    const invoice = new paydunya.CheckoutInvoice(paydunyaConfig.setup, paydunyaConfig.store);

    // Configuration de la facture
    invoice.totalAmount = booking.totalPrice;
    invoice.description = `Réservation de billet de bus #${booking._id}`;

    // Ajouter les éléments à la facture
    invoice.addItem(
      `Billet(s) de bus - ${booking.selectedSeats.length} siège(s)`,
      1,
      booking.totalPrice,
      booking.totalPrice,
      `Trajet ${booking.outboundRoute.from} vers ${booking.outboundRoute.to}`
    );

    // Ajouter les données personnalisées
    invoice.addCustomData('booking_id', booking._id.toString());
    invoice.addCustomData('user_id', booking.user._id.toString());
    invoice.addCustomData('user_email', booking.user.email);

    // Définir les URLs de retour spécifiques à cette facture
    invoice.returnURL = `${process.env.FRONTEND_PAYMENT_RETURN_URL}/${booking._id}`;
    invoice.cancelURL = `${process.env.FRONTEND_PAYMENT_CANCEL_URL || process.env.FRONTEND_PAYMENT_RETURN_URL}/${booking._id}?status=cancelled`;

    // Créer la facture avec PayDunya - CORRECTION CRITIQUE ICI
    await invoice.create();
    // Vérifier si la création a réussi
    if (invoice.token && invoice.url) {
      // Sauvegarder le token de facture dans la réservation
      booking.paydunyaInvoiceToken = invoice.token;
      await booking.save();
      res.status(200).json({
        success: true,
        message: 'Paiement initié avec succès.',
        paymentUrl: invoice.url,
        invoice_token: invoice.token,
        bookingId: booking._id
      });
    } else {
      console.error('Réponse PayDunya incomplète:', {
        token: invoice.token,
        url: invoice.url,
        status: invoice.status,
        responseText: invoice.responseText
      });
      
      res.status(500);
      throw new Error(`Échec de la création de la facture PayDunya: ${invoice.responseText || 'Token ou URL manquant'}`);
    }
  } catch (error) {
    console.error('Erreur lors de l\'initiation du paiement Paydunya:', error);
    
    // Log détaillé pour debug
    if (error.response) {
      console.error('Réponse d\'erreur PayDunya:', error.response);
    }
    
    res.status(500);
    throw new Error(`Échec de l'initiation du paiement: ${error.message}`);
  }
});

/**
 * @desc    Gère la redirection de PayDunya après le paiement (GET Request)
 * @route   GET /api/payment/paydunya-callback
 * @access  Public
 */
export const handlePaydunyaCallback = asyncHandler(async (req, res) => {
  try {
    const { token, invoice_token } = req.query;
    const actualToken = token || invoice_token;
    const bookingIdFromUrl = req.params.bookingId; 
    if (!actualToken) {
      return res.redirect(`${process.env.FRONTEND_PAYMENT_RETURN_URL}/${bookingIdFromUrl || 'unknown'}?status=failed&message=${encodeURIComponent('Jeton de facture PayDunya manquant')}`);
    }
    if (!paydunyaConfig) {
      return res.redirect(`${process.env.FRONTEND_PAYMENT_RETURN_URL}/${bookingIdFromUrl || 'unknown'}?status=failed&message=${encodeURIComponent('Erreur de configuration PayDunya')}`);
    }
    const invoice = new paydunya.CheckoutInvoice(paydunyaConfig.setup, paydunyaConfig.store);

    try {
      await invoice.confirm(actualToken);
      const customData = invoice.customData || {};
      const bookingId = customData.booking_id || bookingIdFromUrl;
      if (invoice.status === 'completed') {
        return res.redirect(`${process.env.FRONTEND_PAYMENT_RETURN_URL}/${bookingId}?status=success&token=${actualToken}`);
      } else {
        return res.redirect(`${process.env.FRONTEND_PAYMENT_RETURN_URL}/${bookingId}?status=${invoice.status.toLowerCase()}&token=${actualToken}&message=${encodeURIComponent(`Paiement non confirmé (${invoice.status})`)}`);
      }

    } catch (confirmError) {
      return res.redirect(`${process.env.FRONTEND_PAYMENT_RETURN_URL}/${bookingIdFromUrl || 'unknown'}?status=failed&message=${encodeURIComponent('Erreur de vérification du paiement')}`);
    }

  } catch (error) {
    const fallbackBookingId = req.params.bookingId || req.query.bookingId;
    const redirectUrl = fallbackBookingId
      ? `${process.env.FRONTEND_PAYMENT_RETURN_URL}/${fallbackBookingId}?status=failed&message=${encodeURIComponent('Erreur interne')}`
      : `${process.env.FRONTEND_PAYMENT_RETURN_URL}/unknown?status=failed&message=${encodeURIComponent('Erreur interne')}`;
    return res.redirect(redirectUrl);
  }
});

/**
 * @desc    Webhook Paydunya pour confirmer les transactions (POST Request)
 * @route   POST /api/payment/paydunya-webhook
 * @access  Public
 */
export const paydunyaWebhook = asyncHandler(async (req, res) => {
  try {
    const { invoice_token, token, data } = req.body;
    const actualToken = invoice_token || token || data?.invoice_token;

    if (!actualToken) {
      return res.status(200).json({ status: 'error', message: 'Token manquant' });
    }

    if (!paydunyaConfig) {
      return res.status(200).json({ status: 'error', message: 'Configuration PayDunya manquante' });
    }

    const invoice = new paydunya.CheckoutInvoice(paydunyaConfig.setup, paydunyaConfig.store);

    try {
      await invoice.confirm(actualToken);
      if (invoice.status === 'completed') {
        const customData = invoice.customData || {};
        const bookingId = customData.booking_id;
        if (bookingId) {
          const booking = await Booking.findById(bookingId);

          if (booking && booking.status !== 'confirmed') {
            booking.status = 'confirmed';
            booking.transactionId = invoice.transactionId;
            booking.paidAt = new Date();
            await booking.save();
          } else if (booking) {
            console.log(`Webhook PayDunya: Réservation ${bookingId} déjà traitée.`);
          } else {
            console.error(`Webhook PayDunya: Réservation introuvable avec ID ${bookingId}`);
          }
        } else {
          console.error('Webhook PayDunya: booking_id manquant dans custom_data:', customData);
        }
      } else {
        console.log(`Webhook PayDunya: Statut non 'completed', statut actuel: ${invoice.status}`);
      }
    } catch (confirmError) {
      console.error('Erreur de confirmation PayDunya dans le webhook:', confirmError.message);
    }
    res.status(200).json({ status: 'received', message: 'Webhook traité.' });
  } catch (error) {
    res.status(200).json({ status: 'error', message: error.message });
  }
});

/**
 * @desc    Vérifie le statut d'une réservation via PayDunya
 * @route   GET /api/payment/check-status/:invoiceToken
 * @access  Private
 */
export const checkPaydunyaPaymentStatus = asyncHandler(async (req, res) => {
  const { invoiceToken } = req.params;
  if (!invoiceToken) {
    res.status(400);
    throw new Error('Jeton de facture PayDunya manquant.');
  }

  if (!paydunyaConfig) {
    res.status(500);
    throw new Error('Le service de paiement PayDunya n\'est pas configuré.');
  }

  try {
    const booking = await Booking.findOne({ paydunyaInvoiceToken: invoiceToken });

    if (!booking) {
      res.status(404);
      throw new Error('Réservation introuvable pour ce jeton de facture.');
    }

    // Vérifier les permissions
    if (booking.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      res.status(403);
      throw new Error('Non autorisé à vérifier le statut de cette réservation.');
    }

    // Si déjà confirmé, retourner directement
    if (booking.status === 'confirmed') {
      return res.status(200).json({
        success: true,
        message: 'Paiement déjà confirmé.',
        bookingId: booking._id,
        status: 'completed',
        currentBookingStatus: booking.status,
        transactionId: booking.transactionId,
      });
    }

    const invoice = new paydunya.CheckoutInvoice(paydunyaConfig.setup, paydunyaConfig.store);
    await invoice.confirm(invoiceToken);

    if (invoice.status === 'completed') {
      if (booking.status !== 'confirmed') {
        booking.status = 'confirmed';
        booking.transactionId = invoice.transactionId;
        booking.paidAt = new Date();
        await booking.save();
      }

      res.status(200).json({
        success: true,
        message: 'Paiement confirmé avec succès.',
        bookingId: booking._id,
        status: 'completed',
        currentBookingStatus: booking.status,
        transactionId: booking.transactionId,
      });
    } else {
      res.status(200).json({
        success: true,
        message: `Paiement non confirmé: ${invoice.status}`,
        bookingId: booking._id,
        status: invoice.status.toLowerCase(),
        currentBookingStatus: booking.status,
      });
    }

  } catch (error) {
    res.status(500);
    throw new Error(`Échec de la vérification du paiement: ${error.message}`);
  }
});
// src/routes/paymentRoutes.js
import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import {
  initiatePaydunyaPayment,
  paydunyaWebhook,
  handlePaydunyaCallback, 
  checkPaydunyaPaymentStatus,
} from '../controllers/paymentController.js';

const router = express.Router();

// Route pour initier un paiement Paydunya
router.post('/initiate', protect, initiatePaydunyaPayment);

// Route pour le webhook de Paydunya (POST - appelé par PayDunya)
router.post('/paydunya-webhook', paydunyaWebhook);

// Routes pour le callback de Paydunya (GET - redirection utilisateur après paiement)
// Support de deux formats d'URL pour plus de flexibilité
router.get('/paydunya-callback', handlePaydunyaCallback);
router.get('/paydunya-callback/:bookingId', handlePaydunyaCallback);

// Route pour vérifier le statut de paiement après redirection du frontend
router.get('/check-status/:invoiceToken', protect, checkPaydunyaPaymentStatus);

export default router;
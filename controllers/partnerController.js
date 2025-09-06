// controllers/partnerController.js - Version améliorée
import asyncHandler from "express-async-handler";
import PartnerRequest from "../models/PartnerRequest.js";
import { sendPartnerRequestNotification } from "../services/emailService.js";

export const createPartnerRequest = asyncHandler(async (req, res) => {
  const { companyName, email, phone, message } = req.body;
  try {
    // Validation des données
    if (!companyName || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: "Veuillez remplir tous les champs obligatoires"
      });
    }

    // Création de la demande
    const partner = await PartnerRequest.create({ 
      companyName: companyName.trim(), 
      email: email.trim().toLowerCase(), 
      phone: phone.trim(), 
      message: message ? message.trim() : "" 
    });

    // Tentative d'envoi d'email
    try {
      const emailResult = await sendPartnerRequestNotification(partner);
    } catch (emailError) {
      console.error('⚠️ Erreur envoi email (non critique):', {
        message: emailError.message,
        code: emailError.code,
        partnerId: partner._id
      });

    }

    // Réponse de succès
    res.status(201).json({ 
      success: true,
      message: "Demande envoyée avec succès", 
      partner: {
        id: partner._id,
        companyName: partner.companyName,
        email: partner.email,
        status: partner.status,
        createdAt: partner.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors de la création de la demande partenaire:', {
      message: error.message,
      stack: error.stack,
      body: req.body
    });

    res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la création de la demande"
    });
  }
});
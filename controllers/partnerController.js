// controllers/partnerController.js
import asyncHandler from "express-async-handler";
import PartnerRequest from "../models/PartnerRequest.js"; // modèle mongoose

export const createPartnerRequest = asyncHandler(async (req, res) => {
  const { companyName, email, phone, message } = req.body;

  if (!companyName || !email || !phone) {
    res.status(400);
    throw new Error("Tous les champs obligatoires doivent être remplis.");
  }

  const partner = await PartnerRequest.create({ companyName, email, phone, message });
  res.status(201).json({ message: "Demande envoyée avec succès", partner });
});

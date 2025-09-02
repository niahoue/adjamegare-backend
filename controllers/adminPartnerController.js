// controllers/partnerController.js
import asyncHandler from "express-async-handler";
import PartnerRequest from "../models/PartnerRequest.js";



/**
 * @desc    Récupérer toutes les demandes de partenariat
 * @route   GET /api/partners
 * @access  Private/Admin
 */
export const getAllPartners = asyncHandler(async (req, res) => {
  const partners = await PartnerRequest.find().sort({ createdAt: -1 });
  res.status(200).json(partners);
});

/**
 * @desc    Approuver une demande de partenariat
 * @route   PUT /api/partners/:id/approve
 * @access  Private/Admin
 */
export const approvePartner = asyncHandler(async (req, res) => {
  const partner = await PartnerRequest.findById(req.params.id);

  if (!partner) {
    res.status(404);
    throw new Error("Demande non trouvée.");
  }

  partner.status = "approved";
  await partner.save();

  res.json({ message: "✅ Partenaire approuvé", partner });
});

/**
 * @desc    Désapprouver une demande de partenariat
 * @route   PUT /api/partners/:id/reject
 * @access  Private/Admin
 */
export const rejectPartner = asyncHandler(async (req, res) => {
  const partner = await PartnerRequest.findById(req.params.id);

  if (!partner) {
    res.status(404);
    throw new Error("Demande non trouvée.");
  }

  partner.status = "rejected";
  await partner.save();

  res.json({ message: "❌ Partenaire rejeté", partner });
});

/**
 * @desc    Supprimer une demande de partenariat
 * @route   DELETE /api/partners/:id
 * @access  Private/Admin
 */
export const deletePartner = asyncHandler(async (req, res) => {
  const partner = await PartnerRequest.findById(req.params.id);

  if (!partner) {
    res.status(404);
    throw new Error("Demande non trouvée.");
  }

  await partner.deleteOne();
  res.json({ message: "🗑️ Demande supprimée" });
});

/**
 * @desc    Ajouter un partenaire directement (admin)
 * @route   POST /api/partners/admin
 * @access  Private/Admin
 */
export const addPartnerDirectly = asyncHandler(async (req, res) => {
  const { companyName, email, phone, message } = req.body;

  if (!companyName || !email || !phone) {
    res.status(400);
    throw new Error("Champs requis manquants.");
  }

  const partner = await PartnerRequest.create({
    companyName,
    email,
    phone,
    message,
    status: "approved", // Directement approuvé
  });

  res.status(201).json({ message: "✅ Partenaire ajouté directement", partner });
});

/**
 * @desc    Obtenir le nombre total de partenaires
 * @route   GET /api/admin/partners/count
 * @access  Private/Admin
 */
export const getPartnersCount = asyncHandler(async (req, res) => {
  const count = await PartnerRequest.countDocuments({});
  res.status(200).json({ success: true, data: { count } });
});

/**
 * @desc    Modifier une demande de partenariat
 * @route   PUT /api/admin/partners/:id
 * @access  Private/Admin
 */
export const updatePartner = asyncHandler(async (req, res) => {
  const { companyName, email, phone, message } = req.body;

  // Validation des champs requis
  if (!companyName || !email || !phone) {
    res.status(400);
    throw new Error("Les champs nom d'entreprise, email et téléphone sont requis.");
  }

  // Validation du format email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400);
    throw new Error("Format d'email invalide.");
  }

  // Trouver le partenaire
  const partner = await PartnerRequest.findById(req.params.id);

  if (!partner) {
    res.status(404);
    throw new Error("Demande de partenariat non trouvée.");
  }

  // Vérifier si l'email n'est pas déjà utilisé par un autre partenaire
  const existingPartner = await PartnerRequest.findOne({ 
    email, 
    _id: { $ne: req.params.id } 
  });

  if (existingPartner) {
    res.status(400);
    throw new Error("Cet email est déjà utilisé par un autre partenaire.");
  }

  // Mettre à jour les champs
  partner.companyName = companyName;
  partner.email = email;
  partner.phone = phone;
  partner.message = message || partner.message;

  const updatedPartner = await partner.save();

  res.json({ 
    message: "✅ Partenaire mis à jour avec succès", 
    partner: updatedPartner 
  });
});
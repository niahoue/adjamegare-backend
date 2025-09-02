// src/controllers/compagnieController.js
import asyncHandler from 'express-async-handler';
import Company from '../models/Company.js'; // Assurez-vous d'avoir ce modèle
import { isValidObjectId } from 'mongoose';



/**
 * @desc    Obtenir le nombre total de compagnies
 * @route   GET /api/admin/companies/count
 * @access  Private/Admin
 */
export const getCompaniesCount = asyncHandler(async (req, res) => {
  const count = await Company.countDocuments({});
  res.status(200).json({ success: true, data: { count } });
});

/**
 * @desc    Obtenir toutes les compagnies (public)
 * @route   GET /api/companies
 * @access  Public
 */
export const getCompanies = asyncHandler(async (req, res) => {
  const companies = await Company.find({});
  res.status(200).json({ success: true, data: companies });
});

/**
 * @desc    Obtenir toutes les compagnies (pour l'admin)
 * @route   GET /api/admin/companies
 * @access  Private/Admin
 */
export const getAllCompaniesAdmin = asyncHandler(async (req, res) => {
  const companies = await Company.find({});
  res.status(200).json({ success: true, data: companies });
});

/**
 * @desc    Obtenir les détails d'une compagnie spécifique (pour l'admin)
 * @route   GET /api/admin/companies/:id
 * @access  Private/Admin
 */
export const getCompanyById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(400);
    throw new Error('ID de compagnie invalide.');
  }

  const company = await Company.findById(id);
  if (!company) {
    res.status(404);
    throw new Error('Compagnie introuvable.');
  }

  res.status(200).json({ success: true, data: company });
});

/**
 * @desc    Créer une nouvelle compagnie (pour l'admin)
 * @route   POST /api/admin/companies
 * @access  Private/Admin
 */
export const createCompany = asyncHandler(async (req, res) => {
  const { name, address, phone, email, description, logoUrl } = req.body;
  
  if (!name || !address || !phone || !email) {
    res.status(400);
    throw new Error('Veuillez remplir tous les champs obligatoires.');
  }

  const newCompany = await Company.create({
    name,
    address,
    phone,
    email,
    description,
    logoUrl,
  });

  res.status(201).json({ success: true, data: newCompany });
});

/**
 * @desc    Mettre à jour une compagnie (pour l'admin)
 * @route   PUT /api/admin/companies/:id
 * @access  Private/Admin
 */
export const updateCompany = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(400);
    throw new Error('ID de compagnie invalide.');
  }

  const company = await Company.findByIdAndUpdate(id, req.body, {
    new: true, // Retourne le document mis à jour
    runValidators: true, // Exécute les validateurs de schéma
  });

  if (!company) {
    res.status(404);
    throw new Error('Compagnie introuvable.');
  }

  res.status(200).json({ success: true, data: company });
});

/**
 * @desc    Supprimer une compagnie (pour l'admin)
 * @route   DELETE /api/admin/companies/:id
 * @access  Private/Admin
 */
export const deleteCompany = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(400);
    throw new Error('ID de compagnie invalide.');
  }

  const company = await Company.findByIdAndDelete(id);
  if (!company) {
    res.status(404);
    throw new Error('Compagnie introuvable.');
  }

  res.status(200).json({ success: true, message: 'Compagnie supprimée avec succès.' });
});
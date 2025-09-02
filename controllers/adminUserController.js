// src/controllers/adminUserController.js
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import jwt from 'jsonwebtoken'; // Nécessaire pour generateAccessToken si utilisée ici
import bcrypt from 'bcryptjs'; // Pour le hachage du mot de passe si création manuelle

// Fonction utilitaire: Générer un token d'accès (peut être utile pour l'admin si ajout manuel)
const generateAccessToken = (userId, role) => {
  return jwt.sign({ id: userId, role: role }, process.env.JWT_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES || '15m',
  });
};

/**
 * @desc    Créer un nouvel utilisateur (pour l'admin)
 * @route   POST /api/admin/users
 * @access  Private/Admin
 */
export const createUser = asyncHandler(async (req, res) => {
  try {
    const { firstName, lastName, phone, dateOfBirth, email, password, role, isBanned } = req.body;

    if (!firstName || !lastName || !phone || !dateOfBirth || !email || !password) {
      res.status(400);
      throw new Error('Tous les champs obligatoires sont requis.');
    }

    const userExists = await User.findOne({ $or: [{ email }, { phone }] });
    if (userExists) {
      let message = 'Un utilisateur avec ';
      if (userExists.email === email) message += 'cet email';
      if (userExists.phone === phone) message += (userExists.email === email ? ' et/ou ce numéro de téléphone' : 'ce numéro de téléphone');
      message += ' existe déjà.';
      res.status(400);
      throw new Error(message);
    }

    const user = await User.create({
      firstName,
      lastName,
      phone,
      dateOfBirth,
      email,
      password, // Le pré-save hook de User.js gérera le hachage
      role: role || 'user',
      isBanned: isBanned || false,
    });

    res.status(201).json({ success: true, user });
  } catch (error) {
    console.error('Erreur lors de la création de l\'utilisateur (Admin) :', error);
    if (error.code === 11000) {
      let message = 'Une entrée similaire (email ou téléphone) existe déjà.';
      if (error.keyPattern && error.keyPattern.email) message = 'Cet email est déjà utilisé.';
      if (error.keyPattern && error.keyPattern.phone) message = 'Ce numéro de téléphone est déjà utilisé.';
      res.status(400);
      throw new Error(message);
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      res.status(400);
      throw new Error(messages.join(', '));
    }
    res.status(500);
    throw new Error('Erreur serveur lors de la création de l\'utilisateur.');
  }
});

/**
 * @desc    Obtenir tous les utilisateurs avec filtres et pagination (pour l'admin)
 * @route   GET /api/admin/users
 * @access  Private/Admin
 */
export const getAllUsers = asyncHandler(async (req, res) => {
  try {
    const { search = '', role, isBanned, page = 1, limit = 10 } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }
    if (role) query.role = role;
    if (isBanned === 'true') query.isBanned = true;
    if (isBanned === 'false') query.isBanned = false;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const users = await User.find(query)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalResults: total,
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs (Admin) :', error);
    res.status(500);
    throw new Error('Erreur serveur lors de la récupération des utilisateurs.');
  }
});

/**
 * @desc    Obtenir un utilisateur par ID (pour l'admin)
 * @route   GET /api/admin/users/:id
 * @access  Private/Admin
 */
export const getUserById = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404);
      throw new Error('Utilisateur introuvable.');
    }
    // La vérification admin est déjà faite par le middleware authorizeRoles
    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'utilisateur par ID (Admin) :', error);
    if (error.name === 'CastError') {
      res.status(400);
      throw new Error('ID utilisateur invalide.');
    }
    res.status(500);
    throw new Error('Erreur serveur lors de la récupération de l\'utilisateur.');
  }
});

/**
 * @desc    Mettre à jour un utilisateur par ID (pour l'admin)
 * @route   PUT /api/admin/users/:id
 * @access  Private/Admin
 */
export const updateUser = asyncHandler(async (req, res) => {
  try {
    const { firstName, lastName, phone, dateOfBirth, email, password, role, isBanned } = req.body;
    let user = await User.findById(req.params.id).select('+password');

    if (!user) {
      res.status(404);
      throw new Error('Utilisateur introuvable.');
    }

    // Un admin ne peut pas changer son propre rôle ou bannissement via cette interface
    if (user._id.toString() === req.user._id.toString()) {
      if (role !== undefined && user.role !== role) {
        res.status(403);
        throw new Error('Un administrateur ne peut pas changer son propre rôle via cette interface.');
      }
      if (isBanned !== undefined && user.isBanned !== isBanned) {
        res.status(403);
        throw new Error('Un administrateur ne peut pas se bannir ou débannir via cette interface.');
      }
    }

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email && user.email !== email) {
      const emailExists = await User.findOne({ email });
      if (emailExists && emailExists._id.toString() !== req.params.id) { // Check if email is used by *another* user
        res.status(400);
        throw new Error('Cet email est déjà utilisé par un autre compte.');
      }
      user.email = email;
    }
    if (phone && user.phone !== phone) {
      const phoneExists = await User.findOne({ phone });
      if (phoneExists && phoneExists._id.toString() !== req.params.id) { // Check if phone is used by *another* user
        res.status(400);
        throw new Error('Ce numéro de téléphone est déjà utilisé par un autre compte.');
      }
      user.phone = phone;
    }
    if (dateOfBirth) user.dateOfBirth = dateOfBirth;

    if (password) {
      if (password.length < 8) {
        res.status(400);
        throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
      }
      if (password.toLowerCase().includes('password')) {
        res.status(400);
        throw new Error('Le mot de passe ne peut pas contenir "password".');
      }
      user.password = password; // Le pré-save hook de User.js gérera le hachage
    }

    if (role) user.role = role;
    if (typeof isBanned === 'boolean') user.isBanned = isBanned;

    await user.save();
    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'utilisateur (Admin) :', error);
    if (error.code === 11000) {
      let message = 'Une entrée similaire (email ou téléphone) existe déjà.';
      if (error.keyPattern && error.keyPattern.email) message = 'Cet email est déjà utilisé.';
      if (error.keyPattern && error.keyPattern.phone) message = 'Ce numéro de téléphone est déjà utilisé.';
      res.status(400);
      throw new Error(message);
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      res.status(400);
      throw new Error(messages.join(', '));
    }
    if (error.name === 'CastError') {
      res.status(400);
      throw new Error('ID utilisateur ou champ invalide.');
    }
    res.status(500);
    throw new Error('Erreur serveur lors de la mise à jour de l\'utilisateur.');
  }
});

/**
 * @desc    Supprimer un utilisateur par ID (pour l'admin)
 * @route   DELETE /api/admin/users/:id
 * @access  Private/Admin
 */
export const deleteUser = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      res.status(404);
      throw new Error('Utilisateur introuvable.');
    }

    if (user._id.toString() === req.user._id.toString()) {
      res.status(400);
      throw new Error('Un administrateur ne peut pas supprimer son propre compte via cette interface.');
    }

    await user.deleteOne();
    res.status(200).json({ success: true, message: 'Utilisateur supprimé avec succès.' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'utilisateur (Admin) :', error);
    if (error.name === 'CastError') {
      res.status(400);
      throw new Error('ID utilisateur invalide.');
    }
    res.status(500);
    throw new Error('Erreur serveur lors de la suppression de l\'utilisateur.');
  }
});

/**
 * @desc    Obtenir le nombre d'utilisateurs (pour l'admin)
 * @route   GET /api/admin/users/count
 * @access  Private/Admin
 */
export const getUsersCount = asyncHandler(async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    res.status(200).json({
      success: true,
      count: userCount,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du nombre d\'utilisateurs :', error);
    res.status(500);
    throw new Error('Erreur serveur lors de la récupération des statistiques.');
  }
});

/**
 * @desc    Bannir ou débannir un utilisateur (pour l'admin)
 * @route   POST /api/admin/users/:id/toggle-ban
 * @access  Private/Admin
 */
export const toggleUserBan = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404);
      throw new Error('Utilisateur introuvable.');
    }

    if (user._id.toString() === req.user._id.toString()) {
      res.status(400);
      throw new Error('Un administrateur ne peut pas modifier son propre statut de bannissement via cette interface.');
    }

    user.isBanned = !user.isBanned;
    await user.save();

    res.status(200).json({
      success: true,
      message: user.isBanned ? 'Utilisateur banni avec succès.' : 'Utilisateur débanni avec succès.',
      user
    });
  } catch (error) {
    console.error('Erreur lors du bannissement de l\'utilisateur :', error);
    if (error.name === 'CastError') {
      res.status(400);
      throw new Error('ID utilisateur invalide.');
    }
    res.status(500);
    throw new Error('Erreur serveur lors du bannissement de l\'utilisateur.');
  }
});

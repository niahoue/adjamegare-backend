// controllers/userController.js
import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { sendResetPasswordEmail } from '../services/emailService.js'; // Importez la fonction

// Fonction utilitaire: Générer un token d'accès
const generateAccessToken = (userId, role) => {
  return jwt.sign({ id: userId, role: role }, process.env.JWT_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES || '15m',
  });
};

// Fonction utilitaire: Générer un refresh token (si encore utilisé)
const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
  });
};

/**
 * @desc    Enregistrement d’un nouvel utilisateur normal (via le formulaire d'inscription public)
 * @route   POST /api/auth/register
 * @access  Public
 */
export const registerUser = async (req, res) => {
  const { firstName, lastName, email, password, phone, dateOfBirth } = req.body;

  try {
    const userExists = await User.findOne({ $or: [{ email }, { phone }] });
    if (userExists) {
      let message = 'Un compte avec ';
      if (userExists.email === email) message += 'cet email';
      if (userExists.phone === phone) message += (userExists.email === email ? ' et/ou ce numéro de téléphone' : 'ce numéro de téléphone');
      message += ' existe déjà.';
      return res.status(400).json({ message });
    }

    const user = await User.create({ firstName, lastName, email, password, phone, dateOfBirth, role: 'user' });

    const token = generateAccessToken(user._id, user.role);

    res.status(201).json({
      success: true,
      token,
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        dateOfBirth: user.dateOfBirth,
        role: user.role,
        isBanned: user.isBanned
      }
    });
  } catch (error) {
    console.error('Erreur lors de l’inscription :', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Erreur lors de l’inscription.' });
  }
};

/**
 * @desc    Connexion utilisateur (y compris la connexion admin)
 * @route   POST /api/auth/login
 * @access  Public
 */
export const loginUser = async (req, res) => {
  const { emailOrPhone, password } = req.body;

  // AJOUT : Vérification si emailOrPhone est fourni
  if (!emailOrPhone || !password) {
    return res.status(400).json({ success: false, message: 'Veuillez fournir l\'email/téléphone et le mot de passe.' });
  }

  try {
    let user;
    // Tenter de trouver l'utilisateur par email ou par téléphone
    // Ajout d'une vérification de type pour éviter l'erreur .includes() sur undefined
    if (typeof emailOrPhone === 'string' && emailOrPhone.includes('@')) {
      user = await User.findOne({ email: emailOrPhone }).select('+password'); // Sélectionner le mot de passe
    } else if (typeof emailOrPhone === 'string') { // Si ce n'est pas un email, on tente le téléphone
      user = await User.findOne({ phone: emailOrPhone }).select('+password'); // Sélectionner le mot de passe
    } else {
        return res.status(400).json({ success: false, message: 'Format d\'identifiant invalide.' });
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Identifiants invalides (email/téléphone ou mot de passe incorrect).' });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: 'Votre compte est banni. Veuillez contacter l\'administration.' });
    }

    // Gérer les tentatives de connexion échouées si vous avez cette logique
    // ... (votre logique existante pour lockUntil et loginAttempts)

    if (!(await user.comparePassword(password))) {
      // Logique pour incrémenter loginAttempts et potentiellement verrouiller le compte
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      const maxLoginAttempts = 10; // Définir un nombre max de tentatives
      const lockTime = 15 * 60 * 1000; // 15 minutes

      if (user.loginAttempts >= maxLoginAttempts) {
        user.lockUntil = Date.now() + lockTime;
        user.loginAttempts = 0; // Réinitialiser les tentatives après le verrouillage
        await user.save();
        const remainingMinutes = Math.ceil((user.lockUntil - Date.now()) / (1000 * 60));
        return res.status(403).json({ success: false, message: `Trop de tentatives de connexion échouées. Votre compte est verrouillé pour ${remainingMinutes} minutes.` });
      }
      await user.save();
      return res.status(401).json({ success: false, message: `Identifiants invalides (email/téléphone ou mot de passe incorrect). Tentatives restantes: ${maxLoginAttempts - user.loginAttempts}` });
    }

    // Réinitialiser les tentatives de connexion en cas de succès
    user.loginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    const accessToken = generateAccessToken(user._id, user.role); // Passer le rôle
    const refreshToken = generateRefreshToken(user._id);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      token: accessToken,
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        isBanned: user.isBanned
      }
    });
  } catch (error) {
    console.error('Erreur connexion :', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la connexion.' });
  }
};

/**
 * @desc    Demander une réinitialisation de mot de passe (envoi d'email)
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
export const forgotPassword = async (req, res) => {
  const { emailOrPhone } = req.body;

  try {
    let user;
    if (!emailOrPhone) {
        console.warn('forgotPassword: Identifiant (email ou téléphone) manquant dans la requête.');
        return res.status(400).json({ success: false, message: 'Veuillez fournir votre email ou numéro de téléphone.' });
    }

    // Tenter de trouver l'utilisateur par email ou par téléphone
    if (emailOrPhone.includes('@')) {
      user = await User.findOne({ email: emailOrPhone });
    } else {
      user = await User.findOne({ phone: emailOrPhone });
    }

    if (!user) {
      // Toujours renvoyer un succès pour ne pas donner d'informations sur l'existence de l'email
      return res.status(200).json({ success: true, message: 'Si un compte avec cet identifiant existe, un lien de réinitialisation a été envoyé.' });
    }

    // Générer le jeton de réinitialisation
    const resetToken = user.getResetPasswordToken(); // Cette méthode crée un token brut ET hache et enregistre le token haché et l'expiration
    await user.save({ validateBeforeSave: false }); // Sauvegarder sans valider tout le document (car on modifie juste le token)

    // Créer le lien de réinitialisation (doit correspondre à votre URL frontend)
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
  
    // Utiliser sendResetPasswordEmail de emailService.js
    try {
      await sendResetPasswordEmail(user, resetUrl); 
      res.status(200).json({ success: true, message: 'Un email de réinitialisation de mot de passe a été envoyé.' });
    } catch (emailError) {
      // En cas d'erreur d'envoi d'email, annuler le token pour ne pas laisser de token invalide en BD
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
      console.error('Erreur lors de l\'envoi de l\'email de réinitialisation :', emailError);
      return res.status(500).json({ success: false, message: 'Erreur lors de l\'envoi de l\'email. Veuillez réessayer.' });
    }

  } catch (error) {
    console.error('Erreur dans forgotPassword :', error);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } 
};

/**
 * @desc    Réinitialiser le mot de passe
 * @route   PUT /api/auth/reset-password/:token
 * @access  Public
 */
export const resetPassword = async (req, res) => {
  // Hacher le jeton reçu de l'URL pour le comparer à celui en BD
  const resetPasswordTokenHashed = crypto.createHash('sha256').update(req.params.token).digest('hex');

  try {
    const user = await User.findOne({
      passwordResetToken: resetPasswordTokenHashed,
      passwordResetExpires: { $gt: Date.now() }, // Vérifier que le jeton n'est pas expiré
    }).select('+password'); // Sélectionner le mot de passe car on va le modifier

    if (!user) {
      return res.status(400).json({ success: false, message: 'Jeton de réinitialisation invalide ou expiré.' });
    }

    // Définir le nouveau mot de passe
    const { password, confirmPassword } = req.body;
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Les mots de passe ne correspondent pas.' });
    }
    // Validation du mot de passe (minlength, pas "password", etc.) sera faite par le hook pre('save')
    // ou vous pouvez ajouter des validations ici avant d'assigner.
    if (password.length < 8 || password.toLowerCase().includes('password')) {
        return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 8 caractères et ne pas inclure "password".' });
    }

    user.password = password; // Le mot de passe sera haché par le middleware pre('save')
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save(); // Sauvegarder l'utilisateur avec le nouveau mot de passe haché

    res.status(200).json({ success: true, message: 'Mot de passe réinitialisé avec succès.' });

  } catch (error) {
    console.error('Erreur dans resetPassword :', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

/**
 * @desc    Obtenir le profil de l'utilisateur connecté
 * @route   GET /api/auth/profile ou /api/users/profile (selon votre choix de route)
 * @access  Private
 */
  export const getUserProfile = async (req, res) => {
      try {
        const user = await User.findById(req.user.id).select('-password'); // Ne pas inclure le mot de passe

        if (!user) {
            return res.status(404).json({ success: false, message: 'Profil utilisateur introuvable.' });
        }


        res.status(200).json({
          success: true,
          data: user, // Assurez-vous que l'objet user est bien sous la clé 'data'
        });
      } catch (error) {
        console.error('Erreur lors de la récupération du profil utilisateur :', error);
        res.status(500).json({ success: false, message: 'Erreur serveur lors de la récupération du profil.' });
      }
    };

/**
 * @desc    Mettre à jour le profil de l'utilisateur connecté
 * @route   PUT /api/auth/profile ou /api/users/profile
 * @access  Private
 */
export const updateUserProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone, dateOfBirth, password, confirmPassword } = req.body;
    const user = await User.findById(req.user.id).select('+password'); // Sélectionner le mot de passe pour la comparaison

    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });

    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.phone = phone || user.phone;
    user.dateOfBirth = dateOfBirth || user.dateOfBirth;
    // Email n'est pas modifiable via cette route pour éviter les duplicatas complexes,
    // ou nécessite une logique de vérification d'email.

    // Gérer la mise à jour du mot de passe
    if (password) {
      if (password !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'Les nouveaux mots de passe ne correspondent pas.' });
      }
      if (password.length < 8) {
          return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 8 caractères.' });
      }
      if (password.toLowerCase().includes('password')) {
          return res.status(400).json({ success: false, message: 'Le mot de passe ne peut pas contenir "password".' });
      }
      user.password = password; // Le pre-save hook du modèle s'occupera du hachage
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profil mis à jour avec succès.',
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
      token: generateAccessToken(user._id, user.role), // Régénérer un token si nécessaire (si le rôle a changé par exemple, mais ici non)
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du profil utilisateur :', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Le numéro de téléphone est déjà utilisé.' });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Erreur serveur lors de la mise à jour du profil.' });
  }
};


/**
 * @desc    Rafraîchir le token d'accès
 * @route   POST /api/auth/refresh
 * @access  Public (utilise le refresh token du cookie)
 */
export const refreshAccessToken = async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Aucun refresh token fourni.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Utilisateur introuvable pour ce refresh token.' });
    }

    const newAccessToken = generateAccessToken(user._id, user.role);

    res.status(200).json({ success: true, token: newAccessToken });
  } catch (error) {
    console.error('Erreur lors du rafraîchissement du token :', error);
    res.status(403).json({ success: false, message: 'Refresh token invalide ou expiré.' });
  }
};

/**
 * @desc    Déconnecter l'utilisateur
 * @route   POST /api/auth/logout
 * @access  Public (invalide le refresh token côté client)
 */
export const logoutUser = (req, res) => {
    res.cookie('refreshToken', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      expires: new Date(0),
    });
    res.status(200).json({ success: true, message: 'Déconnexion réussie.' });
};



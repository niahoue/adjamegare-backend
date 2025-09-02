// src/routes/userRoute.js
import express from 'express';
import {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    getUserProfile,
    updateUserProfile,
    forgotPassword,   
    resetPassword,    
    
} from '../controllers/authController.js';
import { protect, authorizeRoles } from '../middlewares/authMiddleware.js';

const router = express.Router();

// --- Routes d'Authentification (accessibles via /api/users/...) ---
// Ces chemins sont définis ici et seront préfixés par '/api' lors du montage dans app.js
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', logoutUser); // POST pour effacer le cookie de manière sécurisée
router.post('/refresh', refreshAccessToken); // POST pour rafraîchir le token

// Routes de réinitialisation de mot de passe (NOUVEAU)
router.post('/forgot-password', forgotPassword);        // Demande de lien de réinitialisation
router.put('/reset-password/:token', resetPassword);    // Soumission du nouveau mot de passe

router.route('/profile')
    .get(protect, getUserProfile) // Obtenir le profil de l'utilisateur connecté
    .put(protect, updateUserProfile); // Mettre à jour le profil de l'utilisateur connecté




export default router;

import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
      next();
    } catch (error) {
      res.status(401).json({ success: false, message: 'Accès non autorisé' });
    }
  } else {
    res.status(401).json({ success: false, message: 'Aucun token fourni' });
  }
};
/**
 * Middleware pour autoriser l'accès en fonction des rôles.
 * @param {...string} roles - Rôles autorisés (ex: 'admin', 'moderator').
 */
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    // Vérifie si req.user existe et a un rôle
    if (!req.user || !req.user.role) {
      return res.status(403).json({ success: false, message: 'Accès interdit : Rôle utilisateur non défini.' });
    }
    // Vérifie si le rôle de l'utilisateur est inclus dans les rôles autorisés
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: `Accès interdit : Seuls les rôles [${roles.join(', ')}] sont autorisés.` });
    }
    next(); // L'utilisateur a le rôle requis, passe au middleware suivant ou au contrôleur
  };
};


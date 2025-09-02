// services/rateLimiter.js
import NodeCache from 'node-cache';

// Configuration par défaut
const DEFAULT_CONFIG = {
  maxAttempts: 5,
  windowMs: 60 * 60 * 1000, // 1 heure
  blockDurationMs: 60 * 60 * 1000, // 1 heure de blocage
  cleanupIntervalMs: 10 * 60 * 1000, // Nettoyage toutes les 10 minutes
};

class RateLimiter {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Utilisation de NodeCache pour une gestion automatique de l'expiration
    this.cache = new NodeCache({
      stdTTL: Math.ceil(this.config.windowMs / 1000), // TTL en secondes
      checkperiod: Math.ceil(this.config.cleanupIntervalMs / 1000),
      useClones: false
    });

    // Map pour les tentatives échouées (pour compatibilité avec le code existant)
    this.rateLimitMap = new Map();
    
    // Nettoyage périodique du Map
    this.setupCleanup();
  }

  isBlocked(ip) {
    const attempts = this.rateLimitMap.get(ip);
    if (!attempts) return false;

    // Bloqué si le nombre max de tentatives est dépassé ET si nous sommes encore dans la période de blocage
    return attempts.count >= this.config.maxAttempts && 
           Date.now() - attempts.timestamp < this.config.blockDurationMs;
  }

  recordFailedAttempt(ip) {
    const attempts = this.rateLimitMap.get(ip) || { count: 0, timestamp: Date.now() };
    
    // Si c'est dans la même fenêtre de temps, incrémenter
    if (Date.now() - attempts.timestamp < this.config.windowMs) {
      attempts.count += 1;
    } else {
      // Nouvelle fenêtre de temps, réinitialiser le compteur
      attempts.count = 1;
      attempts.timestamp = Date.now();
    }
    
    this.rateLimitMap.set(ip, attempts);
  }

  recordSuccessfulAttempt(ip) {
    // Réinitialise les tentatives à 0 après un succès
    this.rateLimitMap.set(ip, { count: 0, timestamp: Date.now() });
  }

  getAttemptInfo(ip) {
    const attempts = this.rateLimitMap.get(ip) || { count: 0, timestamp: Date.now() };
    const isBlocked = this.isBlocked(ip);
    const timeUntilReset = isBlocked 
      ? this.config.blockDurationMs - (Date.now() - attempts.timestamp)
      : 0;

    return {
      attempts: attempts.count,
      maxAttempts: this.config.maxAttempts,
      isBlocked,
      timeUntilResetMs: Math.max(0, timeUntilReset),
      timeUntilResetMinutes: Math.ceil(Math.max(0, timeUntilReset) / (60 * 1000))
    };
  }

  /**
   * Middleware Express pour la limitation de taux
   * @param {Object} options - Options de configuration spécifiques pour ce middleware
   * @returns {Function} - Middleware Express
   */
  middleware(options = {}) {
    const limiterInstance = new RateLimiter({ ...this.config, ...options }); // Crée une nouvelle instance avec options
    
    return (req, res, next) => {
      // Pour les applications derrière un proxy/load balancer, utilisez req.ip si 'trust proxy' est activé
      // Sinon, req.connection.remoteAddress ou req.socket.remoteAddress
      const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
      
      if (limiterInstance.isBlocked(ip)) {
        const info = limiterInstance.getAttemptInfo(ip);
        return res.status(429).json({
          success: false,
          message: `Trop de requêtes à partir de cette IP. Veuillez réessayer après ${info.timeUntilResetMinutes} minute(s).`,
          retryAfter: info.timeUntilResetMinutes,
          error: 'RATE_LIMIT_EXCEEDED'
        });
      }
      
      // Ajouter les informations de rate limiting à la requête (pour le débogage ou l'affichage)
      req.rateLimitInfo = limiterInstance.getAttemptInfo(ip);
      next();
    };
  }

  reset(ip) {
    this.rateLimitMap.delete(ip);
  }

  resetAll() {
    this.rateLimitMap.clear();
  }

  setupCleanup() {
    setInterval(() => {
      const now = Date.now();
      const expiredKeys = [];

      for (const [ip, attempts] of this.rateLimitMap.entries()) {
        if (now - attempts.timestamp > this.config.blockDurationMs) {
          expiredKeys.push(ip);
        }
      }

      expiredKeys.forEach(ip => this.rateLimitMap.delete(ip));
      
      if (expiredKeys.length > 0) {
        console.log(`Rate Limiter: Nettoyage de ${expiredKeys.length} entrées expirées`);
      }
    }, this.config.cleanupIntervalMs);
  }

  getStats() {
    const now = Date.now();
    let blockedIPs = 0;
    let totalAttempts = 0;

    for (const [ip, attempts] of this.rateLimitMap.entries()) {
      totalAttempts += attempts.count;
      if (this.isBlocked(ip)) {
        blockedIPs++;
      }
    }

    return {
      totalIPs: this.rateLimitMap.size,
      blockedIPs,
      totalAttempts,
      config: this.config
    };
  }
}

// Instance par défaut pour les paiements (si nécessaire)
const paymentRateLimiter = new RateLimiter({
  maxAttempts: 5, // Ex: 5 tentatives de paiement par heure
  windowMs: 60 * 60 * 1000,
  blockDurationMs: 60 * 60 * 1000,
});

// ✅ Création et exportation des instances de middleware de rate limiting
// Limiteur pour les API générales (plus permissif)
export const apiLimiter = new RateLimiter({
    maxAttempts: 100, // 100 requêtes par heure
    windowMs: 60 * 60 * 1000,
}).middleware(); // Utilisez .middleware() pour obtenir la fonction de middleware Express

// Limiteur pour l'authentification (plus strict)
export const authLimiter = new RateLimiter({
    maxAttempts: 5, // 5 tentatives de connexion/enregistrement par 15 minutes
    windowMs: 15 * 60 * 1000,
    blockDurationMs: 30 * 60 * 1000, // Bloque 30 minutes si le maxAttempts est dépassé
}).middleware(); // Utilisez .middleware() pour obtenir la fonction de middleware Express

// Export de l'instance par défaut (si d'autres modules l'utilisent directement)
export default paymentRateLimiter; 

// Export de la classe elle-même (si vous voulez créer d'autres instances ailleurs)
export { RateLimiter }; 

// Export du rateLimitMap pour compatibilité avec le code existant
export const rateLimitMap = paymentRateLimiter.rateLimitMap;

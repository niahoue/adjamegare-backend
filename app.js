import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';

import authRoutes from './routes/authRoutes.js';
import travelRoutes from './routes/travelRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import partnerRoutes from './routes/partnerRoutes.js'
import { notFound, errorHandler } from './middlewares/errorMiddleware.js';

dotenv.config();

const app = express();

// OPTIMISATION 1: Helmet configuré pour Cloudflare
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL],
    },
  },
  crossOriginEmbedderPolicy: false, // Important pour Cloudflare
}));

// OPTIMISATION 2: Compression optimisée
app.use(compression({
  level: 6, // Bon équilibre performance/compression
  threshold: 1024, // Compresser seulement les réponses > 1KB
  filter: (req, res) => {
    // Ne pas compresser les réponses déjà compressées
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    // Plus de requêtes pour les routes de données statiques
    if (req.path.includes('/cities') || req.path.includes('/companies')) return 200;
    if (req.path.includes('/routes/search')) return 50;
    return 100;
  },
  message: {
    success: false,
    message: 'Trop de requêtes, veuillez réessayer plus tard.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Ignorer les requêtes internes de health check
  skip: (req) => req.path === '/health'
});
app.use(limiter);

// OPTIMISATION 4: CORS optimisé pour production
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'https://adjamegare.com', // Votre domaine principal
      'https://www.adjamegare.com', // Variante www
    ];
    
    // Permettre les requêtes sans origin (mobile apps, Postman, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Non autorisé par CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  // Headers optimisés
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
};

app.use(cors(corsOptions));

// OPTIMISATION 5: Logs conditionnels
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  // Logs plus légers en production
  app.use(morgan('combined', {
    skip: (req, res) => res.statusCode < 400 // Seulement les erreurs
  }));
}

// Parsers
// OPTIMISATION 6: Parsers optimisés
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Validation basique du JSON
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({ success: false, message: 'JSON invalide' });
      return;
    }
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 1000
}));

app.use(cookieParser());

// OPTIMISATION 7: Health check endpoint pour Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    success: true, 
    message: 'Service actif',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Route principale avec cache headers
app.get('/', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600'); // 1h de cache
  res.json({
    success: true,
    message: 'API Adjamegare est en cours d\'exécution',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// OPTIMISATION 8: Middleware pour ajouter des headers de performance
app.use((req, res, next) => {
  // Headers pour optimiser les requêtes
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    // Header pour Cloudflare
    'CF-Cache-Status': 'DYNAMIC',
  });
  
  // Cache intelligent selon les routes
  if (req.path.includes('/cities') || req.path.includes('/companies')) {
    res.set('Cache-Control', 'public, max-age=3600'); // 1h
  } else if (req.path.includes('/routes/search')) {
    res.set('Cache-Control', 'public, max-age=300'); // 5 min
  } else {
    res.set('Cache-Control', 'private, no-cache');
  }
  
  next();
});

// Routes
app.use('/api/users', authRoutes);
app.use('/api/travel', travelRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/admin', adminRoutes);

// OPTIMISATION 9: Gestion d'erreur améliorée
app.use(notFound);
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  errorHandler(err, req, res, next);
});

export default app;

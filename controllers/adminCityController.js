import asyncHandler from 'express-async-handler';
import { isValidObjectId } from 'mongoose';
import City from '../models/City.js';
import Route from '../models/Route.js';
import Booking from '../models/Booking.js';

/**
 * @desc    Créer une nouvelle ville
 * @route   POST /api/admin/cities
 * @access  Private/Admin
 */
export const createCity = asyncHandler(async (req, res) => {
  const { name, country, isInternational, region, isFeatured, description, latitude, longitude, image } = req.body;

  if (!name || !country) {
    res.status(400);
    throw new Error('Le nom et le pays de la ville sont requis.');
  }

  const cityExists = await City.findOne({ name });
  if (cityExists) {
    res.status(400);
    throw new Error('Une ville avec ce nom existe déjà.');
  }

  const newCity = await City.create({
    name,
    country,
    isInternational,
    region,
    isFeatured,
    description,
    latitude,
    longitude,
    image,
  });

  res.status(201).json({
    success: true,
    message: 'Ville créée avec succès.',
    data: newCity,
  });
});

/**
 * @desc    Obtenir toutes les villes (pour l'admin)
 * @route   GET /api/admin/cities
 * @access  Private/Admin
 */
export const getCitiesAdmin = asyncHandler(async (req, res) => {
  const cities = await City.find({}).sort({ name: 1 });
  res.status(200).json({
    success: true,
    count: cities.length,
    data: cities,
  });
});

/**
 * @desc    Obtenir le nombre total de villes
 * @route   GET /api/admin/cities/count
 * @access  Private/Admin
 */
export const getCitiesCount = asyncHandler(async (req, res) => {
  const count = await City.countDocuments();
  
  res.status(200).json({
    success: true,
    count: count,
  });
});

/**
 * @desc    Obtenir les détails d'une ville par ID
 * @route   GET /api/admin/cities/:id
 * @access  Private/Admin
 */
export const getCityById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    res.status(400);
    throw new Error('ID de ville invalide.');
  }

  const city = await City.findById(id);

  if (!city) {
    res.status(404);
    throw new Error('Ville introuvable.');
  }

  res.status(200).json({
    success: true,
    data: city,
  });
});

/**
 * @desc    Mettre à jour une ville
 * @route   PUT /api/admin/cities/:id
 * @access  Private/Admin
 */
export const updateCity = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, country, isInternational, region, isFeatured, description, latitude, longitude, image } = req.body;

  if (!isValidObjectId(id)) {
    res.status(400);
    throw new Error('ID de ville invalide.');
  }

  const city = await City.findById(id);
  if (!city) {
    res.status(404);
    throw new Error('Ville introuvable.');
  }

  const oldName = city.name;
  
  if (name && name !== oldName) {
    const existingCity = await City.findOne({ name });
    if (existingCity) {
      res.status(400);
      throw new Error('Le nouveau nom de ville est déjà utilisé.');
    }
  }

  // Mettre à jour les champs de la ville
  city.name = name || city.name;
  city.country = country || city.country;
  city.isInternational = isInternational ?? city.isInternational;
  city.region = region || city.region;
  city.isFeatured = isFeatured ?? city.isFeatured;
  city.description = description || city.description;
  city.latitude = latitude || city.latitude;
  city.longitude = longitude || city.longitude;
  city.image = image || city.image;
  
  const updatedCity = await city.save();;

  res.status(200).json({
    success: true,
    message: `Ville "${updatedCity.name}" mise à jour avec succès.`,
    data: updatedCity,
  });
});

/**
 * @desc    Supprimer une ville
 * @route   DELETE /api/admin/cities/:id
 * @access  Private/Admin
 */
export const deleteCity = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    res.status(400);
    throw new Error('ID de ville invalide.');
  }

  const city = await City.findById(id);
  if (!city) {
    res.status(404);
    throw new Error('Ville introuvable.');
  }

  const cityName = city.name;
  const cityId = city._id;
  
  try {
    // Rechercher les routes qui utilisent cette ville (par ObjectId)
    const routesToDelete = await Route.find({ 
      $or: [{ from: cityId }, { to: cityId }] 
    });
    
    const routeIds = routesToDelete.map(route => route._id);
    
    if (routeIds.length > 0) {
      // Supprimer les réservations liées à ces routes
      const deletedBookings = await Booking.deleteMany({
        $or: [
          { outboundRoute: { $in: routeIds } }, 
          { returnRoute: { $in: routeIds } }
        ],
      });
       
      // Supprimer les routes elles-mêmes
      const deletedRoutes = await Route.deleteMany({ 
        _id: { $in: routeIds } 
      });
      
    }

    // Supprimer la ville
    await city.deleteOne();

    res.status(200).json({
      success: true,
      message: `Ville "${cityName}" et toutes les données associées ont été supprimées avec succès.`,
      details: {
        routesDeleted: routeIds.length,
        cityDeleted: cityName
      }
    });
    
  } catch (error) {
    console.error('Erreur lors de la suppression en cascade:', error);
    res.status(500);
    throw new Error(`Erreur lors de la suppression de la ville: ${error.message}`);
  }
});
// src/controllers/adminBusController.js
import asyncHandler from 'express-async-handler';
import Bus from '../models/Bus.js';

/**
 * @desc    Créer un nouveau bus
 * @route   POST /api/admin/buses
 * @access  Private/Admin
 */
export const createBus = asyncHandler(async (req, res) => {
  const { name, busId, totalSeats, layout, amenities } = req.body;

  if (!name || !busId || !totalSeats || !layout) {
    res.status(400);
    throw new Error('Veuillez fournir toutes les informations requises pour le bus.');
  }

  const busExists = await Bus.findOne({ busId });
  if (busExists) {
    res.status(400);
    throw new Error('Un bus avec cet ID existe déjà.');
  }

  const bus = await Bus.create({
    name,
    busId,
    totalSeats,
    layout,
    amenities: amenities || [],
  });

  res.status(201).json({ success: true, data: bus });
});

/**
 * @desc    Obtenir tous les bus
 * @route   GET /api/admin/buses
 * @access  Private/Admin
 */
export const getAllBuses = asyncHandler(async (req, res) => {
  const buses = await Bus.find({});
  res.status(200).json({ success: true, data: buses });
});

/**
 * @desc    Obtenir un bus par ID
 * @route   GET /api/admin/buses/:id
 * @access  Private/Admin
 */
export const getBusById = asyncHandler(async (req, res) => {
  const bus = await Bus.findById(req.params.id);

  if (!bus) {
    res.status(404);
    throw new Error('Bus introuvable.');
  }
  res.status(200).json({ success: true, data: bus });
});

/**
 * @desc    Mettre à jour un bus
 * @route   PUT /api/admin/buses/:id
 * @access  Private/Admin
 */
export const updateBus = asyncHandler(async (req, res) => {
  const { name, busId, totalSeats, layout, amenities } = req.body;

  const bus = await Bus.findById(req.params.id);

  if (!bus) {
    res.status(404);
    throw new Error('Bus introuvable.');
  }

  // Vérifier si le nouveau busId est déjà utilisé par un autre bus
  if (busId && busId !== bus.busId) {
    const existingBus = await Bus.findOne({ busId });
    if (existingBus && existingBus._id.toString() !== req.params.id) {
      res.status(400);
      throw new Error('Un autre bus utilise déjà cet ID de bus.');
    }
  }

  bus.name = name || bus.name;
  bus.busId = busId || bus.busId;
  bus.totalSeats = totalSeats || bus.totalSeats;
  bus.layout = layout || bus.layout;
  bus.amenities = amenities || bus.amenities;

  const updatedBus = await bus.save();
  res.status(200).json({ success: true, data: updatedBus });
});

/**
 * @desc    Supprimer un bus
 * @route   DELETE /api/admin/buses/:id
 * @access  Private/Admin
 */
export const deleteBus = asyncHandler(async (req, res) => {
  const bus = await Bus.findById(req.params.id);

  if (!bus) {
    res.status(404);
    throw new Error('Bus introuvable.');
  }

  await bus.deleteOne();
  res.status(200).json({ success: true, message: 'Bus supprimé avec succès.' });
});

/**
 * @desc    Compter les bus
 * @route   GET /api/admin/buses/count
 * @access  Private/Admin
 */
export const getBusesCount = asyncHandler(async (req, res) => {
  try {
    const count = await Bus.countDocuments();
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors du comptage des bus' });
  }
});
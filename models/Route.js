import mongoose from 'mongoose';

const RouteSchema = new mongoose.Schema({
  from: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'City',
    required: true,
  },
  to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'City',
    required: true,
  },
  departureDate: {
    type: Date,
    required: true
  },
  departureTime: {
    type: String,
    required: true
  },
  arrivalTime: {
    type: String,
    required: true
  },
  duration: {
    type: String,
    required: true
  },
  stops: {
    type: [String],
    default: []
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  availableSeats: {
    type: Number,
    required: true,
    min: 0
  },
  amenities: {
    type: [String],
    default: []
  },
  features: {
    type: [String],
    default: []
  },
  companyName: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    trim: true
  },
  bus: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bus',
    required: true
  },
  popular: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

const Route = mongoose.model('Route', RouteSchema);

export default Route;
import mongoose from 'mongoose';

const RouteSchema = new mongoose.Schema({
  from: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'City',
    required: true,
    index: true
  },
  to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'City',
    required: true,
    index: true
  },
  departureDate: {
    type: Date,
    required: true,
    index: true
  },
  departureTime: {
    type: String,
    required: true,
    index: true
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
    min: 0,
    index: true
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
    trim: true,
    index: true
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
RouteSchema.index({ from: 1, to: 1, departureDate: 1 ,departureTime:1 , companyName:1});

const Route = mongoose.model('Route', RouteSchema);


export default Route;
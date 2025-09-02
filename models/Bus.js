import mongoose  from 'mongoose';

const BusSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true 
  },
  busId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  totalSeats: {
    type: Number,
    required: true,
    min: 1 
  },
  layout: {
    type: String,
    required: true, 
    trim: true
  },
  amenities: {
    type: [String],
    default: []
  }
}, { timestamps: true });

const Bus = mongoose.model('Bus', BusSchema);

export default Bus
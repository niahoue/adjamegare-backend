import mongoose  from 'mongoose';

const CitySchema = new mongoose.Schema({
  name: { type: String, 
    required: true ,
    index: true},
  country: { type: String,
     required: true,
     index: true },
  isInternational: { type: Boolean, 
    default: false ,
    index: true},
  region: { type: String },
  isFeatured: { type: Boolean,
     default: false },
  description: { type: String },
  latitude: { type: Number }, 
  longitude: { type: Number },
  image: { type: String }
});

CitySchema.index({ name: 1,  country: 1 ,isInternational:1 });

const City = mongoose.model('City', CitySchema);

export default City
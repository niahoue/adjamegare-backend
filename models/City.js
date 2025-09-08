import mongoose  from 'mongoose';

const CitySchema = new mongoose.Schema({
  name: { type: String, 
    required: true ,
    },
  country: { type: String,
     required: true,
     },
  isInternational: { type: Boolean, 
    default: false ,
    },
  region: { type: String },
  isFeatured: { type: Boolean,
     default: false },
  description: { type: String },
  latitude: { type: Number }, 
  longitude: { type: Number },
  image: { type: String }
});


const City = mongoose.model('City', CitySchema);

export default City
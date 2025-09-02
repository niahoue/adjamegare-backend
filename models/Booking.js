import mongoose from 'mongoose';

const BookingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Références originales (peuvent devenir null si les routes sont supprimées)
  outboundRoute: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: true
  },
  returnRoute: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    default: null
  },
  // Snapshots des informations des routes (persistent même si les routes sont supprimées)
  outboundRouteSnapshot: {
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    from: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
      },
      name: {
        type: String,
        required: true
      }
    },
    to: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
      },
      name: {
        type: String,
        required: true
      }
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
      required: true
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
      id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
      },
      name: {
        type: String,
        required: true
      }
    },
    bus: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
      },
      busNumber: {
        type: String,
        required: true,
        default: 'N/A'
      },
      model: {
        type: String,
        default: 'Standard'
      },
      plateNumber: {
        type: String,
        default: ''
      }
    }
  },
  returnRouteSnapshot: {
    routeId: mongoose.Schema.Types.ObjectId,
    from: {
      id: mongoose.Schema.Types.ObjectId,
      name: String
    },
    to: {
      id: mongoose.Schema.Types.ObjectId,
      name: String
    },
    departureDate: Date,
    departureTime: String,
    arrivalTime: String,
    duration: String,
    stops: {
      type: [String],
      default: []
    },
    price: Number,
    amenities: {
      type: [String],
      default: []
    },
    features: {
      type: [String],
      default: []
    },
    companyName: {
      id: mongoose.Schema.Types.ObjectId,
      name: String
    },
    bus: {
      id: mongoose.Schema.Types.ObjectId,
      busNumber: {
        type: String,
        default: 'N/A'
      },
      model: {
        type: String,
        default: 'Standard'
      },
      plateNumber: {
        type: String,
        default: ''
      }
    }
  },
  tripType: {
    type: String,
    enum: ['oneWay', 'roundTrip'],
    required: true
  },
  selectedSeats: {
    type: [String],
    required: true
  },
  passengerDetails: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },

  totalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending_payment', 'confirmed', 'cancelled', 'completed'],
    default: 'pending_payment'
  },
  paymentId: {
    type: String,
    default: null
  },
  bookingReference: {
    type: String,
    unique: true
  }
}, { timestamps: true });

// Générer une référence de réservation unique avant la sauvegarde
BookingSchema.pre('save', function(next) {
  if (!this.bookingReference) {
    this.bookingReference = 'BK' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
  }
  next();
});

const Booking = mongoose.model('Booking', BookingSchema);

export default Booking;
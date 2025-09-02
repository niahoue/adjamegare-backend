// models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true
  },
  phone: {
    type: String,
    // Le numéro de téléphone est désormais optionnel si l'email est fourni
    required: [function() { return !this.email; }, 'Le numéro de téléphone est obligatoire si l\'email n\'est pas fourni.'],
    unique: true,
    sparse: true, // Permet plusieurs documents avec 'null' comme valeur pour le téléphone
    trim: true,
    match: [/^(\+225)?\s?((01|05|07|21|25|27)\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2})$/, 'Veuillez entrer un numéro de téléphone ivoirien valide (10 chiffres).'],
    validate: {
      validator: function(v) {
        if (!v) return true; // Pas de validation si le champ est vide
        const cleanNumber = v.replace(/\s|-|\(|\)/g, '').replace(/^\+225/, '');
        return cleanNumber.length === 10;
      },
      message: props => `${props.value} n'est pas un numéro de téléphone ivoirien valide. Il doit comporter 10 chiffres (ex: 07 00 00 00 00 ou +225 07 00 00 00 00).`
    }
  },
  dateOfBirth: {
    type: Date,
    required: [true, 'La date de naissance est obligatoire.'],
    max: [new Date(), 'La date de naissance ne peut pas être dans le futur.'],
    validate: {
      validator: function(v) {
        const today = new Date();
        const eighteenYearsAgo = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
        return v <= eighteenYearsAgo;
      },
      message: props => `Vous devez avoir au moins 18 ans.`
    }
  },
  email: {
    type: String,
    // L'email est désormais optionnel si le téléphone est fourni
    required: [function() { return !this.phone; }, 'L\'email est requis si le numéro de téléphone n\'est pas fourni.'],
    unique: true,
    sparse: true, // Permet plusieurs documents avec 'null' comme valeur pour l'email
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Format d\'email invalide']
  },
  password: {
    type: String,
    required: [true, 'Le mot de passe est requis'],
    minlength: [8, 'Le mot de passe doit contenir au moins 8 caractères'],
    select: false,
    validate: {
      validator: function(value) {
        return !value.toLowerCase().includes('password');
      },
      message: 'Le mot de passe ne peut pas contenir "password"'
    }
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },

  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isBanned: { type: Boolean, default: false },
  passwordResetToken: String,
  passwordResetExpires: Date,
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Méthode pour générer un jeton de réinitialisation de mot de passe
userSchema.methods.getResetPasswordToken = function() {
  const resetToken = crypto.randomBytes(20).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000;

  return resetToken;
};

userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.passwordResetToken;
  delete user.passwordResetExpires;
  return user;
};

const User = mongoose.model("User", userSchema);

export default User;

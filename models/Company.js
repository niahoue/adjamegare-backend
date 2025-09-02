import mongoose from "mongoose";

const CompanySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Adresse email invalide"],
      default: "",
    },
    website: {
      type: String,
      trim: true,
      default: "",
    },
    logo: {
      type: String, // URL ou chemin du logo
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    stations: {
      latitude: {
        type: Number,
        min: -90,
        max: 90,
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180,
      },
    },
  },
  { timestamps: true }
);

const Company = mongoose.model("Company", CompanySchema);

export default Company;

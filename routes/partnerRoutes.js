// routes/partnerRoutes.js
import express from "express";
import { createPartnerRequest } from "../controllers/partnerController.js";

const router = express.Router();

router.post("/partners/request", createPartnerRequest);

export default router;

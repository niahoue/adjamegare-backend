// routes/sitemap.js
import express from "express";
import Route from "../models/Route.js"; 
import Company from "../models/Company.js";
const router = express.Router();

router.get("/sitemap.xml", async (req, res) => {
  try {
    // Récupérer les données dynamiques
    const routes = await Route.find().select("_id updatedAt");
    const companies = await Company.find().select("_id updatedAt");

    // URL de base
    const baseUrl = "https://www.adjamegare.com";

    // Pages statiques
    let urls = `
      <url>
        <loc>${baseUrl}/</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
      </url>
      <url>
        <loc>${baseUrl}/privacy-policy</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
        <changefreq>yearly</changefreq>
        <priority>0.3</priority>
      </url>
    `;

    // Pages dynamiques → Routes
    urls += routes
      .map(
        (r) => `
      <url>
        <loc>${baseUrl}/routes/${r._id}</loc>
        <lastmod>${r.updatedAt.toISOString()}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.8</priority>
      </url>`
      )
      .join("");

    // Pages dynamiques → Companies
    urls += companies
      .map(
        (c) => `
      <url>
        <loc>${baseUrl}/companies/${c._id}</loc>
        <lastmod>${c.updatedAt.toISOString()}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.6</priority>
      </url>`
      )
      .join("");

    // Réponse XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        ${urls}
      </urlset>`;

    res.header("Content-Type", "application/xml");
    res.send(xml);
  } catch (error) {
    console.error("Erreur génération sitemap:", error);
    res.status(500).send("Erreur génération sitemap");
  }
});

export default router;

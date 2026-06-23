import express from "express";
import Product from "../models/product.js";
import Category from "../models/category.js";

const router = express.Router();

// Define your frontend base URL. For a production app, it should come from process.env.
// You can override this if needed.
const BASE_URL = process.env.FRONTEND_URL || "http://localhost:5173";

router.get("/", async (req, res) => {
    try {
        // Set the response type to XML
        res.header("Content-Type", "application/xml");
        res.header("Content-Encoding", "gzip"); // optional but standard for large sitemaps, we won't gzip here to keep it simple, so remove this

        // Core Static Routes
        const staticRoutes = [
            "/",
            "/categories",
            "/offers",
            "/shop-by-store",
            "/about",
            "/terms",
            "/privacy",
        ];

        // Fetch active categories (usually have a status or is just an array)
        // Adjust the query depending on your Category model fields (e.g., isActive: true)
        const categories = await Category.find({}).select('_id updatedAt').lean();

        // Fetch active products
        // Adjust the query if there is a specific field for product approval/status
        const products = await Product.find({ isActive: true }).select('_id updatedAt').lean();

        // Generate the XML string
        let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        sitemap += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

        // Add static routes
        staticRoutes.forEach(route => {
            sitemap += `  <url>\n`;
            sitemap += `    <loc>${BASE_URL}${route}</loc>\n`;
            sitemap += `    <changefreq>daily</changefreq>\n`;
            sitemap += `    <priority>0.8</priority>\n`;
            sitemap += `  </url>\n`;
        });

        // Add Categories
        categories.forEach(category => {
            sitemap += `  <url>\n`;
            sitemap += `    <loc>${BASE_URL}/category/${category._id}</loc>\n`;
            if (category.updatedAt) {
                sitemap += `    <lastmod>${new Date(category.updatedAt).toISOString()}</lastmod>\n`;
            }
            sitemap += `    <changefreq>weekly</changefreq>\n`;
            sitemap += `    <priority>0.6</priority>\n`;
            sitemap += `  </url>\n`;
        });

        // Add Products
        products.forEach(product => {
            sitemap += `  <url>\n`;
            sitemap += `    <loc>${BASE_URL}/product/${product._id}</loc>\n`;
            if (product.updatedAt) {
                sitemap += `    <lastmod>${new Date(product.updatedAt).toISOString()}</lastmod>\n`;
            }
            sitemap += `    <changefreq>weekly</changefreq>\n`;
            sitemap += `    <priority>0.7</priority>\n`;
            sitemap += `  </url>\n`;
        });

        sitemap += `</urlset>`;

        // We explicitly remove gzip header as we are sending raw string
        res.removeHeader("Content-Encoding");
        res.send(sitemap);
    } catch (error) {
        console.error("Error generating sitemap:", error);
        res.status(500).send("Error generating sitemap");
    }
});

export default router;

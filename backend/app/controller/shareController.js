import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import sharp from "sharp";
import Product from "../models/product.js";

const SHARE_IMAGE_CACHE_DIR = path.join(
  process.env.STORAGE_BASE_PATH || path.join(process.cwd(), "storage"),
  "share-cache",
  "products",
);

function isAlreadyJpeg(url = "") {
  return /\.(jpe?g)$/i.test(String(url || "").split("?")[0]);
}

// Facebook/WhatsApp/Twitter link-preview crawlers are unreliable with WebP/AVIF
// og:image URLs. Product images are stored as WebP for fast in-app loading, so
// share links need a guaranteed-JPEG rendition. This converts on first request
// and caches the result on disk — the source image/quality is untouched,
// only the share-preview copy is re-encoded.
export const getShareProductImage = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id)
      .select("mainImage galleryImages")
      .lean();

    const sourceUrl =
      product?.mainImage ||
      (Array.isArray(product?.galleryImages) && product.galleryImages[0]) ||
      null;

    if (!sourceUrl) {
      return res.status(404).send("Image not found");
    }

    if (isAlreadyJpeg(sourceUrl)) {
      return res.redirect(302, sourceUrl);
    }

    const cachePath = path.join(SHARE_IMAGE_CACHE_DIR, `${id}.jpg`);

    if (fs.existsSync(cachePath)) {
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
      return fs.createReadStream(cachePath).pipe(res);
    }

    const response = await fetch(sourceUrl);
    if (!response.ok) {
      return res.status(502).send("Failed to fetch source image");
    }
    const sourceBuffer = Buffer.from(await response.arrayBuffer());
    const jpegBuffer = await sharp(sourceBuffer).jpeg({ quality: 85 }).toBuffer();

    await fsp.mkdir(SHARE_IMAGE_CACHE_DIR, { recursive: true });
    await fsp.writeFile(cachePath, jpegBuffer);

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
    return res.send(jpegBuffer);
  } catch (error) {
    console.error("Error in getShareProductImage:", error);
    return res.status(500).send("Internal Server Error");
  }
};

export const shareProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id).select("name price salePrice mainImage galleryImages sellerId").populate("sellerId", "shopName name");

    if (!product) {
      return res.status(404).send("Product not found");
    }

    const title = product.name || "Check out this product";
    const price = product.salePrice || product.price || "";
    const storeName = product.sellerId?.shopName || "Zoogno";
    const description = `Buy ${title} from ${storeName} for ₹${price} at Zoogno.`;
    let image = product.mainImage || (product.galleryImages && product.galleryImages.length > 0 ? product.galleryImages[0] : "https://zoogno.com/default-share-image.jpg");

    // Use dynamic host for proper local testing
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    const url = `${baseUrl}/product/${id}`; // Frontend link for scrapers/fallback

    // Convert Cloudinary images (.webp, .png, etc) to .jpg for maximum WhatsApp/Facebook compatibility
    if (image.includes("res.cloudinary.com")) {
        image = image.replace(/\.(webp|png|jpeg|gif)$/i, ".jpg");
    } else if (!/\.(jpe?g)$/i.test(image.split("?")[0])) {
        // Non-Cloudinary (VPS-hosted) images are stored as WebP/AVIF for fast in-app
        // loading, which most link-preview crawlers render poorly or not at all.
        // Route the crawler to a guaranteed-JPEG rendition instead of the raw file.
        image = `${baseUrl}/share/product/${id}/image.jpg`;
    }

    const playStoreUrl = `https://play.google.com/store/apps/details?id=com.zoogno.app&referrer=utm_source%3Dshare%26utm_campaign%3D${id}`;
    const intentUrl = `intent://product/${id}#Intent;scheme=zoogno;package=com.zoogno.app;S.browser_fallback_url=${encodeURIComponent(playStoreUrl)};end`;

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <!-- Open Graph Meta Tags -->
        <meta property="og:title" content="${title}" />
        <meta property="og:description" content="${description}" />
        <meta property="og:image" content="${image}" />
        <meta property="og:url" content="${url}" />
        <meta property="og:type" content="product" />
        
        <!-- Twitter Card Meta Tags -->
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="${title}" />
        <meta name="twitter:description" content="${description}" />
        <meta name="twitter:image" content="${image}" />

        <script>
          // Attempt to open the app or redirect to Play Store
          window.onload = function() {
            var intentUrl = "${intentUrl}";
            var playStoreUrl = "${playStoreUrl}";
            var url = "${url}";
            
            // Check if mobile device
            var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            
            if (isMobile) {
              if (/Android/i.test(navigator.userAgent)) {
                window.location.href = intentUrl;
              } else {
                // iOS not fully specified in this plan, but fallback to app store or domain
                window.location.href = url;
              }
            } else {
              // Redirect to website if on desktop
              window.location.href = url;
            }
          };
        </script>
        <style>
          body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f9f9f9; text-align: center; }
          .container { max-width: 400px; padding: 20px; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
          img { max-width: 100%; border-radius: 8px; }
          h1 { font-size: 20px; margin-top: 15px; }
          p { color: #666; }
          a { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="container">
          <img src="${image}" alt="${title}" />
          <h1>${title}</h1>
          <p>${description}</p>
          <p>Redirecting to app...</p>
          <a href="${url}">Continue to Website</a>
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error("Error in shareProduct:", error);
    res.status(500).send("Internal Server Error");
  }
};

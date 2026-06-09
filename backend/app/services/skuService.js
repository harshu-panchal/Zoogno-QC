import crypto from "crypto";
import Product from "../models/product.js";

/**
 * Generates a random, unique alphanumeric SKU.
 * Checks the database for uniqueness across main product SKUs and variant SKUs.
 * @param {string} name - Product name for prefix generation.
 * @returns {Promise<string>} A unique SKU.
 */
export const generateUniqueRandomSku = async (name) => {
    const prefix = String(name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 5) || "item";

    let isUnique = false;
    let newSku = "";

    while (!isUnique) {
        // Generate a random 6-character alphanumeric string
        const randomStr = crypto.randomBytes(3).toString("hex").toUpperCase();
        newSku = `${prefix}-${randomStr}`;

        // Check uniqueness in DB (main sku or variant sku)
        const existingProduct = await Product.findOne({
            $or: [
                { sku: newSku },
                { "variants.sku": newSku }
            ]
        }).select("_id").lean();

        if (!existingProduct) {
            isUnique = true;
        }
    }

    return newSku;
};

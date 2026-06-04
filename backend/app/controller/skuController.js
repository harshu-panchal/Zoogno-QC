import Product from "../models/product.js";
import handleResponse from "../utils/helper.js";

export const generateUniqueSku = async (req, res) => {
    try {
        const { name } = req.query;
        if (!name) return handleResponse(res, 400, "Name is required");

        const prefix = String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "item";
        const sellerId = req.user._id;

        const products = await Product.find({ 
            sellerId, 
            sku: { $regex: `^${prefix}-\\d{3}$`, $options: "i" } 
        }).select("sku").lean();

        let maxIndex = 0;
        for (const p of products) {
            if (p.sku) {
                const parts = p.sku.split('-');
                if (parts.length > 1) {
                    const num = parseInt(parts[parts.length - 1], 10);
                    if (!isNaN(num) && num > maxIndex) {
                        maxIndex = num;
                    }
                }
            }
        }

        // Also check variants
        const productsWithVariants = await Product.find({
            sellerId,
            "variants.sku": { $regex: `^${prefix}-\\d{3}$`, $options: "i" }
        }).select("variants").lean();

        for (const p of productsWithVariants) {
            if (p.variants && p.variants.length > 0) {
                for (const v of p.variants) {
                    if (v.sku && v.sku.toLowerCase().startsWith(prefix + "-")) {
                        const parts = v.sku.split('-');
                        if (parts.length > 1) {
                            const num = parseInt(parts[parts.length - 1], 10);
                            if (!isNaN(num) && num > maxIndex) {
                                maxIndex = num;
                            }
                        }
                    }
                }
            }
        }

        const newIndex = maxIndex + 1;
        const newSku = `${prefix}-${String(newIndex).padStart(3, "0")}`;
        
        return handleResponse(res, 200, "SKU generated", { sku: newSku, prefix, nextIndex: newIndex });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

import handleResponse from "../utils/helper.js";
import { generateUniqueRandomSku } from "../services/skuService.js";

export const generateUniqueSku = async (req, res) => {
    try {
        const { name } = req.query;
        if (!name) return handleResponse(res, 400, "Name is required");

        const newSku = await generateUniqueRandomSku(name);

        return handleResponse(res, 200, "SKU generated", { sku: newSku });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

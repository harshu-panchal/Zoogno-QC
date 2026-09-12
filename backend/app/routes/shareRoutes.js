import express from "express";
import { shareProduct, getShareProductImage } from "../controller/shareController.js";

const router = express.Router();

router.get("/product/:id/image.jpg", getShareProductImage);
router.get("/product/:id", shareProduct);

export default router;

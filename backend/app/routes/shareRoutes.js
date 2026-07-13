import express from "express";
import { shareProduct } from "../controller/shareController.js";

const router = express.Router();

router.get("/product/:id", shareProduct);

export default router;

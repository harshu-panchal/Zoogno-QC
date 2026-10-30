import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const mockGetProducts = jest.fn((req, res) => res.status(200).json({ route: "list" }));
const mockGetProductById = jest.fn((req, res) =>
  res.status(200).json({ route: "by-id", id: req.params.id }),
);
const mockGetSellerProducts = jest.fn((req, res) =>
  res.status(200).json({ route: "seller-me" }),
);
const mockCreateProduct = jest.fn((req, res) =>
  res.status(201).json({ files: req.files?.length || 0 }),
);

jest.unstable_mockModule("../app/controller/productController.js", () => ({
  getProducts: mockGetProducts,
  getSellerProducts: mockGetSellerProducts,
  createProduct: mockCreateProduct,
  updateProduct: jest.fn((req, res) => res.status(200).json({})),
  deleteProduct: jest.fn((req, res) => res.status(200).json({})),
  getProductById: mockGetProductById,
  getModerationProducts: jest.fn((req, res) => res.status(200).json({})),
  approveProduct: jest.fn((req, res) => res.status(200).json({})),
  rejectProduct: jest.fn((req, res) => res.status(200).json({})),
  getSettlementPreview: jest.fn((req, res) => res.status(200).json({})),
}));

jest.unstable_mockModule("../app/controller/stockController.js", () => ({
  adjustStock: jest.fn((req, res) => res.status(200).json({})),
  getStockHistory: jest.fn((req, res) => res.status(200).json({})),
}));

jest.unstable_mockModule("../app/middleware/authMiddleware.js", () => ({
  verifyToken: (req, _res, next) => {
    req.user = { id: "seller-1", role: "seller" };
    next();
  },
  allowRoles: () => (_req, _res, next) => next(),
  optionalVerifyToken: (_req, _res, next) => next(),
  requireApprovedSeller: (_req, _res, next) => next(),
}));

const productRoutes = (await import("../app/routes/productRoutes.js")).default;

describe("product routes ordering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("GET /seller/me is not shadowed by dynamic /:id route", async () => {
    const app = express();
    app.use("/products", productRoutes);

    const response = await request(app).get("/products/seller/me");
    expect(response.statusCode).toBe(200);
    expect(response.body.route).toBe("seller-me");
    expect(mockGetSellerProducts).toHaveBeenCalledTimes(1);
    expect(mockGetProductById).not.toHaveBeenCalled();
  });

  test("GET /:id still resolves product detail handler", async () => {
    const app = express();
    app.use("/products", productRoutes);

    const response = await request(app).get("/products/abc123");
    expect(response.statusCode).toBe(200);
    expect(response.body.route).toBe("by-id");
    expect(response.body.id).toBe("abc123");
    expect(mockGetProductById).toHaveBeenCalledTimes(1);
  });

  test("product image uploads are not capped at 5 MB", async () => {
    const app = express();
    app.use("/products", productRoutes);

    const response = await request(app)
      .post("/products")
      .attach("mainImage", Buffer.alloc(6 * 1024 * 1024), {
        filename: "large-product.jpg",
        contentType: "image/jpeg",
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.files).toBe(1);
    expect(mockCreateProduct).toHaveBeenCalledTimes(1);
  });
});

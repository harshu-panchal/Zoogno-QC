import express from "express";
import multer from "multer";
import { verifyToken } from "../middleware/authMiddleware.js";
import handleResponse from "../utils/helper.js";
import {
  createUploadIntent,
  confirmUpload,
  deleteMedia,
  uploadToCloudinary,
} from "../services/mediaService.js";
import logger from "../services/logger.js";
import fs from "fs";
import path from "path";
import { getOrCreateImageVariant } from "../utils/imageProcessor.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const VALID_ENTITY_TYPES = [
  "product",
  "profile",
  "category",
  "offer",
  "banner",
  "document",
  "other",
];

const VALID_RESOURCE_TYPES = ["image", "document", "raw"];
const ALLOWED_IMAGE_WIDTHS = new Set([
  100, 150, 160, 200, 400, 412, 560, 800, 824, 1120, 1200, 1248, 1648,
]);

function isImageMimeType(mimeType = "") {
  return String(mimeType || "").trim().toLowerCase().startsWith("image/");
}

function resolveUploadedByModel(role) {
  switch (String(role || "").toLowerCase()) {
    case "customer":
    case "user":
      return "Customer";
    case "seller":
      return "Seller";
    case "admin":
      return "Admin";
    case "delivery":
      return "Delivery";
    default:
      return null;
  }
}

router.get("/image", async (req, res) => {
  try {
    const rawSource = String(req.query.src || "").trim();
    const width = Number(req.query.w);
    if (!rawSource || !Number.isInteger(width) || !ALLOWED_IMAGE_WIDTHS.has(width)) {
      return handleResponse(res, 400, "A valid local image source and width are required");
    }

    let pathname;
    try {
      pathname = new URL(rawSource, "http://local").pathname;
    } catch {
      return handleResponse(res, 400, "Invalid image source");
    }
    if (!pathname.startsWith("/images/")) {
      return handleResponse(res, 400, "Only local VPS images can be optimized");
    }

    const storageRoot = path.resolve(
      process.env.STORAGE_BASE_PATH || path.join(process.cwd(), "storage"),
    );
    const relativePath = decodeURIComponent(pathname.slice("/images/".length));
    const sourcePath = path.resolve(storageRoot, relativePath);
    const pathWithinStorage = path.relative(storageRoot, sourcePath);
    const isOutsideStorage =
      !pathWithinStorage ||
      pathWithinStorage.startsWith(`..${path.sep}`) ||
      path.isAbsolute(pathWithinStorage);
    if (isOutsideStorage || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      return handleResponse(res, 404, "Image not found");
    }

    const variantPath = await getOrCreateImageVariant(sourcePath, width);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.type("image/webp").sendFile(variantPath);
  } catch (error) {
    logger.error("Failed to optimize VPS image", {
      message: error.message,
      source: req.query?.src,
      width: req.query?.w,
    });
    return handleResponse(res, 500, "Image optimization failed");
  }
});

async function handleCreateUploadIntent(req, res) {
  try {
    const {
      entityType = "other",
      entityId = null,
      resourceType = "image",
      mimeType,
      fileSize,
      extension,
      tags = [],
    } = req.body || {};

    if (!VALID_ENTITY_TYPES.includes(String(entityType || "").toLowerCase())) {
      return handleResponse(res, 400, "Invalid entityType", {
        validEntityTypes: VALID_ENTITY_TYPES,
      });
    }
    if (!VALID_RESOURCE_TYPES.includes(String(resourceType || "").toLowerCase())) {
      return handleResponse(res, 400, "Invalid resourceType", {
        validResourceTypes: VALID_RESOURCE_TYPES,
      });
    }

    const uploadedByModel = resolveUploadedByModel(req.user?.role);
    if (!uploadedByModel) {
      return handleResponse(res, 400, "Invalid user role for media upload");
    }

    const intent = await createUploadIntent({
      userId: req.user.id,
      uploadedByModel,
      entityType,
      entityId,
      resourceType,
      mimeType,
      fileSize,
      extension,
      tags,
    });

    return handleResponse(res, 200, "Upload intent created", intent);
  } catch (error) {
    logger.error("Failed to create upload intent", {
      message: error.message,
      userId: req.user?.id,
    });
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

router.post("/upload-intent", verifyToken, handleCreateUploadIntent);

// Backward compatibility alias
router.post("/upload-url", verifyToken, handleCreateUploadIntent);

router.post("/upload", verifyToken, upload.single("file"), async (req, res) => {
  try {
    const uploadedByModel = resolveUploadedByModel(req.user?.role);
    if (!uploadedByModel) {
      return handleResponse(res, 400, "Invalid user role for media upload");
    }
    if (!req.file) {
      return handleResponse(res, 400, "file is required");
    }

    const mimeType = req.file.mimetype;
    const imageUpload = isImageMimeType(mimeType);
    const folder = imageUpload ? "media/images" : "media/files";
    const url = await uploadToCloudinary(req.file.buffer, folder, {
      mimeType,
      resourceType: imageUpload ? "image" : "raw",
    });

    return handleResponse(res, 200, "Media uploaded successfully", {
      url,
      secureUrl: url,
    });
  } catch (error) {
    logger.error("Failed to upload media", {
      message: error.message,
      userId: req.user?.id,
    });
    return handleResponse(res, error.statusCode || 500, error.message);
  }
});

router.post("/confirm", verifyToken, async (req, res) => {
  try {
    const uploadedByModel = resolveUploadedByModel(req.user?.role);
    if (!uploadedByModel) {
      return handleResponse(res, 400, "Invalid user role for media upload");
    }

    const {
      intentId,
      publicId,
      secureUrl,
      resourceType,
      format,
      mimeType,
      width,
      height,
      bytes,
      etag,
      checksum,
      entityType,
      entityId,
      folder,
      tags,
    } = req.body || {};

    if (!intentId && !publicId) {
      return handleResponse(res, 400, "intentId or publicId is required");
    }
    if (!secureUrl) {
      return handleResponse(res, 400, "secureUrl is required");
    }

    const result = await confirmUpload({
      intentId,
      publicId,
      secureUrl,
      resourceType,
      format,
      mimeType,
      width,
      height,
      bytes,
      etag,
      checksum,
      uploadedBy: req.user.id,
      uploadedByModel,
      entityType,
      entityId,
      folder,
      tags,
    });

    return handleResponse(res, 200, "Upload confirmed successfully", result);
  } catch (error) {
    logger.error("Failed to confirm upload", {
      message: error.message,
      userId: req.user?.id,
      intentId: req.body?.intentId,
    });
    return handleResponse(res, error.statusCode || 500, error.message);
  }
});

router.delete("/*publicId", verifyToken, async (req, res) => {
  try {
    const publicId = Array.isArray(req.params.publicId)
      ? req.params.publicId.join("/")
      : req.params.publicId;
    if (!publicId) {
      return handleResponse(res, 400, "publicId is required");
    }

    const uploadedByModel = resolveUploadedByModel(req.user?.role);
    if (!uploadedByModel) {
      return handleResponse(res, 400, "Invalid user role for media upload");
    }

    await deleteMedia(publicId, req.user.id, uploadedByModel);
    return handleResponse(res, 200, "Media deleted successfully");
  } catch (error) {
    logger.error("Failed to delete media", {
      message: error.message,
      userId: req.user?.id,
      publicId: req.params?.publicId,
    });
    return handleResponse(res, error.statusCode || 500, error.message);
  }
});

export default router;

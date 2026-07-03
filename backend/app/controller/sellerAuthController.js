import Seller from "../models/seller.js";
import jwt from "jsonwebtoken";
import handleResponse from "../utils/helper.js";
import {
    issueSellerVerificationOtp,
    verifySellerOtpCode,
    verifySellerVerificationToken,
} from "../services/sellerVerificationService.js";
import { uploadToCloudinary } from "../services/mediaService.js";
import { getFirebaseAdminApp } from "../config/firebaseAdmin.js";
import admin from "firebase-admin";

/* ===============================
   Utils
================================ */

const generateToken = (seller) =>
    jwt.sign({ id: seller._id, role: "seller" }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });

const generateRefreshToken = (seller) =>
    jwt.sign({ id: seller._id, role: "seller" }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
    });

const SELLER_DOCUMENT_FIELDS = {
    tradeLicense: "Trade License",
    gstCertificate: "GST Certificate",
    idProof: "ID Proof",
    sellerImage: "Seller Photo",
};

const REQUIRED_SELLER_DOCUMENT_FIELDS = Object.keys(SELLER_DOCUMENT_FIELDS);

const parseDocumentsPayload = (documents) => {
    if (!documents) {
        return {};
    }

    if (typeof documents === "string") {
        try {
            return JSON.parse(documents);
        } catch {
            return {};
        }
    }

    if (typeof documents === "object") {
        return documents;
    }

    return {};
};

const isValidUploadedDocumentReference = (value) => {
    const normalized = String(value || "").trim();
    return /^https?:\/\//i.test(normalized);
};

const resolveSellerDocuments = (body = {}, parsedDocuments = {}) => {
    const resolved = { ...(parsedDocuments || {}) };

    const directFields = {
        tradeLicense: body.tradeLicenseUrl || body.tradeLicense,
        gstCertificate: body.gstCertificateUrl || body.gstCertificate,
        idProof: body.idProofUrl || body.idProof,
        sellerImage: body.sellerImageUrl || body.sellerImage,
    };

    for (const [field, candidate] of Object.entries(directFields)) {
        const normalized = String(candidate || "").trim();
        if (normalized && /^https?:\/\//i.test(normalized)) {
            resolved[field] = normalized;
        }
    }

    return resolved;
};

const getMissingRequiredSellerDocuments = (documents = {}) =>
    REQUIRED_SELLER_DOCUMENT_FIELDS.filter(
        (fieldName) => !isValidUploadedDocumentReference(documents[fieldName]),
    );

/* ===============================
   SELLER SIGNUP
================================ */
export const signupSeller = async (req, res) => {
    try {
        const {
            name,
            email,
            phone,
            password,
            emailVerificationToken,
            phoneVerificationToken,
            shopName,
            category,
            description,
            address,
            locality,
            pincode,
            city,
            state,
            panNumber,
            cinNumber,
            tradeLicenseNumber,
            gstin,
            documents,
            lat,
            lng,
            radius
        } = req.body || {};

        // 1. Handle file uploads if they exist in req.files (multipart form)
        const documentFiles = req.files || [];
        const uploadedDocs = {};

        if (Array.isArray(documentFiles) && documentFiles.length > 0) {
            for (const file of documentFiles) {
                try {
                    const fieldName = file.fieldname;
                    if (fieldName && REQUIRED_SELLER_DOCUMENT_FIELDS.includes(fieldName)) {
                        const url = await uploadToCloudinary(file.buffer, "docs", {
                            mimeType: file.mimetype,
                        });
                        uploadedDocs[fieldName] = url;
                    }
                } catch (err) {
                    console.error("Failed to upload document to Cloudinary", err);
                }
            }
        }

        // Merge uploaded document URLs into body for resolveSellerDocuments
        const augmentedBody = {
            ...req.body,
            ...uploadedDocs
        };

        const parsedLat = lat !== undefined ? Number(lat) : undefined;
        const parsedLng = lng !== undefined ? Number(lng) : undefined;
        const parsedRadius = radius !== undefined ? Number(radius) : undefined;

        if (!name || !email || !phone || !password || !shopName) {
            return handleResponse(res, 400, "All fields are required");
        }

        verifySellerVerificationToken({
            channel: "email",
            rawValue: email,
            token: emailVerificationToken,
        });

        const app = getFirebaseAdminApp();
        if (!app) {
            return handleResponse(res, 500, "Firebase Admin is not configured on the server");
        }
        
        try {
            const decodedToken = await admin.auth(app).verifyIdToken(phoneVerificationToken);
            if (!decodedToken.phone_number || !decodedToken.phone_number.includes(phone)) {
                return handleResponse(res, 400, "Phone number in Firebase token does not match the provided phone number");
            }
        } catch (error) {
            return handleResponse(res, 400, "Invalid or expired Firebase phone verification token");
        }

        // Validate coordinates and radius if provided
        if (lat !== undefined && (!Number.isFinite(parsedLat) || parsedLat < -90 || parsedLat > 90)) {
            return handleResponse(res, 400, "Invalid latitude");
        }
        if (lng !== undefined && (!Number.isFinite(parsedLng) || parsedLng < -180 || parsedLng > 180)) {
            return handleResponse(res, 400, "Invalid longitude");
        }
        if (radius !== undefined && (!Number.isFinite(parsedRadius) || parsedRadius < 1 || parsedRadius > 100)) {
            return handleResponse(res, 400, "Radius must be between 1 and 100 km");
        }

        let seller = await Seller.findOne({ $or: [{ email }, { phone }] });

        if (seller) {
            return handleResponse(res, 400, "Seller with this email or phone already exists");
        }

        const parsedDocuments = parseDocumentsPayload(documents);
        const sellerDocuments = resolveSellerDocuments(augmentedBody, parsedDocuments);
        const missingRequiredDocuments = getMissingRequiredSellerDocuments(
            sellerDocuments || {}
        );

        if (missingRequiredDocuments.length > 0) {
            const readableMissing = missingRequiredDocuments
                .map((field) => SELLER_DOCUMENT_FIELDS[field] || field)
                .join(", ");
            return handleResponse(
                res,
                400,
                `All required documents must be uploaded: ${readableMissing}`
            );
        }

        const sellerData = {
            name,
            email,
            phone,
            password,
            shopName,
            category,
            description,
            address,
            locality,
            pincode,
            city,
            state,
            panNumber,
            cinNumber,
            tradeLicenseNumber,
            gstin,
            documents: sellerDocuments,
            applicationStatus: "pending",
            isVerified: false,
            emailVerified: true,
            phoneVerified: true,
            isActive: false,
        };

        if (parsedLat !== undefined && parsedLng !== undefined) {
            sellerData.location = {
                type: "Point",
                coordinates: [parsedLng, parsedLat],
            };
        }

        if (parsedRadius !== undefined) {
            sellerData.serviceRadius = parsedRadius;
        }

        // Generate Seller ID
        const lastSeller = await Seller.findOne({ sellerId: { $exists: true, $ne: null } })
            .sort({ createdAt: -1 })
            .exec();
        
        let newSellerId = "ZGS0001";
        if (lastSeller && lastSeller.sellerId) {
            const numericPart = lastSeller.sellerId.replace(/\D/g, "");
            if (numericPart) {
                const lastNum = parseInt(numericPart, 10);
                if (!isNaN(lastNum)) {
                    newSellerId = `ZGS${(lastNum + 1).toString().padStart(4, "0")}`;
                }
            }
        }
        sellerData.sellerId = newSellerId;

        seller = await Seller.create(sellerData);

        return handleResponse(res, 201, "Seller registered successfully", {
            seller,
            applicationStatus: "pending",
            requiresApproval: true,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const sendSellerSignupOtp = async (req, res) => {
    try {
        const { channel, email, phone, value } = req.body || {};
        const targetValue =
            channel === "email"
                ? email || value
                : channel === "phone"
                    ? phone || value
                    : value;

        const result = await issueSellerVerificationOtp({
            channel,
            rawValue: targetValue,
            ipAddress: req.ip,
        });

        return handleResponse(res, 200, "OTP sent successfully", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

export const verifySellerSignupOtp = async (req, res) => {
    try {
        const { channel, email, phone, value, otp } = req.body || {};
        const targetValue =
            channel === "email"
                ? email || value
                : channel === "phone"
                    ? phone || value
                    : value;

        const result = await verifySellerOtpCode({
            channel,
            rawValue: targetValue,
            otp,
            ipAddress: req.ip,
        });

        return handleResponse(res, 200, "OTP verified successfully", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   SELLER LOGIN
================================ */
export const loginSeller = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return handleResponse(res, 400, "Email and password are required");
        }

        // Include password for comparison
        const seller = await Seller.findOne({ email }).select("+password");

        if (!seller) {
            return handleResponse(res, 404, "Seller not found");
        }

        const isMatch = await seller.comparePassword(password);

        if (!isMatch) {
            return handleResponse(res, 401, "Invalid credentials");
        }

        const applicationStatus =
            seller.applicationStatus || (seller.isVerified ? "approved" : "pending");
        const isApproved =
            seller.isVerified === true &&
            seller.isActive === true &&
            applicationStatus === "approved";

        if (!isApproved) {
            const approvalMessage =
                applicationStatus === "rejected"
                    ? "Your seller application was rejected. Please contact support."
                    : "Your seller account is pending admin approval.";

            return handleResponse(res, 403, approvalMessage, {
                applicationStatus,
                isVerified: seller.isVerified === true,
                isActive: seller.isActive === true,
                rejectionReason: seller.rejectionReason || "",
            });
        }

        seller.lastLogin = new Date();
        const token = generateToken(seller);
        const refreshToken = generateRefreshToken(seller);
        seller.refreshToken = refreshToken;
        await seller.save();

        return handleResponse(res, 200, "Login successful", {
            token,
            refreshToken,
            seller,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   REFRESH TOKEN
================================ */
export const refreshSellerToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return handleResponse(res, 401, "Refresh token is required");
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
        const seller = await Seller.findById(decoded.id).select("+refreshToken");

        if (!seller) {
            return handleResponse(res, 401, "Invalid refresh token");
        }

        const newAccessToken = generateToken(seller);
        // Do not rotate the refresh token to prevent multi-tab race conditions and multi-device logouts

        return handleResponse(res, 200, "Token refreshed successfully", {
            token: newAccessToken,
            refreshToken: refreshToken,
        });
    } catch (error) {
        return handleResponse(res, 401, "Refresh token expired or invalid");
    }
};

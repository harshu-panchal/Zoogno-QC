import Admin from "../models/admin.js";
import jwt from "jsonwebtoken";
import handleResponse from "../utils/helper.js";
import {
  bootstrapAdminSchema,
  loginAdminSchema,
  validateSchema,
} from "../validation/adminAuthValidation.js";

const PUBLIC_ADMIN_SIGNUP_ENABLED = () =>
  process.env.ENABLE_PUBLIC_ADMIN_SIGNUP === "true";

function sanitizeAdmin(adminDoc) {
  const admin = adminDoc?.toObject ? adminDoc.toObject() : { ...(adminDoc || {}) };
  delete admin.password;
  delete admin.__v;
  return admin;
}

const generateToken = (adminObj) =>
    jwt.sign({ id: adminObj._id, role: "admin" }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });

const generateRefreshToken = (admin) =>
  jwt.sign(
    { id: admin._id, role: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d" },
  );

function readBootstrapSecret(req) {
  return String(
    req.headers["x-admin-bootstrap-secret"] ||
      req.body?.adminSecret ||
      "",
  ).trim();
}

import crypto from "crypto";
// import adminAuthEmailService from "../services/adminAuthEmailService.js"; // Assume this would exist
// import firebaseAdmin from "firebase-admin"; // Assume initialized

export const bootstrapAdmin = async (req, res) => {
  try {
    const configuredSecret = String(process.env.ADMIN_BOOTSTRAP_SECRET || "").trim();
    if (!configuredSecret) {
      return handleResponse(res, 503, "Admin bootstrap is not configured");
    }

    const suppliedSecret = readBootstrapSecret(req);
    if (!suppliedSecret || suppliedSecret !== configuredSecret) {
      return handleResponse(res, 403, "Invalid admin bootstrap secret");
    }

    const existingCount = await Admin.countDocuments({});
    if (existingCount > 0) {
      return handleResponse(res, 409, "Admin bootstrap is disabled after initial setup");
    }

    const payload = validateSchema(bootstrapAdminSchema, req.body || {});
    const duplicate = await Admin.findOne({ email: payload.email }).lean();
    if (duplicate) {
      return handleResponse(res, 409, "Admin already exists");
    }

    const admin = await Admin.create({
      name: payload.name,
      email: payload.email,
      password: payload.password,
      role: "admin",
      isVerified: true, // Bootstrap admin is auto-verified
    });

    const token = generateToken(admin);
    const refreshToken = generateRefreshToken(admin);
    admin.refreshToken = refreshToken;
    await admin.save();

    return handleResponse(res, 201, "Admin bootstrapped successfully", {
      token,
      refreshToken,
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const signupAdmin = async (req, res) => {
  try {
    const payload = validateSchema(bootstrapAdminSchema, req.body || {});
    const duplicate = await Admin.findOne({ email: payload.email }).lean();
    if (duplicate) {
      return handleResponse(res, 409, "Admin already exists");
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');

    const admin = await Admin.create({
      name: payload.name,
      email: payload.email,
      password: payload.password,
      role: "admin",
      isVerified: false,
      verificationToken,
    });

    // TODO: Send verification email
    // await adminAuthEmailService.sendVerificationEmail(admin.email, verificationToken);

    return handleResponse(res, 201, "Admin registered successfully. Please check your email to verify.", {
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const verifyAdminEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return handleResponse(res, 400, "Token is required");

    const admin = await Admin.findOne({ verificationToken: token });
    if (!admin) return handleResponse(res, 400, "Invalid or expired token");

    admin.isVerified = true;
    admin.verificationToken = undefined;
    await admin.save();

    return handleResponse(res, 200, "Email verified successfully. You can now login.");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const loginAdmin = async (req, res) => {
  try {
    const payload = validateSchema(loginAdminSchema, req.body || {});

    const admin = await Admin.findOne({ email: payload.email }).select("+password").populate("adminRole");
    if (!admin) {
      return handleResponse(res, 401, "Invalid credentials");
    }

    if (!admin.isVerified) {
      return handleResponse(res, 403, "Please verify your email before logging in.");
    }

    const isMatch = await admin.comparePassword(payload.password);
    if (!isMatch) {
      return handleResponse(res, 401, "Invalid credentials");
    }

    admin.lastLogin = new Date();
    await admin.save();

    const token = generateToken(admin);
    const refreshToken = generateRefreshToken(admin);
    admin.refreshToken = refreshToken;
    await admin.save();

    return handleResponse(res, 200, "Login successful", {
      token,
      refreshToken,
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const sendAdminOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return handleResponse(res, 404, "Admin not found");
    if (!admin.isVerified) return handleResponse(res, 403, "Email not verified");

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    admin.otp = otp;
    admin.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
    await admin.save();

    // TODO: Send OTP via email/SMS
    // await adminAuthEmailService.sendOtpEmail(admin.email, otp);

    return handleResponse(res, 200, "OTP sent successfully to email");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const verifyAdminOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const admin = await Admin.findOne({ email }).select("+otp").populate("adminRole");
    
    if (!admin) return handleResponse(res, 404, "Admin not found");
    if (admin.otp !== otp || admin.otpExpires < new Date()) {
      return handleResponse(res, 401, "Invalid or expired OTP");
    }

    admin.otp = undefined;
    admin.otpExpires = undefined;
    admin.lastLogin = new Date();
    await admin.save();

    const token = generateToken(admin);
    const refreshToken = generateRefreshToken(admin);
    admin.refreshToken = refreshToken;
    await admin.save();

    return handleResponse(res, 200, "Login successful", {
      token,
      refreshToken,
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const ssoAdminLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return handleResponse(res, 400, "ID token required");

    // Stub for Firebase Admin SDK verification
    // const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
    // const email = decodedToken.email;
    
    // Placeholder to allow mock logic for SSO
    const email = req.body.email || "test@example.com"; 

    const admin = await Admin.findOne({ email }).populate("adminRole");
    if (!admin) return handleResponse(res, 404, "Admin not registered in system");

    if (!admin.isVerified) {
       admin.isVerified = true; // Auto verify on SSO
    }

    admin.lastLogin = new Date();
    await admin.save();

    const token = generateToken(admin);
    const refreshToken = generateRefreshToken(admin);
    admin.refreshToken = refreshToken;
    await admin.save();

    return handleResponse(res, 200, "SSO Login successful", {
      token,
      refreshToken,
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   REFRESH TOKEN
================================ */
export const refreshAdminToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return handleResponse(res, 401, "Refresh token is required");
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
        const admin = await Admin.findById(decoded.id).select("+refreshToken");

        if (!admin) {
            return handleResponse(res, 401, "Invalid refresh token");
        }

        const newAccessToken = generateToken(admin);
        // Do not rotate the refresh token to prevent multi-tab race conditions and multi-device logouts

        return handleResponse(res, 200, "Token refreshed successfully", {
            token: newAccessToken,
            refreshToken: refreshToken,
        });
    } catch (error) {
        return handleResponse(res, 401, "Refresh token expired or invalid");
    }
};

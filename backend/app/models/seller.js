import mongoose from "mongoose";
import bcrypt from "bcrypt";

const sellerSchema = new mongoose.Schema(
  {
    sellerId: {
      type: String,
      unique: true,
      sparse: true, // sparse is useful if old records don't have it initially, though we'll migrate them.
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    shopName: {
      type: String,
      required: true,
      trim: true,
    },

    shopImage: {
      type: String,
      trim: true,
    },

    storefrontImage: {
      type: String,
      trim: true,
    },

    category: {
      type: String,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    panNumber: {
      type: String,
      trim: true,
    },
    
    cinNumber: {
      type: String,
      trim: true,
    },

    tradeLicenseNumber: {
      type: String,
      trim: true,
    },

    gstin: {
      type: String,
      trim: true,
    },

    // GST Registration status — determines ECO tax mechanism & reporting
    gstStatus: {
      type: String,
      enum: ["REGISTERED", "UNREGISTERED", "COMPOSITION"],
      default: "UNREGISTERED",
      index: true,
    },

    // 2-digit GST state code (e.g. "21" for Odisha, "27" for Maharashtra)
    // For REGISTERED sellers: derived/validated from first 2 chars of GSTIN
    // For UNREGISTERED sellers: set from business address
    stateCode: {
      type: String,
      trim: true,
      maxlength: 2,
    },

    // Section classification (default SECTION_52_TCS for marketplace sellers)
    // Only override to SECTION_9_5 for categories specifically notified by Govt
    ecoTaxMechanism: {
      type: String,
      enum: ["SECTION_52_TCS", "SECTION_9_5", "NORMAL_SUPPLY", "NOT_APPLICABLE"],
      default: "SECTION_52_TCS",
    },

    address: {
      type: String,
      trim: true,
    },
    locality: {
      type: String,
      trim: true,
    },
    pincode: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },

    documents: {
      tradeLicense: { type: String, trim: true },
      gstCertificate: { type: String, trim: true },
      idProof: { type: String, trim: true },
      businessRegistration: { type: String, trim: true },
      fssaiLicense: { type: String, trim: true },
      sellerImage: { type: String, trim: true },
      other: { type: String, trim: true },
    },

    bankDetails: {
      accountHolderName: { type: String, trim: true },
      bankName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      ifscCode: { type: String, trim: true },
      accountType: { type: String, enum: ["Savings", "Current"], default: "Savings" },
      cancelledChequeImage: { type: String, trim: true }
    },

    upiDetails: {
      upiId: { type: String, trim: true },
      qrCodeImage: { type: String, trim: true }
    },

    role: {
      type: String,
      default: "seller",
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    phoneVerified: {
      type: Boolean,
      default: false,
    },

    applicationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    reviewedAt: {
      type: Date,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },

    rejectionReason: {
      type: String,
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: false,
    },
    isOnline: {
      type: Boolean,
      default: true,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    zone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Zone",
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
    serviceRadius: {
      type: Number,
      default: 5, // Default 5km
    },
    estimatedDeliveryTime: {
      type: String,
      default: "8-15 mins",
      trim: true,
    },
    preparationTime: {
      type: Number,
      default: 10, // Default 10 minutes preparation time
    },
    lastLogin: Date,
    refreshToken: {
      type: String,
      select: false,
    },
  },
  { timestamps: true },
);

sellerSchema.index({ location: "2dsphere" });
sellerSchema.index({ isActive: 1, isVerified: 1 });
sellerSchema.index({ isActive: 1, isVerified: 1, isOnline: 1 });

// Hash password before saving
sellerSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
sellerSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model("Seller", sellerSchema);

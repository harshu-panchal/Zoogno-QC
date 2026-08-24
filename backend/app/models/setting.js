import mongoose from "mongoose";
import {
    ALL_DELIVERY_PRICING_MODES,
    ALL_HANDLING_FEE_STRATEGIES,
} from "../constants/finance.js";

const settingSchema = new mongoose.Schema(
    {
        // General
        appName: {
            type: String,
            default: "Appzeto Quick Commerce",
        },
        supportEmail: {
            type: String,
            default: "support@appzeto.com",
        },
        supportPhone: {
            type: String,
            default: "",
        },
        currencySymbol: {
            type: String,
            default: "₹",
        },
        currencyCode: {
            type: String,
            default: "INR",
        },
        timezone: {
            type: String,
            default: "Asia/Kolkata",
        },

        // Branding
        logoUrl: String,
        faviconUrl: String,
        signatureUrl: String,
        primaryColor: {
            type: String,
            default: "#0ea5e9",
        },
        secondaryColor: {
            type: String,
            default: "#64748b",
        },

        // Legal
        companyName: String,
        taxId: String,
        address: String,
        gstin: String,
        panNumber: String,
        fssaiLicense: String,
        cinNumber: String,
        pinCode: String,

        // Social
        facebook: String,
        twitter: String,
        instagram: String,
        linkedin: String,
        youtube: String,

        // Apps
        playStoreLink: String,
        appStoreLink: String,

        // SEO
        metaTitle: String,
        metaDescription: String,
        metaKeywords: String,
        keywords: [{ type: String }], // Array for structured SEO keywords

        hsnCodes: {
            delivery: { type: String, default: "996813" },
            handling: { type: String, default: "996711" },
            surge: { type: String, default: "999999" }
        },

        // Optional: multi-tenant (null = default tenant)
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
            index: true,
        },

        // OTP Provider configuration
        otpProvider: {
            type: String,
            enum: ["smsIndiaHub", "firebase"],
            default: "firebase",
        },

        // Payment Gateway configuration
        paymentGateway: {
            type: String,
            enum: ["cashfree"],
            default: "cashfree",
        },

        // Returns / logistics configuration
        returnDeliveryCommission: {
            // Flat amount per return pickup, paid by seller
            type: Number,
            default: 0,
        },
        returnWindowMinutes: {
            type: Number,
            default: 180, // Default 3 hours
        },
        returnEligibilityDelayMinutes: {
            type: Number,
            default: 2, // Default 2 mins to allow system settlement sync before allowing returns
        },

        /**
         * Finance / delivery pricing rules (single source of truth).
         * Existing keys are kept for backward compatibility.
         */
        deliveryPricingMode: {
            type: String,
            enum: ALL_DELIVERY_PRICING_MODES,
            default: "distance_based",
        },
        pricingMode: {
            type: String,
            enum: ALL_DELIVERY_PRICING_MODES,
            default: "distance_based",
        },
        customerBaseDeliveryFee: {
            type: Number,
            default: 30,
            min: 0,
        },
        riderEarningType: {
            type: String,
            enum: ['fixed', 'distance_based'],
            default: 'fixed',
        },
        riderFixedAmount: {
            type: Number,
            default: 20,
            min: 0,
        },
        riderBaseDistance: {
            type: Number,
            default: 4,
            min: 0,
        },
        riderBaseEarning: {
            type: Number,
            default: 25,
            min: 0,
        },
        riderExtraPerKm: {
            type: Number,
            default: 5,
            min: 0,
        },
        baseDeliveryCharge: {
            type: Number,
            default: 30,
            min: 0,
        },
        baseDistanceCapacityKm: {
            type: Number,
            default: 0.5,
            min: 0,
        },
        incrementalKmSurcharge: {
            type: Number,
            default: 10,
            min: 0,
        },
        deliveryPartnerRatePerKm: {
            type: Number,
            default: 5,
            min: 0,
        },
        fleetCommissionRatePerKm: {
            type: Number,
            default: 5,
            min: 0,
        },
        fixedDeliveryFee: {
            type: Number,
            default: 30,
            min: 0,
        },
        handlingFeeStrategy: {
            type: String,
            enum: ALL_HANDLING_FEE_STRATEGIES,
            default: "highest_category_fee",
        },
        freeDeliveryThreshold: {
            type: Number,
            default: 0,
        },
        codEnabled: {
            type: Boolean,
            default: true,
        },
        onlineEnabled: {
            type: Boolean,
            default: true,
        },
        useGlobalBilling: {
            type: Boolean,
            default: false,
        },
        globalCommissionType: {
            type: String,
            enum: ["percentage", "fixed"],
            default: "percentage",
        },
        globalCommissionValue: {
            type: Number,
            default: 0,
        },
        globalHandlingFeeType: {
            type: String,
            enum: ["none", "fixed", "percentage"],
            default: "none",
        },
        globalHandlingFeeValue: {
            type: Number,
            default: 0,
        },
        globalPlatformFeeType: {
            type: String,
            enum: ["none", "fixed", "percentage"],
            default: "none",
        },
        globalPlatformFeeValue: {
            type: Number,
            default: 0,
        },
        lowStockAlertsEnabled: {
            type: Boolean,
            default: true,
        },
        productApproval: {
            sellerCreateRequiresApproval: {
                type: Boolean,
                default: false,
            },
            sellerEditRequiresApproval: {
                type: Boolean,
                default: false,
            },
        },
        paperBagPricing: {
            small: { type: Number, default: 0 },
            medium: { type: Number, default: 0 },
            large: { type: Number, default: 0 },
            xl: { type: Number, default: 0 }
        },
        basketPricing: {
            small: { type: Number, default: 0 },
            medium: { type: Number, default: 0 },
            large: { type: Number, default: 0 }
        },

        /**
         * GST Tax Configuration — CA/admin configurable.
         * NOT hardcoded. CA sets SAC codes, rates and ECO mechanism here.
         * This config drives all GST report generation.
         */
        gstConfig: {
            // --- Zoogno's own GST registrations ---
            // Main GSTIN for B2B invoicing & regular GST compliance
            zoognoGstin: { type: String, trim: true },
            zoognoLegalName: { type: String, trim: true, default: "Zoogno" },
            zoognoStateCode: { type: String, trim: true }, // e.g. "21" for Odisha
            zoognoState: { type: String, trim: true },

            // Separate TCS registration (Section 52) — MAY differ from main GSTIN
            tcsGstin: { type: String, trim: true },
            tcsStateName: { type: String, trim: true },

            // --- Default ECO tax mechanism for marketplace sellers ---
            // SECTION_52_TCS = seller raises invoice, Zoogno collects TCS
            // SECTION_9_5    = Zoogno is deemed supplier (specific notified categories only)
            // NORMAL_SUPPLY  = No TCS, seller handles own GST
            defaultEcoTaxMechanism: {
                type: String,
                enum: ["SECTION_52_TCS", "SECTION_9_5", "NORMAL_SUPPLY", "NOT_APPLICABLE"],
                default: "SECTION_52_TCS",
            },

            // --- TCS (Section 52) rate ---
            tcsRate: { type: Number, default: 1, min: 0, max: 100 }, // 1% default

            // --- Platform Fee service config ---
            platformFeeSac: { type: String, trim: true, default: "998599" },
            platformFeeGstRate: { type: Number, default: 18, min: 0, max: 28 },
            platformFeeDescription: { type: String, trim: true, default: "Online Marketplace Services" },

            // --- Delivery Fee service config ---
            deliveryFeeSac: { type: String, trim: true, default: "996813" },
            deliveryFeeGstRate: { type: Number, default: 18, min: 0, max: 28 },
            deliveryFeeDescription: { type: String, trim: true, default: "Local Delivery of Goods" },

            // --- Handling Fee service config ---
            handlingFeeSac: { type: String, trim: true, default: "996711" },
            handlingFeeGstRate: { type: Number, default: 18, min: 0, max: 28 },
            handlingFeeDescription: { type: String, trim: true, default: "Packaging and Handling Charges" },

            // --- Commission service config (Zoogno charges seller) ---
            commissionSac: { type: String, trim: true, default: "998599" },
            commissionGstRate: { type: Number, default: 18, min: 0, max: 28 },
            commissionDescription: { type: String, trim: true, default: "Marketplace Commission" },

            // --- Financial Year ---
            fyStartMonth: { type: Number, default: 4, min: 1, max: 12 }, // April = 4

            // --- E-Invoice threshold (in Rs) ---
            eInvoiceThreshold: { type: Number, default: 50000000 }, // 5 Cr default
        },
    },
    {
        timestamps: true,
    }
);

settingSchema.pre("save", function syncFinanceAliases(next) {
    if (!this.pricingMode && this.deliveryPricingMode) {
        this.pricingMode = this.deliveryPricingMode;
    }
    if (!this.deliveryPricingMode && this.pricingMode) {
        this.deliveryPricingMode = this.pricingMode;
    }

    if (this.baseDeliveryCharge == null) {
        this.baseDeliveryCharge = this.customerBaseDeliveryFee ?? 30;
    }
    if (this.customerBaseDeliveryFee == null) {
        this.customerBaseDeliveryFee = this.baseDeliveryCharge ?? 30;
    }

    // Removed legacy aliases for riderBasePayout and deliveryPartnerRatePerKm

    if (this.fixedDeliveryFee == null) {
        this.fixedDeliveryFee = this.baseDeliveryCharge ?? this.customerBaseDeliveryFee ?? 30;
    }

    next();
});

export default mongoose.model("Setting", settingSchema);

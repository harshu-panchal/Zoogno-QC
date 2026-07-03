import mongoose from "mongoose";
import bcrypt from "bcrypt";

const adminSchema = new mongoose.Schema(
  {
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
      trim: true,
      unique: true,
      sparse: true,
    },

    profileImage: {
      type: String,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      default: "admin", // The platform-level role used by the frontend RoleGuard
    },
    
    adminRole: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role", // The fine-grained custom role (e.g., Manager, Support)
    },

    isVerified: {
      type: Boolean,
      default: false, 
    },
    
    isActive: {
      type: Boolean,
      default: true,
    },
    
    verificationToken: String,
    
    otp: {
      type: String,
      select: false,
    },
    otpExpires: Date,

    lastLogin: Date,

    refreshToken: {
      type: String,
      select: false,
    },
  },
  { timestamps: true },
);

// Hash password before saving
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
adminSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model("Admin", adminSchema);

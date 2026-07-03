import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";
import { UserRole } from "@core/constants/roles";
import {
  Mail,
  Lock,
  User,
  Phone,
  ArrowRight,
  Store,
  ShoppingBag,
  TrendingUp,
  Rocket,
  Globe,
  MapPin,
  LayoutList,
  FileText,
  Upload,
  CheckCircle,
  Navigation,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import Lottie from "lottie-react";
import sellerAnimation from "../../../assets/INSTANT_6.json";
import { sellerApi } from "../services/sellerApi";
import MapPicker from "../../../shared/components/MapPicker";
import { auth, RecaptchaVerifier, signInWithPhoneNumber } from "../../../firebase/firebase";

const createInitialVerificationState = () => ({
  status: "idle",
  otp: "",
  token: "",
  isOtpVisible: false,
  isSending: false,
  isVerifying: false,
  verifiedValue: "",
  confirmationResult: null,
});

const REQUIRED_DOCUMENT_CONFIG = [
  { id: "tradeLicense", label: "Trade License" },
  { id: "gstCertificate", label: "GST Certificate" },
  { id: "idProof", label: "ID Proof" },
  { id: "sellerImage", label: "Seller Photo" },
];

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [signupStep, setSignupStep] = useState(1);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const { login } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const appName = settings?.appName || "App";
  const logoUrl = settings?.logoUrl || "";
  const [verifications, setVerifications] = useState({
    email: createInitialVerificationState(),
    phone: createInitialVerificationState(),
  });

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    shopName: "",
    phone: "",
    locality: "",
    pincode: "",
    city: "",
    state: "",
    category: "",
    description: "",
    lat: null,
    lng: null,
    radius: 5,
    address: "",
    panNumber: "",
    cinNumber: "",
    tradeLicenseNumber: "",
    gstin: "",
    bagOption: "", // "purchase", "query", or "none"
  });

  const handleLocationSelect = (location) => {
    setFormData((prev) => ({
      ...prev,
      lat: location.lat,
      lng: location.lng,
      radius: location.radius,
      address: location.address,
      locality: location.locality || prev.locality,
      pincode: location.pincode || prev.pincode,
      city: location.city || prev.city,
      state: location.state || prev.state,
    }));
  };

  const [documents, setDocuments] = useState({
    tradeLicense: null,
    gstCertificate: null,
    idProof: null,
    sellerImage: null,
  });

  const getMissingRequiredDocuments = () =>
    REQUIRED_DOCUMENT_CONFIG.filter((doc) => !documents[doc.id]);

  const updateVerificationState = (field, updates) => {
    setVerifications((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        ...updates,
      },
    }));
  };

  const resetVerificationState = (field) => {
    setVerifications((prev) => ({
      ...prev,
      [field]: createInitialVerificationState(),
    }));
  };

  const getVerificationPayload = (field) => {
    const channel = field === "email" ? "email" : "phone";
    return channel === "email"
      ? { channel, email: formData.email }
      : { channel, phone: formData.phone };
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "name") {
      // Owner name: only alphabets and spaces
      const cleaned = value.replace(/[^a-zA-Z\s]/g, "");
      setFormData({ ...formData, [name]: cleaned });
    } else if (name === "email") {
      // Business email: trim leading spaces, disallow spaces inside
      const cleaned = value.replace(/\s+/g, "").toLowerCase();
      if (cleaned !== formData.email) {
        resetVerificationState("email");
      }
      setFormData({ ...formData, [name]: cleaned });
    } else if (name === "phone") {
      // Contact number: only digits, max 10 characters
      const digitsOnly = value.replace(/[^0-9]/g, "").slice(0, 10);
      if (digitsOnly !== formData.phone) {
        resetVerificationState("phone");
      }
      setFormData({ ...formData, [name]: digitsOnly });
    } else if (name === "city" || name === "state") {
      // City & State: only alphabets and spaces
      const cleaned = value.replace(/[^a-zA-Z\s]/g, "");
      setFormData({ ...formData, [name]: cleaned });
    } else if (name === "pincode") {
      const digitsOnly = value.replace(/[^0-9]/g, "").slice(0, 6);
      setFormData({ ...formData, [name]: digitsOnly });
    } else if (name === "password") {
      // Password: allow any characters, min length 6
      setFormData({ ...formData, [name]: value });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleDocumentChange = (e, docName) => {
    setDocuments({ ...documents, [docName]: e.target.files[0] });
  };

  const handleCameraClick = async (e, docName) => {
    if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
      e.preventDefault();
      try {
        const result = await window.flutter_inappwebview.callHandler('openCamera');
        if (result && result.success) {
          const res = await fetch(`data:${result.mimeType};base64,${result.base64}`);
          const blob = await res.blob();
          const file = new File([blob], result.fileName || 'camera_image.jpg', { type: result.mimeType });
          
          setDocuments(prev => ({ ...prev, [docName]: file }));
        }
      } catch (error) {
        console.error("Flutter bridge error:", error);
      }
    }
  };

  const setupRecaptcha = () => {
    try {
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
        document.getElementById('recaptcha-container').innerHTML = '';
      }
    } catch (e) {
      console.error("Error clearing recaptcha", e);
    }

    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      'size': 'invisible',
      'callback': (response) => {
        // reCAPTCHA solved
      },
      'expired-callback': () => {
        // Response expired. Ask user to solve reCAPTCHA again.
      }
    });
  };

  const handleSendVerificationOtp = async (field) => {
    const currentValue = formData[field];
    const isEmailField = field === "email";

    if (
      (isEmailField &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentValue || "")) ||
      (!isEmailField && !/^[6-9]\d{9}$/.test(currentValue || ""))
    ) {
      toast.error(
        isEmailField
          ? "Enter a valid email before requesting OTP."
          : "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9 before requesting OTP.",
      );
      return;
    }

    updateVerificationState(field, {
      isSending: true,
      isOtpVisible: true,
      otp: "",
      token: "",
      status: "sending",
    });

    try {
      if (field === "phone") {
        setupRecaptcha();
        const appVerifier = window.recaptchaVerifier;
        const phoneNumber = "+91" + currentValue;
        const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
        updateVerificationState(field, {
          isSending: false,
          isOtpVisible: true,
          status: "otp-sent",
          confirmationResult: confirmationResult,
        });
        toast.success("Verification OTP sent to your phone via Firebase.");
      } else {
        await sellerApi.sendVerificationOtp(getVerificationPayload(field));
        updateVerificationState(field, {
          isSending: false,
          isOtpVisible: true,
          status: "otp-sent",
        });
        toast.success("Verification OTP sent to your email.");
      }
    } catch (error) {
      updateVerificationState(field, {
        isSending: false,
        status: "idle",
      });
      console.error(error);
      toast.error(error.message || error.response?.data?.message || "Failed to send OTP");
    }
  };

  const handleVerifyOtp = async (field) => {
    const verificationState = verifications[field];
    
    // Email uses 4 digit, Phone uses 6 digit
    if (field === "email" && !/^\d{4}$/.test(verificationState.otp || "")) {
      toast.error("Enter a valid 4-digit OTP.");
      return;
    }
    if (field === "phone" && !/^\d{6}$/.test(verificationState.otp || "")) {
      toast.error("Enter a valid 6-digit OTP.");
      return;
    }

    updateVerificationState(field, {
      isVerifying: true,
    });

    try {
      if (field === "phone") {
        const result = await verificationState.confirmationResult.confirm(verificationState.otp);
        const token = await result.user.getIdToken();
        updateVerificationState(field, {
          isVerifying: false,
          isOtpVisible: false,
          status: "verified",
          otp: "",
          token: token,
          verifiedValue: formData[field],
        });
        toast.success("Phone number verified successfully via Firebase.");
      } else {
        const response = await sellerApi.verifyVerificationOtp({
          ...getVerificationPayload(field),
          otp: verificationState.otp,
        });
        const verificationToken = response.data?.result?.verificationToken || "";

        updateVerificationState(field, {
          isVerifying: false,
          isOtpVisible: false,
          status: "verified",
          otp: "",
          token: verificationToken,
          verifiedValue: formData[field],
        });
        toast.success("Email verified successfully.");
      }
    } catch (error) {
      updateVerificationState(field, {
        isVerifying: false,
      });
      toast.error(error.message || error.response?.data?.message || "Failed to verify OTP");
    }
  };

  const handlePanelWheel = (e) => {
    const panel = e.currentTarget;
    if (panel.scrollHeight <= panel.clientHeight) {
      return;
    }

    e.preventDefault();
    panel.scrollTop += e.deltaY;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (isLogin) {
        setIsLoading(true);
        const response = await sellerApi.login({
          email: formData.email,
          password: formData.password,
        });
        const { token, refreshToken, seller } = response.data.result;
        login({
          ...seller,
          token,
          refreshToken,
          role: "seller",
        });
        toast.success("Welcome back, Partner!");
        navigate("/seller");
        return;
      }

      // Signup step validations
      if (!isLogin) {
        if (signupStep === 1) {
          if (!formData.name.trim() || !formData.shopName.trim()) {
            toast.error("Please enter owner name and shop name.");
            return;
          }
        } else if (signupStep === 2) {
          if (!/^[6-9]\d{9}$/.test(formData.phone)) {
            toast.error("Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.");
            return;
          }
          if (verifications.phone.status !== "verified" || !verifications.phone.token) {
            toast.error("Please verify your contact number before continuing.");
            return;
          }
        } else if (signupStep === 3) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            toast.error("Please enter a valid business email address.");
            return;
          }
          if (verifications.email.status !== "verified" || !verifications.email.token) {
            toast.error("Please verify your business email before continuing.");
            return;
          }
        } else if (signupStep === 4) {
          if (!formData.category.trim() || !formData.description.trim() || !formData.panNumber.trim() || !formData.cinNumber.trim()) {
             toast.error("Please fill all business details.");
             return;
          }
          const pwd = (formData.password || "").trim();
          if (pwd.length < 6) {
            toast.error("Password must be at least 6 characters.");
            return;
          }
        } else if (signupStep === 5) {
          if (!formData.lat || !formData.lng) {
             toast.error("Please pin your shop location on the map.");
             return;
          }
        } else if (signupStep === 6) {
          const missingRequiredDocuments = getMissingRequiredDocuments();
          if (missingRequiredDocuments.length > 0) {
            toast.error(
              `Please upload all required documents: ${missingRequiredDocuments
                .map((doc) => doc.label)
                .join(", ")}`
            );
            return;
          }
        }
      }

      if (!isLogin && signupStep < 7) {
        setSignupStep((prev) => prev + 1);
        return;
      }

      setIsLoading(true);
      const address =
        formData.address ||
        [
          formData.locality,
          formData.city,
          formData.state,
          formData.pincode,
        ]
          .filter(Boolean)
          .join(", ");

      const signupPayload = new FormData();

      Object.entries({
        ...formData,
        address,
        lat: formData.lat,
        lng: formData.lng,
        radius: formData.radius,
        emailVerificationToken: verifications.email.token,
        phoneVerificationToken: verifications.phone.token,
      }).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== "") {
          signupPayload.append(key, value);
        }
      });

      Object.entries(documents).forEach(([key, file]) => {
        if (file) {
          signupPayload.append(key, file);
        }
      });

      await sellerApi.signup(signupPayload);

      setIsLogin(true);
      setSignupStep(1);
      setDocuments({
        tradeLicense: null,
        gstCertificate: null,
        idProof: null,
        sellerImage: null,
      });
      setVerifications({
        email: createInitialVerificationState(),
        phone: createInitialVerificationState(),
      });
      setFormData((prev) => ({
        ...prev,
        password: "",
      }));
      toast.success(
        "Application submitted. Login is enabled only after admin approval.",
      );
      navigate("/seller/pending-approval", {
        replace: true,
        state: {
          approvalRequired: true,
          applicationStatus: "pending",
        },
      });
    } catch (error) {
      if (isLogin && error.response?.status === 403) {
        const applicationStatus =
          error.response?.data?.result?.applicationStatus || "pending";
        const rejectionReason =
          error.response?.data?.result?.rejectionReason || "";
        navigate("/seller/pending-approval", {
          replace: true,
          state: {
            approvalRequired: true,
            applicationStatus,
            rejectionReason,
          },
        });
      }
      toast.error(error.response?.data?.message || "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  
    // Handle body scroll locking for modals
    React.useEffect(() => {
        const hasOpenModal = isMapOpen;
        if (hasOpenModal) {
            document.body.style.overflow = 'hidden';
            if (window.lenis) window.lenis.stop();
        } else {
            document.body.style.overflow = '';
            if (window.lenis) window.lenis.start();
        }
        return () => {
            document.body.style.overflow = '';
            if (window.lenis) window.lenis.start();
        };
    }, [isMapOpen]);

    return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#fcfaff] p-6 font-['Outfit'] overflow-hidden">
      {/* Elegant Ambient Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[60%] h-[60%] bg-slate-100/50 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-5%] right-[-5%] w-[40%] h-[40%] bg-slate-50/50 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-[1000px] min-h-[600px] max-h-[90vh] bg-white rounded-lg shadow-[0_50px_120px_rgba(0,0,0,0.04)] border border-white flex flex-col md:flex-row overflow-hidden">
        {/* Visual Side Panel */}
        <div className="hidden md:flex w-[45%] bg-linear-to-br from-slate-900 via-slate-950 to-black relative flex-col items-center justify-center p-10 overflow-hidden">
          {/* Abstract Decorative Circles */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-slate-500/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="relative z-10 w-full flex flex-col items-center">
            {/* Lottie Animation for Seller */}
            <div className="w-full max-w-[350px] drop-shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
              <Lottie
                animationData={sellerAnimation}
                loop={true}
                className="w-full h-auto"
              />
            </div>

            <div className="mt-8 text-center space-y-4">
              <h2 className="text-2xl font-black text-white tracking-tight leading-tight uppercase underline decoration-white/20 underline-offset-8">
                Seller <span className="text-slate-600">Expansion.</span>
              </h2>
            </div>
          </motion.div>

          {/* Partner Badges */}
          <div className="absolute bottom-12 left-0 right-0 px-12 flex justify-between items-center opacity-60">
            <div className="flex items-center gap-2 text-white/80">
              <Rocket size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Growth First
              </span>
            </div>
            <div className="flex items-center gap-2 text-white/80">
              <Globe size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Pan India
              </span>
            </div>
          </div>
        </div>

        {/* Form Content Side */}
        <div
          className="w-full md:w-[55%] min-h-0 p-6 md:p-8 flex flex-col justify-center bg-white overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar relative"
          onWheelCapture={handlePanelWheel}
          style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="hidden md:flex absolute top-6 right-6 z-20">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${appName} logo`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Store size={30} className="text-slate-700" />
              )}
            </div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={isLogin ? "login" : `signup-step-${signupStep}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className="space-y-6 py-4 md:py-6">
              <div className="space-y-3">
                <span className="inline-block px-4 py-1 bg-slate-100 text-slate-800 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-200">
                  {isLogin
                    ? "Welcome Back"
                    : `New Partnership - Step ${signupStep} of 7`}
                </span>
                <h1 className="text-3xl font-black text-slate-900 tracking-tighter">
                  Seller{" "}
                  <span className="text-slate-900">
                    {isLogin ? "Login" : "Signup"}
                  </span>
                </h1>
                <p className="text-slate-600 font-medium text-base leading-relaxed">
                  {isLogin
                    ? "Access your unified seller dashboard and manage orders."
                    : signupStep === 1
                      ? "Register your store and start selling instantly."
                      : signupStep === 2
                        ? "Verify your contact number."
                        : signupStep === 3
                          ? "Verify your business email."
                          : signupStep === 4
                            ? "Provide your business details."
                            : signupStep === 5
                              ? "Set your shop address and service area precisely."
                              : signupStep === 6
                                ? "Upload verification documents to complete your application."
                                : "Choose paper bag options for delivering orders."}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                {/* LOGIN OR SIGNUP STEP 1 */}
                {(isLogin || signupStep === 1) && (
                  <>
                    {!isLogin && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="relative group">
                          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                            <User size={18} />
                          </div>
                          <input
                            type="text"
                            name="name"
                            required
                            placeholder="Owner Name"
                            className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all duration-300 placeholder:text-slate-400"
                            value={formData.name}
                            onChange={handleChange}
                          />
                        </div>
                        <div className="relative group">
                          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                            <Store size={18} />
                          </div>
                          <input
                            type="text"
                            name="shopName"
                            required
                            placeholder="Shop / Business Name"
                            className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all duration-300 placeholder:text-slate-400"
                            value={formData.shopName}
                            onChange={handleChange}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* SIGNUP STEP 2: Phone */}
                {!isLogin && signupStep === 2 && (
                  <>
                    <div className="relative group">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                        <Phone size={18} />
                      </div>
                      <input
                        type="tel"
                        name="phone"
                        required
                        placeholder="Contact Number"
                        className="w-full pl-12 pr-28 py-3 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all duration-300 placeholder:text-slate-400"
                        value={formData.phone}
                        onChange={handleChange}
                      />
                      <button
                        type="button"
                        onClick={() => handleSendVerificationOtp("phone")}
                        disabled={
                          verifications.phone.isSending ||
                          verifications.phone.status === "verified" ||
                          !/^[6-9]\d{9}$/.test(formData.phone || "")
                        }
                        className={`absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${verifications.phone.status === "verified"
                          ? "bg-brand-100 text-brand-700 cursor-default"
                          : "bg-slate-900 text-white hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed"
                          }`}>
                        {verifications.phone.isSending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : verifications.phone.status === "verified" ? (
                          "Verified"
                        ) : verifications.phone.isOtpVisible ? (
                          "Resend"
                        ) : (
                          "Verify"
                        )}
                      </button>
                    </div>
                    {verifications.phone.isOtpVisible && verifications.phone.status !== "verified" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-600 ml-1">Enter Phone OTP</label>
                          <button
                            type="button"
                            onClick={() => handleVerifyOtp("phone")}
                            disabled={verifications.phone.isVerifying || verifications.phone.otp.length !== 6}
                            className="shrink-0 rounded-md bg-slate-900 text-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider shadow-sm hover:bg-black disabled:opacity-50"
                          >
                            {verifications.phone.isVerifying ? "Checking..." : "Confirm OTP"}
                          </button>
                        </div>
                        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="6-digit OTP"
                            value={verifications.phone.otp}
                            onChange={(e) =>
                              updateVerificationState("phone", {
                                otp: e.target.value.replace(/\D/g, "").slice(0, 6),
                              })
                            }
                            className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-400"
                          />
                        </div>
                      </div>
                    )}
                    {verifications.phone.status === "verified" && (
                      <div className="flex items-center gap-2 text-[11px] font-bold text-brand-600">
                        <CheckCircle className="h-4 w-4" />
                        <span>Phone number verified successfully.</span>
                      </div>
                    )}
                  </>
                )}

                {/* SIGNUP STEP 3: Email */}
                {!isLogin && signupStep === 3 && (
                  <>
                    <div className="relative group">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                        <Mail size={18} />
                      </div>
                      <input
                        type="email"
                        name="email"
                        required
                        inputMode="email"
                        autoComplete="email"
                        placeholder="Business Email"
                        className={`w-full pl-12 py-3 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all duration-300 placeholder:text-slate-400 pr-28`}
                        value={formData.email}
                        onChange={handleChange}
                      />
                      <button
                        type="button"
                        onClick={() => handleSendVerificationOtp("email")}
                        disabled={
                          verifications.email.isSending ||
                          verifications.email.status === "verified" ||
                          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email || "")
                        }
                        className={`absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${verifications.email.status === "verified"
                          ? "bg-brand-100 text-brand-700 cursor-default"
                          : "bg-slate-900 text-white hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed"
                          }`}>
                        {verifications.email.isSending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : verifications.email.status === "verified" ? (
                          "Verified"
                        ) : verifications.email.isOtpVisible ? (
                          "Resend"
                        ) : (
                          "Verify"
                        )}
                      </button>
                    </div>
                    {verifications.email.isOtpVisible && verifications.email.status !== "verified" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-600 ml-1">Enter Email OTP</label>
                          <button
                            type="button"
                            onClick={() => handleVerifyOtp("email")}
                            disabled={verifications.email.isVerifying || verifications.email.otp.length !== 4}
                            className="shrink-0 rounded-md bg-slate-900 text-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider shadow-sm hover:bg-black disabled:opacity-50"
                          >
                            {verifications.email.isVerifying ? "Checking..." : "Confirm OTP"}
                          </button>
                        </div>
                        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={4}
                            placeholder="4-digit OTP"
                            value={verifications.email.otp}
                            onChange={(e) =>
                              updateVerificationState("email", {
                                otp: e.target.value.replace(/\D/g, "").slice(0, 4),
                              })
                            }
                            className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-400"
                          />
                        </div>
                      </div>
                    )}
                    {verifications.email.status === "verified" && (
                      <div className="flex items-center gap-2 text-[11px] font-bold text-brand-600">
                        <CheckCircle className="h-4 w-4" />
                        <span>Email verified successfully.</span>
                      </div>
                    )}
                  </>
                )}

                {/* SIGNUP STEP 4: Business Details */}
                {!isLogin && signupStep === 4 && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="relative group">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                          <Store size={18} />
                        </div>
                        <input
                          type="text"
                          name="category"
                          required
                          placeholder="Business Category"
                          className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all duration-300 placeholder:text-slate-400"
                          value={formData.category}
                          onChange={handleChange}
                        />
                      </div>
                      <div className="relative group">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                          <FileText size={18} />
                        </div>
                        <input
                          type="text"
                          name="description"
                          required
                          placeholder="Brief Description"
                          className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all duration-300 placeholder:text-slate-400"
                          value={formData.description}
                          onChange={handleChange}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="relative group">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                          <FileText size={18} />
                        </div>
                        <input
                          type="text"
                          name="panNumber"
                          required
                          placeholder="PAN Number"
                          className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all duration-300 placeholder:text-slate-400"
                          value={formData.panNumber}
                          onChange={handleChange}
                        />
                      </div>
                      <div className="relative group">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                          <FileText size={18} />
                        </div>
                        <input
                          type="text"
                          name="cinNumber"
                          required
                          placeholder="CIN Number"
                          className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all duration-300 placeholder:text-slate-400"
                          value={formData.cinNumber}
                          onChange={handleChange}
                        />
                      </div>
                    </div>

                    <div className="relative group">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                        <Lock size={18} />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        required
                        minLength={6}
                        autoComplete="current-password"
                        placeholder="Create a password"
                        className="w-full pl-12 pr-14 py-3 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all duration-300 placeholder:text-slate-400"
                        value={formData.password}
                        onChange={handleChange}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors px-2"
                        tabIndex="-1">
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </>
                )}

                {isLogin && (
                  <>
                    <div className="relative group">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                        <Mail size={18} />
                      </div>
                      <input
                        type="email"
                        name="email"
                        required
                        inputMode="email"
                        autoComplete="email"
                        placeholder="Business Email"
                        className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all duration-300 placeholder:text-slate-400"
                        value={formData.email}
                        onChange={handleChange}
                      />
                    </div>
                    <div className="relative group">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                        <Lock size={18} />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        required
                        minLength={6}
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        className="w-full pl-12 pr-14 py-3 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all duration-300 placeholder:text-slate-400"
                        value={formData.password}
                        onChange={handleChange}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors px-2"
                        tabIndex="-1">
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </>
                )}

                {/* SIGNUP STEP 5 (Shop address and service area) */}
                {!isLogin && signupStep === 5 && (
                  <div className="space-y-3">
                    <div className="pt-2">
                      <p className="text-sm font-black text-slate-600 uppercase tracking-widest mb-3">
                        Shop Location & Service Area
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsMapOpen(true)}
                        className={`w-full flex items-center justify-between p-4 rounded-lg border-2 border-dashed transition-all cursor-pointer ${formData.lat
                          ? "border-brand-200 bg-brand-50/50"
                          : "border-slate-200 bg-slate-50 hover:border-slate-300"
                          }`}>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className={`p-2 rounded-md shrink-0 ${formData.lat ? "bg-brand-100 text-brand-600" : "bg-white text-slate-600 shadow-sm"}`}>
                            {formData.lat ? (
                              <CheckCircle className="w-4 h-4" />
                            ) : (
                              <MapPin className="w-4 h-4" />
                            )}
                          </div>
                          <div className="text-left min-w-0 flex-1 pr-2">
                            <p
                              className={`text-xs font-bold truncate ${formData.lat ? "text-brand-700" : "text-slate-600"}`}>
                              {formData.lat
                                ? "Location Selected"
                                : "Pin Shop on Map"}
                            </p>
                            <p className="text-xs text-slate-600 font-medium truncate">
                              {formData.lat
                                ? `${formData.address} (${formData.radius}km)`
                                : "Precisely mark your shop location"}
                            </p>
                          </div>
                        </div>
                        {formData.lat && (
                          <span className="shrink-0 text-[10px] font-black text-brand-600 bg-brand-100 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                            Verified
                          </span>
                        )}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="relative group">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                          <MapPin size={18} />
                        </div>
                        <input
                          type="text"
                          name="locality"
                          required
                          placeholder="Locality / Area"
                          className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all duration-300 placeholder:text-slate-400"
                          value={formData.locality}
                          onChange={handleChange}
                        />
                      </div>
                      <div className="relative group">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                          <MapPin size={18} />
                        </div>
                        <input
                          type="text"
                          name="pincode"
                          required
                          placeholder="Pincode"
                          className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all duration-300 placeholder:text-slate-400"
                          value={formData.pincode}
                          onChange={handleChange}
                        />
                      </div>
                      <div className="relative group">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                          <MapPin size={18} />
                        </div>
                        <input
                          type="text"
                          name="city"
                          required
                          placeholder="City"
                          className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all duration-300 placeholder:text-slate-400"
                          value={formData.city}
                          onChange={handleChange}
                        />
                      </div>
                      <div className="relative group">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                          <MapPin size={18} />
                        </div>
                        <input
                          type="text"
                          name="state"
                          required
                          placeholder="State"
                          className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all duration-300 placeholder:text-slate-400"
                          value={formData.state}
                          onChange={handleChange}
                        />
                      </div>
                    </div>

                    <div className="relative group">
                      <div className="absolute left-5 top-5 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                        <MapPin size={18} />
                      </div>
                      <textarea
                        name="address"
                        rows={3}
                        required
                        placeholder="Full address"
                        className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all duration-300 placeholder:text-slate-400 resize-none"
                        value={formData.address}
                        onChange={handleChange}
                      />
                    </div>
                  </div>
                )}

                {/* SIGNUP STEP 6 (Verification documents) */}
                {!isLogin && signupStep === 6 && (
                  <div className="space-y-3">
                    <div className="pt-2">
                      <p className="text-sm font-black text-slate-600 uppercase tracking-widest mb-3">
                        Verification Documents
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <div className="relative group">
                          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                            <FileText size={18} />
                          </div>
                          <input
                            type="text"
                            name="tradeLicenseNumber"
                            required
                            placeholder="Trade License Number"
                            className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all duration-300 placeholder:text-slate-400"
                            value={formData.tradeLicenseNumber}
                            onChange={handleChange}
                          />
                        </div>
                        <div className="relative group">
                          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                            <FileText size={18} />
                          </div>
                          <input
                            type="text"
                            name="gstin"
                            required
                            placeholder="GST Certificate Number (GSTIN)"
                            className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all duration-300 placeholder:text-slate-400"
                            value={formData.gstin}
                            onChange={handleChange}
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        {REQUIRED_DOCUMENT_CONFIG.map((doc) => (
                          <div key={doc.id} className="relative">
                            <input
                              type="file"
                              id={doc.id}
                              className="hidden"
                              accept="image/*,.pdf"
                              onChange={(e) => handleDocumentChange(e, doc.id)}
                            />
                            <label
                              htmlFor={doc.id}
                              onClick={(e) => handleCameraClick(e, doc.id)}
                              className={`flex items-center justify-between p-3.5 rounded-lg border-2 border-dashed transition-all cursor-pointer ${documents[doc.id]
                                ? "border-brand-200 bg-brand-50/50"
                                : "border-slate-200 bg-slate-50 hover:border-slate-300"
                                }`}>
                              <div className="flex items-center gap-3">
                                <div
                                  className={`p-2 rounded-md ${documents[doc.id] ? "bg-brand-100 text-brand-600" : "bg-white text-slate-600 shadow-sm"}`}>
                                  {documents[doc.id] ? (
                                    <CheckCircle className="w-4 h-4" />
                                  ) : (
                                    <Upload className="w-4 h-4" />
                                  )}
                                </div>
                                <div className="text-left">
                                  <p
                                    className={`text-xs font-bold ${documents[doc.id] ? "text-brand-700" : "text-slate-600"}`}>
                                    {doc.label}
                                  </p>
                                  <p className="text-xs text-slate-600 font-medium truncate max-w-[150px]">
                                    {documents[doc.id]
                                      ? documents[doc.id].name
                                      : "Upload secure PDF or image"}
                                  </p>
                                </div>
                              </div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* SIGNUP STEP 7 (Paper Bags) */}
                {!isLogin && signupStep === 7 && (
                  <div className="space-y-3">
                    <div className="pt-2">
                      <p className="text-sm font-black text-slate-600 uppercase tracking-widest mb-3">
                        Branded Paper Bags
                      </p>
                      <p className="text-xs text-slate-500 mb-4">
                        To maintain quality and trust, we offer branded paper bags for your deliveries. Would you like to request bags now?
                      </p>

                      <div className="space-y-3">
                        {[
                          { id: "purchase", label: "Yes, I want to purchase bags", icon: <ShoppingBag className="w-5 h-5" /> },
                          { id: "query", label: "I have a query about bags", icon: <FileText className="w-5 h-5" /> },
                          { id: "none", label: "No, I'll use my own packaging for now", icon: <CheckCircle className="w-5 h-5" /> }
                        ].map((opt) => (
                          <div
                            key={opt.id}
                            onClick={() => setFormData({ ...formData, bagOption: opt.id })}
                            className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all cursor-pointer ${formData.bagOption === opt.id
                              ? "border-brand-500 bg-brand-50"
                              : "border-slate-200 bg-slate-50 hover:border-slate-300"
                              }`}
                          >
                            <div className={`${formData.bagOption === opt.id ? "text-brand-600" : "text-slate-400"}`}>
                              {opt.icon}
                            </div>
                            <span className={`text-sm font-bold ${formData.bagOption === opt.id ? "text-brand-700" : "text-slate-700"}`}>
                              {opt.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  {!isLogin && signupStep > 1 && (
                    <button
                      type="button"
                      onClick={() => setSignupStep((prev) => Math.max(1, prev - 1))}
                      className="w-1/3 bg-slate-100 text-slate-600 rounded-lg py-4 text-sm font-black tracking-[2px] transition-all hover:bg-slate-200">
                      BACK
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className={`${!isLogin && signupStep > 1 ? "w-2/3" : "w-full"} bg-slate-900 text-white rounded-lg py-4 text-sm font-black tracking-[2px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.3)] hover:bg-black transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 group`}>
                    {isLoading
                      ? "WORKING..."
                      : isLogin
                        ? "ENTER DASHBOARD"
                        : signupStep < 7
                          ? "NEXT STEP"
                          : "SUBMIT APPLICATION"}
                    <ArrowRight
                      className="group-hover:translate-x-2 transition-transform"
                      size={20}
                    />
                  </button>
                </div>
              </form>

              <div className="pt-1 border-t border-slate-50 flex flex-col items-center gap-1">
                <p className="text-slate-600 font-bold text-sm">
                  {isLogin ? "New to the platform?" : "Already part of us?"}{" "}
                  <button
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setSignupStep(1);
                      setVerifications({
                        email: createInitialVerificationState(),
                        phone: createInitialVerificationState(),
                      });
                    }}
                    className="text-slate-900 hover:text-black transition-colors px-2">
                    {isLogin ? "Register Store" : "Sign In"}
                  </button>
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
          <div id="recaptcha-container"></div>
        </div>
      </motion.div>

      {/* Bottom Tagline */}
      <div className="absolute bottom-6 flex items-center gap-4 text-slate-300 text-[10px] font-black uppercase tracking-[6px]">
        Empowering Business Digitalization
      </div>

      {isMapOpen && (
        <MapPicker
          isOpen={isMapOpen}
          onClose={() => setIsMapOpen(false)}
          onConfirm={handleLocationSelect}
          preferCurrentLocationOnOpen={true}
          initialLocation={
            formData.lat ? { lat: formData.lat, lng: formData.lng } : null
          }
          initialRadius={formData.radius}
        />
      )}
    </div>
  );
};

export default Auth;

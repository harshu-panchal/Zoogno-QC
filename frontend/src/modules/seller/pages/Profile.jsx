import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  User,
  Mail,
  Phone,
  Store,
  Shield,
  Edit2,
  Save,
  X,
  Rocket,
  Globe,
  MapPin,
  CheckCircle,
  Briefcase,
  FileText,
  Landmark,
  FileCheck,
  Globe2,
  Lock,
  Clock,
} from "lucide-react";
import { sellerApi } from "../services/sellerApi";
import { toast } from "sonner";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import MapPicker from "../../../shared/components/MapPicker";

const SellerProfile = () => {
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    shopName: "",
    phone: "",
    email: "",
    shopImage: "",
    lat: null,
    lng: null,
    radius: 5,
    address: "",
    category: "",
    description: "",
    panNumber: "",
    cinNumber: "",
    tradeLicenseNumber: "",
    gstin: "",
    locality: "",
    city: "",
    state: "",
    pincode: "",
    documents: {},
    bankDetails: {
      accountHolderName: "",
      bankName: "",
      accountNumber: "",
      ifscCode: "",
      accountType: "Savings",
      cancelledChequeImage: ""
    },
    upiDetails: {
      upiId: "",
      qrCodeImage: ""
    },
    preparationTime: 10
  });

  useEffect(() => {
    fetchProfile();
  }, []);

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

  const fetchProfile = async () => {
    try {
      const response = await sellerApi.getProfile();
      const data = response.data.result;
      setProfile(data);
      
      const hasLocation = data.location?.coordinates && 
                         (data.location.coordinates[0] !== 0 || data.location.coordinates[1] !== 0);

      setFormData({
        name: data.name,
        shopName: data.shopName,
        phone: data.phone,
        email: data.email,
        shopImage: data.shopImage || "",
        lat: hasLocation ? data.location.coordinates[1] : null,
        lng: hasLocation ? data.location.coordinates[0] : null,
        radius: data.serviceRadius || 5,
        address: data.address || "",
        locality: data.locality || "",
        city: data.city || "",
        state: data.state || "",
        pincode: data.pincode || "",
        category: data.category || "",
        description: data.description || "",
        panNumber: data.panNumber || "",
        cinNumber: data.cinNumber || "",
        tradeLicenseNumber: data.tradeLicenseNumber || "",
        gstin: data.gstin || "",
        documents: data.documents || {},
        bankDetails: data.bankDetails || {
          accountHolderName: "",
          bankName: "",
          accountNumber: "",
          ifscCode: "",
          accountType: "Savings",
          cancelledChequeImage: ""
        },
        upiDetails: data.upiDetails || {
          upiId: "",
          qrCodeImage: ""
        },
        preparationTime: data.preparationTime || 10
      });
    } catch (error) {
      toast.error("Failed to fetch profile");
    } finally {
      setIsLoading(false);
    }
  };

  const fileInputRef = useRef(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const openFlutterCamera = async () => {
    if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
        const result = await window.flutter_inappwebview.callHandler('openCamera');
        if (result && result.success) {
            const byteCharacters = atob(result.base64);
            const byteArrays = [];
            for (let offset = 0; offset < byteCharacters.length; offset += 512) {
                const slice = byteCharacters.slice(offset, offset + 512);
                const byteNumbers = new Array(slice.length);
                for (let i = 0; i < slice.length; i++) {
                    byteNumbers[i] = slice.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                byteArrays.push(byteArray);
            }
            const blob = new Blob(byteArrays, { type: result.mimeType });
            const file = new File([blob], result.fileName || "camera_image.jpg", { type: result.mimeType });
            return file;
        }
    }
    return null;
  };

  const processShopImageFile = async (file) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const uploadData = new FormData();
      uploadData.append("file", file);
      const res = await sellerApi.uploadMedia(uploadData);
      const url = res.data.url || res.data.result?.url || res.data.secureUrl || res.data.result?.secureUrl;
      
      setFormData((prev) => ({ ...prev, shopImage: url }));
      
      // Auto save so the image is persistent immediately
      await sellerApi.updateProfile({ shopImage: url });
      setProfile((prev) => ({ ...prev, shopImage: url }));
      toast.success("Shop photo updated successfully");
    } catch (error) {
      toast.error("Failed to upload shop photo");
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processShopImageFile(file);
  };

  const handleLocationSelect = (location) => {
    setFormData((prev) => ({
      ...prev,
      lat: location.lat,
      lng: location.lng,
      radius: location.radius,
      address: location.address,
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "name") {
      // Disallow numbers in seller name
      const cleaned = value.replace(/[0-9]/g, "");
      setFormData({ ...formData, [name]: cleaned });
    } else if (name === "phone") {
      // Allow only digits, max 10 characters
      const digitsOnly = value.replace(/[^0-9]/g, "").slice(0, 10);
      setFormData({ ...formData, [name]: digitsOnly });
    } else if (name === "email") {
      // Trim spaces, keep as-is otherwise; HTML5 type=email will help validate shape
      setFormData({ ...formData, [name]: value.trimStart() });
    } else if (name.startsWith("bankDetails.")) {
      const field = name.split(".")[1];
      setFormData({
        ...formData,
        bankDetails: { ...formData.bankDetails, [field]: value }
      });
    } else if (name.startsWith("upiDetails.")) {
      const field = name.split(".")[1];
      setFormData({
        ...formData,
        upiDetails: { ...formData.upiDetails, [field]: value }
      });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const processBankFile = async (file, type) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    try {
      const uploadData = new FormData();
      uploadData.append("file", file);
      const res = await sellerApi.uploadMedia(uploadData);
      const url = res.data.url || res.data.result?.url || res.data.secureUrl || res.data.result?.secureUrl;
      
      if (type === "cheque") {
        setFormData(prev => ({ ...prev, bankDetails: { ...prev.bankDetails, cancelledChequeImage: url } }));
        toast.success("Cheque image uploaded successfully");
      } else if (type === "qr") {
        setFormData(prev => ({ ...prev, upiDetails: { ...prev.upiDetails, qrCodeImage: url } }));
        toast.success("QR code uploaded successfully");
      }
    } catch (error) {
      toast.error("Failed to upload image");
    }
  };

  const handleBankUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processBankFile(file, type);
    e.target.value = "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Basic phone validation: must be exactly 10 digits
    if (!/^[0-9]{10}$/.test(formData.phone)) {
      toast.error("Please enter a valid 10-digit phone number.");
      return;
    }
    // Basic email validation
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        lat: formData.lat,
        lng: formData.lng,
        radius: formData.radius,
        panNumber: formData.panNumber,
        cinNumber: formData.cinNumber,
        tradeLicenseNumber: formData.tradeLicenseNumber,
        gstin: formData.gstin,
        category: formData.category,
        description: formData.description,
        locality: formData.locality,
        city: formData.city,
        state: formData.state,
        pincode: formData.pincode,
        bankDetails: formData.bankDetails,
        upiDetails: formData.upiDetails,
      };
      await sellerApi.updateProfile(payload);
      toast.success("Profile updated successfully");
      setIsEditing(false);
      fetchProfile();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async () => {
    try {
      const newStatus = !profile.isActive;
      await sellerApi.updateProfile({ isActive: newStatus });
      setProfile((prev) => ({ ...prev, isActive: newStatus }));
      toast.success(`Shop is now ${newStatus ? "Active" : "Inactive"}`);
    } catch (error) {
      toast.error("Failed to update shop status");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-3 md:p-6 font-['Outfit']">
      {/* Header Section */}
      <div className="relative mb-8 md:mb-12 px-2 md:px-0">
        {/* Banner Background */}
        <div className="bg-linear-to-r from-slate-900 via-slate-950 to-black rounded-2xl shadow-xl relative overflow-hidden flex flex-col justify-end min-h-[18rem] md:h-56 pb-6 pt-12 md:pt-0">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div className="absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-slate-500/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
          </div>

          {/* Profile Info Row */}
          <div className="relative z-10 px-4 md:px-8 lg:px-10 grid grid-cols-1 md:grid-cols-[140px_minmax(0,1fr)_auto] items-center md:items-end gap-4 md:gap-6">
          {/* Avatar Container */}
          <div className="h-32 w-32 md:h-36 md:w-36 rounded-full bg-white p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.15)] flex-shrink-0 mx-auto md:mx-0 relative group">
            <div className="h-full w-full rounded-full bg-slate-50 flex items-center justify-center border-4 border-slate-50 overflow-hidden relative">
              {formData.shopImage ? (
                <img src={formData.shopImage} alt="Shop" className="w-full h-full object-cover" />
              ) : (
                <span className="text-7xl font-black text-slate-900">
                  {profile?.name?.charAt(0)}
                </span>
              )}
              
              <div 
                onClick={async () => {
                  if (!isUploadingPhoto) {
                    if (window.flutter_inappwebview?.callHandler) {
                      const file = await openFlutterCamera();
                      if (file) await processShopImageFile(file);
                    } else {
                      fileInputRef.current?.click();
                    }
                  }
                }}
                className={`absolute inset-0 flex items-center justify-center transition-all duration-300 cursor-pointer rounded-full ${isUploadingPhoto ? 'bg-black/60 backdrop-blur-md opacity-100' : 'bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100'}`}
              >
                {isUploadingPhoto ? (
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                ) : (
                  <div className="text-white text-center flex flex-col items-center gap-1">
                    <Edit2 size={20} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Update Photo</span>
                  </div>
                )}
              </div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handlePhotoUpload} 
              accept="image/*" 
              className="hidden" 
            />
          </div>

          {/* Info Block */}
          <div className="min-w-0 pb-2 md:pb-4 text-center md:text-left">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mb-3">
              <span className="px-4 py-1.5 bg-white/10 backdrop-blur-xl text-white text-[10px] font-black uppercase tracking-[2px] rounded-full border border-white/20">
                {profile?.role}
              </span>
              <button
                onClick={toggleStatus}
                className={`group flex items-center gap-2 px-4 py-1.5 text-[10px] font-black uppercase tracking-[2px] rounded-full border transition-all hover:scale-105 active:scale-95 ${
                  profile?.isActive
                    ? "bg-emerald-500 text-white border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                    : "bg-rose-500 text-white border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.4)]"
                }`}>
                <div
                  className={`w-2 h-2 rounded-full animate-pulse ${
                    profile?.isActive ? "bg-emerald-200" : "bg-rose-200"
                  }`}
                />
                {profile?.isActive ? "Active" : "Inactive"}
              </button>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter drop-shadow-sm mb-1 break-words">
              {profile?.name}
            </h1>
            <div className="flex items-center gap-3">
              <p className="text-white/60 font-black tracking-[1px] text-lg">
                {profile?.shopName}
              </p>
              {profile?.sellerId && (
                <span className="px-2 py-0.5 bg-white/20 text-white text-[10px] uppercase rounded-md tracking-widest">{profile.sellerId}</span>
              )}
            </div>
          </div>

          {/* Action Button */}
          <div className="pb-2 md:pb-4 w-full md:w-auto">
            {!isEditing ? (
              <Button
                onClick={() => setIsEditing(true)}
                className="w-full md:w-auto bg-white/10 backdrop-blur-md text-white border border-white/20 hover:bg-white hover:text-slate-950 transition-all rounded-lg px-6 lg:px-12 py-4 md:py-5 flex items-center justify-center gap-3 md:gap-4 font-black tracking-[2px] md:tracking-[3px] text-xs shadow-[0_20px_40px_rgba(0,0,0,0.1)] hover:scale-[1.03] active:scale-[0.95] whitespace-nowrap">
                <Edit2 size={18} /> EDIT PROFILE
              </Button>
            ) : (
              <div className="w-full md:w-auto flex gap-3 md:gap-4 justify-center md:justify-end">
                <Button
                  onClick={() => setIsEditing(false)}
                  variant="outline"
                  className="h-[64px] w-[64px] flex items-center justify-center bg-white/5 text-white border border-white/20 hover:bg-white hover:text-slate-900 rounded-lg shadow-lg transition-all backdrop-blur-md">
                  <X size={24} className="stroke-[2.5]" />
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSaving}
                  className="min-w-0 max-w-full bg-white text-slate-950 hover:bg-slate-100 rounded-lg px-5 md:px-8 lg:px-12 py-4 md:py-5 font-black tracking-[2px] md:tracking-[3px] text-xs flex items-center gap-3 md:gap-4 shadow-[0_25px_50px_rgba(0,0,0,0.15)] h-[64px] whitespace-nowrap">
                  {isSaving ? (
                    "UPDATING..."
                  ) : (
                    <>
                      <Save size={20} /> SAVE CHANGES
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info Card */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5 md:p-6 border border-slate-100 shadow-xs rounded-2xl">
            <h3 className="text-lg font-black text-slate-900 mb-5 border-b border-slate-100 pb-3">
              Business Profile
            </h3>

            <form className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Seller Identity
                  </label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors">
                      <User size={16} />
                    </div>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Store Name
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <Store size={18} />
                    </div>
                    <input
                      type="text"
                      name="shopName"
                      value={formData.shopName}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Preparation Time (Minutes)
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <Clock size={18} />
                    </div>
                    <input
                      type="number"
                      name="preparationTime"
                      value={formData.preparationTime}
                      onChange={handleChange}
                      disabled={!isEditing}
                      placeholder="e.g. 10"
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Contact Number
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <Phone size={18} />
                    </div>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Email Address
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300">
                      <Mail size={18} />
                    </div>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Store Address
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <MapPin size={18} />
                    </div>
                    <input
                      type="text"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Locality / Area
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <MapPin size={18} />
                    </div>
                    <input
                      type="text"
                      name="locality"
                      value={formData.locality}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    City
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <Globe size={18} />
                    </div>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    State
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <Globe size={18} />
                    </div>
                    <input
                      type="text"
                      name="state"
                      value={formData.state}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Pincode
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <MapPin size={18} />
                    </div>
                    <input
                      type="text"
                      name="pincode"
                      value={formData.pincode}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>
              </div>
            </form>
          </Card>

          {/* Legal & Tax Details Card */}
          <Card className="p-8 border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-lg">
            <h3 className="text-xl font-black text-slate-900 mb-8 border-b border-slate-50 pb-4">
              Legal & Tax Information
            </h3>
            <form className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Category
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <Briefcase size={18} />
                    </div>
                    <input
                      type="text"
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    GSTIN
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <FileCheck size={18} />
                    </div>
                    <input
                      type="text"
                      name="gstin"
                      value={formData.gstin}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    PAN Number
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <FileText size={18} />
                    </div>
                    <input
                      type="text"
                      name="panNumber"
                      value={formData.panNumber}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    CIN Number
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <Landmark size={18} />
                    </div>
                    <input
                      type="text"
                      name="cinNumber"
                      value={formData.cinNumber}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Trade License Number
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <FileCheck size={18} />
                    </div>
                    <input
                      type="text"
                      name="tradeLicenseNumber"
                      value={formData.tradeLicenseNumber}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3 md:col-span-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Description
                  </label>
                  <div className="relative group">
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      disabled={!isEditing}
                      rows={3}
                      className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-100 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>
              </div>
            </form>
          </Card>

          {/* Uploaded Documents Card */}
          <Card className="p-8 border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-lg">
            <h3 className="text-xl font-black text-slate-900 mb-8 border-b border-slate-50 pb-4">
              Uploaded Documents
            </h3>
            {Object.keys(formData.documents || {}).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.entries(formData.documents).map(([key, url]) => {
                  // Format the key to a readable label
                  const label = key
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, (str) => str.toUpperCase());
                  
                  // Scroll locking is now handled at the top level

    return (
                    <a
                      key={key}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-col gap-2 p-4 border border-slate-100 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-700">{label}</span>
                        <FileText size={16} className="text-slate-400 group-hover:text-brand-600 transition-colors" />
                      </div>
                      <span className="text-xs text-slate-400 truncate">{url}</span>
                    </a>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">No documents uploaded.</p>
            )}
          </Card>

          {/* Bank & UPI Details Card */}
          <Card className="p-8 border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-lg">
            <h3 className="text-xl font-black text-slate-900 mb-8 border-b border-slate-50 pb-4">
              Bank & UPI Details
            </h3>
            <div className="space-y-8">
              {/* Bank Details */}
              <div className="space-y-4">
                <h4 className="text-sm font-black text-slate-800 border-b border-slate-100 pb-2">Bank Account</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">Bank Name</label>
                    <input
                      type="text"
                      name="bankDetails.bankName"
                      value={formData.bankDetails?.bankName || ""}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">Account Holder Name</label>
                    <input
                      type="text"
                      name="bankDetails.accountHolderName"
                      value={formData.bankDetails?.accountHolderName || ""}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">Account Number</label>
                    <input
                      type="text"
                      name="bankDetails.accountNumber"
                      value={formData.bankDetails?.accountNumber || ""}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">IFSC Code</label>
                    <input
                      type="text"
                      name="bankDetails.ifscCode"
                      value={formData.bankDetails?.ifscCode || ""}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">Account Type</label>
                    <select
                      name="bankDetails.accountType"
                      value={formData.bankDetails?.accountType || "Savings"}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    >
                      <option value="Savings">Savings</option>
                      <option value="Current">Current</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">Cancelled Cheque</label>
                    {formData.bankDetails?.cancelledChequeImage ? (
                      <div className="flex items-center gap-4">
                        <a href={formData.bankDetails.cancelledChequeImage} target="_blank" rel="noreferrer" className="text-sm font-bold text-brand-600 hover:underline flex-1 truncate">
                          View Uploaded Cheque
                        </a>
                        {isEditing && (
                          <label 
                            className="cursor-pointer bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                            onClick={async (e) => {
                                if (window.flutter_inappwebview?.callHandler) {
                                    e.preventDefault();
                                    const file = await openFlutterCamera();
                                    if (file) await processBankFile(file, "cheque");
                                }
                            }}
                          >
                            Change
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleBankUpload(e, "cheque")} />
                          </label>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-slate-400 italic flex-1">Not uploaded</span>
                        {isEditing && (
                          <label 
                            className="cursor-pointer bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                            onClick={async (e) => {
                                if (window.flutter_inappwebview?.callHandler) {
                                    e.preventDefault();
                                    const file = await openFlutterCamera();
                                    if (file) await processBankFile(file, "cheque");
                                }
                            }}
                          >
                            Upload
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleBankUpload(e, "cheque")} />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* UPI Details */}
              <div className="space-y-4 pt-4">
                <h4 className="text-sm font-black text-slate-800 border-b border-slate-100 pb-2">UPI Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">UPI ID</label>
                    <input
                      type="text"
                      name="upiDetails.upiId"
                      value={formData.upiDetails?.upiId || ""}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all disabled:opacity-70"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">QR Code</label>
                    {formData.upiDetails?.qrCodeImage ? (
                      <div className="flex items-center gap-4">
                        <a href={formData.upiDetails.qrCodeImage} target="_blank" rel="noreferrer" className="text-sm font-bold text-brand-600 hover:underline flex-1 truncate">
                          View QR Code
                        </a>
                        {isEditing && (
                          <label 
                            className="cursor-pointer bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                            onClick={async (e) => {
                                if (window.flutter_inappwebview?.callHandler) {
                                    e.preventDefault();
                                    const file = await openFlutterCamera();
                                    if (file) await processBankFile(file, "qr");
                                }
                            }}
                          >
                            Change
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleBankUpload(e, "qr")} />
                          </label>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-slate-400 italic flex-1">Not uploaded</span>
                        {isEditing && (
                          <label 
                            className="cursor-pointer bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                            onClick={async (e) => {
                                if (window.flutter_inappwebview?.callHandler) {
                                    e.preventDefault();
                                    const file = await openFlutterCamera();
                                    if (file) await processBankFile(file, "qr");
                                }
                            }}
                          >
                            Upload
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleBankUpload(e, "qr")} />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Location & Radius Settings Card */}
          <Card className="p-6 md:p-8 border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-2xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-slate-100 pb-4">
              <h3 className="text-lg md:text-xl font-black text-slate-900">
                Location & Service Settings
              </h3>
              {!isEditing && (
                <Button
                  onClick={() => setIsEditing(true)}
                  className="bg-slate-900 text-white hover:bg-black rounded-lg px-6 py-2 text-[10px] font-black tracking-[2px]">
                  MANAGE
                </Button>
              )}
            </div>

            <div className="space-y-6">
              <div className="bg-slate-50 p-4 md:p-6 rounded-2xl border-2 border-slate-100/50 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                    <div
                      className={`shrink-0 h-10 w-10 sm:h-12 sm:w-12 rounded-xl flex items-center justify-center transition-all ${
                        formData.lat
                          ? "bg-brand-100 text-brand-600 shadow-[0_8px_20px_-6px_rgba(16,185,129,0.3)]"
                          : "bg-white text-slate-400 shadow-sm"
                      }`}>
                      <MapPin size={20} className="sm:w-6 sm:h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-black text-slate-900">
                        {formData.lat
                          ? "Store Location Pin"
                          : "Location Not Defined"}
                      </p>
                      <p className="text-xs text-slate-500 font-medium max-w-[400px] leading-relaxed">
                        {formData.address ||
                          "Click change to precisely mark your shop location on the map for delivery accuracy."}
                      </p>
                    </div>
                  </div>
                  {isEditing && (
                    <Button
                      type="button"
                      onClick={() => setIsMapOpen(true)}
                      className="bg-white text-slate-900 border-2 border-slate-200 hover:border-slate-900 rounded-lg px-6 sm:px-8 py-2.5 sm:py-3 text-[10px] font-black tracking-[2px] shadow-sm hover:shadow-md transition-all whitespace-nowrap self-start sm:self-auto">
                      CHANGE PIN
                    </Button>
                  )}
                </div>

                {formData.lat && (
                  <div className="pt-5 border-t border-slate-200/60 grid grid-cols-2 md:flex flex-wrap gap-4 md:gap-8">
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        Service Radius
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-slate-900">
                          {formData.radius}
                        </span>
                        <span className="text-xs font-bold text-slate-500 bg-slate-200/50 px-2 py-0.5 rounded-md">
                          KM
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        Latitude
                      </span>
                      <span className="text-sm font-bold text-slate-700 tabular-nums">
                        {formData.lat.toFixed(6)}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        Longitude
                      </span>
                      <span className="text-sm font-bold text-slate-700 tabular-nums">
                        {formData.lng.toFixed(6)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
                <Shield size={16} className="text-amber-600 mt-0.5" />
                <p className="text-xs text-amber-700 font-medium leading-relaxed">
                  Your shop location and service radius determine which
                  customers can view your products. Ensure the marker is placed
                  exactly at your physical storefront for accurate delivery
                  assignments.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Sidebar Card */}
        <div className="space-y-6">
          <Card className="p-6 border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-800 text-white">
            <h4 className="text-[10px] font-black uppercase tracking-[4px] text-white/40 mb-6">
              Security & Trust
            </h4>
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Shield size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-white/60">
                    Verification
                  </p>
                  <p className="text-sm font-bold">
                    {profile?.isVerified
                      ? "Verified Merchant"
                      : "Verification Pending"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Rocket size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-white/60">
                    Partner Tier
                  </p>
                  <p className="text-sm font-bold">Standard Growth</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Globe size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-white/60">
                    Region
                  </p>
                  <p className="text-sm font-bold">Pan India Reach</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
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

export default SellerProfile;

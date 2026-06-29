import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Landmark, CreditCard, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import Input from "@/shared/components/ui/Input";
import { deliveryApi } from "../../services/deliveryApi";
import { toast } from "sonner";

const BankAccount = () => {
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [formData, setFormData] = useState({
    accountHolder: "",
    newAccountNumber: "",
    confirmAccountNumber: "",
    ifscCode: "",
  });
  const [bankDetails, setBankDetails] = useState({
    accountHolder: "",
    accountNumber: "",
    ifsc: "",
    bankName: "Your Bank",
    status: "Pending",
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setIsLoading(true);
      const res = await deliveryApi.getProfile();
      const profile = res.data?.data || res.data?.result || res.data;
      
      if (profile) {
        setBankDetails({
          accountHolder: profile.accountHolder || "Not Provided",
          accountNumber: profile.accountNumber 
            ? `XXXX${profile.accountNumber.slice(-4)}` 
            : "Not Provided",
          ifsc: profile.ifsc || "Not Provided",
          bankName: profile.ifsc ? profile.ifsc.substring(0, 4) + " Bank" : "Your Bank",
          status: profile.accountNumber ? "Active" : "Pending",
        });
      }
    } catch (err) {
      toast.error("Failed to load bank details");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdate = async () => {
    const { accountHolder, newAccountNumber, confirmAccountNumber, ifscCode } = formData;
    
    if (!accountHolder || !newAccountNumber || !confirmAccountNumber || !ifscCode) {
      return toast.error("Please fill in all fields");
    }
    
    if (newAccountNumber !== confirmAccountNumber) {
      return toast.error("Account numbers do not match");
    }
    
    const ifscRegex = /^[A-Za-z]{4}0[A-Z0-9a-z]{6}$/;
    if (!ifscRegex.test(ifscCode)) {
      return toast.error("Invalid IFSC code format");
    }
    
    try {
      setIsUpdating(true);
      const payload = new FormData();
      payload.append('accountHolder', accountHolder);
      payload.append('accountNumber', newAccountNumber);
      payload.append('ifsc', ifscCode.toUpperCase());
      
      const res = await deliveryApi.updateProfile(payload);
      if (res.data?.success || res.status === 200) {
        toast.success("Bank details updated successfully");
        setFormData({ accountHolder: "", newAccountNumber: "", confirmAccountNumber: "", ifscCode: "" });
        fetchProfile();
      } else {
        toast.error("Failed to update bank details");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update bank details");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button 
            onClick={() => navigate(-1)} 
            className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-2"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="ds-h3 text-gray-900">Bank Account</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* Bank Card Visual */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 rounded-2xl shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          
          <div className="flex justify-between items-start mb-8 relative z-10">
            <Landmark size={32} className="text-white/80" />
            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border flex items-center ${
              bankDetails.status === "Active" 
                ? "bg-slate-500/20 text-slate-300 border-slate-500/30" 
                : "bg-amber-500/20 text-amber-300 border-amber-500/30"
            }`}>
              {bankDetails.status === "Active" && <CheckCircle2 size={12} className="mr-1" />}
              {bankDetails.status}
            </span>
          </div>

          <div className="space-y-1 relative z-10">
            <p className="text-slate-400 text-xs uppercase tracking-wider">Account Number</p>
            <p className="font-mono text-2xl tracking-widest text-slate-100">{bankDetails.accountNumber}</p>
          </div>

          <div className="flex justify-between items-end mt-8 relative z-10">
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Account Holder</p>
              <p className="font-bold text-lg text-slate-100">{bankDetails.accountHolder}</p>
            </div>
            <div className="text-right">
              <p className="text-white font-bold">{bankDetails.bankName}</p>
              <p className="text-slate-400 text-xs uppercase">{bankDetails.ifsc}</p>
            </div>
          </div>
          
          {isLoading && (
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-20 rounded-2xl">
              <Loader2 className="animate-spin text-white w-8 h-8" />
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-xl flex items-start">
          <AlertTriangle size={20} className="text-yellow-600 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-yellow-800 font-bold text-sm mb-1">Payment Information</h4>
            <p className="text-xs text-yellow-700 leading-relaxed">
              Your weekly earnings will be deposited to this account every Tuesday. 
              Changes to bank details may delay your next payout by up to 7 days.
            </p>
          </div>
        </div>

        {/* Change Request Form */}
        <div className="pt-4">
          <h3 className="ds-h4 text-gray-900 mb-4">Request Change</h3>
          <div className="space-y-4">
            <Input 
              label="Account Holder Name" 
              placeholder="Enter account holder name" 
              icon={CreditCard}
              value={formData.accountHolder}
              onChange={(e) => setFormData({...formData, accountHolder: e.target.value})}
            />
            <Input 
              label="New Account Number" 
              placeholder="Enter account number" 
              icon={CreditCard}
              value={formData.newAccountNumber}
              onChange={(e) => setFormData({...formData, newAccountNumber: e.target.value})}
            />
            <Input 
              label="Confirm Account Number" 
              placeholder="Re-enter account number" 
              icon={CreditCard}
              value={formData.confirmAccountNumber}
              onChange={(e) => setFormData({...formData, confirmAccountNumber: e.target.value})}
            />
            <Input 
              label="IFSC Code" 
              placeholder="Enter IFSC code" 
              icon={Landmark}
              value={formData.ifscCode}
              onChange={(e) => setFormData({...formData, ifscCode: e.target.value})}
            />
            <Button 
              className="w-full mt-2 flex items-center justify-center" 
              variant="outline"
              onClick={handleUpdate}
              disabled={isUpdating}
            >
              {isUpdating ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
              {isUpdating ? "Updating..." : "Verify & Update"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BankAccount;

import React, { useState } from 'react';
import {
  Shield,
  Mail,
  Key,
  Save,
  CheckSquare,
  Square,
  ShieldCheck,
  Send,
  UserPlus
} from 'lucide-react';
import { Card, Input, Button } from '@shared/components/ui';
import { toast } from 'sonner';
import { adminApi } from '../services/adminApi';

const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'categories', label: 'Categories' },
  { id: 'products', label: 'Products' },
  { id: 'marketing', label: 'Marketing Tools' },
  { id: 'support', label: 'Customer Support' },
  { id: 'sellers', label: 'Sellers' },
  { id: 'delivery', label: 'Delivery Drivers' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'withdrawals', label: 'Money Requests' },
  { id: 'seller_payments', label: 'Seller Payments' },
  { id: 'cash_collection', label: 'Collect Cash' },
  { id: 'customers', label: 'Customers' },
  { id: 'faqs', label: 'FAQs' },
  { id: 'orders', label: 'Orders' },
  { id: 'qr_bags', label: 'QR Bag Management' },
  { id: 'baskets', label: 'Basket Management' },
  { id: 'billing', label: 'Fees & Charges' },
  { id: 'settings', label: 'Settings' },
  { id: 'system_settings', label: 'System Settings' }
];

export default function RoleManagement() {
  const [formData, setFormData] = useState({
    email: '',
    otp: '',
    password: '',
    confirmPassword: '',
  });
  
  const [permissions, setPermissions] = useState([]);
  const [otpSent, setOtpSent] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const togglePermission = (sectionId) => {
    setPermissions((prev) => 
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const toggleAll = () => {
    if (permissions.length === SECTIONS.length) {
      setPermissions([]);
    } else {
      setPermissions(SECTIONS.map(s => s.id));
    }
  };

  const handleSendOtp = async () => {
    if (!formData.email) {
      toast.error('Please enter an email first');
      return;
    }
    setLoading(true);
    try {
      await adminApi.sendInviteOtp({ email: formData.email });
      setOtpSent(true);
      toast.success('OTP sent to email!');
    } catch (error) {
      const msg = error?.response?.data?.message || 'Failed to send OTP';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!formData.otp || formData.otp.length < 4) {
      toast.error('Please enter a valid OTP');
      return;
    }
    setIsVerifying(true);
    try {
      await adminApi.verifyInviteOtp({ email: formData.email, otp: formData.otp });
      setIsOtpVerified(true);
      toast.success('Email verified successfully!');
    } catch (error) {
      const msg = error?.response?.data?.message || 'Invalid or expired OTP';
      toast.error(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isOtpVerified) {
      toast.error('Please verify email first');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (permissions.length === 0) {
      toast.error('Please select at least one permission section');
      return;
    }

    setLoading(true);
    try {
      await adminApi.inviteStaff({
        email: formData.email,
        password: formData.password,
        otp: formData.otp,
        permissions: permissions
      });
      toast.success('Admin Role created successfully!');
      setFormData({
        email: '',
        otp: '',
        password: '',
        confirmPassword: '',
      });
      setPermissions([]);
      setOtpSent(false);
      setIsOtpVerified(false);
    } catch (error) {
      const msg = error?.response?.data?.message || 'Failed to create admin role';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
          <ShieldCheck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Role Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Create new sub-admins and assign specific panel access
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Account Details */}
          <Card>
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-4">
                <UserPlus className="w-5 h-5 text-gray-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Account Details</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <Input
                    label="Admin Email"
                    type="email"
                    name="email"
                    icon={Mail}
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Enter email address"
                    disabled={isOtpVerified}
                    required
                  />
                  {!isOtpVerified && (
                    <div className="mt-2 flex justify-end">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleSendOtp}
                        loading={loading && !otpSent}
                        disabled={!formData.email}
                        className="text-xs"
                      >
                        <Send className="w-3 h-3 mr-1" />
                        {otpSent ? 'Resend OTP' : 'Send OTP'}
                      </Button>
                    </div>
                  )}
                </div>

                {otpSent && !isOtpVerified && (
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Input
                        label="Enter OTP"
                        type="text"
                        name="otp"
                        value={formData.otp}
                        onChange={handleInputChange}
                        placeholder="Enter 6-digit OTP"
                        maxLength={6}
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={handleVerifyOtp}
                      loading={isVerifying}
                      className="mb-[2px]"
                    >
                      Verify
                    </Button>
                  </div>
                )}

                {isOtpVerified && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-xl text-sm flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    Email verified successfully
                  </div>
                )}

                <Input
                  label="Create Password"
                  type="password"
                  name="password"
                  icon={Key}
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Minimum 8 characters"
                  required
                />

                <Input
                  label="Confirm Password"
                  type="password"
                  name="confirmPassword"
                  icon={Key}
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  placeholder="Re-enter password"
                  required
                />
              </div>
            </div>
          </Card>

          {/* Permissions / Sections */}
          <Card>
            <div className="p-6 flex flex-col h-full">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-gray-500" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Panel Access</h2>
                </div>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium transition-colors"
                >
                  {permissions.length === SECTIONS.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-1 custom-scrollbar" style={{ maxHeight: '400px' }}>
                {SECTIONS.map((section) => {
                  const isSelected = permissions.includes(section.id);
                  return (
                    <div
                      key={section.id}
                      onClick={() => togglePermission(section.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                        isSelected 
                          ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800/30' 
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border-transparent'
                      } border`}
                    >
                      <button
                        type="button"
                        className="flex-shrink-0 focus:outline-none"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-400 dark:text-gray-600" />
                        )}
                      </button>
                      <span className={`text-sm font-medium ${
                        isSelected ? 'text-indigo-900 dark:text-indigo-200' : 'text-gray-700 dark:text-gray-300'
                      }`}>
                        {section.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            size="lg"
            icon={Save}
            loading={loading && isOtpVerified}
            disabled={!isOtpVerified || permissions.length === 0}
            className="w-full sm:w-auto"
          >
            Create Admin Role
          </Button>
        </div>
      </form>
    </div>
  );
}

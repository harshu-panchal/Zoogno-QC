import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Mail,
  Key,
  Save,
  CheckSquare,
  Square,
  ShieldCheck,
  Send,
  UserPlus,
  Users,
  ToggleLeft,
  ToggleRight,
  Edit2,
  X,
  Check,
  RefreshCw,
  Clock,
  AlertCircle,
  Crown,
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

const SUPER_ADMIN_EMAILS = ['zoogno61@gmail.com', 'superadmin@zoognu.com'];

// ────────────────────────────────────────────────────────────────
// Permission Badge
// ────────────────────────────────────────────────────────────────
function PermissionBadge({ label }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/40">
      {label}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────
// Edit Permissions Modal
// ────────────────────────────────────────────────────────────────
function EditPermissionsModal({ admin, onClose, onSave }) {
  const currentPerms = admin?.adminRole?.permissions || [];
  const [selected, setSelected] = useState(currentPerms);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    if (window.lenis) {
      window.lenis.stop();
    }

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;

      if (window.lenis) {
        window.lenis.start();
      }
    };
  }, []);

  const toggle = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };
  const toggleAll = () => {
    setSelected(prev => prev.length === SECTIONS.length ? [] : SECTIONS.map(s => s.id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(admin._id, selected);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" data-lenis-prevent>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-indigo-50 dark:from-indigo-950/30 to-transparent">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-indigo-500" />
              Edit Permissions
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{admin.email}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sections grid */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Panel Sections</span>
            <button
              onClick={toggleAll}
              className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
            >
              {selected.length === SECTIONS.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 max-h-72 overflow-y-auto custom-scrollbar pr-1">
            {SECTIONS.map((s) => {
              const isSelected = selected.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 text-left ${
                    isSelected
                      ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700/50'
                      : 'bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-400 border border-transparent hover:border-gray-200 dark:hover:border-gray-700'
                  }`}
                >
                  {isSelected
                    ? <CheckSquare className="w-3.5 h-3.5 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
                    : <Square className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                  }
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Admin Card (for the Active Admins section)
// ────────────────────────────────────────────────────────────────
function AdminCard({ admin, onToggleStatus, onEditPermissions, isSuper }) {
  const [toggling, setToggling] = useState(false);
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(admin.email) || !admin.adminRole;
  const permissions = admin.adminRole?.permissions || [];
  // Treat undefined isActive as true (legacy admins don't have the field)
  const isEffectivelyActive = admin.isActive !== false;

  const handleToggle = async () => {
    setToggling(true);
    try {
      await onToggleStatus(admin._id, !admin.isActive);
    } finally {
      setToggling(false);
    }
  };

  // Format date
  const formatDate = (d) => {
    if (!d) return 'Never';
    const date = new Date(d);
    const now = new Date();
    const diff = Math.floor((now - date) / 60000);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className={`relative bg-white dark:bg-gray-900 rounded-2xl border transition-all duration-300 overflow-hidden ${
      isEffectivelyActive
        ? 'border-gray-200 dark:border-gray-700/60 shadow-sm hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-700/40'
        : 'border-gray-100 dark:border-gray-800 opacity-70 grayscale-[0.4]'
    }`}>
      {/* Status indicator bar */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${isEffectivelyActive ? 'bg-gradient-to-r from-indigo-500 to-violet-500' : 'bg-gray-300 dark:bg-gray-700'}`} />

      <div className="p-5">
        {/* Top row: Avatar + Name + Status toggle */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shadow-sm ${
              isSuperAdmin
                ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
                : 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white'
            }`}>
              {admin.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-[140px]">
                  {admin.name || 'Unnamed'}
                </p>
                {isSuperAdmin && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700/40 uppercase tracking-wider">
                    <Crown className="w-2.5 h-2.5" /> Super
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate max-w-[160px]">{admin.email}</p>
            </div>
          </div>

          {/* Toggle only for sub-admins */}
          {!isSuperAdmin && isSuper && (
            <button
              onClick={handleToggle}
              disabled={toggling}
              title={isEffectivelyActive ? 'Deactivate admin' : 'Activate admin'}
              className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border ${
                isEffectivelyActive
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/40 text-green-700 dark:text-green-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-200 dark:hover:border-red-800/40 hover:text-red-600 dark:hover:text-red-400'
                  : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-green-50 dark:hover:bg-green-900/20 hover:border-green-200 dark:hover:border-green-700/40 hover:text-green-600 dark:hover:text-green-400'
              }`}
            >
              {toggling
                ? <RefreshCw className="w-3 h-3 animate-spin" />
                : isEffectivelyActive
                  ? <ToggleRight className="w-3.5 h-3.5" />
                  : <ToggleLeft className="w-3.5 h-3.5" />
              }
              {isEffectivelyActive ? 'Active' : 'Inactive'}
            </button>
          )}
          {isSuperAdmin && (
            <span className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 text-amber-700 dark:text-amber-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              Full Access
            </span>
          )}
        </div>

        {/* Permissions */}
        {!isSuperAdmin && (
          <div className="mb-4">
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-widest mb-2">
              Module Access ({permissions.length}/{SECTIONS.length})
            </p>
            {permissions.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {permissions.slice(0, 5).map(p => {
                  const section = SECTIONS.find(s => s.id === p);
                  return <PermissionBadge key={p} label={section?.label || p} />;
                })}
                {permissions.length > 5 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                    +{permissions.length - 5} more
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-3.5 h-3.5" />
                No permissions assigned
              </div>
            )}
          </div>
        )}

        {/* Last login + edit button */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-600">
            <Clock className="w-3 h-3" />
            Last login: {formatDate(admin.lastLogin)}
          </div>
          {!isSuperAdmin && isSuper && (
            <button
              onClick={() => onEditPermissions(admin)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-100 dark:border-indigo-800/40 transition-all duration-200"
            >
              <Edit2 className="w-3 h-3" />
              Edit Permissions
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Main RoleManagement Page
// ────────────────────────────────────────────────────────────────
export default function RoleManagement() {
  // ── Create Sub-Admin State ──
  const [formData, setFormData] = useState({
    email: '', otp: '', password: '', confirmPassword: '',
  });
  const [permissions, setPermissions] = useState([]);
  const [otpSent, setOtpSent] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Active Admins State ──
  const [admins, setAdmins] = useState([]);
  const [adminsLoading, setAdminsLoading] = useState(true);
  const [editingAdmin, setEditingAdmin] = useState(null);

  // ── Fetch Admins ──
  const fetchAdmins = useCallback(async () => {
    setAdminsLoading(true);
    try {
      const res = await adminApi.getStaff();
      // Backend returns arrays under 'results' (plural), not 'result'
      const data = res.data?.results || res.data?.result || [];
      setAdmins(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[RoleManagement] getStaff error:', err?.response?.data || err.message);
      toast.error('Failed to load admin list');
    } finally {
      setAdminsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  // ── Handlers for Create Form ──
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const togglePermission = (sectionId) => {
    setPermissions(prev =>
      prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId]
    );
  };

  const toggleAll = () => {
    setPermissions(prev => prev.length === SECTIONS.length ? [] : SECTIONS.map(s => s.id));
  };

  const handleSendOtp = async () => {
    if (!formData.email) { toast.error('Please enter an email first'); return; }
    setLoading(true);
    try {
      await adminApi.sendInviteOtp({ email: formData.email });
      setOtpSent(true);
      toast.success('OTP sent to email!');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!formData.otp || formData.otp.length < 4) { toast.error('Please enter a valid OTP'); return; }
    setIsVerifying(true);
    try {
      await adminApi.verifyInviteOtp({ email: formData.email, otp: formData.otp });
      setIsOtpVerified(true);
      toast.success('Email verified successfully!');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Invalid or expired OTP');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isOtpVerified) { toast.error('Please verify email first'); return; }
    if (formData.password !== formData.confirmPassword) { toast.error('Passwords do not match'); return; }
    if (permissions.length === 0) { toast.error('Please select at least one permission section'); return; }
    if (formData.password.length < 8) { toast.error('Password must be at least 8 characters'); return; }

    setLoading(true);
    try {
      await adminApi.inviteStaff({
        email: formData.email,
        password: formData.password,
        otp: formData.otp,
        permissions,
      });
      toast.success('Admin created successfully! Credentials sent via email.');
      setFormData({ email: '', otp: '', password: '', confirmPassword: '' });
      setPermissions([]);
      setOtpSent(false);
      setIsOtpVerified(false);
      fetchAdmins(); // refresh the list
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to create admin role');
    } finally {
      setLoading(false);
    }
  };

  // ── Handlers for Active Admins ──
  const handleToggleStatus = async (adminId, isActive) => {
    try {
      await adminApi.toggleStaffStatus(adminId, { isActive });
      toast.success(`Admin ${isActive ? 'activated' : 'deactivated'} successfully`);
      setAdmins(prev => prev.map(a => a._id === adminId ? { ...a, isActive } : a));
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update status');
    }
  };

  const handleSavePermissions = async (adminId, newPermissions) => {
    try {
      // We reuse the invite endpoint by patching permissions via a dedicated call
      // The backend inviteAdminUser supports updating permissions too. We'll use a simpler approach:
      // call a new endpoint. Since none exists yet, we'll use a workaround - re-invite isn't right.
      // Instead we call the update staff permissions endpoint
      await adminApi.updateStaffPermissions(adminId, { permissions: newPermissions });
      toast.success('Permissions updated successfully');
      setAdmins(prev => prev.map(a => {
        if (a._id !== adminId) return a;
        return {
          ...a,
          adminRole: { ...a.adminRole, permissions: newPermissions }
        };
      }));
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update permissions');
      throw error;
    }
  };

  // Separate super admins from sub-admins
  const superAdmins = admins.filter(a => SUPER_ADMIN_EMAILS.includes(a.email) || !a.adminRole);
  const subAdmins = admins.filter(a => !SUPER_ADMIN_EMAILS.includes(a.email) && a.adminRole);
  const activeSubAdmins = subAdmins.filter(a => a.isActive !== false).length;

  return (
    <div className="max-w-6xl mx-auto space-y-8">

      {/* ── Page Header ── */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
          <ShieldCheck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Role Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Create sub-admins, assign module permissions, and manage access
          </p>
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          SECTION 1 — Active Admins Overview
      ════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Admin Team</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400">
              {admins.length} total
            </span>
          </div>
          <button
            onClick={fetchAdmins}
            disabled={adminsLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${adminsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {/* Super Admins */}
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-800/30 rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
              <Crown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xl font-black text-amber-700 dark:text-amber-300">{superAdmins.length}</p>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Super Admins</p>
            </div>
          </div>
          {/* Sub Admins */}
          <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-800/30 rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-xl font-black text-indigo-700 dark:text-indigo-300">{subAdmins.length}</p>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Sub Admins</p>
            </div>
          </div>
          {/* Active */}
          <div className="bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-800/30 rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xl font-black text-green-700 dark:text-green-300">{activeSubAdmins}</p>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Active Sub-Admins</p>
            </div>
          </div>
        </div>

        {adminsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-48 rounded-2xl bg-gray-100 dark:bg-gray-800/50 animate-pulse" />
            ))}
          </div>
        ) : admins.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-600">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">No admins found</p>
          </div>
        ) : (
          <>
            {/* Super Admins */}
            {superAdmins.length > 0 && (
              <div className="mb-5">
                <p className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest mb-2.5 px-1">
                  ⭐ Super Admins — Full Access
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {superAdmins.map(admin => (
                    <AdminCard
                      key={admin._id}
                      admin={admin}
                      onToggleStatus={handleToggleStatus}
                      onEditPermissions={setEditingAdmin}
                      isSuper={true}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Sub Admins */}
            {subAdmins.length > 0 && (
              <div>
                <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-500 uppercase tracking-widest mb-2.5 px-1">
                  🛡 Sub Admins — Limited Access
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {subAdmins.map(admin => (
                    <AdminCard
                      key={admin._id}
                      admin={admin}
                      onToggleStatus={handleToggleStatus}
                      onEditPermissions={setEditingAdmin}
                      isSuper={true}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200 dark:border-gray-800" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-4 bg-gray-50 dark:bg-gray-950 text-xs font-bold text-gray-400 dark:text-gray-600 uppercase tracking-widest">
            Create New Admin
          </span>
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          SECTION 2 — Create Sub-Admin Form
      ════════════════════════════════════════════════ */}
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

          {/* Permissions */}
          <Card>
            <div className="p-6 flex flex-col h-full">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-gray-500" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Panel Access</h2>
                  {permissions.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                      {permissions.length}
                    </span>
                  )}
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
                      <button type="button" className="flex-shrink-0 focus:outline-none">
                        {isSelected
                          ? <CheckSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          : <Square className="w-5 h-5 text-gray-400 dark:text-gray-600" />
                        }
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

      {/* Edit Permissions Modal */}
      {editingAdmin && (
        <EditPermissionsModal
          admin={editingAdmin}
          onClose={() => setEditingAdmin(null)}
          onSave={handleSavePermissions}
        />
      )}
    </div>
  );
}

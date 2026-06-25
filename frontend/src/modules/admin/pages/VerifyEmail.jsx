import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { adminAuthApi } from '../services/api/authApi';
import { motion } from 'framer-motion';
import { ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const VerifyEmail = () => {
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState('verifying'); // verifying, success, error
    const navigate = useNavigate();
    const token = searchParams.get('token');

    useEffect(() => {
        if (!token) {
            setStatus('error');
            return;
        }

        const verifyToken = async () => {
            try {
                await adminAuthApi.verifyEmail(token);
                setStatus('success');
                setTimeout(() => {
                    navigate('/admin/auth');
                }, 3000);
            } catch (error) {
                toast.error(error.response?.data?.message || 'Verification failed');
                setStatus('error');
            }
        };

        verifyToken();
    }, [token, navigate]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f8f9ff] font-outfit">
            <motion.div 
                initial={{ scale: 0.9, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                className="bg-white p-10 rounded-[30px] shadow-2xl flex flex-col items-center max-w-md w-full text-center"
            >
                {status === 'verifying' && (
                    <>
                        <div className="w-16 h-16 border-4 border-brand-100 border-t-brand-600 rounded-full animate-spin mb-6" />
                        <h2 className="text-2xl font-black text-gray-900 mb-2">Verifying Email...</h2>
                        <p className="text-gray-500 font-medium">Please wait while we confirm your admin account.</p>
                    </>
                )}
                {status === 'success' && (
                    <>
                        <ShieldCheck size={64} className="text-green-500 mb-6" />
                        <h2 className="text-2xl font-black text-gray-900 mb-2">Email Verified!</h2>
                        <p className="text-gray-500 font-medium mb-6">Your admin account is now active.</p>
                        <button 
                            onClick={() => navigate('/admin/auth')}
                            className="bg-brand-600 text-white px-6 py-3 rounded-full font-bold hover:bg-brand-700 transition"
                        >
                            Go to Login
                        </button>
                    </>
                )}
                {status === 'error' && (
                    <>
                        <XCircle size={64} className="text-red-500 mb-6" />
                        <h2 className="text-2xl font-black text-gray-900 mb-2">Verification Failed</h2>
                        <p className="text-gray-500 font-medium mb-6">The link might be expired or invalid.</p>
                        <button 
                            onClick={() => navigate('/admin/auth')}
                            className="bg-gray-100 text-gray-700 px-6 py-3 rounded-full font-bold hover:bg-gray-200 transition"
                        >
                            Return to Login
                        </button>
                    </>
                )}
            </motion.div>
        </div>
    );
};

export default VerifyEmail;

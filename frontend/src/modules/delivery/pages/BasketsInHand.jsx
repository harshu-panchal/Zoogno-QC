import React, { useState, useEffect } from 'react';
import { ArrowLeft, ShoppingBasket, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '@core/api/axios';

const BasketsInHand = () => {
  const navigate = useNavigate();
  const [baskets, setBaskets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBaskets();
  }, []);

  const fetchBaskets = async () => {
    try {
      const res = await axiosInstance.get('/delivery/baskets-in-hand');
      if (res.data.success) {
        setBaskets(res.data.result.baskets || []);
      }
    } catch (error) {
      console.error('Error fetching baskets in hand', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-outfit pb-24">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center gap-3 sticky top-0 z-40 shadow-sm border-b border-slate-100">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 active:bg-slate-200 transition-colors"
        >
          <ArrowLeft size={24} className="text-slate-700" />
        </button>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Baskets in Hand</h1>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="text-orange-600 mt-0.5 flex-shrink-0" size={20} />
          <div>
            <h3 className="font-semibold text-orange-900">Return to Hub</h3>
            <p className="text-sm text-orange-800 mt-1 leading-relaxed">
              You currently have <span className="font-bold">{baskets.length}</span> empty baskets. Please return them to the admin hub at the end of your shift.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-8">
            <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : baskets.length === 0 ? (
          <div className="text-center p-10 bg-white rounded-2xl shadow-sm border border-slate-100 mt-6">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShoppingBasket size={32} className="text-slate-400" />
            </div>
            <h3 className="font-bold text-slate-800 text-lg">No Baskets</h3>
            <p className="text-slate-500 text-sm mt-2">You don't have any empty baskets to return right now.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {baskets.map((basket, index) => (
              <div key={index} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4">
                <div className="w-12 h-12 bg-brand-50 text-brand-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <ShoppingBasket size={24} />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-slate-800">{basket.basketId}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Last Customer: <span className="font-medium text-slate-700">{basket.lastCustomer}</span></div>
                </div>
                <div className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full uppercase tracking-wide">
                  {basket.status === 'DELIVERED' ? 'Empty' : basket.status}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BasketsInHand;

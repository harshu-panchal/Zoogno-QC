import React, { useEffect, useState } from "react";
import { ArrowLeft, Gift } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { deliveryApi } from "../../services/deliveryApi";

const RUPEE = "\u20B9";

const IncentiveHistory = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await deliveryApi.getMyIncentiveHistory();
        setItems(res.data.result?.items || []);
      } catch (err) {
        toast.error(err?.response?.data?.message || "Failed to load incentive history");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="bg-gray-50 min-h-screen pb-24 font-poppins">
      <div className="bg-white px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)+16px)] sticky top-0 z-30 border-b border-gray-100 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-gray-50">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-gray-900 text-xl font-bold">Incentive History</h1>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="py-16 text-center text-gray-400 font-medium">Loading...</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <Gift className="mx-auto text-gray-300 mb-2" />
            <p className="font-bold text-gray-900">No incentives yet</p>
            <p className="text-sm text-gray-500 mt-1">Complete offer targets to earn extra pay.</p>
          </div>
        ) : (
          items.map((row) => (
            <div key={row._id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">{row.title}</h3>
                  <p className="text-[11px] font-semibold text-gray-500 mt-0.5 capitalize">
                    {row.periodType} · {row.periodKey}
                  </p>
                </div>
                <span className="font-black text-emerald-600">{RUPEE}{row.amount}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-50 rounded-xl py-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Target</p>
                  <p className="text-sm font-black text-gray-900">{row.targetOrders}</p>
                </div>
                <div className="bg-gray-50 rounded-xl py-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Done</p>
                  <p className="text-sm font-black text-gray-900">{row.completedOrders}</p>
                </div>
                <div className="bg-gray-50 rounded-xl py-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Status</p>
                  <p className="text-sm font-black capitalize text-gray-900">{row.paymentStatus}</p>
                </div>
              </div>
              {row.earnedAt && (
                <p className="text-[11px] text-gray-400 font-medium mt-2">
                  Earned {new Date(row.earnedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default IncentiveHistory;

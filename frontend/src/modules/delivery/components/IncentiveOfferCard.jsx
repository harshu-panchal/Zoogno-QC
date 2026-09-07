import React from "react";
import { useNavigate } from "react-router-dom";

const PERIOD_LABEL = {
  daily: "Today's Incentive Offer",
  weekly: "This Week's Incentive",
  monthly: "This Month's Incentive",
  custom: "Incentive Offer",
};

function formatRemaining(ms) {
  if (ms <= 0) return "Ended";
  const totalMins = Math.floor(ms / 60000);
  const hours = Math.floor(totalMins / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d ${hours % 24}h left`;
  if (hours >= 1) return `${hours}h ${totalMins % 60}m left`;
  return `${Math.max(1, totalMins)}m left`;
}

const IncentiveOfferCard = ({ offer }) => {
  const navigate = useNavigate();
  if (!offer) return null;

  const percent = Math.min(100, Number(offer.percent || 0));
  const earned = offer.status === "earned";
  const remaining = Number(offer.remainingOrders || 0);

  return (
    <button
      type="button"
      onClick={() => navigate("/delivery/incentives/history")}
      className="w-full text-left rounded-2xl p-4 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-orange-500/20 overflow-hidden relative"
    >
      <div className="absolute -right-8 -top-8 w-24 h-24 bg-white/10 rounded-full" />
      <p className="text-[11px] font-black uppercase tracking-widest text-white/80 relative z-10">
        {PERIOD_LABEL[offer.periodType] || "Incentive Offer"}
      </p>
      <h3 className="text-base font-black mt-1 relative z-10 leading-snug">{offer.title}</h3>
      <p className="text-sm font-medium text-white/90 mt-1 relative z-10">
        Complete <span className="font-black">{offer.targetOrders} orders</span> and earn{" "}
        <span className="font-black">₹{offer.amount}</span>
      </p>

      <div className="mt-3 relative z-10">
        <div className="flex justify-between text-[11px] font-bold mb-1">
          <span>
            {offer.completedOrders} / {offer.targetOrders} Orders
          </span>
          <span>{formatRemaining(offer.msRemaining)}</span>
        </div>
        <div className="h-2.5 bg-white/25 rounded-full overflow-hidden">
          <div className="h-full bg-white rounded-full transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <p className="text-xs font-bold mt-2.5 relative z-10">
        {earned
          ? `₹${offer.amount} credited to your wallet`
          : remaining > 0
            ? `Complete ${remaining} more order${remaining === 1 ? "" : "s"} to earn ₹${offer.amount}!`
            : "Target reached — confirming payout..."}
      </p>
    </button>
  );
};

export default IncentiveOfferCard;

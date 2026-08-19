import Order from "../models/order.js";
import Transaction from "../models/transaction.js";
import handleResponse from "../utils/helper.js";
import mongoose from "mongoose";
import Wallet from "../models/wallet.js";
import { getSellerStats as getSellerStatsFromService } from "../services/seller/sellerStatsService.js";
import { roundCurrency } from "../utils/money.js";
import { computeWithdrawableBalance } from "../utils/transactionBalance.js";

/* ===============================
   GET SELLER DASHBOARD STATS
   Delegates to SellerStatsService (P6.2 — cache-fronted) so the heavy
   $facet aggregation + category pipeline are absorbed for ~60s.
================================ */
export const getSellerStats = async (req, res) => {
    try {
        const result = await getSellerStatsFromService(req.user.id, {
            range: req.query?.range,
        });
        return handleResponse(res, 200, "Stats fetched successfully", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   GET SELLER EARNINGS / TRANSACTIONS
================================ */
export const getSellerEarnings = async (req, res) => {
    try {
        const sellerId = req.user.id;
        const sellerOid = new mongoose.Types.ObjectId(sellerId);

        const transactions = await Transaction.find({ user: sellerId, userModel: 'Seller' })
            .sort({ createdAt: -1 })
            .populate("order", "orderId");

        // Single source of truth, shared with requestWithdrawal()'s own validation —
        // see utils/transactionBalance.js for why this must not be recomputed inline.
        const { settledBalance, pendingPayouts, availableBalance } =
            await computeWithdrawableBalance(sellerId, 'Seller');

        // Fetch wallet for live "on hold" balance (money held during the return window).
        // NOTE: wallet.availableBalance is NOT used for the seller-facing available-to-withdraw
        // figure — it's fed exclusively by the order-settlement payout pipeline and is never
        // debited by this legacy Transaction-based withdrawal flow, so it drifts out of sync
        // with reality as soon as a withdrawal is approved.
        const wallet = await Wallet.findOne({ ownerType: 'SELLER', ownerId: sellerId });
        const onHoldBalance = wallet ? wallet.pendingBalance : 0;

        // Keep "Total Revenue" aligned with Dashboard definition:
        // sum of non-cancelled seller orders from Order collection.
        const [orderRevenueAgg] = await Order.aggregate([
            {
                $match: {
                    seller: sellerOid,
                    status: { $ne: 'cancelled' },
                },
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
                },
            },
        ]);
        const totalRevenue = Number(orderRevenueAgg?.totalRevenue || 0);

        const totalWithdrawn = roundCurrency(
            transactions
                .filter(t => t.type === 'Withdrawal' && t.status === 'Settled')
                .reduce((acc, t) => acc + Math.abs(t.amount), 0)
        );

        const totalRefunds = roundCurrency(
            transactions
                .filter(t => t.type === 'Refund')
                .reduce((acc, t) => acc + Math.abs(t.amount), 0)
        );

        // Monthly Revenue Aggregation (Last 6 Months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyAggregation = await Transaction.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(sellerId),
                    userModel: 'Seller',
                    type: 'Order Payment',
                    createdAt: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                    revenue: { $sum: "$amount" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const chartData = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const dateStr = d.toISOString().slice(0, 7);
            const data = monthlyAggregation.find(m => m._id === dateStr);
            chartData.push({
                name: monthNames[d.getMonth()],
                revenue: data ? data.revenue : 0
            });
        }

        return handleResponse(res, 200, "Earnings fetched successfully", {
            balances: {
                settledBalance: settledBalance,
                pendingPayouts: pendingPayouts,
                onHoldBalance: onHoldBalance,
                availableBalance: availableBalance, // = settledBalance - pendingPayouts, same formula requestWithdrawal() enforces
                totalRevenue: totalRevenue,
                totalWithdrawn: totalWithdrawn,
                totalRefunds: totalRefunds
            },
            monthlyChart: chartData,
            ledger: transactions.map(t => ({
                id: (t.reference || t._id).toString(),
                type: t.type,
                amount: t.amount,
                status: t.status,
                date: t.createdAt.toISOString().split('T')[0],
                time: t.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                customer: t.type === 'Withdrawal' ? 'Bank Transfer' : 'Customer',
                ref: t.order ? `#${t.order.orderId}` : t.reference || t._id
            }))
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

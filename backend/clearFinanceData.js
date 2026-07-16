import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import Transaction from "./app/models/transaction.js";
import Payout from "./app/models/payout.js";
import Wallet from "./app/models/wallet.js";
import LedgerEntry from "./app/models/ledgerEntry.js";
import SellerMetrics from "./app/models/sellerMetrics.js";

async function clearData() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");

        console.log("Deleting Transactions...");
        await Transaction.deleteMany({});
        console.log("Transactions deleted.");

        console.log("Deleting Payouts (Withdrawals)...");
        await Payout.deleteMany({});
        console.log("Payouts deleted.");

        console.log("Deleting LedgerEntries...");
        await LedgerEntry.deleteMany({});
        console.log("LedgerEntries deleted.");

        console.log("Deleting SellerMetrics...");
        await SellerMetrics.deleteMany({});
        console.log("SellerMetrics deleted.");

        console.log("Resetting Wallet balances to 0...");
        await Wallet.updateMany({}, {
            $set: {
                availableBalance: 0,
                pendingBalance: 0,
                cashInHand: 0,
                totalCredited: 0,
                totalDebited: 0
            }
        });
        console.log("Wallet balances reset.");

        console.log("Data cleared successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Error clearing data:", err);
        process.exit(1);
    }
}

clearData();

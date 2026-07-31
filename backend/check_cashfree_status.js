import dotenv from "dotenv";
dotenv.config();

const run = async () => {
    const { getActivePaymentProvider } = await import("./app/services/payment/providerRegistry.js");
    const provider = getActivePaymentProvider();
    const statusResp = await provider.getPaymentStatus({ merchantOrderId: "COD-REMIT-1785493767047-149" });
    console.log("Cashfree Status:", statusResp);
    process.exit(0);
};

run().catch(console.error);

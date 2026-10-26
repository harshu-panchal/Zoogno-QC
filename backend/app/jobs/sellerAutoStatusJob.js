import cron from "node-cron";
import Seller from "../models/seller.js";
import { getIO } from "../socket/socketManager.js";
import { isWithinTimeWindows } from "../domains/deliverySurge/deliverySurge.period.js";
import { invalidate, buildKey } from "../services/cacheService.js";

/**
 * Auto open/close: every minute, flip `isOnline` for every seller who has
 * `shopSchedule.enabled` to match whether the current IST time falls inside
 * their [openTime, closeTime) window — same effect as the seller manually
 * hitting the store-status toggle (sellerController.updateStoreStatus), just
 * driven by the clock instead of a tap.
 */
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    const scheduledSellers = await Seller.find({ "shopSchedule.enabled": true }).select(
      "isOnline shopSchedule",
    );

    if (!scheduledSellers.length) return;

    let changed = false;
    for (const seller of scheduledSellers) {
      const shouldBeOnline = isWithinTimeWindows(
        [{ startTime: seller.shopSchedule.openTime, endTime: seller.shopSchedule.closeTime }],
        now,
      );

      if (Boolean(seller.isOnline) === shouldBeOnline) continue;

      seller.isOnline = shouldBeOnline;
      seller.lastSeen = now;
      await seller.save();
      changed = true;

      try {
        const io = getIO();
        if (io) {
          io.to("customer:online").emit("seller-status-updated", {
            sellerId: seller._id,
            isOnline: seller.isOnline,
          });
          io.to(`seller:${seller._id}`).emit("store-status-updated", {
            isOnline: seller.isOnline,
            auto: true,
          });
        }
      } catch (socketError) {
        console.warn("Socket emission failed for auto store status:", socketError.message);
      }
    }

    if (changed) {
      invalidate(buildKey("products", "list", "*"));
      invalidate(buildKey("sellers", "nearby", "*"));
      invalidate(buildKey("category", "list", "*"));
    }
  } catch (error) {
    console.error("Seller Auto Status Cron Error:", error);
  }
});

export const startSellerAutoStatusCron = () => {
  console.log("Seller Auto Open/Close Cron started");
};

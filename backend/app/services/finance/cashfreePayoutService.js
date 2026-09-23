import Seller from "../../models/seller.js";
import Delivery from "../../models/delivery.js";
import { cashfreePayoutAdapter } from "../payment/providers/cashfreePayout.adapter.js";
import { BENEFICIARY_TYPE, SETTLEMENT_PAYOUT_STATUS } from "../../models/settlementPayout.js";
import logger from "../logger.js";

function cashfreeBeneficiaryId(beneficiaryType, beneficiaryId) {
  const prefix = beneficiaryType === BENEFICIARY_TYPE.SELLER ? "SELLER" : "RIDER";
  return `${prefix}_${beneficiaryId}`;
}

/** Builds the Cashfree beneficiary payload from a Seller/Delivery doc, or
 * throws a clear, admin-facing error if the data needed isn't there — never
 * fabricates bank/address details. */
async function buildBeneficiaryPayload(beneficiaryType, beneficiaryId, paymentMethod) {
  if (beneficiaryType === BENEFICIARY_TYPE.SELLER) {
    const seller = await Seller.findById(beneficiaryId).select(
      "name shopName email phone address city state pincode bankDetails upiDetails",
    );
    if (!seller) throw new Error("Seller not found");

    const name = seller.bankDetails?.accountHolderName || seller.shopName || seller.name;
    if (paymentMethod === "UPI") {
      if (!seller.upiDetails?.upiId) {
        throw new Error("This seller has no UPI ID on file. Add one in their profile before sending a UPI payout.");
      }
      return {
        beneficiaryId: cashfreeBeneficiaryId(beneficiaryType, beneficiaryId),
        name,
        vpa: seller.upiDetails.upiId,
        email: seller.email,
        phone: seller.phone,
      };
    }

    if (!seller.bankDetails?.accountNumber || !seller.bankDetails?.ifscCode) {
      throw new Error("This seller has no bank account on file. Add bank details in their profile before sending a bank transfer payout.");
    }
    if (!seller.address || !seller.city || !seller.state || !seller.pincode) {
      throw new Error("This seller's profile is missing address/city/state/pincode, which Cashfree requires to register a bank beneficiary.");
    }
    return {
      beneficiaryId: cashfreeBeneficiaryId(beneficiaryType, beneficiaryId),
      name,
      bankAccountNumber: seller.bankDetails.accountNumber,
      ifsc: seller.bankDetails.ifscCode,
      email: seller.email,
      phone: seller.phone,
      address: seller.address,
      city: seller.city,
      state: seller.state,
      pincode: seller.pincode,
    };
  }

  const delivery = await Delivery.findById(beneficiaryId).select(
    "name email phone address city state pincode accountHolder accountNumber ifsc upiId",
  );
  if (!delivery) throw new Error("Delivery partner not found");

  const name = delivery.accountHolder || delivery.name;
  if (paymentMethod === "UPI") {
    if (!delivery.upiId) {
      throw new Error("This delivery partner has no UPI ID on file. Add one in their profile before sending a UPI payout.");
    }
    return {
      beneficiaryId: cashfreeBeneficiaryId(beneficiaryType, beneficiaryId),
      name,
      vpa: delivery.upiId,
      email: delivery.email,
      phone: delivery.phone,
    };
  }

  if (!delivery.accountNumber || !delivery.ifsc) {
    throw new Error("This delivery partner has no bank account on file. Add bank details in their profile before sending a bank transfer payout.");
  }
  if (!delivery.address || !delivery.city || !delivery.state || !delivery.pincode) {
    throw new Error("This delivery partner's profile is missing address/city/state/pincode, which Cashfree requires to register a bank beneficiary. Ask them to complete it under Bank Account in their app.");
  }
  return {
    beneficiaryId: cashfreeBeneficiaryId(beneficiaryType, beneficiaryId),
    name,
    bankAccountNumber: delivery.accountNumber,
    ifsc: delivery.ifsc,
    email: delivery.email,
    phone: delivery.phone,
    address: delivery.address,
    city: delivery.city,
    state: delivery.state,
    pincode: delivery.pincode,
  };
}

/**
 * Registers (or reuses) the Cashfree beneficiary and initiates the transfer
 * for a SettlementPayout record that was just created with status PENDING.
 * Mutates and saves the payout document with the outcome. Never throws past
 * this point — a failure is recorded on the payout itself so the caller's
 * reserved-balance bookkeeping stays consistent.
 */
export async function processCashfreePayout(payout) {
  try {
    const beneficiaryPayload = await buildBeneficiaryPayload(
      payout.beneficiaryType,
      payout.beneficiaryId,
      payout.paymentMethod,
    );

    await cashfreePayoutAdapter.createOrGetBeneficiary(beneficiaryPayload);
    payout.cashfreeBeneficiaryId = beneficiaryPayload.beneficiaryId;

    const safePayoutId = payout.payoutId.replace(/-/g, "_");
    const safeRemarks = `Settlement payout ${payout.payoutId}`.replace(/[^a-zA-Z0-9 ]/g, "");
    const transferResponse = await cashfreePayoutAdapter.createTransfer({
      transferId: safePayoutId,
      amount: payout.amount,
      beneficiaryId: beneficiaryPayload.beneficiaryId,
      remarks: safeRemarks,
    });

    payout.cashfreeTransferId = safePayoutId;
    payout.cashfreeReferenceId = transferResponse.cf_transfer_id || transferResponse.referenceId || null;
    payout.cashfreeStatus = transferResponse.status || null;
    payout.cashfreeStatusCode = transferResponse.status_code || null;
    payout.cashfreeStatusDescription = transferResponse.status_description || null;
    payout.cashfreeRawResponse = transferResponse;
    payout.status = cashfreePayoutAdapter.mapCashfreeStatus(transferResponse.status);
    await payout.save();
  } catch (error) {
    logger.error("cashfree_payout_initiate_failed", {
      payoutId: payout.payoutId,
      error: error.message,
    });
    payout.status = SETTLEMENT_PAYOUT_STATUS.FAILED;
    payout.failureReason = error.message;
    await payout.save();
  }

  return payout;
}

/** Polls Cashfree for the latest status of a still-PENDING/PROCESSING transfer. */
export async function fetchAndApplyTransferStatus(payout) {
  if (!payout.cashfreeTransferId) return payout;

  const statusResponse = await cashfreePayoutAdapter.getTransferStatus(payout.cashfreeTransferId);
  payout.cashfreeReferenceId = statusResponse.cf_transfer_id || payout.cashfreeReferenceId;
  payout.cashfreeStatus = statusResponse.status || payout.cashfreeStatus;
  payout.cashfreeStatusCode = statusResponse.status_code || payout.cashfreeStatusCode;
  payout.cashfreeStatusDescription = statusResponse.status_description || payout.cashfreeStatusDescription;
  payout.cashfreeRawResponse = statusResponse;

  const mapped = cashfreePayoutAdapter.mapCashfreeStatus(statusResponse.status);
  if (mapped === "FAILED" && payout.status !== SETTLEMENT_PAYOUT_STATUS.FAILED) {
    payout.status = SETTLEMENT_PAYOUT_STATUS.FAILED;
    payout.failureReason = statusResponse.status_description || statusResponse.status || "Transfer failed";
  } else if (mapped !== "FAILED") {
    payout.status = mapped;
  }

  await payout.save();
  return payout;
}

import { getCodDueAmount, isCodAlreadyCollected, isCodOrder } from "../app/utils/codAmount.js";

describe("codAmount helpers", () => {
  it("subtracts wallet from COD due", () => {
    expect(
      getCodDueAmount({
        paymentBreakdown: { grandTotal: 250, walletAmount: 50 },
      }),
    ).toBe(200);
  });

  it("treats QR or cash collection as already collected", () => {
    expect(isCodAlreadyCollected({ financeFlags: { codMarkedCollected: true } })).toBe(true);
    expect(isCodAlreadyCollected({ codCollectionMethod: "UPI_QR" })).toBe(true);
    expect(isCodAlreadyCollected({ paymentMode: "COD" })).toBe(false);
  });

  it("detects COD from paymentMode or legacy method", () => {
    expect(isCodOrder({ paymentMode: "COD" })).toBe(true);
    expect(isCodOrder({ payment: { method: "cash" } })).toBe(true);
    expect(isCodOrder({ paymentMode: "ONLINE" })).toBe(false);
  });
});

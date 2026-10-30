import { describe, expect, test } from "@jest/globals";
import {
  PRODUCT_APPROVAL_STATUS,
  sellerEditRequiresModeration,
} from "../app/services/productModerationService.js";

describe("seller product moderation transitions", () => {
  test("pending product cannot become approved through a seller edit", () => {
    expect(
      sellerEditRequiresModeration(
        { approvalStatus: PRODUCT_APPROVAL_STATUS.PENDING },
        false,
      ),
    ).toBe(true);
  });

  test("rejected product is resubmitted after a seller edit", () => {
    expect(
      sellerEditRequiresModeration(
        { approvalStatus: PRODUCT_APPROVAL_STATUS.REJECTED },
        false,
      ),
    ).toBe(true);
  });

  test("approved product follows the configured edit policy", () => {
    const product = { approvalStatus: PRODUCT_APPROVAL_STATUS.APPROVED };
    expect(sellerEditRequiresModeration(product, false)).toBe(false);
    expect(sellerEditRequiresModeration(product, true)).toBe(true);
  });

  test("legacy approved product follows the configured edit policy", () => {
    expect(sellerEditRequiresModeration({}, false)).toBe(false);
    expect(sellerEditRequiresModeration({}, true)).toBe(true);
  });
});

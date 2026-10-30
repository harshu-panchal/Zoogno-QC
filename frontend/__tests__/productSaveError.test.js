import { describe, expect, test } from "@jest/globals";
import { getProductSaveErrorMessage } from "../src/core/utils/productSaveError.js";

describe("getProductSaveErrorMessage", () => {
  test("prefers the API response message", () => {
    expect(
      getProductSaveErrorMessage({
        response: { data: { message: "SKU already exists" } },
      }),
    ).toBe("SKU already exists");
  });

  test("explains that a timed-out save may have completed", () => {
    expect(getProductSaveErrorMessage({ code: "ECONNABORTED" })).toContain(
      "may still have completed",
    );
  });

  test("includes an HTTP status when the proxy returns no JSON message", () => {
    expect(getProductSaveErrorMessage({ response: { status: 502 } })).toBe(
      "Failed to save product (HTTP 502). Please try again.",
    );
  });
});

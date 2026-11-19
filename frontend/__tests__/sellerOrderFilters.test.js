import {
  sellerOrderStatusParam,
  sellerOrderTabStatus,
  orderMatchesSellerTab,
  buildSellerOrderParams,
} from "../src/shared/utils/sellerOrderFilters.js";

// The statuses the backend's normalizeSellerStatusFilter() accepts.
const BACKEND_STATUS_VALUES = new Set(["pending", "processed", "out-for-delivery", "delivered", "cancelled", "returned"]);

describe("sellerOrderStatusParam", () => {
  test.each([
    ["All", undefined],
    ["Pending", "pending"],
    ["Confirmed", "processed"],
    ["Packed", "processed"],
    ["Out for Delivery", "out-for-delivery"],
    ["Delivered", "delivered"],
    ["Cancelled", "cancelled"],
  ])("tab %p -> %p", (tab, expected) => {
    expect(sellerOrderStatusParam(tab)).toBe(expected);
  });

  test("every value it produces is one the backend actually accepts", () => {
    for (const tab of ["Pending", "Confirmed", "Packed", "Out for Delivery", "Delivered", "Cancelled"]) {
      expect(BACKEND_STATUS_VALUES.has(sellerOrderStatusParam(tab))).toBe(true);
    }
  });

  test("an unknown or missing tab means no status filter (never a bogus value)", () => {
    expect(sellerOrderStatusParam(undefined)).toBeUndefined();
    expect(sellerOrderStatusParam("")).toBeUndefined();
    expect(sellerOrderStatusParam("Whatever")).toBeUndefined();
  });
});

describe("orderMatchesSellerTab - the exact tab on top of the coarse server filter", () => {
  test("Confirmed and Packed share the server's 'processed', but stay distinct on screen", () => {
    expect(orderMatchesSellerTab({ status: "confirmed" }, "Confirmed")).toBe(true);
    expect(orderMatchesSellerTab({ status: "packed" }, "Confirmed")).toBe(false);
    expect(orderMatchesSellerTab({ status: "packed" }, "Packed")).toBe(true);
  });

  test("'Out for Delivery' maps to the stored out_for_delivery", () => {
    expect(sellerOrderTabStatus("Out for Delivery")).toBe("out_for_delivery");
    expect(orderMatchesSellerTab({ status: "out_for_delivery" }, "Out for Delivery")).toBe(true);
  });

  test("'All' matches everything; case does not matter", () => {
    expect(orderMatchesSellerTab({ status: "anything" }, "All")).toBe(true);
    expect(orderMatchesSellerTab({ status: "DELIVERED" }, "Delivered")).toBe(true);
    expect(orderMatchesSellerTab({}, "Delivered")).toBe(false);
  });
});

describe("buildSellerOrderParams", () => {
  test("sends the search to the server (trimmed), so ANY order can be found - not just the loaded page", () => {
    expect(buildSellerOrderParams({ page: 3, search: "  ORD-123  " })).toEqual({ page: 3, search: "ORD-123" });
  });

  test("omits empty values entirely", () => {
    expect(buildSellerOrderParams({ search: "   ", tab: "All", startDate: "", endDate: "" })).toEqual({ page: 1 });
    expect(buildSellerOrderParams()).toEqual({ page: 1 });
  });

  test("combines search, tab and dates", () => {
    expect(
      buildSellerOrderParams({ page: 2, search: "asha", tab: "Delivered", startDate: "2026-08-01", endDate: "2026-08-31" }),
    ).toEqual({ page: 2, search: "asha", status: "delivered", startDate: "2026-08-01", endDate: "2026-08-31" });
  });
});

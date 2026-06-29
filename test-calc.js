import { resolveHandlingConfig, calculateHandlingFee } from "./backend/app/services/finance/pricingService.js";

const category = {
  _id: "60b8d295f1d2c140c83a1b15",
  name: "Atta",
  handlingFeeType: "fixed",
  handlingFeeValue: 10
};

const targetId = category._id;
const item = {
  price: 90,
  quantity: 1,
  headerCategoryId: targetId,
};

const options = {
  categoryById: new Map([[targetId.toString(), category]])
};

console.log("Handling Result:", calculateHandlingFee([item], options));

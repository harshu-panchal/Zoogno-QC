import SurgeCharge from "../../models/surgeCharge.js";

export async function computeSurgeChargeForCheckout(hydratedItems = [], address = {}, productSubtotal = 0, { session = null } = {}) {
  const query = SurgeCharge.find({ isActive: true }).sort({ priority: -1 }).lean();
  if (session) query.session(session);
  const activeSurges = await query;

  if (!activeSurges || activeSurges.length === 0) {
    return { surgeChargeCharged: 0, surgeRuleName: null };
  }

  for (const surge of activeSurges) {
    let matches = false;

    if (surge.applyTo === 'All') {
      matches = true;
    } else if (surge.applyTo === 'City') {
      const cityMatches = (surge.cities || []).some(c => 
        (address?.city || address?.address || "").toLowerCase().includes(c.toLowerCase())
      );
      if (cityMatches) matches = true;
    } else if (surge.applyTo === 'Seller') {
      const sellerIdsInCart = new Set(hydratedItems.map(item => String(item.sellerId)));
      const surgeSellers = new Set((surge.sellers || []).map(id => String(id)));
      if ([...sellerIdsInCart].some(id => surgeSellers.has(id))) {
        matches = true;
      }
    } else if (surge.applyTo === 'Category') {
      const categoryIdsInCart = new Set(hydratedItems.map(item => String(item.categoryId)));
      const surgeCategories = new Set((surge.categories || []).map(id => String(id)));
      if ([...categoryIdsInCart].some(id => surgeCategories.has(id))) {
        matches = true;
      }
    }

    if (matches) {
      let fee = 0;
      if (surge.calculationType === 'Fixed') {
        fee = surge.value;
      } else if (surge.calculationType === 'Percentage') {
        fee = (productSubtotal * surge.value) / 100;
      }
      return { 
        surgeChargeCharged: Number(fee.toFixed(2)), 
        surgeRuleName: surge.name 
      };
    }
  }

  return { surgeChargeCharged: 0, surgeRuleName: null };
}

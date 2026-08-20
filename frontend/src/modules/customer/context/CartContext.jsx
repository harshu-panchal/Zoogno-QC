import React, { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { customerApi } from "../services/customerApi";
import { useAuth } from "../../../core/context/AuthContext";
import ConfirmDialog from "../../../shared/components/ui/ConfirmDialog";
import { useToast } from "../../../shared/components/ui/Toast";

const CartContext = createContext();

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [cart, setCart] = useState(() => {
    try {
      const savedCart = localStorage.getItem("cart");
      return savedCart ? JSON.parse(savedCart) : [];
    } catch (error) {
      console.error("Failed to load cart from localStorage", error);
      return [];
    }
  });

  const [loading, setLoading] = useState(false);
  const [sellerConflict, setSellerConflict] = useState(null);
  const pendingRequestsRef = React.useRef(0);
  const lsDebounceRef = useRef(null);
  const { showToast } = useToast();

  // Mirrors `cart` so mutation callbacks below can read the latest cart
  // without needing `cart` in their own dependency list — that's what lets
  // addToCart/removeFromCart/updateQuantity keep a stable identity across
  // renders (via useCallback) instead of being recreated on every cart
  // change. A stable identity is required for React.memo on cart-consuming
  // components (e.g. ProductCard) to actually skip re-rendering unrelated
  // cards when one product's quantity changes — previously every card
  // re-rendered on every cart mutation because these callbacks (and the
  // context value bundling them) changed reference every single time.
  const cartRef = useRef(cart);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  // Clear cart locally when user logs out is handled by the useEffect dependency on isAuthenticated
  const normalizeBackendCart = (items) => {
    if (!items) return [];
    return items.map((item) => {
      const product = item.productId;
      const variantKey = String(item.variantSku || "").trim();
      const { price, salePrice, variantName } = resolveVariantPricing(product, variantKey);
      return {
        ...product,
        id: product?._id, // Normalize ID
        quantity: item.quantity,
        variantSku: variantKey,
        variantName,
        price,
        salePrice,
        image: product?.mainImage, // Handle mapping for frontend
      };
    });
  };

  const resolveVariantPricing = (product, variantSku = "") => {
    const normalizedKey = String(variantSku || "").trim();
    if (!normalizedKey) {
      return {
        price: Number(product?.price || 0),
        salePrice: Number(product?.salePrice || 0),
        variantName: "",
      };
    }

    const variants = Array.isArray(product?.variants) ? product.variants : [];
    const hit = variants.find((v) => {
      const sku = String(v?.sku || "").trim();
      const name = String(v?.name || "").trim();
      return (sku && sku === normalizedKey) || (!sku && name === normalizedKey) || name === normalizedKey;
    });
    return {
      price: Number(hit?.price || product?.price || 0),
      salePrice: Number(hit?.salePrice || 0),
      variantName: String(hit?.name || "").trim(),
    };
  };

  const syncCart = useCallback((backendItems) => {
    // Only update state from backend if no more pending optimistic updates
    if (pendingRequestsRef.current === 0) {
      setCart(normalizeBackendCart(backendItems));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCart = useCallback(async () => {
    if (isAuthenticated) {
      setLoading(true);
      try {
        const response = await customerApi.getCart();
        setCart(normalizeBackendCart(response.data.result.items));
      } catch (error) {
        console.error("Failed to fetch cart from backend", error);
      } finally {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Fetch cart from backend on mount or authentication change
  useEffect(() => {
    if (isAuthenticated) {
      fetchCart();
    } else {
      // Clear cart state and load from local storage for guests
      try {
        const savedCart = localStorage.getItem("cart");
        setCart(savedCart ? JSON.parse(savedCart) : []);
      } catch (error) {
        setCart([]);
      }
    }
  }, [isAuthenticated]);

  // Save local cart to localStorage (fallback/guest mode) — debounced to 300 ms
  useEffect(() => {
    if (isAuthenticated) return;           // backend is source of truth

    clearTimeout(lsDebounceRef.current);
    lsDebounceRef.current = setTimeout(() => {
      localStorage.setItem("cart", JSON.stringify(cart));
    }, 300);

    return () => {
      if (isAuthenticated) return;
      // Flush on unmount — no data loss
      clearTimeout(lsDebounceRef.current);
      localStorage.setItem("cart", JSON.stringify(cart));
    };
  }, [cart, isAuthenticated]);

  const addToCart = useCallback(async (product) => {
    const currentCart = cartRef.current;
    if (currentCart.length > 0) {
      const currentSellerId = currentCart[0].sellerId?._id || currentCart[0].sellerId;
      const newSellerId = product.sellerId?._id || product.sellerId;
      if (currentSellerId && newSellerId && String(currentSellerId) !== String(newSellerId)) {
        setSellerConflict({
          currentSellerName: currentCart[0].sellerId?.shopName || "another seller",
          pendingProduct: product
        });
        return;
      }
    }

    const availableStock = product.stock !== undefined ? product.stock : 0;
    const isOutOfStock = product.isOutOfStock || availableStock === 0;

    if (isOutOfStock) {
      showToast(`${product.name} is currently out of stock.`, "error");
      return;
    }

    const variantSku = String(product?.variantSku || product?.variantName || "").trim();
    const id = product.id || product._id;
    const key = `${id}::${variantSku || ""}`;
    const { price, salePrice, variantName } = resolveVariantPricing(product, variantSku);

    // Optimistic UI update for instant feedback
    setCart((prev) => {
      const existingItem = prev.find(
        (item) => `${item.id || item._id}::${String(item.variantSku || "").trim()}` === key,
      );
      if (existingItem) {
        return prev.map((item) =>
          `${item.id || item._id}::${String(item.variantSku || "").trim()}` === key
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      return [
        ...prev,
        {
          ...product,
          id,
          variantSku,
          variantName,
          price,
          salePrice,
          quantity: 1,
          image: product.image || product.mainImage,
        },
      ];
    });

    if (isAuthenticated) {
      pendingRequestsRef.current += 1;
      try {
        const response = await customerApi.addToCart({
          productId: id,
          variantSku,
          quantity: 1,
        });
        pendingRequestsRef.current -= 1;
        await syncCart(response.data.result.items);
      } catch (error) {
        pendingRequestsRef.current -= 1;
        console.error("Error adding to cart on backend", error);
        // Re-fetch entire cart to ensure consistency on error
        if (pendingRequestsRef.current === 0) {
          await fetchCart();
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, showToast, syncCart, fetchCart]);

  const removeFromCart = useCallback(async (productId, variantSku = "") => {
    const normalizedVariantSku = String(variantSku || "").trim();
    const key = `${productId}::${normalizedVariantSku || ""}`;

    // Optimistic update (remove only the matching line when variantSku is provided).
    setCart((prev) =>
      prev.filter(
        (item) =>
          `${item.id || item._id}::${String(item.variantSku || "").trim()}` !==
          key,
      ),
    );

    if (isAuthenticated) {
      pendingRequestsRef.current += 1;
      try {
        const response = await customerApi.removeFromCart(
          productId,
          normalizedVariantSku,
        );
        pendingRequestsRef.current -= 1;
        await syncCart(response.data.result.items);
      } catch (error) {
        pendingRequestsRef.current -= 1;
        console.error("Error removing from cart on backend", error);
        if (pendingRequestsRef.current === 0) {
          await fetchCart();
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, syncCart, fetchCart]);

  const updateQuantity = useCallback(async (productId, delta, variantSku = "") => {
    const normalizedVariantSku = String(variantSku || "").trim();
    const key = `${productId}::${normalizedVariantSku || ""}`;
    const currentItem = cartRef.current.find(
      (item) =>
        `${item.id || item._id}::${String(item.variantSku || "").trim()}` === key,
    );
    if (!currentItem) return;

    const availableStock = currentItem.stock !== undefined ? currentItem.stock : 0;
    const isOutOfStock = currentItem.isOutOfStock;

    if (delta > 0) {
      if (isOutOfStock) {
        showToast(`${currentItem.name} is out of stock.`, "error");
        return;
      }
      if (currentItem.quantity + delta > availableStock) {
        showToast(`Only ${availableStock} units available for ${currentItem.name}.`, "error");
        return;
      }
    }

    const newQty = Math.max(0, currentItem.quantity + delta);

    if (newQty === 0) {
      removeFromCart(productId, normalizedVariantSku);
      return;
    }

    // Optimistic update
    setCart((prev) =>
      prev.map((item) => {
        if (
          `${item.id || item._id}::${String(item.variantSku || "").trim()}` ===
          key
        ) {
          return { ...item, quantity: newQty };
        }
        return item;
      }),
    );

    if (isAuthenticated) {
      pendingRequestsRef.current += 1;
      try {
        const response = await customerApi.updateCartQuantity({
          productId,
          quantity: newQty,
          variantSku: normalizedVariantSku,
        });
        pendingRequestsRef.current -= 1;
        await syncCart(response.data.result.items);
      } catch (error) {
        pendingRequestsRef.current -= 1;
        console.error("Error updating quantity on backend", error);
        if (pendingRequestsRef.current === 0) {
          await fetchCart();
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, showToast, removeFromCart, syncCart, fetchCart]);

  const clearCart = useCallback(async () => {
    if (isAuthenticated) {
      try {
        await customerApi.clearCart();
        setCart([]);
      } catch (error) {
        console.error("Error clearing cart on backend", error);
      }
    } else {
      setCart([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const resolveConflict = async (clearAndAdd) => {
    const pendingProduct = sellerConflict?.pendingProduct;
    setSellerConflict(null);
    if (clearAndAdd && pendingProduct) {
      await clearCart();
      await addToCart(pendingProduct);
    }
  };

  const cartTotal = cart.reduce((total, item) => {
    const unit =
      Number(item.salePrice || 0) > 0 && Number(item.salePrice) < Number(item.price || 0)
        ? Number(item.salePrice)
        : Number(item.price || 0);
    return total + unit * Number(item.quantity || 0);
  }, 0);
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);

  const cartValue = useMemo(() => ({
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    cartTotal,
    cartCount,
    loading,
  }), [cart, cartTotal, cartCount, loading, addToCart, removeFromCart, updateQuantity, clearCart]);

  return (
    <CartContext.Provider value={cartValue}>
      {children}
      <ConfirmDialog
        isOpen={!!sellerConflict}
        title="Different Seller Detected"
        message={`Your cart contains products from ${sellerConflict?.currentSellerName || "another seller"}.\n\nYou can place an order from only one seller at a time. Do you want to clear your cart and add this new item?`}
        confirmLabel="Clear Cart & Add New Item"
        cancelLabel="Cancel"
        onConfirm={() => resolveConflict(true)}
        onCancel={() => resolveConflict(false)}
        variant="primary"
      />
    </CartContext.Provider>
  );
};

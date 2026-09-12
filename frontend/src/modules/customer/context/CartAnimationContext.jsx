import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

const CartAnimationContext = createContext({
  animateAddToCart: () => {},
  animateRemoveFromCart: () => {},
});

export const useCartAnimation = () => useContext(CartAnimationContext);

export const CartAnimationProvider = ({ children }) => {
  const [flyingItems, setFlyingItems] = useState([]);
  const [droppingItems, setDroppingItems] = useState([]);

  const animateAddToCart = (rect, imageSrc) => {
    const id = Date.now() + Math.random();
    setFlyingItems((prev) => [...prev, { id, rect, imageSrc }]);

    // Remove item after animation
    setTimeout(() => {
      setFlyingItems((prev) => prev.filter((item) => item.id !== id));
    }, 1600); // Buffer for 1.5s animation
  };

  const animateRemoveFromCart = (imageSrc) => {
    const id = Date.now() + Math.random();

    // Calculate start position immediately to handle unmounting
    const miniCart = document.getElementById("mini-cart-target");
    let startPos;

    if (miniCart) {
      const rect = miniCart.getBoundingClientRect();
      startPos = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    } else {
      // Fallback
      const isMd = window.innerWidth >= 768;
      const bottomOffset = isMd ? 96 : 74;
      startPos = {
        x: window.innerWidth / 2,
        y: window.innerHeight - bottomOffset - 25,
      };
    }

    setDroppingItems((prev) => [...prev, { id, imageSrc, startPos }]);

    // Remove item after animation
    setTimeout(() => {
      setDroppingItems((prev) => prev.filter((item) => item.id !== id));
    }, 600);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(() => ({ animateAddToCart, animateRemoveFromCart }), []);

  return (
    <CartAnimationContext.Provider value={value}>
      {children}
      <FlyingItemsOverlay items={flyingItems} />
      <DroppingItemsOverlay items={droppingItems} />
    </CartAnimationContext.Provider>
  );
};

const FlyingItemsOverlay = ({ items }) => {
  return (
    <div className="fixed inset-0 pointer-events-none z-600 overflow-hidden">
      <AnimatePresence>
        {items.map((item) => (
          <FlyingItem key={item.id} item={item} />
        ))}
      </AnimatePresence>
    </div>
  );
};

const FlyingItem = ({ item }) => {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    // Function to find target
    const findTarget = () => {
      const miniCart = document.getElementById("mini-cart-target");
      const headerCart = document.getElementById("header-cart-icon");

      if (miniCart) {
        const rect = miniCart.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      } else if (headerCart) {
        const rect = headerCart.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      } else {
        // Fallback
        const isMd = window.innerWidth >= 768;
        const bottomOffset = isMd ? 96 : 74;
        return {
          x: window.innerWidth / 2,
          y: window.innerHeight - bottomOffset - 25,
        };
      }
    };

    // Initial calculation
    setTarget(findTarget());

    // Update target after a short delay to account for entrance animations
    const timer = setTimeout(() => {
      setTarget(findTarget());
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  if (!target) return null;

  const initialSize = 48; // Start small
  const startX = item.rect.left + item.rect.width / 2 - initialSize / 2;
  const startY = item.rect.top + item.rect.height / 2 - initialSize / 2;

  return (
    <motion.img
      src={item.imageSrc}
      // Fixed at (0,0) and moved purely via transform (x/y) instead of
      // animating left/top, so the browser can composite this on the GPU
      // instead of recalculating layout on every frame.
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: initialSize,
        height: initialSize,
        borderRadius: "50%",
        boxShadow:
          "inset 0 4px 8px rgba(255, 255, 255, 0.8), inset 0 -4px 8px rgba(0, 0, 0, 0.1), 0 8px 20px rgba(0, 0, 0, 0.3)",
      }}
      initial={{
        x: startX,
        y: startY,
        opacity: 0,
        scale: 0.5,
      }}
      animate={{
        x: target.x - initialSize / 2,
        y: target.y - initialSize / 2,
        opacity: [0, 1, 1, 0], // Fade in, stay visible, fade out
        scale: [0.5, 1.2, 1, 0.2], // Pop up, settle, then shrink into cart
      }}
      transition={{
        duration: 1.5,
        times: [0, 0.2, 0.8, 1], // Timing for opacity/scale keyframes
        ease: "easeInOut",
      }}
      className="object-cover bg-white pointer-events-none z-650"
    />
  );
};

const DroppingItemsOverlay = ({ items }) => {
  return (
    <div className="fixed inset-0 pointer-events-none z-600 overflow-hidden">
      <AnimatePresence>
        {items.map((item) => (
          <DroppingItem key={item.id} item={item} />
        ))}
      </AnimatePresence>
    </div>
  );
};

const DroppingItem = ({ item }) => {
  const { startPos } = item;
  const size = 40;

  if (!startPos) return null;

  return (
    <motion.img
      src={item.imageSrc}
      // Fixed at the resting (x, top-of-drop) position and moved purely via
      // transform (y) instead of animating top, for GPU compositing.
      style={{
        position: "fixed",
        left: startPos.x - size / 2,
        top: startPos.y - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        boxShadow:
          "inset 0 4px 8px rgba(255, 255, 255, 0.8), inset 0 -4px 8px rgba(0, 0, 0, 0.1), 0 8px 20px rgba(0, 0, 0, 0.3)",
      }}
      initial={{
        y: 0,
        opacity: 0,
        scale: 0.5,
      }}
      animate={{
        y: 150, // Drop down 150px
        opacity: [0, 1, 0], // Quick flash then fade
        scale: [0.5, 1, 0.8],
      }}
      transition={{
        duration: 0.5,
        ease: "easeIn",
      }}
      className="object-cover bg-white pointer-events-none z-650"
    />
  );
};

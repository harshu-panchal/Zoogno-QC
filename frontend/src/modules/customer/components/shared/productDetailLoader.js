let productDetailModulePromise;

export function loadProductDetailSheet() {
  if (!productDetailModulePromise) {
    productDetailModulePromise = import("./ProductDetailSheet");
  }
  return productDetailModulePromise;
}

export function preloadProductDetailSheet() {
  void loadProductDetailSheet();
}

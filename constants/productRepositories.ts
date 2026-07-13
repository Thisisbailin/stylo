export const PRODUCT_REPOSITORIES = {
  // Current external slug; update this coordinate after the GitHub rename.
  stylo: "https://github.com/Thisisbailin/qalam",
  manus: "https://github.com/Thisisbailin/Manus",
  lookbook: "https://github.com/Thisisbailin/LookBook",
  cinewor: "https://github.com/Thisisbailin/cinewor",
} as const;

export type ProductRepositoryKey = keyof typeof PRODUCT_REPOSITORIES;

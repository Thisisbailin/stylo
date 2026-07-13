export const PRODUCT_REPOSITORIES = {
  stylo: "https://github.com/Thisisbailin/stylo",
  manus: "https://github.com/Thisisbailin/Manus",
  lookbook: "https://github.com/Thisisbailin/LookBook",
  cinewor: "https://github.com/Thisisbailin/cinewor",
} as const;

export type ProductRepositoryKey = keyof typeof PRODUCT_REPOSITORIES;

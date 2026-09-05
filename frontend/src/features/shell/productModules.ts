export type ContentModule = "shortform" | "sponsored" | "audience";
export type ProductModule = ContentModule | "settings";

export function isContentModule(module: ProductModule): module is ContentModule {
  return module === "shortform" || module === "sponsored" || module === "audience";
}

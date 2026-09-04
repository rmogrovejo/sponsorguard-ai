import type { ProductModule } from "./productModules";

interface ProductNavProps {
  module: ProductModule;
  onChange: (module: ProductModule) => void;
}

export function ProductNav({ module, onChange }: ProductNavProps) {
  return (
    <nav className="product-rail" aria-label="CreatorPreflight">
      <p className="product-rail__label mono-label">PRE-FLIGHT</p>
      <div className="product-nav">
        <button
          type="button"
          aria-current={module === "shortform" ? "page" : undefined}
          onClick={() => onChange("shortform")}
        >
          <strong>Short-Form</strong>
          <span>TikTok · Shorts · Reels</span>
        </button>
        <button
          type="button"
          aria-current={module === "sponsored" ? "page" : undefined}
          onClick={() => onChange("sponsored")}
        >
          <strong>Sponsored Content</strong>
          <span>SponsorGuard compliance</span>
        </button>
        <div className="product-nav__placeholder">
          <strong>Reviews</strong>
          <span>History later</span>
        </div>
        <div className="product-nav__placeholder">
          <strong>Settings</strong>
          <span>Workspace later</span>
        </div>
      </div>
    </nav>
  );
}

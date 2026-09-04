import type { ProductModule } from "./productModules";
import { useTranslation } from "../../i18n/useTranslation";

interface ProductNavProps {
  module: ProductModule;
  onChange: (module: ProductModule) => void;
  productName?: string;
}

export function ProductNav({
  module,
  onChange,
  productName = "CreatorPreflight",
}: ProductNavProps) {
  const { t } = useTranslation();
  return (
    <nav className="product-rail" aria-label={productName}>
      <p className="product-rail__label mono-label">{t("nav.preflight")}</p>
      <div className="product-nav">
        <button
          type="button"
          aria-current={module === "shortform" ? "page" : undefined}
          onClick={() => onChange("shortform")}
        >
          <strong>{t("nav.shortform")}</strong>
          <span>{t("nav.shortformDetail")}</span>
        </button>
        <button
          type="button"
          aria-current={module === "sponsored" ? "page" : undefined}
          onClick={() => onChange("sponsored")}
        >
          <strong>{t("nav.sponsored")}</strong>
          <span>{t("nav.sponsoredDetail")}</span>
        </button>
        <div className="product-nav__placeholder">
          <strong>{t("nav.reviews")}</strong>
          <span>{t("nav.reviewsDetail")}</span>
        </div>
        <button
          type="button"
          aria-current={module === "settings" ? "page" : undefined}
          onClick={() => onChange("settings")}
        >
          <strong>{t("nav.settings")}</strong>
          <span>{t("nav.settingsDetail")}</span>
        </button>
      </div>
    </nav>
  );
}

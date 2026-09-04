import { isSafeLogoDataUrl, displayMarkText, type MarkMode } from "./settingsSchema";

interface BrandMarkProps {
  mode: MarkMode;
  text: string;
  logoDataUrl: string | null;
}

export function BrandMark({ mode, text, logoDataUrl }: BrandMarkProps) {
  if (mode === "image" && logoDataUrl && isSafeLogoDataUrl(logoDataUrl)) {
    return (
      <span className="wordmark__mark wordmark__mark--image" aria-hidden="true">
        <img src={logoDataUrl} alt="" />
      </span>
    );
  }
  return (
    <span className="wordmark__mark" aria-hidden="true">
      {displayMarkText(text)}
    </span>
  );
}

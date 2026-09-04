import {
  MAX_LOGO_EDGE_PX,
  MAX_LOGO_FILE_BYTES,
} from "./settingsKeys";
import { isSafeLogoDataUrl } from "./settingsSchema";

export type LogoReadFailure = "svg" | "type" | "empty" | "oversized" | "unreadable";

export type LogoReadResult =
  | { ok: true; dataUrl: string }
  | { ok: false; reason: LogoReadFailure; message: string };

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const MESSAGES: Record<LogoReadFailure, string> = {
  svg: "SVG logos are not supported.",
  type: "Use a PNG, JPG, or WebP image.",
  empty: "Choose a logo image to upload.",
  oversized: "Logo is too large to save locally.",
  unreadable: "That image could not be read.",
};

export function inspectLogoFile(file: File): LogoReadFailure | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".svg") || file.type === "image/svg+xml" || file.type === "image/svg") {
    return "svg";
  }
  if (!ALLOWED_TYPES.has(file.type)) return "type";
  if (file.size <= 0) return "empty";
  if (file.size > MAX_LOGO_FILE_BYTES) return "oversized";
  return null;
}

export async function readRasterLogo(file: File): Promise<LogoReadResult> {
  const inspect = inspectLogoFile(file);
  if (inspect) return { ok: false, reason: inspect, message: MESSAGES[inspect] };

  let dataUrl: string;
  try {
    dataUrl = await readAsDataUrl(file);
  } catch {
    return { ok: false, reason: "unreadable", message: MESSAGES.unreadable };
  }
  const comma = dataUrl.indexOf(",");
  const payload = comma >= 0 ? dataUrl.slice(comma + 1).replace(/\s/g, "") : "";
  const normalized = `data:${file.type};base64,${payload}`;
  if (!isSafeLogoDataUrl(normalized)) {
    return { ok: false, reason: "type", message: MESSAGES.type };
  }

  const size = await readImageSize(normalized);
  if (size) {
    if (size.width <= 0 || size.height <= 0) {
      return { ok: false, reason: "unreadable", message: MESSAGES.unreadable };
    }
    if (size.width > MAX_LOGO_EDGE_PX || size.height > MAX_LOGO_EDGE_PX) {
      return { ok: false, reason: "oversized", message: MESSAGES.oversized };
    }
  }

  return { ok: true, dataUrl: normalized };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("read"));
    };
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
}

function readImageSize(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(null), 250);
    image.onload = () => {
      window.clearTimeout(timer);
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    image.src = src;
  });
}

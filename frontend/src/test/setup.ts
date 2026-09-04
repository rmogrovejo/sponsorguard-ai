import { applyDocumentTitle, clearAppearanceDataset } from "../features/settings/applyWorkspaceAppearance";
import { DEFAULT_PRODUCT_NAME } from "../features/settings/settingsKeys";
import { stubMatchMedia } from "./matchMedia";
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

stubMatchMedia(false);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  clearAppearanceDataset();
  applyDocumentTitle(DEFAULT_PRODUCT_NAME);
  document.documentElement.lang = "en";
  stubMatchMedia(false);
  try {
    window.localStorage.clear();
  } catch {
    // Tests that stub localStorage away should not fail teardown.
  }
});


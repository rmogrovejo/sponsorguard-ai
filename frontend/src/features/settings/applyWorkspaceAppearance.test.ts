import { describe, expect, it } from "vitest";

import { applyDocumentAppearance } from "./applyWorkspaceAppearance";
import { sampleSettings } from "./settingsTestFixtures";

describe("applyWorkspaceAppearance", () => {
  it("maps enums onto document data attributes without inline CSS", () => {
    applyDocumentAppearance(sampleSettings());
    const root = document.documentElement;
    expect(root.dataset.accent).toBe("olive");
    expect(root.dataset.heading).toBe("classic");
    expect(root.dataset.interface).toBe("humanist");
    expect(root.dataset.density).toBe("compact");
    expect(root.dataset.motion).toBe("reduced");
    expect(root.dataset.theme).toBe("light");
    expect(root.dataset.colorMode).toBe("light");
    expect(root.lang).toBe("en");
    expect(root.getAttribute("style") ?? "").toBe("");
  });

  it("applies theme and accent as independent root attributes", () => {
    applyDocumentAppearance(
      sampleSettings({
        appearance: {
          ...sampleSettings().appearance,
          accent: "olive",
          colorMode: "dark",
        },
      }),
      true,
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.accent).toBe("olive");
    expect(document.documentElement.dataset.colorMode).toBe("dark");
    expect(document.documentElement.getAttribute("style") ?? "").toBe("");
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SettingsWorkspace } from "./SettingsWorkspace";
import { defaultSettings } from "./settingsSchema";

describe("SettingsWorkspace", () => {
  it("exposes labelled controls for brand, appearance, and defaults", () => {
    render(
      <SettingsWorkspace
        settings={defaultSettings()}
        logoNotice={null}
        onDismissLogoNotice={() => undefined}
        onLogoFailure={() => undefined}
        onBrandChange={() => true}
        onAppearanceChange={() => undefined}
        onPreferencesChange={() => undefined}
        onRestoreDefaults={() => undefined}
      />,
    );

    expect(screen.getByLabelText("Product name")).toHaveValue("CreatorPreflight");
    expect(screen.getByLabelText("Tagline")).toHaveValue(
      "Know what to fix before you publish.",
    );
    expect(screen.getByLabelText("Text mark")).toHaveValue("CP");
    expect(screen.getByLabelText("Upload logo")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Terracotta" })).toBeChecked();
    expect(screen.getByLabelText("Heading typography")).toHaveDisplayValue("Editorial");
    expect(screen.getByLabelText("Interface typography")).toHaveDisplayValue("Neutral");
    expect(screen.getByRole("radio", { name: "Comfortable" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "English" })).toBeChecked();
    expect(screen.getByLabelText("Short-Form preset")).toHaveDisplayValue("TikTok");
    expect(screen.getByRole("radio", { name: "Follow system" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Restore defaults" })).toBeInTheDocument();
  });

  it("asks before restoring defaults", async () => {
    const user = userEvent.setup();
    let restored = false;
    render(
      <SettingsWorkspace
        settings={defaultSettings()}
        logoNotice={null}
        onDismissLogoNotice={() => undefined}
        onLogoFailure={() => undefined}
        onBrandChange={() => true}
        onAppearanceChange={() => undefined}
        onPreferencesChange={() => undefined}
        onRestoreDefaults={() => {
          restored = true;
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Restore defaults" }));
    expect(screen.getByRole("alertdialog", { name: "Restore visual defaults?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(restored).toBe(false);
    await user.click(screen.getByRole("button", { name: "Restore defaults" }));
    await user.click(screen.getAllByRole("button", { name: "Restore defaults" })[0]);
    expect(restored).toBe(true);
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceErrorBoundary } from "./WorkspaceErrorBoundary";

function Boom(): never {
  throw new Error("secret stack should never reach the page");
}

describe("WorkspaceErrorBoundary", () => {
  it("catches a render failure and shows a safe fallback", async () => {
    const user = userEvent.setup();
    const onReload = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <WorkspaceErrorBoundary onReload={onReload}>
        <Boom />
      </WorkspaceErrorBoundary>,
    );

    expect(screen.getByText("CREATORPREFLIGHT")).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "Workspace encountered an unexpected interface error.",
      }),
    ).toBeVisible();
    expect(screen.queryByText(/secret stack/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reload workspace" }));
    expect(onReload).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});

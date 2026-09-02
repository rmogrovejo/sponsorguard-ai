import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { VALID_SRT } from "../../test/testData";
import { ReviewWorkspace } from "../review/ReviewWorkspace";

describe("transcript input", () => {
  it("reads an uploaded UTF-8 SRT into the transcript field", async () => {
    const user = userEvent.setup();
    render(<ReviewWorkspace />);
    const file = new File([VALID_SRT], "acme-unicodé.srt", {
      type: "application/x-subrip",
    });

    await user.upload(screen.getByLabelText("Upload SRT"), file);

    expect(await screen.findByText("acme-unicodé.srt")).toBeVisible();
    expect(screen.getByLabelText("SRT transcript")).toHaveValue(VALID_SRT);
  });

  it("rejects files without an SRT extension", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<ReviewWorkspace />);
    const file = new File([VALID_SRT], "transcript.txt", {
      type: "text/plain",
    });

    await user.upload(screen.getByLabelText("Upload SRT"), file);

    expect(
      await screen.findByText("Choose a file with the .srt extension."),
    ).toBeVisible();
    expect(screen.getByLabelText("SRT transcript")).toHaveValue("");
  });

  it("removes a loaded file and its transcript content", async () => {
    const user = userEvent.setup();
    render(<ReviewWorkspace />);
    const file = new File([VALID_SRT], "creator.srt", {
      type: "application/x-subrip",
    });
    await user.upload(screen.getByLabelText("Upload SRT"), file);

    await user.click(await screen.findByRole("button", { name: "Remove file" }));

    expect(screen.queryByText("creator.srt")).not.toBeInTheDocument();
    expect(screen.getByLabelText("SRT transcript")).toHaveValue("");
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { VALID_SRT } from "../../test/testData";
import { LocaleProvider } from "../../i18n/useTranslation";
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

  it("keeps a persistent SRT format example visible after typing", async () => {
    const user = userEvent.setup();
    render(<ReviewWorkspace />);
    expect(screen.getByText("REQUIRED FORMAT")).toBeVisible();
    expect(screen.getByText("Cue number → time range → text")).toBeVisible();
    expect(screen.getByText(/Hello, this is the first subtitle/)).toBeVisible();
    expect(screen.getByText(/00:00:01,000 --> 00:00:04,000/)).toBeVisible();
    expect(screen.queryByText("Each cue begins with an index.")).not.toBeVisible();

    await user.type(
      screen.getByLabelText("SRT transcript"),
      "1{enter}00:00:01,000 --> 00:00:02,000{enter}Typed cue",
    );

    expect(screen.getByText("REQUIRED FORMAT")).toBeVisible();
    expect(screen.getByText(/Hello, this is the first subtitle/)).toBeVisible();
    expect((screen.getByLabelText("SRT transcript") as HTMLTextAreaElement).value).toContain(
      "Typed cue",
    );
  });

  it("shows Spanish SRT format help", () => {
    render(
      <LocaleProvider locale="es">
        <ReviewWorkspace />
      </LocaleProvider>,
    );
    expect(screen.getByText("FORMATO REQUERIDO")).toBeVisible();
    expect(screen.getByText("Número de cue → intervalo de tiempo → texto")).toBeVisible();
    expect(screen.getByText(/Hola, este es el primer subtítulo/)).toBeVisible();
    expect(screen.getByText(/00:00:01,000 --> 00:00:04,000/)).toBeVisible();
    expect(screen.getByText("Ver guía del formato SRT")).toBeVisible();
  });

  it("opens the SRT format guide from a native disclosure control", async () => {
    const user = userEvent.setup();
    render(<ReviewWorkspace />);
    const toggle = screen.getByText("View SRT format guide");
    expect(toggle.tagName).toBe("SUMMARY");
    await user.click(toggle);
    expect(toggle.closest("details")).toHaveAttribute("open");
    expect(screen.getByText("Each cue begins with an index.")).toBeVisible();
    expect(screen.getByText("Time range: HH:MM:SS,mmm --> HH:MM:SS,mmm")).toBeVisible();
  });
});

import { createRef } from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "../../i18n/useTranslation";
import { VALID_SRT } from "../../test/testData";
import type { AnalyzeComplianceResponse, RequirementPayload } from "../../types/compliance";
import { FixRecommendation } from "../fixes/FixRecommendation";
import { ReviewWorkspace } from "../review/ReviewWorkspace";
import type { ReviewReportSnapshot } from "../review/useComplianceAnalysis";
import { ComplianceReport } from "./ComplianceReport";

const mention: RequirementPayload = {
  id: "req_mention",
  type: "required_mention",
  description: "Mention AcmeVPN",
  value: "AcmeVPN",
};

const token: RequirementPayload = {
  id: "req_token",
  type: "required_exact_token",
  description: "Use code CREATOR25",
  value: "CREATOR25",
};

const url: RequirementPayload = {
  id: "req_url",
  type: "required_url",
  description: "Share the campaign URL",
  value: "acmevpn.com/creator",
};

const response: AnalyzeComplianceResponse = {
  summary: {
    total: 3,
    evaluated: 3,
    not_evaluated: 0,
    passed: 1,
    warnings: 1,
    failed: 1,
    compliance_score: 50,
    verification_coverage: 100,
  },
  results: [
    {
      requirement_id: "req_mention",
      status: "pass",
      reason_code: "REQUIRED_MENTION_FOUND",
      reason: "Required mention found.",
      source_segment_index: 1,
      timestamp_seconds: 38,
      evidence: "Today's video is sponsored by AcmeVPN.",
    },
    {
      requirement_id: "req_token",
      status: "fail",
      reason_code: "REQUIRED_TOKEN_MISSING",
      reason: "Required token CREATOR25 was not found.",
      source_segment_index: null,
      timestamp_seconds: null,
      evidence: null,
    },
    {
      requirement_id: "req_url",
      status: "warning",
      reason_code: "MANUAL_REVIEW_REQUIRED",
      reason: "Manual review required for this URL check.",
      source_segment_index: null,
      timestamp_seconds: null,
      evidence: null,
    },
  ],
};

const report: ReviewReportSnapshot = {
  campaignName: "AcmeVPN September Campaign",
  requirementDescriptions: {
    req_mention: "Mention AcmeVPN",
    req_token: "Use code CREATOR25",
    req_url: "Share acmevpn.com/creator",
  },
  requirementTypes: {
    req_mention: "required_mention",
    req_token: "required_exact_token",
    req_url: "required_url",
  },
  requirementsById: {
    req_mention: mention,
    req_token: token,
    req_url: url,
  },
  transcriptContent: VALID_SRT,
  response,
};

describe("Sponsored report localization", () => {
  it("localizes report chrome and statuses while leaving campaign, coupon, URL, and evidence intact", () => {
    render(
      <LocaleProvider locale="es">
        <ComplianceReport report={report} headingRef={createRef()} />
      </LocaleProvider>,
    );

    expect(screen.getByRole("heading", { name: "AcmeVPN September Campaign" })).toBeVisible();
    expect(screen.getByText("PUNTUACIÓN DE CUMPLIMIENTO")).toBeVisible();
    expect(screen.getByText("COBERTURA DE VERIFICACIÓN")).toBeVisible();
    expect(screen.getByText("evaluadas")).toBeVisible();
    expect(screen.getByText("Comprobaciones totales")).toBeVisible();
    expect(screen.getByText("Correctas")).toBeVisible();
    expect(screen.getByText("Avisos")).toBeVisible();
    expect(screen.getByText("Fallidas")).toBeVisible();
    expect(screen.getByText("REGISTRO DE HALLAZGOS")).toBeVisible();
    expect(screen.getAllByText("REQUISITO").length).toBeGreaterThan(0);
    expect(screen.getByText("EVIDENCIA")).toBeVisible();
    expect(screen.getByText("CUE DE ORIGEN / 1")).toBeVisible();
    expect(screen.getByLabelText("Estado de cumplimiento: Correcto")).toHaveTextContent("Correcto");
    expect(screen.getByLabelText("Estado de cumplimiento: Fallo")).toHaveTextContent("Fallo");
    expect(screen.getByLabelText("Estado de cumplimiento: Revisar")).toHaveTextContent("Revisar");
    expect(screen.queryByText("Aviso")).not.toBeInTheDocument();
    expect(screen.queryByText("Warning")).not.toBeInTheDocument();
    expect(screen.queryByText("Pass")).not.toBeInTheDocument();
    expect(screen.getByText('Se encontró la mención requerida "AcmeVPN".')).toBeVisible();
    expect(screen.getByText('No se encontró el token requerido "CREATOR25".')).toBeVisible();
    expect(screen.getByText("Este hallazgo necesita revisión humana.")).toBeVisible();
    expect(screen.queryByText("Required mention found.")).not.toBeInTheDocument();
    expect(screen.queryByText("Required token CREATOR25 was not found.")).not.toBeInTheDocument();
    expect(screen.getAllByText(/CREATOR25/).length).toBeGreaterThan(0);
    expect(screen.getByText(/acmevpn\.com\/creator/)).toBeVisible();
    expect(screen.getByText("“Today's video is sponsored by AcmeVPN.”")).toBeVisible();
    expect(screen.getAllByRole("button", { name: /generar corrección/i }).length).toBeGreaterThan(0);
  });

  it("localizes Generate Fix chrome and keeps suggested creator text unchanged", () => {
    render(
      <LocaleProvider locale="es">
        <FixRecommendation
          finding={{
            requirement_id: "req_token",
            status: "fail",
            reason_code: "REQUIRED_TOKEN_MISSING",
            reason: "Required token CREATOR25 was not found.",
            source_segment_index: null,
            timestamp_seconds: null,
            evidence: null,
          }}
          state={{
            phase: "success",
            suggestion: {
              requirement_id: "req_token",
              action: "insert",
              suggested_text: "Use code CREATOR25 at checkout.",
              placement: {
                strategy: "after_segment",
                source_segment_index: 2,
                timestamp_seconds: 52,
                before_seconds: null,
              },
              reason: "Insert the missing required promo code.",
            },
            error: null,
          }}
          onGenerate={() => undefined}
          onDismiss={() => undefined}
        />
      </LocaleProvider>,
    );

    expect(screen.getByText("CAMBIO RECOMENDADO")).toBeVisible();
    expect(screen.getByText("Insertar")).toBeVisible();
    expect(screen.getByText("UBICACIÓN")).toBeVisible();
    expect(screen.getByRole("button", { name: "Regenerar" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Descartar sugerencia" })).toBeVisible();
    expect(screen.getByText(/Use code CREATOR25 at checkout\./)).toBeVisible();
    expect(screen.queryByText("Insert the missing required promo code.")).not.toBeInTheDocument();
    expect(screen.queryByText("RECOMMENDED CHANGE")).not.toBeInTheDocument();
  });

  it("keeps the persistent SRT guide localized after typing", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="es">
        <ReviewWorkspace />
      </LocaleProvider>,
    );
    expect(screen.getByText("FORMATO REQUERIDO")).toBeVisible();
    await user.type(screen.getByLabelText("Transcripción SRT"), "1{enter}Typed cue");
    expect(screen.getByText("FORMATO REQUERIDO")).toBeVisible();
    expect(screen.getByText(/00:00:01,000 --> 00:00:04,000/)).toBeVisible();
    expect((screen.getByLabelText("Transcripción SRT") as HTMLTextAreaElement).value).toContain(
      "Typed cue",
    );
  });
});

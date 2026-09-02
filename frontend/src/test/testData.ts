import type {
  AnalyzeComplianceRequest,
  AnalyzeComplianceResponse,
  ComplianceStatus,
} from "../types/compliance";

export const VALID_SRT = `1
00:00:38,000 --> 00:00:42,000
Today's video is sponsored by AcmeVPN.

2
00:00:52,000 --> 00:00:57,000
You can save twenty-five percent using my link.`;

export function responseForRequest(
  request: AnalyzeComplianceRequest,
  status: ComplianceStatus = "pass",
): AnalyzeComplianceResponse {
  const passed = status === "pass" ? 1 : 0;
  const warnings = status === "warning" ? 1 : 0;
  const failed = status === "fail" ? 1 : 0;

  return {
    summary: {
      total: 1,
      passed,
      warnings,
      failed,
      compliance_score: passed * 100 + warnings * 50,
    },
    results: [
      {
        requirement_id: request.requirements[0].id,
        status,
        reason_code:
          status === "pass"
            ? "REQUIRED_MENTION_FOUND"
            : "REQUIRED_MENTION_MISSING",
        reason:
          status === "pass"
            ? "Required mention found."
            : "Required mention was not found.",
        source_segment_index: status === "pass" ? 1 : null,
        timestamp_seconds: status === "pass" ? 38 : null,
        evidence:
          status === "pass"
            ? "Today's video is sponsored by AcmeVPN."
            : null,
      },
    ],
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

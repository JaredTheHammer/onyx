import {
  ISSUE_REPORT_MAX_SCREENSHOT_BYTES,
  buildIssueFeedbackOptions,
  buildIssueReportContext,
  buildIssueReportTags,
  buildManualIssueFeedbackPayload,
  isSensitiveIssueReportRoute,
  validateIssueScreenshot,
} from "./issueReporting";

describe("issueReporting", () => {
  it("tags reports with Onyx app context", () => {
    const context = buildIssueReportContext("/app?chatId=123");

    expect(context).toMatchObject({
      app: "Onyx Web",
      repo: "JaredTheHammer/onyx",
      route: "/app?chatId=123",
      screenshotAllowed: false,
    });
    expect(buildIssueReportTags(context)).toEqual({
      repo: "JaredTheHammer/onyx",
      app: "Onyx Web",
      route: "/app?chatId=123",
      environment: context.environment,
      release: context.release,
    });
  });

  it("builds Sentry Feedback options without auto injection", () => {
    const context = buildIssueReportContext("/");
    const options = buildIssueFeedbackOptions(context);

    expect(options.autoInject).toBe(false);
    expect(options.enableScreenshot).toBe(true);
    expect(options.showName).toBe(true);
    expect(options.showEmail).toBe(true);
    expect(options.messagePlaceholder).toContain("What happened?");
  });

  it("suppresses automatic screenshots on confidential routes", () => {
    expect(isSensitiveIssueReportRoute("/admin/connectors/google")).toBe(true);
    expect(isSensitiveIssueReportRoute("/app/settings/accounts-access")).toBe(
      true
    );
    expect(isSensitiveIssueReportRoute("/auth/login")).toBe(true);
    expect(isSensitiveIssueReportRoute("/")).toBe(false);
  });

  it("validates manual screenshot uploads", () => {
    expect(validateIssueScreenshot(null)).toEqual({ valid: true });
    expect(validateIssueScreenshot({ type: "image/webp", size: 32 })).toEqual({
      valid: true,
    });
    expect(validateIssueScreenshot({ type: "text/plain", size: 32 })).toEqual({
      valid: false,
      reason: "Upload a PNG, JPEG, or WebP screenshot.",
    });
    expect(
      validateIssueScreenshot({
        type: "image/png",
        size: ISSUE_REPORT_MAX_SCREENSHOT_BYTES + 1,
      })
    ).toEqual({
      valid: false,
      reason: "Screenshot must be 8 MB or smaller.",
    });
  });

  it("trims optional manual feedback fields", () => {
    const context = buildIssueReportContext("/app");

    expect(
      buildManualIssueFeedbackPayload(
        context,
        {
          message: "  Sources panel overlaps. ",
          name: "  Admin ",
          email: "",
          url: "",
        },
        "https://onyx.example/app"
      )
    ).toEqual({
      message: "Sources panel overlaps.",
      source: "onyx-web-report-issue",
      name: "Admin",
      url: "https://onyx.example/app",
      tags: buildIssueReportTags(context),
    });
  });
});

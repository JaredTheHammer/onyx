export const ISSUE_REPORT_MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;

export const ISSUE_REPORT_ALLOWED_SCREENSHOT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export interface IssueReportContext {
  app: string;
  repo: string;
  route: string;
  environment: string;
  release: string;
  screenshotAllowed: boolean;
}

export interface ManualIssueReportInput {
  message: string;
  name?: string;
  email?: string;
  url?: string;
}

export interface IssueScreenshotLike {
  type: string;
  size: number;
}

export function isSensitiveIssueReportRoute(route = "") {
  return /(^|[/?#&])(app|admin|auth|login|profile|account|settings|billing|payment|password|token|secret|credential|connector|connectors|document|documents|knowledge|chat|chats|file|files|api)([/?#&=]|$)/i.test(
    route
  );
}

export function buildIssueReportContext(route = "/"): IssueReportContext {
  const normalizedRoute = route || "/";
  return {
    app: "Onyx Web",
    repo: "JaredTheHammer/onyx",
    route: normalizedRoute,
    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ||
      process.env.NODE_ENV ||
      "production",
    release: process.env.SENTRY_RELEASE || "local",
    screenshotAllowed: !isSensitiveIssueReportRoute(normalizedRoute),
  };
}

export function buildIssueReportTags(context: IssueReportContext) {
  return {
    repo: context.repo,
    app: context.app,
    route: context.route,
    environment: context.environment,
    release: context.release,
  };
}

export function buildIssueFeedbackOptions(context: IssueReportContext) {
  return {
    autoInject: false,
    enableScreenshot: context.screenshotAllowed,
    showName: true,
    showEmail: true,
    isNameRequired: false,
    isEmailRequired: false,
    formTitle: "Report issue",
    nameLabel: "Name",
    emailLabel: "Email",
    messageLabel: "What went wrong?",
    messagePlaceholder:
      "What happened? What did you expect? What steps would reproduce it?",
    addScreenshotButtonLabel: "Add screenshot",
    tags: buildIssueReportTags(context),
  };
}

export function validateIssueScreenshot(file: IssueScreenshotLike | null) {
  if (!file) {
    return { valid: true as const };
  }

  if (
    !ISSUE_REPORT_ALLOWED_SCREENSHOT_TYPES.includes(
      file.type as (typeof ISSUE_REPORT_ALLOWED_SCREENSHOT_TYPES)[number]
    )
  ) {
    return {
      valid: false as const,
      reason: "Upload a PNG, JPEG, or WebP screenshot.",
    };
  }

  if (file.size > ISSUE_REPORT_MAX_SCREENSHOT_BYTES) {
    return {
      valid: false as const,
      reason: "Screenshot must be 8 MB or smaller.",
    };
  }

  return { valid: true as const };
}

export function getIssueReportingDisabledReason() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return "Issue reporting needs NEXT_PUBLIC_SENTRY_DSN before reports can be sent.";
  }
  return null;
}

export function buildManualIssueFeedbackPayload(
  context: IssueReportContext,
  input: ManualIssueReportInput,
  fallbackUrl = ""
) {
  const payload: {
    message: string;
    source: string;
    tags: ReturnType<typeof buildIssueReportTags>;
    name?: string;
    email?: string;
    url?: string;
  } = {
    message: input.message.trim(),
    source: "onyx-web-report-issue",
    tags: buildIssueReportTags(context),
  };

  const name = input.name?.trim();
  const email = input.email?.trim();
  const url = input.url?.trim() || fallbackUrl;
  if (name) payload.name = name;
  if (email) payload.email = email;
  if (url) payload.url = url;
  return payload;
}

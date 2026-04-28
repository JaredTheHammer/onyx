"use client";

import { useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button, SidebarTab } from "@opal/components";
import { SvgAlertCircle } from "@opal/icons";
import Modal from "@/refresh-components/Modal";
import InputTextArea from "@/refresh-components/inputs/InputTextArea";
import InputTypeIn from "@/refresh-components/inputs/InputTypeIn";
import Text from "@/refresh-components/texts/Text";
import * as InputLayouts from "@/layouts/input-layouts";
import {
  ISSUE_REPORT_ALLOWED_SCREENSHOT_TYPES,
  buildIssueFeedbackOptions,
  buildIssueReportContext,
  buildIssueReportTags,
  buildManualIssueFeedbackPayload,
  getIssueReportingDisabledReason,
  type IssueReportContext,
  validateIssueScreenshot,
} from "@/lib/issueReporting";

type SentryFeedbackIntegration = {
  createForm?: (
    options: ReturnType<typeof buildIssueFeedbackOptions>
  ) => Promise<{ appendToDom: () => void; open: () => void }>;
  openDialog?: () => void;
};

type SentryWithFeedback = typeof Sentry & {
  addIntegration?: (integration: unknown) => void;
  captureFeedback?: (
    feedback: ReturnType<typeof buildManualIssueFeedbackPayload>,
    hint?: {
      attachments?: Array<{
        filename: string;
        contentType: string;
        data: Uint8Array;
      }>;
    }
  ) => string | undefined;
  feedbackIntegration?: (
    options: ReturnType<typeof buildIssueFeedbackOptions>
  ) => SentryFeedbackIntegration;
};

let sentryFeedbackIntegration: SentryFeedbackIntegration | null = null;

function getCurrentRoute() {
  if (typeof window === "undefined") {
    return "/";
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

async function openSentryIssueReporter(context: IssueReportContext) {
  if (getIssueReportingDisabledReason()) {
    return false;
  }

  const sentry = Sentry as SentryWithFeedback;

  try {
    sentry.setTags(buildIssueReportTags(context));

    if (!sentryFeedbackIntegration && sentry.feedbackIntegration) {
      sentryFeedbackIntegration = sentry.feedbackIntegration(
        buildIssueFeedbackOptions(context)
      );
      sentry.addIntegration?.(sentryFeedbackIntegration);
    }

    if (sentryFeedbackIntegration?.createForm) {
      const form = await sentryFeedbackIntegration.createForm(
        buildIssueFeedbackOptions(context)
      );
      form.appendToDom();
      form.open();
      return true;
    }

    if (sentryFeedbackIntegration?.openDialog) {
      sentryFeedbackIntegration.openDialog();
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

async function captureManualIssueFeedback({
  context,
  message,
  name,
  email,
  screenshot,
}: {
  context: IssueReportContext;
  message: string;
  name: string;
  email: string;
  screenshot: File | null;
}) {
  const validation = validateIssueScreenshot(screenshot);
  if (!validation.valid) {
    return { ok: false, reason: validation.reason };
  }

  const disabledReason = getIssueReportingDisabledReason();
  if (disabledReason) {
    return { ok: false, reason: disabledReason };
  }

  const sentry = Sentry as SentryWithFeedback;
  if (!sentry.captureFeedback) {
    return { ok: false, reason: "Sentry Feedback is not available." };
  }

  sentry.setTags(buildIssueReportTags(context));

  const hint = screenshot
    ? {
        attachments: [
          {
            filename: screenshot.name.replace(/[\\/]/g, "_"),
            contentType: screenshot.type,
            data: new Uint8Array(await screenshot.arrayBuffer()),
          },
        ],
      }
    : undefined;

  const eventId = sentry.captureFeedback(
    buildManualIssueFeedbackPayload(
      context,
      {
        message,
        name,
        email,
        url:
          typeof window === "undefined" ? context.route : window.location.href,
      },
      typeof window === "undefined" ? "" : window.location.href
    ),
    hint
  );

  return { ok: true, eventId };
}

export default function ReportIssueButton({ folded }: { folded?: boolean }) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<IssueReportContext>(() =>
    buildIssueReportContext("/")
  );
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<
    "error" | "success" | "warning" | ""
  >("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setMessage("");
    setName("");
    setEmail("");
    setScreenshot(null);
    setStatus("");
    setStatusKind("");
  };

  const showManualForm = (nextContext: IssueReportContext) => {
    setContext(nextContext);
    resetForm();
    if (!nextContext.screenshotAllowed) {
      setStatus(
        "Automatic screenshots are disabled on confidential Onyx pages. Crop or redact private data before uploading a screenshot manually."
      );
      setStatusKind("warning");
    }
    setOpen(true);
  };

  const handleOpen = async () => {
    const nextContext = buildIssueReportContext(getCurrentRoute());
    if (await openSentryIssueReporter(nextContext)) {
      return;
    }
    showManualForm(nextContext);
  };

  const handleScreenshotChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] || null;
    const validation = validateIssueScreenshot(file);

    if (!validation.valid) {
      event.target.value = "";
      setScreenshot(null);
      setStatus(validation.reason);
      setStatusKind("error");
      return;
    }

    setScreenshot(file);
    setStatus(file ? `${file.name} attached` : "");
    setStatusKind("");
  };

  const handleSubmit = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setStatus("Describe what went wrong before sending.");
      setStatusKind("error");
      return;
    }

    setIsSubmitting(true);
    setStatus("Sending issue report...");
    setStatusKind("");

    try {
      const result = await captureManualIssueFeedback({
        context,
        message: trimmedMessage,
        name,
        email,
        screenshot,
      });

      if (!result.ok) {
        setStatus(result.reason || "Issue report could not be sent.");
        setStatusKind("error");
        return;
      }

      setStatus("Issue report sent.");
      setStatusKind("success");
      setMessage("");
      setScreenshot(null);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Issue report could not be sent."
      );
      setStatusKind("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <SidebarTab icon={SvgAlertCircle} folded={folded} onClick={handleOpen}>
        Report issue
      </SidebarTab>

      <Modal open={open} onOpenChange={setOpen}>
        <Modal.Content width="sm" height="lg">
          <Modal.Header
            icon={SvgAlertCircle}
            title="Report issue"
            description="Tell us what happened, what you expected, and the steps to reproduce it."
            onClose={() => setOpen(false)}
          />
          <Modal.Body>
            <InputLayouts.Vertical
              title="What went wrong?"
              description="Include what happened, what you expected, and how to reproduce it."
            >
              <InputTextArea
                aria-label="Issue description"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="What happened? What did you expect? What steps would reproduce it?"
                rows={5}
                variant={
                  statusKind === "error" && !message.trim()
                    ? "error"
                    : "primary"
                }
              />
            </InputLayouts.Vertical>

            <InputLayouts.Vertical title="Name" suffix="optional">
              <InputTypeIn
                aria-label="Your name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Name"
                showClearButton={false}
              />
            </InputLayouts.Vertical>

            <InputLayouts.Vertical title="Email" suffix="optional">
              <InputTypeIn
                aria-label="Your email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                showClearButton={false}
              />
            </InputLayouts.Vertical>

            <InputLayouts.Vertical
              title="Screenshot upload"
              suffix="optional"
              description="PNG, JPEG, or WebP. Keep it under 8 MB and redact private document content first."
            >
              <input
                aria-label="Issue screenshot upload"
                type="file"
                accept={ISSUE_REPORT_ALLOWED_SCREENSHOT_TYPES.join(",")}
                onChange={handleScreenshotChange}
                className="w-full rounded-08 border border-border-medium px-3 py-2 text-sm"
              />
            </InputLayouts.Vertical>

            {status && (
              <Text
                text03
                className={
                  statusKind === "error"
                    ? "text-status-error-05"
                    : statusKind === "success"
                      ? "text-status-success-05"
                      : statusKind === "warning"
                        ? "text-status-warning-05"
                        : "text-text-03"
                }
              >
                {status}
              </Text>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              prominence="secondary"
              onClick={() => setOpen(false)}
              type="button"
            >
              Cancel
            </Button>
            <Button disabled={isSubmitting} onClick={handleSubmit}>
              {isSubmitting ? "Sending..." : "Send report"}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal>
    </>
  );
}

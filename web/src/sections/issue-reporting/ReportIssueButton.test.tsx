import { render, screen, setupUser } from "@tests/setup/test-utils";
import ReportIssueButton from "./ReportIssueButton";

describe("ReportIssueButton", () => {
  const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
  });

  it("opens the manual fallback and validates the required fields", async () => {
    const user = setupUser({ applyAccept: false });
    render(<ReportIssueButton />);

    await user.click(screen.getByText("Report issue"));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Tell us what happened, what you expected, and the steps to reproduce it."
      )
    ).not.toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(
      screen.getByText("Describe what went wrong before sending.")
    ).toBeInTheDocument();

    const upload = screen.getByLabelText("Issue screenshot upload");
    await user.upload(
      upload,
      new File(["plain text"], "notes.txt", { type: "text/plain" })
    );
    expect(
      screen.getByText("Upload a PNG, JPEG, or WebP screenshot.")
    ).toBeInTheDocument();

    await user.upload(
      upload,
      new File(["png"], "issue.png", { type: "image/png" })
    );
    expect(screen.getByText("issue.png attached")).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Issue description"),
      "The sources panel overlaps."
    );
    await user.click(screen.getByRole("button", { name: "Send report" }));

    expect(
      screen.getByText(
        "Issue reporting needs NEXT_PUBLIC_SENTRY_DSN before reports can be sent."
      )
    ).toBeInTheDocument();
  });
});

import "server-only";

// The one place the app sends email from. Which service actually delivers
// it is a launch decision that hasn't been made yet, so this is pluggable:
//
//   - RESEND_API_KEY + EMAIL_FROM set  -> sent through Resend's HTTP API
//     (no SDK needed; https://resend.com has a free tier that covers this).
//   - nothing set                      -> the message is printed to the
//     server log instead, so the reset flow still works end to end in dev
//     and on UAT (copy the link out of the service log).
//
// Swapping to another provider (Postmark, SES, SendGrid...) means adding a
// branch here -- callers only ever see sendEmail().

export type Email = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(email: Email): Promise<void> {
  if (!isEmailConfigured()) {
    console.log(
      `[email:not-configured] Would send to ${email.to}\n` +
        `  Subject: ${email.subject}\n` +
        email.text
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n")
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });

  if (!res.ok) {
    // Logged, not thrown: callers like the reset request deliberately show
    // the same message whether or not an account exists, so a delivery
    // failure mustn't surface as a different response either.
    console.error(`[email] Resend rejected message to ${email.to}: ${res.status} ${await res.text()}`);
  }
}

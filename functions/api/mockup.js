const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

const clean = (value, maxLength) => String(value ?? "").trim().slice(0, maxLength);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escapeHtml = value => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export async function onRequestPost({ request, env }) {
  try {
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return json({ error: "Unsupported request format." }, 415);
    }

    if (!env.RESEND_API_KEY || !env.TURNSTILE_SECRET_KEY) {
      console.error("Missing RESEND_API_KEY or TURNSTILE_SECRET_KEY.");
      return json({ error: "The form is temporarily unavailable." }, 503);
    }

    const body = await request.json();

    // Bots commonly fill fields hidden from real visitors.
    if (clean(body.company_website, 200)) {
      return json({ success: true });
    }

    const submission = {
      name: clean(body.name, 100),
      email: clean(body.email, 254),
      business: clean(body.business, 150),
      businessType: clean(body.business_type, 100),
      website: clean(body.website, 500),
      goals: clean(body.goals, 3000),
      turnstileToken: clean(body.turnstileToken, 2048),
    };

    if (!submission.name || !submission.email || !submission.business ||
        !submission.businessType || !submission.goals || !submission.turnstileToken) {
      return json({ error: "Please complete every required field." }, 400);
    }

    if (!emailPattern.test(submission.email)) {
      return json({ error: "Enter a valid email address." }, 400);
    }

    if (submission.website) {
      try {
        const websiteUrl = new URL(submission.website);
        if (!["http:", "https:"].includes(websiteUrl.protocol)) throw new Error();
      } catch {
        return json({ error: "Enter a valid website URL." }, 400);
      }
    }

    const turnstileBody = new FormData();
    turnstileBody.append("secret", env.TURNSTILE_SECRET_KEY);
    turnstileBody.append("response", submission.turnstileToken);
    const visitorIp = request.headers.get("CF-Connecting-IP");
    if (visitorIp) turnstileBody.append("remoteip", visitorIp);

    const turnstileResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: turnstileBody },
    );
    const turnstile = await turnstileResponse.json();

    if (!turnstile.success) {
      return json({ error: "Spam verification expired or failed. Please try again." }, 400);
    }

    const contactEmail = env.CONTACT_EMAIL || "forms@coastlinestudio.ca";
    const replyEmail = env.REPLY_EMAIL || "hello@coastlinestudio.ca";
    const fromEmail = env.FROM_EMAIL || "Coastline Studio <forms@coastlinestudio.ca>";
    const requestId = crypto.randomUUID();
    const emailText = [
      `Name: ${submission.name}`,
      `Email: ${submission.email}`,
      `Business: ${submission.business}`,
      `Business type: ${submission.businessType}`,
      `Current website: ${submission.website || "None"}`,
      "",
      "Website goals:",
      submission.goals,
      "",
      `Submission ID: ${requestId}`,
    ].join("\n");

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `mockup/${requestId}`,
        "User-Agent": "coastline-studio-form/1.0",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [contactEmail],
        reply_to: submission.email,
        subject: `Mockup request — ${submission.business}`,
        text: emailText,
      }),
    });

    if (!emailResponse.ok) {
      console.error("Resend error:", emailResponse.status, await emailResponse.text());
      return json({ error: "Your request could not be delivered. Please try again." }, 502);
    }

    const firstName = submission.name.split(/\s+/)[0];
    const safeFirstName = escapeHtml(firstName);
    const safeBusiness = escapeHtml(submission.business);
    const confirmationResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `mockup-confirmation/${requestId}`,
        "User-Agent": "coastline-studio-form/1.0",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [submission.email],
        reply_to: replyEmail,
        subject: `We received your Coastline Studio request — ${submission.business}`,
        text: [
          `Hi ${firstName},`,
          "",
          `Thanks for telling us about ${submission.business}. Your mockup request has been received.`,
          "",
          "We’ll review your details and reply within 1–2 business days.",
          "",
          "Here’s what happens next:",
          "1. We review your business and website goals.",
          "2. We contact you if we need any additional details.",
          "3. We prepare a homepage direction for discussion.",
          "",
          "If you need to add anything, reply directly to this email.",
          "",
          "Coastline Studio",
          "647-471-1807",
          "hello@coastlinestudio.ca",
        ].join("\n"),
        html: `<!doctype html>
<html lang="en" style="margin:0;padding:0;">
  <body style="margin:0;padding:0;background:#f5f4f0;color:#20252d;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;background:#f5f4f0;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;background:#ffffff;border:1px solid #e1e0db;border-radius:20px;overflow:hidden;">
            <tr>
              <td align="left" style="padding:20px 30px;background:linear-gradient(135deg,#0b1626,#17304c);">
                <img src="https://coastlinestudio.ca/assets/coastline-studio-logo-header.png" width="280" alt="Coastline Studio" style="display:block;width:280px;max-width:100%;height:auto;padding:10px 14px;background:#f8f7f3;border:0;border-radius:8px;">
              </td>
            </tr>
            <tr>
              <td align="left" style="padding:34px 30px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;">
          <h1 style="margin:0 0 18px;color:#101a2b;font-family:Georgia,serif;font-size:30px;line-height:1.15;">Request received.</h1>
          <p>Hi ${safeFirstName},</p>
          <p>Thanks for telling us about <strong>${safeBusiness}</strong>. Your mockup request has been received.</p>
          <p>We’ll review your details and reply within <strong>1–2 business days</strong>.</p>
          <div style="margin:26px 0;padding:22px;box-sizing:border-box;border:1px solid #e3e6e9;border-radius:15px;background:#f8f9fa;">
            <strong style="color:#101a2b;">What happens next</strong>
            <ol style="margin:12px 0 0;padding-left:20px;">
              <li>We review your business and website goals.</li>
              <li>We contact you if we need more information.</li>
              <li>We prepare a homepage direction for discussion.</li>
            </ol>
          </div>
          <p>If you need to add anything, simply reply to this email.</p>
          <p style="margin-top:28px;">Coastline Studio<br><a href="tel:+16474711807" style="color:#126eb8;">647-471-1807</a><br><a href="mailto:hello@coastlinestudio.ca" style="color:#126eb8;">hello@coastlinestudio.ca</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
      }),
    });

    if (!confirmationResponse.ok) {
      // The lead is safely delivered; a confirmation failure should not make the form look failed.
      console.error(
        "Confirmation email failed:",
        confirmationResponse.status,
        await confirmationResponse.text(),
      );
    }

    return json({ success: true });
  } catch (error) {
    console.error("Mockup form error:", error);
    return json({ error: "An unexpected error occurred. Please try again." }, 500);
  }
}

export function onRequest() {
  return json({ error: "Method not allowed." }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/mockup") {
      if (request.method !== "POST") return onRequest();
      return onRequestPost({ request, env });
    }

    return env.ASSETS.fetch(request);
  },
};

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

    const contactEmail = env.CONTACT_EMAIL || "hello@coastlinestudio.ca";
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

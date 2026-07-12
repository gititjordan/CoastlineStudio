# Coastline Studio

Coastline Studio is a static one-page website for a local web design studio.

## What’s included

- `index.html` — complete homepage with inline styles and JavaScript
- `assets/` — logo, hero mockup, and work-section images used by the homepage
- `.gitignore` — common ignore rules for static web projects
- `LICENSE` — MIT license
- `functions/api/mockup.js` — Cloudflare Worker endpoint for secure form delivery
- `wrangler.jsonc` — Cloudflare Worker and static-assets configuration

## Use

1. Open `index.html` locally to preview the site.
2. Push to GitHub and connect the repository to Cloudflare Workers Builds.
3. Customize copy, visuals, and brand colors directly in `index.html`.

## Mockup form configuration

The form requires Cloudflare Workers, Turnstile, and Resend. Before deployment:

1. Replace `YOUR_TURNSTILE_SITE_KEY` in `index.html` with the public Turnstile site key.
2. Add encrypted `RESEND_API_KEY` and `TURNSTILE_SECRET_KEY` secrets in the Cloudflare Worker.
3. Verify `coastlinestudio.ca` in Resend so `forms@coastlinestudio.ca` can send mail.
4. Confirm the `CONTACT_EMAIL` and `FROM_EMAIL` variables in `wrangler.jsonc`.

For local development, copy `.dev.vars.example` to `.dev.vars` and add test credentials. Never commit `.dev.vars`.

## Branding direction

Coastline Studio is positioned for local service businesses that need a clear, professional website built around calls, bookings, quote requests, and local search.

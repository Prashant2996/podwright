# Podwright Pro — Payment Setup Guide

This is the complete, step-by-step guide to start collecting money for Podwright Pro.
Total setup time: ~30-45 minutes. Cost: $0 upfront (Stripe takes ~3% per sale).

## How the money flow works

```
Customer clicks "Get Pro" on your landing page
   -> Stripe Checkout (Stripe handles the card + tax + receipt)
   -> Customer pays
   -> Stripe sends a webhook to your fulfillment server
   -> Fulfillment server generates a license key + emails it
   -> Customer pastes the key into Podwright -> Pro unlocked
```

You never touch card data. Stripe deposits money to your bank account.

---

## Step 1 — Create a Stripe account

1. Go to https://stripe.com and sign up (free).
2. Complete business/identity verification (required to receive payouts).
3. Add your bank account for payouts.

## Step 2 — Create the Pro product & price

1. In the Stripe Dashboard: **Products -> Add product**
2. Name: `Podwright Pro`
3. Price: `$9.00 USD`, recurring, **monthly**
4. Save. Copy the **Price ID** (looks like `price_1AbC...`).

## Step 3 — Create a Payment Link (easiest, no code)

1. Stripe Dashboard: **Payment Links -> New**
2. Select the `Podwright Pro` price you just created.
3. Under "After payment", set a confirmation message like:
   *"Thanks! Your license key is on its way to your email."*
4. Create the link. Copy the URL (looks like `https://buy.stripe.com/...`).
5. In `website/index.html`, replace `STRIPE_PAYMENT_LINK` with this URL.

That alone lets you take payments. The fulfillment server below automates the
license key delivery.

## Step 4 — Deploy the fulfillment server

The fulfillment server (`fulfillment/server.js`) turns each payment into a
license key email.

**Deploy options (all have free tiers):** Railway, Render, Fly.io.

Example with Railway:
1. Push this repo to GitHub (already done).
2. In Railway: **New Project -> Deploy from GitHub -> select podwright**
3. Set the root directory to `fulfillment`.
4. Add environment variables (Step 5).
5. Deploy. Note the public URL (e.g. `https://podwright-fulfillment.up.railway.app`).

## Step 5 — Environment variables for the fulfillment server

```
STRIPE_SECRET_KEY=sk_live_...        # Stripe Dashboard -> Developers -> API keys
STRIPE_WEBHOOK_SECRET=whsec_...      # from Step 6
SMTP_HOST=smtp.your-provider.com     # e.g. smtp.resend.com, smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
FROM_EMAIL=Podwright <noreply@podwright.dev>
```

For email, the easiest free options are Resend (resend.com), SendGrid, or
Mailgun. If you skip SMTP, the server just logs keys to the console (fine for
testing).

## Step 6 — Connect the Stripe webhook

1. Stripe Dashboard: **Developers -> Webhooks -> Add endpoint**
2. Endpoint URL: `https://YOUR-FULFILLMENT-URL/webhook/stripe`
3. Events to listen to: **`checkout.session.completed`**
4. Create. Copy the **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.

## Step 7 — Test it (Stripe test mode)

1. Use Stripe **test mode** keys first.
2. Use test card `4242 4242 4242 4242`, any future expiry, any CVC.
3. Complete a checkout via your Payment Link.
4. Check the fulfillment server logs — you should see a license key issued.
5. Paste that key into Podwright -> Pro should unlock.

## Step 8 — Go live

1. Switch Stripe to **live mode**, swap in live API keys.
2. Update the Payment Link in `website/index.html` to the live one.
3. Update the webhook to use live signing secret.
4. Deploy the website (see `website/README.md`).
5. Buy a domain and point it at the site.

---

## Pricing notes

- Start at **$9/month per developer**. You can raise later.
- Consider an **annual option** (`$90/year`, 2 months free) — improves cash flow
  and reduces churn. Add a second Payment Link for it.
- Enterprise (SSO, audit, support) is sold via direct contact — no self-serve
  checkout needed initially.

## Important: this is an honor-system license

Because Podwright is open source (AGPL), the license check can be bypassed by
someone editing the code. That's normal for open-core. The license stops casual
and honest-business misuse, which is the vast majority. Don't over-invest in
DRM — invest in making Pro worth paying for.

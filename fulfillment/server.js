/**
 * Podwright Pro - License Fulfillment Server
 *
 * A tiny standalone service that:
 *   1. Receives Stripe webhook events when a customer completes checkout.
 *   2. Generates a Podwright Pro license key.
 *   3. Emails the key to the customer.
 *
 * This is SEPARATE from the Podwright dashboard server. You deploy it once
 * (e.g. Railway, Render, Fly.io, a small VPS) and point your Stripe webhook at it.
 *
 * It has zero dependencies beyond `stripe` and `nodemailer` so it's cheap to run.
 *
 * ---------------------------------------------------------------------------
 * SETUP (see ../STRIPE-SETUP.md for the full walkthrough)
 * ---------------------------------------------------------------------------
 * Environment variables required:
 *   STRIPE_SECRET_KEY        - sk_live_... or sk_test_...
 *   STRIPE_WEBHOOK_SECRET    - whsec_... (from the Stripe webhook you create)
 *   SMTP_HOST, SMTP_PORT,
 *   SMTP_USER, SMTP_PASS     - for sending the license email
 *   FROM_EMAIL               - e.g. "Podwright <noreply@podwright.dev>"
 *   PORT                     - default 8787
 *
 * Run:  npm install && node server.js
 */

const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8787;

// --- License key generation (must match server/pro.js validation) ---
const LICENSE_PREFIX = 'PODW-PRO-';

function simpleChecksum(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 5; i++) {
    out += alphabet[hash % alphabet.length];
    hash = Math.floor(hash / alphabet.length) + str.charCodeAt(i % str.length);
  }
  return out;
}

function generateLicenseKey() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rnd = (n) => Array.from({ length: n }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  const g1 = rnd(5), g2 = rnd(5), g3 = rnd(5);
  const checksum = simpleChecksum(g1 + g2 + g3);
  return `${LICENSE_PREFIX}${g1}-${g2}-${g3}-${checksum}`;
}

// --- Simple JSON file store for issued licenses (audit trail) ---
const fs = require('fs');
const path = require('path');
const STORE = path.join(__dirname, 'licenses.json');

function recordLicense(record) {
  let data = [];
  try { data = JSON.parse(fs.readFileSync(STORE, 'utf-8')); } catch (e) {}
  data.push(record);
  fs.writeFileSync(STORE, JSON.stringify(data, null, 2));
}

// --- Email (lazy-loaded so the service runs even without nodemailer for testing) ---
async function sendLicenseEmail(toEmail, licenseKey) {
  if (!process.env.SMTP_HOST) {
    console.log(`[fulfillment] (no SMTP configured) License for ${toEmail}: ${licenseKey}`);
    return;
  }
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: parseInt(process.env.SMTP_PORT || '587') === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.FROM_EMAIL || 'Podwright <noreply@podwright.dev>',
    to: toEmail,
    subject: 'Your Podwright Pro license key',
    text: `Thanks for upgrading to Podwright Pro!

Your license key:

  ${licenseKey}

To activate:
  1. Open Podwright
  2. Go to "Podwright Pro" in the sidebar
  3. Paste your key and click Activate

Questions? Just reply to this email.

- The Podwright team`,
    html: `<div style="font-family:sans-serif;max-width:480px">
      <h2>Thanks for upgrading to Podwright Pro!</h2>
      <p>Your license key:</p>
      <pre style="background:#f4f4f5;padding:12px;border-radius:8px;font-size:15px">${licenseKey}</pre>
      <p><strong>To activate:</strong></p>
      <ol>
        <li>Open Podwright</li>
        <li>Go to <b>Podwright Pro</b> in the sidebar</li>
        <li>Paste your key and click <b>Activate</b></li>
      </ol>
      <p style="color:#71717a;font-size:13px">Questions? Just reply to this email.</p>
    </div>`,
  });
}

// --- Stripe webhook (raw body required for signature verification) ---
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[fulfillment] Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Fulfill on successful checkout
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email || session.customer_email;
    if (email) {
      const licenseKey = generateLicenseKey();
      recordLicense({
        email,
        licenseKey,
        stripeSessionId: session.id,
        stripeCustomer: session.customer,
        amount: session.amount_total,
        currency: session.currency,
        issuedAt: new Date().toISOString(),
      });
      try {
        await sendLicenseEmail(email, licenseKey);
        console.log(`[fulfillment] Issued license to ${email}`);
      } catch (e) {
        console.error(`[fulfillment] Failed to email license to ${email}:`, e.message);
      }
    }
  }

  res.json({ received: true });
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Podwright fulfillment server listening on :${PORT}`);
  console.log(`Stripe webhook endpoint: POST /webhook/stripe`);
});

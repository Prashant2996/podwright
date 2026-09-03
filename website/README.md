# Podwright Landing Page

A single static HTML page. No build step. Deploy anywhere that serves static files.

## Deploy options (all free)

### Vercel
```bash
cd website
npx vercel --prod
```

### Netlify
```bash
cd website
npx netlify deploy --prod --dir=.
```

### GitHub Pages
Push the `website/` folder contents to a `gh-pages` branch, or point Pages at
this directory.

### Cloudflare Pages
Connect the repo, set the build output directory to `website`.

## Before going live

1. Buy a domain (e.g. podwright.dev on Namecheap / Cloudflare, ~$12/yr).
2. Point the domain at your chosen host.
3. Replace `STRIPE_PAYMENT_LINK` in `index.html` with your real Stripe Payment
   Link (see ../STRIPE-SETUP.md).
4. Update the contact email if needed.

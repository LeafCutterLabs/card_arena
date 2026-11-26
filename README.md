# Sandbox Card Table

A mobile-first, rules-agnostic, real-time multiplayer card game sandbox for rapid prototyping and playtesting. Built with React, TypeScript, Tailwind CSS, Framer Motion, and PartyKit.

## Local Development

```bash
npm install
npm run dev
```

This starts both:
- **Vite frontend:** `http://localhost:5173`
- **PartyKit WebSocket server:** `http://localhost:1999`

Open two browser tabs (or connect from a phone on the same LAN) to test real-time multiplayer synchronization.

## Adding Custom Decks

1. Create a folder under `public/decks/<your-deck-id>/` with a `deck.json` and optional `assets/` folder (`.webp` or `.png` at `750 × 1050 px`, `5:7` aspect ratio).
2. Register the deck in `public/decks/manifest.json`.
3. Any missing artwork files automatically fall back to clean CSS/SVG card rendering using the deck's typography fields (`cornerValue`, `title`, `rulesText`, `textColor`).

See `docs/ASSET_CONVENTION.md` for full deck and artwork conventions.

## Cloud Deployment (PartyKit + GitHub Pages / Netlify)

1. **Deploy the PartyKit server:**
   ```bash
   npm run deploy:party
   ```
   Note the deployed host (e.g., `sandbox-card-table.<your-username>.partykit.dev`).

2. **GitHub Pages (auto-deployed via `.github/workflows/deploy-pages.yml`):**
   - Push to `main` to trigger automatic builds and deployments to GitHub Pages.
   - In GitHub repo **Settings → Secrets and variables → Actions → Variables**, add `VITE_PARTYKIT_HOST` set to your deployed PartyKit host so live multiplayer connects from GitHub Pages.

3. **Alternative — Netlify:**
   - Connect this repository to Netlify (`netlify.toml` is preconfigured) and set `VITE_PARTYKIT_HOST`.

# NextMove

Chess training with Stockfish — play bots and friends, review games in plain English, and drill your own mistakes.

## Layout
- `app/` – the app (HTML/CSS/JS, Stockfish, data). Shared with the Claude artifact version.
- `web/` – website-only files: accounts/online shim (`web.js`), icons, manifest, licences page, headers.
- `public/` – built site (`npm run build`), served as Worker static assets.
- `src/index.js` – Cloudflare Worker: accounts, cloud save, and a Durable Object per online game.
- `schema.sql` – D1 schema (database `nextmove-db`).

## Commands
- `npm run dev` – build and run locally (`npx wrangler d1 execute nextmove-db --local --file schema.sql` first time).
- `npm run deploy` – build and deploy.

Deploys automatically from `main` via Cloudflare Workers Builds.

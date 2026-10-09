# CMS (Next.js 15 / React 19, port 3001)

- UI: `src/components/*.tsx` (`cms.tsx` nav/views). Proxy: `src/app/api/cms/[...path]/route.ts`. Backend logic lives in `../bannedCards-server/src` (copy in `server-module/src`; keep in sync).
- Validate: `pnpm typecheck && pnpm test`. Keep output short.
- Business rules (stock, pricing, stores, permissions, import syntax) are in `PROJECT_CONTEXT.md`: grep the heading you need instead of reading it all.
- Rules to remember: SKU is optional `attributes.cms_sku` per printing; new stock listings need unique product handles; staff permissions checked every request; don't write test stock or edit live prices.

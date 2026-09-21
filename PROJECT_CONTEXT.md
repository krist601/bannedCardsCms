# Project context

## Locations and runtime
- CMS: this directory, Next.js 15 / React 19, port 3001, `pnpm dev`.
- Backend: ../bannedCards-server, Medusa 2.21, port 9000. Requested bannerCards-server path was a typo.
- Storefront: ../bannedCards/apps/storefront, port 3000.
- Shared launcher: ../start-banned-cards.sh starts all three, logs under ../.banned-cards-logs.
- Backend runs a production build: source changes require `pnpm build` then restart the identified backend process. Do not assume a source edit is live. Sibling writes/restarts need sandbox escalation.

## Important code
- src/components/cms.tsx: main navigation and views.
- condition-stock.tsx: per-printing stock panel, English / Spanish / Other, finish and warehouse, +/- per condition.
- inline-field.tsx: SKU/price inline save on blur or Enter.
- src/app/api/cms/[...path]/route.ts: same-origin proxy, HttpOnly session.
- server-module/src: copies of installed CMS server files. Keep changed files synchronized with ../bannedCards-server/src; do not overwrite unrelated backend work.
- api/admin/cms/route.ts: CMS reads and mutations; cms-set-groups.ts groups before pagination, newest main release first.
- Card SKU is optional attributes.cms_sku, shared across conditions/languages for that printing. Medusa/listing SKUs are generated internal IDs.
- Each new stock listing creates a Medusa product with an explicit unique handle. Never let name-derived handles collide between NM/LP/languages/finishes.
- New unpriced stock is DRAFT with price_pending=true; storefront projection hides its sellability. Inline positive CLP price publishes it.
- Stock subtraction checks warehouse availability/reservations; adjustments use inventory-item locks and refresh legacy listing quantity snapshot.
- No hardcoded login credentials. CMS requires a Medusa user with metadata.isAdmin === true, checked every request.

## UX decisions
- No importers in sidebar.
- Card catalog Import cards opens pasted stock-line import: quantity, name, set code, collector number, optional foil, language. Example: `2x The One Ring (LTR) 246 *F* S`.
- Sets Import set opens Scryfall set/printing import, a separate operation from receiving stock.
- Card stock uses NM / LP / MP / HP / DMG; + is immediate, no creation dialog. English defaults; Spanish and Other are separate.
- Sets are grouped by main set with expandable Commander/Tokens/etc and descending main release date.

## Validation and work style
- `pnpm typecheck`; `pnpm test` (node:test, backend handlers mocked via TS transpilation).
- Backend: `pnpm typecheck`; existing backend tests cover catalog/Scryfall/directory.
- Limit passing output to summaries, log long builds to /private/tmp.
- Browser checks should not add fictional stock or edit live SKU/price merely to test.
- Inspect actual listeners before restarting; do not reuse old PIDs from conversation.
- Avoid unnecessary browsing for local development. User explicitly requested less token usage.

## Stock text import (implemented)
- src/components/card-import.tsx: preview then receive, shared condition/warehouse; no SKU field. Import screens have no sidebar entries.
- server-module/src/lib/cms-stock-import.ts: bounded parser (100 lines, 10,000 units/line), exact set/collector/name resolution in CMS route.
- POST stock_import_preview is read-only; stock_import revalidates all rows before mutation, adds quantities through quick_add, stops on first failure/warning and returns partial results. No automatic retry; inspect inventory after uncertain responses before resubmitting.
- Syntax: `2x The One Ring (LTR) 246 *F* S`; NF or omitted=nonfoil, E or omitted=English, S=Spanish, O=Other, other:Japanese supports named languages. No silent set-code correction.
- Latest validation: 34 tests passing, CMS/backend typechecks and backend build passed; browser preview matched LTR 246 Spanish foil and English nonfoil without writing test stock.

## Set filters and collector ordering
- Card catalog and Inventory use a named set dropdown (GET set_options includes visible individual sets/divisions, newest release first). Empty value means all sets; changes reset pagination and any printing-specific inventory filter.
- GET cards/stock applies set_id with existing search; sets sort newest release first, then natural collector order (2 before 10, suffixes supported), before pagination. Inventory includes collector_number.
- cms-catalog-sort.ts reads matching records in 500-row batches for sorting, then inventory enrichment runs only for the displayed page. For much larger catalogs, move natural ordering into the database rather than loading all matches.

## Set visibility and release grouping
- metadata.isVisible defaults true when unset. CMS POST set_visibility persists a strict boolean while preserving other metadata. Main set checkbox gates the entire family; division preferences are preserved but cannot override a hidden parent.
- CMS set_options and storefront /store/tcg/sets share cms-visible-sets.ts and omit hidden families/divisions. All sets card/inventory views still include their stock; visibility controls filter choices, not publication.
- Dropdown defaults to All sets. CMS card/inventory tables have set heading rows; sorting uses set release descending, stable set name/id ties, then numeric collector ascending. Undated sets sort last.
- Storefront already reads /store/tcg/sets without caching; reload its directory to see visibility changes. Import/sync merges metadata so flags survive reimports.

- CMS and storefront refresh filter directories on window focus to reflect changes made in another tab. Family visibility regression covered; 43 CMS tests passing.

## Image storage
- Local S3-compatible MinIO: public files http://localhost:9002/banned-cards, console port9003. Credentials stay in backend .env; never print them.
- Set import script now requires FILE_STORAGE_DRIVER=s3 and awaits sync-card-images for that set before reporting success. Failed image transfers fail the import; rerunning reuses stored images.
- sync-card-images supports set=CODE for scoped imports, or no set for whole-catalog migration. Stores normal/small URLs in printing.image_url/image_small_url and storage metadata, updates linked product thumbnails. Original Scryfall URLs remain source metadata for recovery only.
- Set icons already stored by sync-set-directory. audit-image-storage script reports owned/external active URLs and tests a stored image HEAD without exposing credentials.
- Completed image migration: 368 newly synced, 856 already stored, 0 failures. Final audit: all 2,448 card image URLs (1,224 printings), 1,051 set icons, and 55 product thumbnails use configured MinIO; no missing/external active URLs. Stored image HEAD returned 200. Backend built/restarted; 44 CMS tests and 7 backend image/import tests passed.

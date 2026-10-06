# Project context

- AWS deployment: main/manual GitHub Actions deploys via SSH to Lightsail, Docker Compose at /opt/banned-cards. CMS cms.bannedcards.cl, backend api.bannedcards.cl. Deploy backend changes through its separate repository before CMS dependents.

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
- No hardcoded login credentials. CMS administrators use metadata.isAdmin === true. Staff use metadata.cmsAccess {enabled, sections, warehouseIds}; fresh permissions are checked every request, with native /admin endpoints blocked for staff.

## UX decisions

- Database backups: admin-only sidebar section. Backend job checks every minute for a daily America/Santiago backup, catches up after downtime, encrypts custom-format PostgreSQL dumps into a separate private S3 bucket, and removes files at least 14 days old. Redis owns queue/locks/status and maintenance outside the restored DB. Restore requires typed confirmation, matching schema, archive validation, a safety backup and single-transaction pg_restore. Supports one shared-mode backend; see docs/database-backups.md for configuration/recovery. BACKUP_ENCRYPTION_KEY must be preserved separately. Local setup script uses the existing PostgreSQL container; production Dockerfile installs PostgreSQL 15 clients.

- Staff sealed-product creation requires cmsAccess.canCreateSealed === true plus sealed section access; covers sealed_create and sealed_accept. Administrators retain access. Users & access edits the flag; default is denied for staff. Existing product editing and stock adjustments remain section-controlled.

- Pricing rounding is configurable via card_pricing.rounding (default 50); positive integer increments supported. Automatic conversion applies minimum first, then rounds upward to a multiple. Preview cache includes rate/minimum/rounding; new imports persist the selected increment. Existing custom prices remain exempt from automatic rounding.

- Pricing settings (admin-only): Medusa store metadata.card_pricing stores rate/minimum, defaults 750/300 confirmed by user. New automatic stock, set import refresh and price previews use these settings, rounded up to CLP50. Saving does not bulk-reprice existing listings; reimport sets for that. Existing custom prices remain intact; new custom prices must meet the minimum. cms-pricing-settings.ts handles validation/persistence.

- Automatic singles pricing: cms-base-prices.ts refreshes printing attributes.base_prices_clp per finish from Scryfall during import-scryfall-set (USD ×750, ceil to CLP50). Listings tagged price_source=scryfall follow refreshed bases; manual edits tag custom, and legacy positive prices are preserved as custom. New listings use the saved base (fallback: stored scryfall_data prices). Missing prices stay pending/draft. Stock panels label base versus custom pricing. Refresh updates both listing.price_clp and Medusa variant pricing.

- Sidebar groups: Stock (Overview, Card catalog, Inventory, Sealed products, Orders), Administration (Users & access, Stores & warehouses, Storefront sections, Sets); SVG icons in navigation-icon.tsx. Inventory sends selected `location_id`, filters positive available/reserved warehouse levels before pagination, and refreshes on warehouse changes.

- Stores & warehouses: admin-only section; each store is a Medusa sales channel with `metadata.cms_store {domain,api_key_id}` and an individual publishable key. Warehouse links determine available stock; new warehouses are unassigned. Shared CLP prices remain unchanged. `configure-cms-stores.ts` bootstraps Banned Cards (preserving default-channel warehouses) and Distrito TCG (none assigned).
- Storefront deployments must use their store-specific publishable key and permitted CORS origin. A saved domain does not configure DNS or deploy a frontend. Custom card stock reads live inventory for linked warehouses; cart middleware rejects cross-store carts. Stock receipts cannot relink excluded managed stores. Storefront saved carts are namespaced by public key.
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

## Sealed product management
- src/components/sealed-products.tsx is the Sealed products sidebar screen. Uses existing Medusa category tree rooted at sealed-products: Bundles, Precons, Booster boxes, Booster packs, Extras (no separate CMS catalogue).
- server-module/src/lib/cms-sealed.ts handles GET resource=sealed and sealed_create/sealed_save/sealed_price/sealed_stock through the authenticated CMS route.
- Lists/searches products by group; creates managed single-language variants with CLP price and zero stock; edits details/category/image/draft-published status; updates variant base CLP price; adjusts warehouse stock under inventory locks while respecting reservations. Multi-item inventory variants are read-only for stock.
- Product metadata, unrelated categories and other currency prices are preserved. Image edits update thumbnail plus storefront image_url/product_cutout overrides. Existing product languages/SKUs are displayed; creating a new product accepts language and optional SKU.
- Validation: 52 tests passing, CMS/backend typechecks and backend build passed. Read-only live audit found 36 sealed products: Bundles7, Precons2, Booster boxes10, Booster packs9, Extras8, with working CLP prices/inventory. Browser verified CMS login loads; authenticated screen inspection requires sign-in. No test stock or products added.

## Sealed bulk finder and inline rows
- SealedFinder previews official WPN set products and graphics for MTG set codes (optional explicit WPN page URL when derived slug differs). Nuxt data is parsed as JSON, never evaluated; code must match the official page.
- cms-sealed-finder.ts: sealed_find is read-only; one-hour signed preview snapshots gate sealed_accept. Only selected entries are saved. Products use draft status, zero stock and no invented CLP price. Positive CLP price is required before publication. Legacy uppercase set codes and shared pack/display SKUs are handled by name/source-ID duplicate matching.
- Assets use Medusa S3 file module with separate sealed/magic-the-gathering/{code}/products and /graphics prefixes. ZIP/PDF downloads remain intact; 64MB per asset. Metadata.sealed_assets is a reusable source-to-storage manifest; original sources retained. No mutation during discovery.
- Status dropdowns patch product state; +/- returns refreshed inventory levels and patches only that row with local action loading. Edit opens via product name; Actions contain only +/-; purple search button.
- 60 tests passed; CMS/backend typechecks and backend build passed. Live SOS preview: 10 products (7 already present), 66 graphics/download entries; browser preview verified. No discovery items were accepted during verification.

## Sealed set banners
- Downloading graphics does not automatically choose a banner. Finder → enter set code → Manage saved set banner → Use as set banner selects a stored raster image (ZIP/PDF excluded).
- sealed_graphics/sealed_banner actions list saved graphics and assign metadata.sealed_banner_url/asset_id on the set; updates same-set sealed product banner_image under locks, preserving metadata. Future finder imports inherit the chosen banner. Storefront already consumes banner_image.
- Assigned existing TMT Header from S3 to TMT. CMS/backend typechecks, backend build and 7 finder tests pass (61 total tests including prior suite).
- Sealed create/edit now use native modal dialogs (focus trapping, Escape/Cancel, inline error). Toolbar Refresh removed; New product sits at right; Search font matches buttons.
- Finder parses official WPN USD MSRP, fetches recent USD/CLP from mindicador.cl/api/dolar, shows dated CLP estimates in signed preview and saves them to draft variants on acceptance. Missing MSRP/rate stays unpriced; existing products/prices never overwritten. price_estimate metadata keeps provenance. 62 tests pass, both typechecks and backend build pass.
- Sealed finder also opens in a wide, scrollable native modal; Close/Escape dismiss it except during active work. Browser opening/Escape and typecheck verified.

- Storefront sections navigation uses `storefront-sections.tsx` and CMS resource/action `storefront_settings`. Strict boolean settings persist in Medusa store metadata.storefront_sections, retaining unrelated metadata. Public GET /store/storefront-settings exposes flags only. Master sealed flag hides nav/Home content and guards sealed routes/API; individual controls manage Home banner/rows, sealed landing sections, and bottom service cards. Defaults enabled. Mirrors under server-module stay synchronized.
- Rebuilt/restarted using shared launcher; live public settings API returns HTTP 200 and 13 flags. CMS route regression covers read/save/read and invalid payloads; 63 tests pass. Settings UI validates response before rendering. Dev output uses .next-dev separately from production .next to avoid build corruption; production build passes.
- Deployment verified September 30: GitHub main pipelines deploy CMS/backend to Lightsail, not ECS. Existing SSH access works; never print keys or runtime secrets.

## Staff access and warehouse defaults
- Users & access is administrator-only; creates staff logins and changes enabled status, sections, and warehouse assignments. lib/cms-permissions.ts handles policy and warehouse response filtering; lib/cms-users.ts manages accounts. Existing admins retain unrestricted access.
- Default warehouse above cards/inventory/sealed supplies stock panels and imports; top-level changes reset panel overrides. Warehouse list contains only assigned IDs for staff.
- scripts/configure-cms-member.ts provisions from JSON stdin without logging passwords; existing users have permissions updated without resetting passwords. Optional createMissingWarehouses is for local setup only.

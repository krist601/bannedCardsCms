# Banned Cards CMS

Next.js administration app for the sibling `bannedCards-server` Medusa project. This app integrates with `../bannedCards-server`.

## Open the CMS

1. Run `../start-banned-cards.sh` to start the backend, storefront, CMS, and infrastructure together. The launcher reuses services that are already running and stops only the applications it started. CMS output is written to `../.banned-cards-logs/cms.log`.
2. For standalone CMS development, run `pnpm install`, then `pnpm dev` in this directory with Medusa already running on port 9000.
3. Open **http://localhost:3001** or the storefront's **Staff CMS** footer link.
4. Sign in using an assigned CMS account. Customer/store accounts do not have CMS access.

Administrators can open **Users & access** to create staff logins, enable/disable their access, and select their sections and warehouses. Permissions are checked on every backend request; staff cannot bypass them through Medusa admin endpoints. Administrators retain full access. Staff permissions are stored in user metadata `cmsAccess` (`enabled`, `sections`, `warehouseIds`).

The **Default warehouse** selector above Card catalog, Inventory, and Sealed products supplies the warehouse for new stock and card imports. Individual stock panels can override it; changing the top selector resets those overrides.

The app reads `MEDUSA_BACKEND_URL`, defaulting to `http://localhost:9000`. Copy `.env.example` to `.env.local` to change it. Requests are proxied server-side, so the browser needs no Medusa API key or additional Medusa CORS origins.

### Enable or revoke access

In `../bannedCards-server`, for an existing Medusa user:

```sh
pnpm exec medusa exec ./src/scripts/set-cms-admin.ts your-email@example.com true
```

Use `false` to remove administrator privileges. Staff access is managed separately in **Users & access**. New public registrations have no CMS access; public registration must never accept effective `isAdmin` or `cmsAccess` metadata.

If no Medusa user exists, create one with Medusa's user CLI (`pnpm exec medusa user --help`), then run the grant command above. This project does not add a shared/default password.

## Features

- Dashboard counts for printings, sets, listings, and open orders.
- Searchable, paginated printing catalog; create a sellable listing for a printing with SKU, condition, finish, language, CLP price, quantity, and warehouse.
- Bulk Scryfall importer: up to ten set codes per request; uses the existing server importer to import all printings, preserving its stored-image behavior. Results are reported per set; re-import updates existing printings by external ID.
- Optional card-level SKU column, editable inline (Enter or blur to save, Escape to cancel). The value is stored once per printing in `attributes.cms_sku` and shared across its conditions/languages; generated internal variant identifiers are separate.
- Set families ordered by the main set’s release date, newest first (undated sets last). Expand a family to see its main set, Commander, tokens, and other related divisions, with set selection for import. Families are grouped before pagination.
- Open “Stock by condition” on any catalog card to see NM, LP, MP, HP, and DMG with +/− controls. Choose a warehouse; each click adjusts one unit on the exact language/finish listing. For an unlisted condition, + immediately creates one copy without a dialog. English is the default language tab, followed by Spanish and Other languages; finishes and individual other languages stay separate. New stock without a price is kept as a draft and excluded from sellable storefront quantities. Enter a positive CLP price inline to publish it. Reserved units cannot be subtracted. Both catalog and inventory display set abbreviations.
- Search inventory by SKU, receive or subtract quantities, and view live Medusa available and reserved inventory. CMS adjustments serialize per inventory item and record the latest signed adjustment, warehouse, and administrator in listing metadata.
- Open orders (`pending`, `requires_action`) and closed orders (`completed`, `canceled`, `archived`), with line items and shipping details. These views are read-only; payment, fulfillment, cancellation, and refunds remain in Medusa.
- Workspace and warehouse information.
- Server-enforced CMS authorization, same-origin write protection, HttpOnly session cookie, logout, and keyboard-accessible dialogs.

## Integration files

The contents of `server-module/src` are installed into the existing server:

- `api/middlewares.ts`: authenticated Medusa user + `isAdmin` requirement for `/admin/cms*`.
- `api/admin/cms/route.ts`: catalog, imports, inventory, order, and summary APIs.
- `lib/cms-access.ts`: strict permission and stock validation.
- `scripts/set-cms-admin.ts`: trusted grant/revoke command.

There was no existing server middleware file when installed. On future integration into another project, merge route middleware rather than replacing its existing configuration. No database migration is needed: `isAdmin` uses Medusa's persisted user metadata.

The existing storefront has `/cms` redirecting to `CMS_URL` (default `http://localhost:3001`) and a footer entry. Configure `CMS_URL` in the storefront for deployment. This directory also serves `/cms` and `/login` for convenient entry points.

## Inventory behavior

New listings use Medusa product/inventory workflows, publish a variant with CLP pricing, link the selected warehouse to the selected sales channel, and store the TCG listing. Product creation is compensated if subsequent listing creation fails. Existing listings receive stock through Medusa's atomic quantity adjustment; stock is added rather than overwritten. New listing creation currently selects the first configured sales channel and shipping profile, matching the existing server's setup.

The legacy storefront reads a quantity snapshot on the TCG listing. This app refreshes that snapshot on receipts; the inventory screen always reads Medusa's live available and reserved quantities. The existing storefront still needs a separate order/inventory event subscription to keep its snapshot current after sales or changes made outside the CMS.

Set imports run synchronously. Keep the page open, and configure the deployment proxy timeout for long imports. A worker/queue and durable import history would be needed for larger unattended jobs. Do not blindly repeat a stock receipt after a network failure: check the live inventory first to avoid double receiving.

## Checks

```sh
pnpm test
pnpm typecheck
pnpm build
```

Tests exercise strict authorization, revocation, stock validation, bulk import validation, and order filtering. The production build type-checks the frontend. Run `pnpm typecheck` and `pnpm test` in the server for its own checks. Local API checks verify unauthenticated access returns 401. Real imports/stock changes should be tested against a development database with an explicitly enabled administrator.

For production, run `pnpm build && pnpm start` behind HTTPS (the session cookie is Secure in production), configure backend and storefront URLs, and apply your Medusa rate limits and deployment access controls.

## Current import and filter workflows

- **Card catalog → Import cards** receives stock from lines such as `2x The One Ring (LTR) 246 *F* S`. Preview validates the exact printing before stock is added. Select condition and warehouse for the batch; F/NF indicates finish, E/S/O indicates language. English and non-foil are defaults.
- **Sets → Import set** imports Scryfall printings and copies normal/small card images into configured S3-compatible storage before reporting success. Neither importer appears in the sidebar.
- Set filters default to All sets, ordered newest release first. Cards group by set release date, then ascending natural collector number.
- Set visibility is stored in `metadata.isVisible`. Hiding a main set removes its whole family from CMS and storefront filter options while retaining individual division preferences and inventory.
- Local development uses MinIO: image endpoint port 9002, dashboard port 9003. Configure storage credentials in the backend environment; credentials are not included here. Existing images can be migrated with backend `pnpm images:sync`.

This repository contains the CMS plus integration overlays, not the complete backend or storefront. Their existing catalog modules and supporting services are required. Merge overlays into their respective projects and rebuild the backend after changes.

## Sealed products

Open **Sealed products** in the sidebar to manage the same groups/products used by the storefront. Filter by group or search by name. Use **New sealed product** to enter its name, category, set, language, optional SKU, CLP price and image URL; new products start with zero inventory. **Edit product** changes details and Draft/Published status. Prices save inline. Choose a warehouse and adjustment quantity, then use **+ / −** to receive or subtract stock; reserved stock cannot be subtracted. Existing multi-item inventory variants require inventory setup outside these controls.

### Find sealed products and artwork

Use **Sealed products → Find products by set**, select Magic: The Gathering, and enter a set code such as SOS. If automatic lookup fails, provide the official English WPN product-page URL. Review the products and graphics, select items, then click **Accept & save selected items**. Search alone saves nothing. New products are drafts without prices or stock; existing products are skipped. Graphics are stored separately under `sealed/magic-the-gathering/<set>/graphics`, with archive downloads kept intact. Per-file limit is 64MB; failed items are reported individually and saved items are reused on retry.

Rows support Draft/Published dropdowns, inline CLP pricing and local +/- stock updates. Click the product name to edit its other details.

## AWS deployment pipeline

`.github/workflows/deploy-cms.yml` deploys pushes to `main` (or manual runs) to the existing Lightsail host. It uploads source over SSH and rebuilds the CMS with Docker Compose in `/opt/banned-cards`.

The GitHub `production` environment uses `LIGHTSAIL_HOST`, `LIGHTSAIL_USER`, `LIGHTSAIL_SSH_PRIVATE_KEY`, and `LIGHTSAIL_KNOWN_HOSTS`. Runtime `MEDUSA_BACKEND_URL` points to `http://backend:9000` inside Compose. The public CMS is https://cms.bannedcards.cl.

Server-module changes must also be synchronized and deployed through the backend repository before enabling features that depend on them. Credentials and runtime environment files are never committed.

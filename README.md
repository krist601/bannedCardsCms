# Banned Cards CMS

Next.js administration app for the sibling `bannedCards-server` Medusa project. This app integrates with `../bannedCards-server`.

## Open the CMS

1. Run `../start-banned-cards.sh` to start the backend, storefront, CMS, and infrastructure together. The launcher reuses services that are already running and stops only the applications it started. CMS output is written to `../.banned-cards-logs/cms.log`.
2. For standalone CMS development, run `pnpm install`, then `pnpm dev` in this directory with Medusa already running on port 9000.
3. Open **http://localhost:3001** or the storefront's **Staff CMS** footer link.
4. Sign in using a Medusa **user** email/password with `metadata.isAdmin === true`. Customer/store accounts do not have administrator access.

The app reads `MEDUSA_BACKEND_URL`, defaulting to `http://localhost:9000`. Copy `.env.example` to `.env.local` to change it. Requests are proxied server-side, so the browser needs no Medusa API key or additional Medusa CORS origins.

### Enable or revoke access

In `../bannedCards-server`, for an existing Medusa user:

```sh
pnpm exec medusa exec ./src/scripts/set-cms-admin.ts your-email@example.com true
```

Use `false` to revoke access. This merges the existing user metadata and preserves other fields. Revocation is checked on every CMS request. New users have no CMS access by default; they must be created through trusted Medusa administration and explicitly granted the flag. Public registration must never accept an effective `isAdmin` flag.

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

`.github/workflows/deploy-cms.yml` follows the storefront/backend pipelines: pushes to `main` (or a manual GitHub Actions run) build a Docker image tagged with the commit SHA, push it to ECR, and deploy a new ECS task revision while waiting for service stability.

Before the first run, configure these existing AWS/GitHub resources:

- GitHub environment `production` with secret `AWS_ROLE_ARN`. The role's GitHub OIDC trust must allow `repo:krist601/bannedCardsCms:environment:production` and the `sts.amazonaws.com` audience.
- The role needs ECR push, ECS task-definition read/register and service deployment permissions, plus permission to pass the task's execution/task roles, following the backend/frontend deployment roles.
- Region `us-east-2`, ECR repository `banned-cards-cms`, ECS cluster `banned-cards`, service and task-definition family `banned-cards-cms`, container name `cms`. Adjust workflow values if the provisioned names differ.
- The ECS container listens on port `3001`. Set its runtime `MEDUSA_BACKEND_URL` to the deployed backend URL reachable from ECS; the Docker default `http://backend:9000` is only suitable if that hostname resolves in your deployment. Serve the CMS through HTTPS.

The workflow preserves the current task definition's environment, secrets and infrastructure settings. It deploys the CMS only; changes under `server-module` must also be installed and deployed through the backend repository. AWS infrastructure is not created by this workflow.

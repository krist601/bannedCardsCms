# Stores and warehouses

Sign in as a CMS administrator and open **Stores & warehouses**.

1. Expand a store, select its warehouses, and click **Save store**.
2. Use **New store** to add a name and domain. Warehouses can belong to multiple stores.
3. Use the separate **New warehouse** button to create a warehouse, then assign it to stores.

Banned Cards starts with its existing warehouse assignments. Distrito TCG starts with none; select the warehouses you want it to use. No selected warehouses means no available stock. Staff warehouse permissions are independent of these storefront assignments.

## Connect a storefront

Expand **Connect this storefront** inside the store panel. Configure that frontend deployment with its publishable API key as `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`, the shared `NEXT_PUBLIC_MEDUSA_URL`, and the CLP `NEXT_PUBLIC_MEDUSA_REGION_ID`. Rebuild the frontend after changing these public environment variables.

Configure DNS, hosting, and backend CORS for its domain separately. Adding a domain in the CMS does not deploy a new website. Give each storefront key exactly one sales channel.

## Backend setup

After deploying the backend module, run `pnpm exec medusa exec ./src/scripts/configure-cms-stores.ts` from the backend repository. This initializes Banned Cards and Distrito TCG without changing existing configured assignments.

Stock is calculated from the warehouses assigned to the requesting store, including reservations. Card and sealed-product base CLP prices remain shared. Store-specific prices are deferred.

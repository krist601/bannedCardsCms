import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("require", "exports", code)((id) => {
    if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`);
    return dependencies[id];
  }, exports);
  return exports;
}
const access = load("server-module/src/lib/cms-access.ts");
const permissions = load("server-module/src/lib/cms-permissions.ts");
test('inventory warehouse filter excludes other stock before pagination',async()=>{
  const printings=[{id:'p1',set_id:'s',name:'First',collector_number:'1'},{id:'p2',set_id:'s',name:'Second',collector_number:'2'}];
  const services={tcgCatalog:{listAndCountCardPrintings:async()=>[printings,2],listAndCountCardListings:async()=>[[{id:'l1',printing_id:'p1',variant_id:'v1'},{id:'l2',printing_id:'p2',variant_id:'v2'}],2],listAndCountCardSets:async()=>[[{id:'s',code:'FRA'}],1],retrieveCardSet:async()=>({code:'FRA'})},query:{graph:async({filters})=>({data:[{inventory_items:[{inventory_item_id:filters.id}]}]})},inventory:{listInventoryLevels:async filters=>{assert.equal(filters.location_id,'banned');return filters.inventory_item_id==='v1'?[{location_id:'banned',available_quantity:1,reserved_quantity:0}]:[]}}};
  const res=response();await cmsRoutes.GET({query:{resource:'stock',location_id:'banned'},scope:{resolve:n=>services[n]}},res);
  assert.equal(res.body.count,1);assert.equal(res.body.rows[0].id,'l1');assert.equal(res.body.rows[0].levels[0].available_quantity,1);
});
test("CMS access requires a literal true flag on the stored user", () => {
  for (const user of [
    null,
    {},
    { isAdmin: true },
    { metadata: {} },
    { metadata: { isAdmin: false } },
    { metadata: { isAdmin: "true" } },
    { metadata: { isAdmin: 1 } },
  ])
    assert.equal(access.isCmsAdmin(user), false);
  assert.equal(access.isCmsAdmin({ metadata: { isAdmin: true } }), true);
});
test("stock input rejects zero, negative, fractional, string and unsafe values", () => {
  for (const value of [0, -1, 1.5, "2", NaN, Infinity, 1000001, undefined])
    assert.throws(() => access.positiveInteger(value, "Quantity"));
  assert.equal(access.positiveInteger(12, "Quantity"), 12);
});
const middlewareRoutes = load("server-module/src/api/middlewares.ts", {
  "@medusajs/framework/http": {
    defineMiddlewares: (x) => x,
    authenticate: () => () => {},
  },
  "@medusajs/framework/utils": { Modules: { USER: "user" } },
  "../lib/cms-access": access,
  "../lib/cms-permissions": permissions,
  "../lib/store-warehouse-scope": {storeCartGuard:()=>{}},
  "../lib/database-backups": {backupMaintenanceMiddleware:()=>{}},
}).default.routes;
const middleware = middlewareRoutes.find(r=>r.matcher==="/admin/cms*").middlewares[1];
test("CMS members cannot bypass permissions with native admin endpoints", async () => {
  const guard = middlewareRoutes.find(r=>r.matcher==="/admin*").middlewares[1];
  const user = {metadata:{cmsAccess:{enabled:true,sections:['cards'],warehouseIds:['shared']}}};
  for (const path of ['/admin/users','/admin/stock-locations','/admin/cms/unknown']) {
    const res = response(); let next = false;
    await guard({path,auth_context:{actor_id:'member'},scope:{resolve:()=>({retrieveUser:async()=>user})}},res,()=>next=true);
    assert.equal(res.code,403); assert.equal(next,false);
  }
  const res = response(); let next = false;
  await guard({path:'/',originalUrl:'/admin/cms?resource=cards',auth_context:{actor_id:'member'},scope:{resolve:()=>({retrieveUser:async()=>user})}},res,()=>next=true);
  assert.equal(next,true);
});
test("member response scopes locations and inventory using fresh stored permissions", async () => {
  const user={metadata:{cmsAccess:{enabled:true,sections:['cards'],warehouseIds:['shared']}}};
  const req={method:'GET',query:{resource:'locations'},auth_context:{actor_id:'member'},scope:{resolve:()=>({retrieveUser:async()=>user})}};
  const res=response(); await middleware(req,res,()=>{});
  res.json({rows:[{id:'shared'},{id:'private'}]});
  assert.deepEqual(res.body.rows,[{id:'shared'}]);
  user.metadata.cmsAccess.enabled=false;
  const revoked=response(); await middleware(req,revoked,()=>assert.fail('revoked access'));
  assert.equal(revoked.code,403);
});
function response() {
  return {
    on() {},
    code: 200,
    body: null,
    status(n) {
      this.code = n;
      return this;
    },
    json(v) {
      this.body = v;
      return this;
    },
  };
}
test("API permission is re-read, including after admin access is revoked", async () => {
  let flag = true,
    calls = 0;
  const res = response();
  const req = {
    method: "GET", query: {resource:"me"},
    auth_context: { actor_id: "user_1" },
    scope: {
      resolve: () => ({
        retrieveUser: async (id) => {
          assert.equal(id, "user_1");
          return { metadata: { isAdmin: flag } };
        },
      }),
    },
  };
  await middleware(req, res, () => calls++);
  assert.equal(calls, 1);
  flag = false;
  await middleware(req, res, () => calls++);
  assert.equal(calls, 1);
  assert.equal(res.code, 403);
});
const stockRules = load("server-module/src/lib/cms-stock.ts");
test("bulk stock import accepts quantity without x and split card names",()=>{
  const rows=stockImport.parseStockImport(`2 Artifist Acumen (FRA) 73
1 Chandra's Emberling (FRA) 76
1 Hallway Heckler // Vicious Verse (FRA) 85
1 Heartstring Puller (FRA) 86
2 Violent Echoes (FRA) 95
1 Way of the Pyromancer (FRA) 254`);
  assert.equal(rows.every(row=>!row.error),true);
  assert.equal(rows[2].name,"Hallway Heckler // Vicious Verse");
  assert.equal(rows[0].quantity,2); assert.equal(rows[5].collector,"254");
});
let generatedIds = 0;
const catalogSort = load("server-module/src/lib/cms-catalog-sort.ts");
const stockImport = load("server-module/src/lib/cms-stock-import.ts");
const setGroups = load("server-module/src/lib/cms-set-groups.ts");
const visibleSets = load("server-module/src/lib/cms-visible-sets.ts", {"./cms-set-groups":setGroups});
const calls = [];
const sectionRules = load("server-module/src/lib/storefront-sections.ts");
const settingsHandlers = load("server-module/src/lib/storefront-settings.ts", {
  "@medusajs/framework/utils": { Modules: { STORE: "store" } },
  "./storefront-sections": sectionRules,
});
const cmsRoutes = load("server-module/src/api/admin/cms/route.ts", {
  "../../../lib/cms-users": {cmsUsers:()=>{}},
  "../../../lib/cms-backups": {cmsBackups:()=>{}},
  "../../../lib/cms-stores": {cmsStores:()=>{},allowedStockChannels:async(_scope,_location,ids)=>ids,productStoreChannels:async(_scope,id)=>[{id}]},
  "../../../lib/catalogue-cache": {invalidateCatalogueCache:()=>{}},
  "../../../lib/cms-orders": {setOrderPayment:()=>{},paymentStateOf:o=>o.metadata?.payment_status??"not_paid"},
  "../../../lib/cms-set-sync": {startSetSync:()=>({running:true}),setSyncStatus:()=>({running:false})},
  "../../../lib/cms-set-prices": {previewSetPrices:()=>{},applySetPrices:()=>{}},
  "../../../lib/cms-card-autoimport": {lookupScryfallCard:async(code,collector)=>globalThis.__scryfall?.[`${code}:${collector}`]??null,importMissingCard:async(_scope,code,collector)=>{globalThis.__imported.push(`${code}:${collector}`);return {printing_id:'printing_1',created:true,warnings:[]};}},
  "../../../lib/cms-pricing-settings": {readPricing:async()=>({rate:750,minimum:300}),pricingSettings:()=>{}},
  "../../../lib/cms-base-prices": {basePrice:(p,finish)=>p.attributes?.base_prices_clp?.[finish] ?? null},
  "../../../lib/storefront-settings": settingsHandlers,
  "../../../lib/cms-set-groups": setGroups,
  "../../../lib/cms-catalog-sort": catalogSort,
  "../../../lib/cms-visible-sets": visibleSets,
  "../../../lib/cms-sealed-finder": {sealedFinder:()=>{}},
  "../../../lib/cms-sealed": {getSealed:()=>{},postSealed:()=>{}},
  "../../../lib/cms-stock-import": stockImport,
  "node:crypto": {
    randomUUID: () => `generated-internal-id-${++generatedIds}`,
  },
  "../../../lib/cms-stock": stockRules,
  "@medusajs/framework/utils": {
    Modules: {
      INVENTORY: "inventory",
      STOCK_LOCATION: "location",
      ORDER: "order",
      LOCKING: "locking",
      SALES_CHANNEL: "sales_channel",
      FULFILLMENT: "fulfillment",
    },
    ContainerRegistrationKeys: { QUERY: "query" },
    ProductStatus: { PUBLISHED: "published", DRAFT: "draft" },
  },
  "@medusajs/medusa/core-flows": Object.fromEntries(
    [
      "createProductsWorkflow",
      "createInventoryLevelsWorkflow",
      "deleteProductsWorkflow",
      "linkSalesChannelsToStockLocationWorkflow",
      "updateProductVariantsWorkflow",
      "updateProductsWorkflow",
    ].map((name) => [
      name,
      (scope) => ({ run: (input) => scope.resolve("flows")[name](input) }),
    ]),
  ),
  "../../../scripts/import-scryfall-set": { default: async () => {} },
  "../../../lib/cms-access": access,
});
test("storefront settings route loads, saves and reads visibility without losing metadata", async () => {
  const store = { id: "store_1", metadata: { other: "retained", storefront_sections: { homeSingles: false } } };
  const scope = { resolve: name => name === "store" ? {listStores: async () => [store], updateStores: async (id, data) => { assert.equal(id, store.id); store.metadata = data.metadata; }} : {} };
  const read = response(); read.setHeader = () => {};
  await cmsRoutes.GET({ scope, query: { resource: "storefront_settings" } }, read);
  assert.equal(read.body.settings.homeSingles, false); assert.equal(read.body.settings.sealed, true);
  const saved = response(); await cmsRoutes.POST({ scope, body: { action: "storefront_settings", settings: { sealed: false } } }, saved);
  assert.equal(saved.body.settings.sealed, false); assert.equal(store.metadata.other, "retained");
  await cmsRoutes.GET({ scope, query: { resource: "storefront_settings" } }, read); assert.equal(read.body.settings.sealed, false);
  for (const settings of [{ sealed: "false" }, { unknown: true }, [], null]) { const invalid = response(); await cmsRoutes.POST({ scope, body: { action: "storefront_settings", settings } }, invalid); assert.equal(invalid.code, 400); }
});
test("invalid stock request returns 400 before any inventory mutation", async () => {
  const res = response();
  await cmsRoutes.POST(
    {
      body: { action: "receive", quantity: -10 },
      scope: { resolve: () => ({}) },
    },
    res,
  );
  assert.equal(res.code, 400);
});
test("bulk loader rejects too many sets and invalid codes", async () => {
  for (const codes of [[], Array(11).fill("ltr"), ["../secret"], [""]]) {
    const res = response();
    await cmsRoutes.POST(
      { body: { action: "import", codes }, scope: { resolve: () => ({}) } },
      res,
    );
    assert.equal(res.code, 400);
  }
});
test("open and closed orders are filtered on the server before pagination", async () => {
  for (const status of ["open", "closed"]) {
    const res = response();
    const query = {
      graph: async (input) => {
        calls.push(input);
        return { data: [], metadata: { count: 0 } };
      },
    };
    await cmsRoutes.GET(
      {
        query: { resource: "orders", status, offset: "30" },
        scope: { resolve: () => query },
      },
      res,
    );
    assert.deepEqual(
      calls.at(-1).filters.status,
      status === "open"
        ? ["pending", "requires_action"]
        : ["completed", "canceled", "archived"],
    );
    assert.equal(calls.at(-1).pagination.skip, 30);
  }
});
test("unlinked catalog listing cannot accidentally receive another variant inventory", async () => {
  let queried = false;
  const res = response();
  await cmsRoutes.POST(
    {
      body: {
        action: "receive",
        quantity: 2,
        listing_id: "listing_1",
        location_id: "loc_1",
      },
      scope: {
        resolve: (name) =>
          name === "tcgCatalog"
            ? {
                retrieveCardListing: async () => ({
                  id: "listing_1",
                  variant_id: null,
                }),
              }
            : name === "query"
              ? {
                  graph: async () => {
                    queried = true;
                  },
                }
              : {},
      },
    },
    res,
  );
  assert.equal(res.code, 409);
  assert.equal(queried, false);
});
const proxy = load("src/app/api/cms/[...path]/route.ts", {
  "next/server": {
    NextResponse: {
      json: (body, options = {}) => ({
        body,
        status: options.status || 200,
        cookies: {
          values: [],
          set(...args) {
            this.values.push(args);
          },
          delete(name) {
            this.values.push(["delete", name]);
          },
        },
      }),
    },
  },
});
const context = (path) => ({ params: Promise.resolve({ path: [path] }) });
const request = (method, origin = "http://localhost:3001") => ({
  method,
  headers: new Headers({ origin }),
  nextUrl: new URL("http://localhost:3001/api/cms/data"),
  cookies: { get: () => undefined },
  json: async () => ({ email: "admin@example.com", password: "test-only" }),
  text: async () => "{}",
});
test("write proxy blocks cross-origin requests before contacting the backend", async () => {
  const res = await proxy.POST(
    request("POST", "https://untrusted.example"),
    context("login"),
  );
  assert.equal(res.status, 403);
});
test("proxy does not expose unauthenticated commerce data", async () => {
  const res = await proxy.GET(request("GET"), context("data"));
  assert.equal(res.status, 401);
});
test("proxy only permits its fixed CMS backend endpoint", async () => {
  const res = await proxy.GET(request("GET"), context("../../admin/users"));
  assert.equal(res.status, 404);
});
test("valid credentials without admin permission never create a session cookie", async () => {
  const original = globalThis.fetch;
  let step = 0;
  globalThis.fetch = async () =>
    ++step === 1
      ? { ok: true, json: async () => ({ token: "test-token" }) }
      : { ok: false };
  try {
    const res = await proxy.POST(request("POST"), context("login"));
    assert.equal(res.status, 403);
    assert.equal(res.cookies.values.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test("successful login stores token only in an HttpOnly cookie", async () => {
  const original = globalThis.fetch;
  let step = 0;
  globalThis.fetch = async () =>
    ++step === 1
      ? { ok: true, json: async () => ({ token: "test-token" }) }
      : {
          ok: true,
          json: async () => ({
            user: { email: "admin@example.com", isAdmin: true },
          }),
        };
  try {
    const res = await proxy.POST(request("POST"), context("login"));
    assert.equal(res.status, 200);
    assert.equal(res.body.token, undefined);
    assert.equal(res.cookies.values[0][1], "test-token");
    assert.equal(res.cookies.values[0][2].httpOnly, true);
    assert.equal(res.cookies.values[0][2].sameSite, "strict");
  } finally {
    globalThis.fetch = original;
  }
});

function stockScenario({
  available = 3,
  missing = false,
  snapshotFailure = false,
} = {}) {
  const adjustments = [],
    snapshots = [];
  const catalog = {
    retrieveCardListing: async () => ({
      id: "listing_1",
      variant_id: "variant_1",
      metadata: { existing: true },
    }),
    updateCardListings: async (data) => {
      if (snapshotFailure) throw new Error("snapshot unavailable");
      snapshots.push(data);
    },
  };
  const services = {
    tcgCatalog: catalog,
    location: { retrieveStockLocation: async () => ({ id: "warehouse_1" }) },
    query: {
      graph: async () => ({
        data: [{ inventory_items: [{ inventory_item_id: "item_1" }] }],
      }),
    },
    locking: {
      execute: async (key, fn) => {
        assert.equal(key, "cms-inventory:item_1");
        return fn();
      },
    },
    inventory: {
      listInventoryLevels: async () =>
        missing
          ? []
          : [
              {
                available_quantity: available,
                reserved_quantity: 2,
                stocked_quantity: available + 2,
              },
            ],
      adjustInventory: async (item, location, amount) => {
        adjustments.push({ item, location, amount });
        available += amount;
      },
    },
  };
  const req = {
    body: {
      action: "subtract",
      quantity: 2,
      listing_id: "listing_1",
      location_id: "warehouse_1",
    },
    auth_context: { actor_id: "admin_1" },
    scope: { resolve: (key) => services[key] },
  };
  return { req, adjustments, snapshots };
}
test("subtract decreases the correct warehouse and updates snapshot and audit metadata", async () => {
  const s = stockScenario();
  const res = response();
  await cmsRoutes.POST(s.req, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.ok, true);
  assert.deepEqual(s.adjustments, [
    { item: "item_1", location: "warehouse_1", amount: -2 },
  ]);
  assert.equal(s.snapshots[0].quantity, 1);
  assert.equal(s.snapshots[0].metadata.last_stock_adjustment_quantity, -2);
  assert.equal(s.snapshots[0].metadata.last_stock_adjustment_by, "admin_1");
  assert.equal(s.snapshots[0].metadata.existing, true);
});
test("subtract cannot consume reserved units or stock from another warehouse", async () => {
  for (const options of [
    { available: 1 },
    { available: 0 },
    { missing: true },
  ]) {
    const s = stockScenario(options);
    const res = response();
    await cmsRoutes.POST(s.req, res);
    assert.equal(res.code, 409);
    assert.equal(s.adjustments.length, 0);
    assert.equal(s.snapshots.length, 0);
  }
});
test("subtract accepts exact available quantity and rejects invalid quantities", async () => {
  const s = stockScenario({ available: 2 });
  const res = response();
  await cmsRoutes.POST(s.req, res);
  assert.equal(s.snapshots[0].quantity, 0);
  for (const quantity of [0, -1, 1.5, "2", 1000001]) {
    const t = stockScenario();
    t.req.body.quantity = quantity;
    const r = response();
    await cmsRoutes.POST(t.req, r);
    assert.equal(r.code, 400);
    assert.equal(t.adjustments.length, 0);
  }
});
test("successful subtraction with failed snapshot reports warning without inviting a second adjustment", async () => {
  const s = stockScenario({ snapshotFailure: true });
  const res = response();
  await cmsRoutes.POST(s.req, res);
  assert.equal(res.body.ok, true);
  assert.match(res.body.warning, /Do not repeat/);
  assert.equal(s.adjustments.length, 1);
});
test("receive still adds a positive quantity", async () => {
  const s = stockScenario();
  s.req.body.action = "receive";
  const res = response();
  await cmsRoutes.POST(s.req, res);
  assert.equal(res.body.ok, true);
  assert.equal(s.adjustments[0].amount, 2);
  assert.equal(s.snapshots[0].quantity, 5);
});
test("catalog returns matching set abbreviations and preserves unassigned sets", async () => {
  const catalog = {
    listAndCountCardPrintings: async () => [
      [
        { id: "a", set_id: "set_1" },
        { id: "b", set_id: "missing" },
      ],
      2,
    ],
    listAndCountCardSets: async () => [[
      { id: "set_1", code: "ltr", name: "The Lord of the Rings" },
    ], 1],
  };
  const res = response();
  await cmsRoutes.GET(
    { query: { resource: "cards" }, scope: { resolve: () => catalog } },
    res,
  );
  assert.equal(res.body.rows[0].set_code, "ltr");
  assert.equal(res.body.rows[0].set_name, "The Lord of the Rings");
  assert.equal(res.body.rows[1].set_code, null);
});

test("card SKU is optional, trimmed and validates length", () => {
  assert.equal(stockRules.optionalCardSku(null), null);
  assert.equal(stockRules.optionalCardSku("  "), null);
  assert.equal(stockRules.optionalCardSku(" RING-01 "), "RING-01");
  for (const value of [123, "x".repeat(121), "bad\nSKU"])
    assert.throws(() => stockRules.optionalCardSku(value));
});
test("card SKU updates the printing only and preserves catalog attributes", async () => {
  let update;
  const res = response();
  const catalog = {
    retrieveCardPrinting: async () => ({
      id: "printing_1",
      attributes: { scryfall_data: { id: "source" } },
    }),
    updateCardPrintings: async (data) => {
      update = data;
    },
  };
  await cmsRoutes.POST(
    {
      body: { action: "card_sku", printing_id: "printing_1", sku: " RING " },
      scope: {
        resolve: (name) =>
          name === "locking" ? { execute: async (_, fn) => fn() } : catalog,
      },
    },
    res,
  );
  assert.equal(res.body.card_sku, "RING");
  assert.equal(update.attributes.cms_sku, "RING");
  assert.deepEqual(update.attributes.scryfall_data, { id: "source" });
});
test("English and Spanish aliases normalize while other languages remain distinct", () => {
  assert.equal(stockRules.stockLanguage("en"), "English");
  assert.equal(stockRules.stockLanguage("español"), "Spanish");
  assert.equal(stockRules.stockLanguage("Japanese"), "Japanese");
  assert.throws(() => stockRules.stockLanguage(" "));
});
function quickAddScenario() {
  const products = [],
    listings = [],
    levels = [],
    variantUpdates = [],
    productUpdates = [];
  const catalog = {
    listCardListings: async (filters) =>
      listings.filter(
        (l) =>
          l.printing_id === filters.printing_id &&
          l.condition === filters.condition &&
          l.finish === filters.finish,
      ),
    retrieveCardPrinting: async () => ({
      id: "printing_1",
      name: "The One Ring",
      attributes: { cms_sku: "CARD-SHARED" },
    }),
    createCardListings: async (data) => {
      listings.push({ id: "listing_1", ...data });
    },
    retrieveCardListing: async () => listings[0],
    updateCardListings: async (data) => {
      Object.assign(listings[0], data);
    },
  };
  const services = {
    tcgCatalog: catalog,
    locking: { execute: async (_, fn) => fn() },
    location: { retrieveStockLocation: async () => ({ id: "warehouse_1" }) },
    sales_channel: { listSalesChannels: async () => [{ id: "channel_1" }] },
    fulfillment: { listShippingProfiles: async () => [{ id: "profile_1" }] },
    query: {
      graph: async () => ({
        data: [{ inventory_items: [{ inventory_item_id: "item_1" }] }],
      }),
    },
    inventory: {
      listInventoryLevels: async () => [
        { available_quantity: levels[0].stocked_quantity },
      ],
      adjustInventory: async (_, __, n) => {
        levels[0].stocked_quantity += n;
      },
    },
    flows: {
      linkSalesChannelsToStockLocationWorkflow: async () => {},
      createProductsWorkflow: async ({ input }) => {
        for (const product of input.products) {
          const handle =
            product.handle || product.title.toLowerCase().replaceAll(" ", "-");
          if (
            products.some(
              (existing) =>
                (existing.handle ||
                  existing.title.toLowerCase().replaceAll(" ", "-")) === handle,
            )
          )
            throw new Error(`Product with handle: ${handle}, already exists.`);
        }
        products.push(...input.products);
        return {
          result: [{ id: "product_1", variants: [{ id: "variant_1" }] }],
        };
      },
      createInventoryLevelsWorkflow: async ({ input }) => {
        levels.push(...input.inventory_levels);
      },
      deleteProductsWorkflow: async () => {},
      updateProductVariantsWorkflow: async (data) => {
        variantUpdates.push(data);
      },
      updateProductsWorkflow: async (data) => {
        productUpdates.push(data);
      },
    },
  };
  const req = {
    body: {
      action: "quick_add",
      printing_id: "printing_1",
      condition: "near_mint",
      language: "English",
      finish: "non_foil",
      location_id: "warehouse_1",
    },
    auth_context: { actor_id: "admin_1" },
    scope: { resolve: (name) => services[name] },
  };
  return { req, products, listings, levels, variantUpdates, productUpdates };
}
test("first plus adds unpriced stock without asking for SKU or price; next plus reuses it", async () => {
  const s = quickAddScenario();
  const res = response();
  await cmsRoutes.POST(s.req, res);
  assert.equal(res.code, 201);
  assert.equal(s.listings.length, 1);
  assert.equal(s.levels[0].stocked_quantity, 1);
  assert.equal(s.products[0].status, "draft");
  assert.deepEqual(s.products[0].variants[0].prices, []);
  assert.equal(s.listings[0].metadata.price_pending, true);
  assert.match(s.listings[0].sku, /^BC-/);
  const again = response();
  await cmsRoutes.POST(s.req, again);
  assert.equal(again.body.ok, true);
  assert.equal(s.listings.length, 1);
  assert.equal(s.levels[0].stocked_quantity, 2);
});
test("Spanish and other-language quick additions preserve the selected language", async () => {
  for (const language of ["Spanish", "Japanese", "Other"]) {
    const s = quickAddScenario();
    s.req.body.language = language;
    await cmsRoutes.POST(s.req, response());
    assert.equal(s.listings[0].language, language);
  }
});
test("entering a price updates Medusa before marking new stock sellable", async () => {
  const s = quickAddScenario();
  await cmsRoutes.POST(s.req, response());
  s.req.body = { action: "price", listing_id: "listing_1", price_clp: 12000 };
  const res = response();
  await cmsRoutes.POST(s.req, res);
  assert.equal(res.body.ok, true);
  assert.equal(
    s.variantUpdates[0].input.product_variants[0].prices[0].amount,
    12000,
  );
  assert.equal(s.productUpdates[0].input.products[0].status, "published");
  assert.equal(s.listings[0].metadata.price_pending, false);
  assert.equal(s.listings[0].price_clp, 12000);
  assert.equal(s.listings[0].metadata.price_source, "custom");
});
test('new stock inherits its printing base price and finish',async()=>{
 const s=quickAddScenario();s.req.scope.resolve('tcgCatalog').retrieveCardPrinting=async()=>({id:'printing_1',name:'Jace',attributes:{base_prices_clp:{non_foil:10000,foil:15000}}});
 await cmsRoutes.POST(s.req,response());
 assert.equal(s.listings[0].price_clp,10000);assert.equal(s.listings[0].metadata.price_source,'scryfall');
 assert.equal(s.products[0].variants[0].prices[0].amount,10000);assert.equal(s.products[0].status,'published');
});
const projection = load("server-module/src/lib/card-catalogue-projection.ts");
test("unpriced inventory never appears as free or sellable stock in the storefront", () => {
  const [card] = projection.projectCardCatalogue(
    [{ id: "p", set_id: "s", name: "The One Ring", collector_number: "246" }],
    [{ id: "s", code: "ltr", name: "LTR" }],
    [
      {
        id: "l",
        printing_id: "p",
        variant_id: "v",
        price_clp: 0,
        quantity: 4,
        metadata: { price_pending: true },
      },
    ],
  );
  assert.equal(card.price_clp, null);
  assert.equal(card.variant_id, null);
  assert.equal(card.stock, 0);
});

test("same card supports NM, LP, other languages and finishes without handle collisions", async () => {
  const s = quickAddScenario();
  for (const [condition, language, finish] of [
    ["near_mint", "English", "non_foil"],
    ["lightly_played", "English", "non_foil"],
    ["near_mint", "Spanish", "non_foil"],
    ["near_mint", "English", "foil"],
  ]) {
    s.req.body = { ...s.req.body, condition, language, finish };
    const res = response();
    await cmsRoutes.POST(s.req, res);
    assert.equal(res.code, 201);
  }
  assert.equal(s.products.length, 4);
  assert.equal(new Set(s.products.map((p) => p.handle)).size, 4);
  assert.ok(s.products.every((p) => p.handle && p.title === "The One Ring"));
  assert.deepEqual(
    s.listings.map((l) => [l.condition, l.language, l.finish]),
    [
      ["near_mint", "English", "non_foil"],
      ["lightly_played", "English", "non_foil"],
      ["near_mint", "Spanish", "non_foil"],
      ["near_mint", "English", "foil"],
    ],
  );
});

test("CMS groups main, Commander and token sets and sorts families by main release newest first", () => {
  const result = setGroups.groupCmsSets([
    { id: "old", code: "old", name: "Older", released_at: "2020-01-01" },
    {
      id: "main",
      code: "sos",
      name: "Secrets of Strixhaven",
      released_at: "2026-04-24",
    },
    {
      id: "cmd",
      code: "soc",
      name: "Secrets of Strixhaven Commander",
      released_at: "2026-04-24",
      metadata: { scryfall_data: { parent_set_code: "sos" } },
    },
    {
      id: "token",
      code: "tsoc",
      name: "Secrets of Strixhaven Commander Tokens",
      released_at: "2026-04-24",
      metadata: { parent_set_code: "soc" },
    },
    { id: "unknown", code: "u", name: "Undated", released_at: null },
  ]);
  assert.deepEqual(
    result.map((g) => g.code),
    ["sos", "old", "u"],
  );
  assert.equal(result[0].divisions.length, 3);
  assert.equal(result[0].divisions[0].code, "sos");
});
test("CMS set grouping falls back to exact main name without merging historical blocks", () => {
  const result = setGroups.groupCmsSets([
    {
      id: "a",
      code: "a",
      name: "Alpha",
      released_at: "2024-01-01",
      metadata: { block_code: "same" },
    },
    {
      id: "b",
      code: "b",
      name: "Beta",
      released_at: "2025-01-01",
      metadata: { block_code: "same" },
    },
    { id: "at", code: "at", name: "Alpha Tokens", released_at: "2024-01-01" },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].code, "b");
  assert.equal(result[1].divisions.length, 2);
});
test("CMS set grouping tolerates missing parents, invalid dates and parent cycles", () => {
  const sets = [
    {
      id: "a",
      code: "a",
      name: "A",
      released_at: "invalid",
      metadata: { parent_set_code: "b" },
    },
    {
      id: "b",
      code: "b",
      name: "B",
      released_at: null,
      metadata: { parent_set_code: "a" },
    },
    {
      id: "c",
      code: "c",
      name: "C",
      released_at: null,
      metadata: { parent_set_code: "missing" },
    },
  ];
  const groups = setGroups.groupCmsSets(sets);
  assert.equal(groups.length, 2);
  assert.equal(groups.flatMap((g) => g.divisions).length, 3);
});
test("CMS sets API groups before pagination", async () => {
  const rows = Array.from({ length: 31 }, (_, i) => ({
    id: `main${i}`,
    code: `m${i}`,
    name: `Main ${i}`,
    released_at: `2025-01-${String(i + 1).padStart(2, "0")}`,
  }));
  rows.push({
    id: "child",
    code: "child",
    name: "Child",
    released_at: "2025-01-31",
    metadata: { parent_set_code: "m30" },
  });
  const res = response();
  await cmsRoutes.GET(
    {
      query: { resource: "sets", offset: "0" },
      scope: { resolve: () => ({ listCardSets: async () => rows }) },
    },
    res,
  );
  assert.equal(res.body.count, 31);
  assert.equal(res.body.rows.length, 30);
  assert.equal(res.body.rows[0].divisions.length, 2);
  assert.equal(res.body.rows[0].code, "m30");
});
test('stock import parses foil, forgiving stars, Spanish and default English/nonfoil', () => {
  const rows = stockImport.parseStockImport('2x the one ring (LOR) 234 *F* S.\n1x the one ring (LOR) 234 *NF E*\n3x Card (ABC) 1\n1x Card (ABC) 2 other:Japanese');
  assert.deepEqual(rows.map(r=>[r.quantity,r.finish,r.language,r.error]), [[2,'foil','Spanish',undefined],[1,'non_foil','English',undefined],[3,'non_foil','English',undefined],[1,'non_foil','Japanese',undefined]]);
  assert.equal(rows[0].code,'lor');
  for(const text of ['0x Card (ABC) 1','1x Card (ABC) 1 X','Card (ABC) 1']) assert.ok(stockImport.parseStockImport(text)[0].error);
  assert.throws(()=>stockImport.parseStockImport(''));
  assert.throws(()=>stockImport.parseStockImport(Array(101).fill('1x Card (ABC) 1').join('\n')));
});
function importScenario(text) {
  const s=quickAddScenario();
  const catalog=s.req.scope.resolve('tcgCatalog');
  catalog.listCardSets=async ({code})=>code==='ltr'?[{id:'set_1'}]:[];
  catalog.listAndCountCardPrintings=async ({collector_number})=>[collector_number==='246'?[{id:'printing_1',name:'The One Ring'}]:[],1];
  s.req.body={action:'stock_import_preview',text,condition:'near_mint',location_id:'warehouse_1'};
  return s;
}
test('import preview checks set and collector while tolerating pasted name typos',async()=>{
  const s=importScenario('2x The One Ring (LTR) 246 *F* S');const res=response();await cmsRoutes.POST(s.req,res);
  assert.equal(res.body.valid,true);assert.equal(s.products.length,0);
  for(const text of ['1x The One Ring (LOR) 246','1x The One Ring (LTR) 234']) {
    s.req.body={...s.req.body,action:'stock_import',text};const invalid=response();await cmsRoutes.POST(s.req,invalid);assert.equal(invalid.body.applied,false);assert.equal(s.products.length,0);
  }
  s.req.body={...s.req.body,action:'stock_import_preview',text:'1x Wrong name (LTR) 246'};const corrected=response();await cmsRoutes.POST(s.req,corrected);assert.equal(corrected.body.valid,true);assert.match(corrected.body.rows[0].warning,/Catalog name/);assert.equal(s.products.length,0);
});
test('bulk receiving applies quantity and reuses the matching listing',async()=>{
  const s=importScenario('2x The One Ring (LTR) 246\n3x The One Ring (LTR) 246');s.req.body.action='stock_import';const res=response();await cmsRoutes.POST(s.req,res);
  assert.equal(res.body.completed,true);assert.equal(s.products.length,1);assert.equal(s.levels[0].stocked_quantity,5);
});
test('bulk receiving stops after a failed line and reports partial progress',async()=>{
  const s=importScenario('2x The One Ring (LTR) 246\n3x The One Ring (LTR) 246\n4x The One Ring (LTR) 246');
  s.req.scope.resolve('inventory').adjustInventory=async()=>{throw new Error('warehouse unavailable');};
  s.req.body.action='stock_import';const res=response();await cmsRoutes.POST(s.req,res);
  assert.equal(res.body.completed,false);assert.equal(res.body.rows.length,2);assert.equal(res.body.rows[0].ok,true);assert.equal(res.body.rows[1].ok,false);assert.equal(s.levels[0].stocked_quantity,2);
});
test('collector ordering is numeric, handles suffixes and puts missing numbers last',()=>{
  const rows=['10a','2','10',null,'1'].map((collector_number,id)=>({id:String(id),collector_number}));
  assert.deepEqual(rows.sort(catalogSort.compareCollectors).map(r=>r.collector_number),['1','2','10','10a',null]);
});
test('set filter and natural collector order apply before catalog pagination',async()=>{
  const records=Array.from({length:35},(_,i)=>({id:String(i),set_id:'s',collector_number:String(35-i)}));
  const catalog={listAndCountCardPrintings:async(filters)=>{assert.equal(filters.set_id,'s');assert.deepEqual(filters.name,{$ilike:'%Ring%'});return [records,35];},listAndCountCardSets:async()=>[[{id:'s',name:'Set',code:'s'}],1]};
  const res=response();await cmsRoutes.GET({query:{resource:'cards',set_id:'s',q:'Ring',offset:30},scope:{resolve:()=>catalog}},res);
  assert.equal(res.body.count,35);assert.deepEqual(res.body.rows.map(r=>r.collector_number),['31','32','33','34','35']);
});
test('inventory filters by the selected set and sorts before enriching the page',async()=>{
  const printings=[{id:'p10',set_id:'s',collector_number:'10',name:'Ten'},{id:'p2',set_id:'s',collector_number:'2',name:'Two'}];
  const services={tcgCatalog:{listAndCountCardPrintings:async(filters)=>{assert.equal(filters.set_id,'s');return [printings,2];},listAndCountCardListings:async(filters)=>{assert.deepEqual(filters.printing_id,['p10','p2']);assert.deepEqual(filters.sku,{$ilike:'%BC%'});return [[{id:'l10',printing_id:'p10'},{id:'l2',printing_id:'p2'}],2];},listAndCountCardSets:async()=>[[{id:'s',code:'s',name:'Set'}],1],retrieveCardSet:async()=>({code:'s',name:'Set'})},inventory:{},query:{}};
  const res=response();await cmsRoutes.GET({query:{resource:'stock',set_id:'s',q:'BC'},scope:{resolve:name=>services[name]}},res);
  assert.deepEqual(res.body.rows.map(r=>r.collector_number),['2','10']);assert.equal(res.body.count,2);
});
test('empty set returns no inventory without querying unrelated listings',async()=>{
  const res=response();await cmsRoutes.GET({query:{resource:'stock',set_id:'empty'},scope:{resolve:()=>({listAndCountCardPrintings:async()=>[[],0]})}},res);
  assert.deepEqual(res.body,{rows:[],count:0});
});
const datedSets = [
  {id:'old',name:'Edge of Eternities',code:'eoe',released_at:'2025-08-01'},
  {id:'new',name:'Secrets of Strixhaven',code:'sos',released_at:'2026-04-23'},
  {id:'hidden',name:'Hidden',code:'hid',released_at:'2027-01-01',metadata:{isVisible:false}},
  {id:'unknown',name:'Undated',code:'u',released_at:null},
];
test('dropdown shows visible sets newest first, with missing dates last',async()=>{
  const res=response();await cmsRoutes.GET({query:{resource:'set_options'},scope:{resolve:()=>({listAndCountCardSets:async()=>[datedSets,4]})}},res);
  assert.deepEqual(res.body.rows.map(r=>r.id),['new','old','unknown']);
});
test('all cards group by newest set then natural collector order before pagination',async()=>{
  const printings=[{id:'o1',set_id:'old',collector_number:'1'},{id:'n10',set_id:'new',collector_number:'10'},{id:'n2',set_id:'new',collector_number:'2'},{id:'o2',set_id:'old',collector_number:'2'}];
  const catalog={listAndCountCardSets:async()=>[datedSets,4],listAndCountCardPrintings:async()=>[printings,4]};
  const res=response();await cmsRoutes.GET({query:{resource:'cards'},scope:{resolve:()=>catalog}},res);
  assert.deepEqual(res.body.rows.map(r=>r.id),['n2','n10','o1','o2']);
});
test('visibility checkbox persists boolean and preserves Scryfall metadata',async()=>{
  let saved;
  const services={locking:{execute:async(_,fn)=>fn()},tcgCatalog:{retrieveCardSet:async()=>({id:'s',metadata:{parent_set_code:'parent',isVisible:true}}),updateCardSets:async data=>{saved=data;}}};
  const req={body:{action:'set_visibility',set_id:'s',isVisible:false},scope:{resolve:name=>services[name]}};
  const res=response();await cmsRoutes.POST(req,res);assert.equal(res.body.ok,true);assert.deepEqual(saved.metadata,{parent_set_code:'parent',isVisible:false});
  req.body.isVisible='false';const invalid=response();await cmsRoutes.POST(req,invalid);assert.equal(invalid.code,400);
  assert.equal(setGroups.groupCmsSets([{id:'s',name:'Set',code:'s',released_at:null,metadata:saved.metadata}])[0].isVisible,false);
});
test('storefront directory excludes hidden sets and latest codes; all hidden returns empty success',async()=>{
  let directory=datedSets;
  const store=load('server-module/src/api/store/tcg/sets/route.ts',{
    '../../../../lib/cms-visible-sets':visibleSets,
    '../../../../lib/set-directory-store':{readMagicSets:async()=>directory},
    '../../../../lib/set-directory':{groupSets:sets=>sets,pageGroups:groups=>({groups,nextCursor:null}),latestSetCodes:sets=>sets.map(s=>s.code)},
  });
  const res=response();await store.GET({query:{},scope:{}},res);assert.deepEqual(res.body.groups.map(s=>s.id),['old','new','unknown']);assert.ok(!res.body.latestSetCodes.includes('hid'));
  directory=[datedSets[2]];const empty=response();await store.GET({query:{},scope:{}},empty);assert.equal(empty.code,200);assert.deepEqual(empty.body.groups,[]);
});
test('hiding a main set removes its entire family from both filter consumers',()=>{
  const sets=[
    {id:'main',code:'trk',name:'Star Trek',released_at:null,metadata:{isVisible:false}},
    {id:'commander',code:'trc',name:'Star Trek Commander',released_at:null,metadata:{parent_set_code:'trk'}},
    {id:'tokens',code:'ttrk',name:'Star Trek Tokens',released_at:null},
    {id:'other',code:'eoe',name:'Edge of Eternities',released_at:null},
  ];
  assert.deepEqual(visibleSets.visibleFilterSets(sets).map(s=>s.id),['other']);
  sets[0].metadata.isVisible=true;
  sets[1].metadata.isVisible=false;
  assert.deepEqual(visibleSets.visibleFilterSets(sets).map(s=>s.id),['main','tokens','other']);
});
test('set import awaits S3 image sync for the imported set and reports failures',async()=>{
  const previous=process.env.FILE_STORAGE_DRIVER;process.env.FILE_STORAGE_DRIVER='s3';
  let synced;let failSync=false;
  const script=load('server-module/src/scripts/import-scryfall-set.ts',{
    '../lib/cms-base-prices':{refreshSetBasePrices:async(_scope,code)=>{assert.equal(code,'ltr');return {printings:1,updated:0,custom:0};}},
    '../lib/scryfall-set-import':{importScryfallSet:async()=>({setCode:'ltr',setName:'LTR',discovered:1,created:1,updated:0})},
    './sync-card-images':{default:async input=>{synced=input.args;if(failSync) throw new Error('Storage unavailable');}},
  }).default;
  try {
    await script({container:{resolve:()=>({})},args:['LTR']});assert.deepEqual(synced,['set=ltr']);
    failSync=true;await assert.rejects(script({container:{resolve:()=>({})},args:['LTR']}),/Storage unavailable/);
    process.env.FILE_STORAGE_DRIVER='local';await assert.rejects(script({container:{resolve:()=>({})},args:['LTR']}),/Configure S3/);
  } finally {if(previous===undefined) delete process.env.FILE_STORAGE_DRIVER;else process.env.FILE_STORAGE_DRIVER=previous;}
});

test('import finds cards missing from the catalog on Scryfall and imports them only when applying',async()=>{
  globalThis.__scryfall={'new:12':{id:'sf1',name:'Brand New Card',set:'new'}};globalThis.__imported=[];
  const s=importScenario('1x Brand New Card (NEW) 12\n1x Ghost (NEW) 99');
  const preview=response();await cmsRoutes.POST(s.req,preview);
  assert.equal(preview.body.rows[0].import_card,true);assert.match(preview.body.rows[0].warning,/will import Brand New Card/);
  assert.match(preview.body.rows[1].error,/not found/);assert.equal(globalThis.__imported.length,0);
  s.req.body={...s.req.body,action:'stock_import',text:'1x Brand New Card (NEW) 12'};const applied=response();await cmsRoutes.POST(s.req,applied);
  assert.deepEqual(globalThis.__imported,['new:12']);assert.equal(applied.body.applied,true);
  s.req.body={...s.req.body,text:'1x Brand New Card (NEW) 12\n1x Ghost (NEW) 99'};globalThis.__imported=[];const blocked=response();await cmsRoutes.POST(s.req,blocked);
  assert.equal(blocked.body.applied,false);assert.equal(globalThis.__imported.length,0);
});

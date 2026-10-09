"use client";
import StorefrontSections from "./storefront-sections";
import CmsUsers from "./cms-users";
import SetPrices from "./set-prices";
import SetSync from "./set-sync";
import NavigationIcon from "./navigation-icon";
import StoresWarehouses from "./stores-warehouses";
import PricingSettings from "./pricing-settings";
import DatabaseBackups from "./database-backups";
import SealedProducts from "./sealed-products";
import CardImport from "./card-import";
import ConditionStock from "./condition-stock";
import InlineField from "./inline-field";
import {
  Fragment,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type Row = {
  id: string;
  name?: string;
  code?: string;
  set_code?: string;
  set_name?: string;
  set_id?: string;
  isVisible?: boolean;
  sku?: string;
  card_sku?: string | null;
  divisions?: {
    id: string;
    code: string;
    name: string;
    released_at: string | null;
    isVisible?: boolean;
  }[];
  email?: string;
  status?: string;
  display_id?: number;
  payment?: "paid" | "not_paid";
  test_order?: boolean;
  created_at?: string;
  released_at?: string;
  collector_number?: string;
  rarity?: string;
  image_small_url?: string;
  quantity?: number;
  price_clp?: number;
  total?: number;
  currency_code?: string;
  condition?: string;
  language?: string;
  finish?: string;
  levels?: {
    location_id: string;
    stocked_quantity: number;
    available_quantity: number;
    reserved_quantity: number;
  }[];
  items?: { id: string; title: string; quantity: number; unit_price: number }[];
  shipping_address?: {
    first_name?: string;
    last_name?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    province?: string;
    phone?: string;
    company?: string;
    country_code?: string;
  };
  metadata?: {
    document_type?: "boleta" | "factura";
    document_rut?: string;
    company?: { rut?: string; name?: string; activity?: string; address?: string; comuna?: string };
    shipping_method?: string;
    starken_branch?: string;
    customer_notes?: string;
    contact_phone?: string;
  };
};
type Page =
  | "users"
  | "stores"
  | "pricing"
  | "backups"
  | "storefront"
  | "overview"
  | "cards"
  | "sets"
  | "stock"
  | "sealed"
  | "custom"
  | "accessories"
  | "orders"
  | "import"
  | "card_import"
  | "settings";
const navigation: { id: Page; label: string; icon: string; group: string }[] = [
  { id: "overview", label: "Overview", icon: "◫", group: "Stock" },
  { id: "cards", label: "Card catalog", icon: "▤", group: "Stock" },
  { id: "stock", label: "Inventory", icon: "▦", group: "Stock" },
  { id: "sealed", label: "Sealed products", icon: "▣", group: "Stock" },
  { id: "custom", label: "Custom products", icon: "✦", group: "Stock" },
  { id: "accessories", label: "Accessories", icon: "◇", group: "Stock" },
  { id: "orders", label: "Orders", icon: "▣", group: "Stock" },
  { id: "users", label: "Users & access", icon: "♙", group: "Administration" },
  { id: "stores", label: "Stores & warehouses", icon: "▣", group: "Administration" },
  { id: "pricing", label: "Pricing settings", icon: "", group: "Administration" },
  { id: "backups", label: "Database backups", icon: "", group: "Administration" },
  { id: "storefront", label: "Storefront sections", icon: "◧", group: "Administration" },
  { id: "sets", label: "Sets", icon: "◈", group: "Administration" },
];
const money = (n = 0, currency = "CLP") =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(n);
const date = (v?: string) =>
  v
    ? new Date(v).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
const human = (v?: string) => v?.replaceAll("_", " ") || "—";
async function api(resource: string, body?: unknown) {
  const response = await fetch(`/api/cms/${resource}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || "Request failed") as Error & {
      status: number;
    };
    error.status = response.status;
    throw error;
  }
  return data;
}
export default function Cms() {
  const [session, setSession] = useState<"loading" | "out" | "in">("loading");
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<{admin:boolean;sections:string[];canCreateSealed?:boolean}>({admin:false,sections:[]});
  const applyUser = (user: any) => {
    setEmail(user.email);
    const p = {admin:user.admin === true || user.isAdmin === true,sections:user.sections || []};
    setPermissions(p);
    setPage(p.admin ? "overview" : (p.sections[0] as Page || "settings"));
  };
  const [page, setPage] = useState<Page>("overview");
  const [rows, setRows] = useState<Row[]>([]),
    [count, setCount] = useState(0),
    [offset, setOffset] = useState(0);
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [orderStatus, setOrderStatus] = useState("open");
  const [setFilter, setSetFilter] = useState("");
  const [setOptions, setSetOptions] = useState<Row[]>([]);
  const [printingFilter, setPrintingFilter] = useState<Row | null>(null);
  const [warehouse, setWarehouse] = useState("");
  const [priceSet, setPriceSet] = useState<{id:string;name?:string}|null>(null);
  const [listingCondition, setListingCondition] = useState("near_mint");
  const [stats, setStats] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [locations, setLocations] = useState<Row[]>([]),
    [selected, setSelected] = useState<Row | null>(null);
  const [modal, setModal] = useState<
    "listing" | "receive" | "subtract" | "order" | null
  >(null);
  const [codes, setCodes] = useState(""),
    [results, setResults] = useState<
      { code: string; ok: boolean; message?: string }[]
    >([]);
  const [revision, setRevision] = useState(0);
  const requestId = useRef(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const fail = useCallback((e: unknown) => {
    const err = e as Error & { status?: number };
    setError(err.message);
    if (err.status === 401) setSession("out");
  }, []);
  useEffect(() => {
    api("data?resource=me")
      .then((d) => {
        applyUser(d.user);
        setSession("in");
      })
      .catch(() => setSession("out"));
  }, []);
  useEffect(() => {
    if (session !== "in") return;
    api("data?resource=locations")
      .then((d) => {setLocations(d.rows);setWarehouse(v=>d.rows.some((l:Row)=>l.id===v)?v:d.rows[0]?.id||"");})
      .catch(fail);
  }, [session, fail]);
  useEffect(() => {
    if (session !== "in" || (page !== "cards" && page !== "stock")) return;
    let current = true;
    api("data?resource=set_options")
      .then((d) => {
        if (current) {
          setSetOptions(d.rows);
          setSetFilter((value) =>
            d.rows.some((row: Row) => row.id === value) ? value : "",
          );
        }
      })
      .catch(fail);
    return () => {
      current = false;
    };
  }, [session, page, revision, fail]);
  useEffect(() => {
    if (
      session !== "in" ||
      page === "import" ||
      page === "card_import" ||
      page === "storefront" ||
      page === "users" ||
      page === "stores" ||
      page === "pricing" ||
      page === "backups" ||
      page === "sealed" ||
      page === "custom" ||
      page === "accessories" ||
      page === "settings"
    )
      return;
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    setRows([]);
    api(
      `data?resource=${page}&location_id=${encodeURIComponent(page === "stock" ? warehouse : "")}&offset=${offset}&q=${encodeURIComponent(search)}&status=${orderStatus}&set_id=${encodeURIComponent(setFilter)}&printing_id=${encodeURIComponent(printingFilter?.id || "")}`,
    )
      .then((d) => {
        if (id !== requestId.current) return;
        if (page === "overview") setStats(d);
        else {
          setRows(d.rows);
          setCount(d.count);
        }
      })
      .catch((e) => {
        if (id === requestId.current) fail(e);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
    return () => {
      requestId.current++;
    };
  }, [
    session,
    page,
    offset,
    search,
    orderStatus,
    revision,
    printingFilter,
    setFilter,
    warehouse,
    fail,
  ]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>("[role=dialog]");
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,[tabindex="0"]',
        ) || [],
      );
    focusable()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setModal(null);
      if (event.key === "Tab") {
        const nodes = focusable();
        const first = nodes[0],
          last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      previous?.focus();
    };
  }, [modal, busy]);
  function go(p: Page) {
    const section = p === "card_import" ? "cards" : p === "import" ? "sets" : p;
    if (section !== "settings" && !permissions.admin && !permissions.sections.includes(section)) return;
    setSetFilter("");
    setPrintingFilter(null);
    setPage(p);
    setOffset(0);
    setQuery("");
    setSearch("");
    setError("");
    setNotice("");
    setSelected(null);
    setModal(null);
  }
  async function setVisibility(id: string, isVisible: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("data", { action: "set_visibility", set_id: id, isVisible });
      setRows((current) =>
        current.map((row) => ({
          ...row,
          ...(row.id === id ? { isVisible } : {}),
          divisions: row.divisions?.map((division) =>
            division.id === id ? { ...division, isVisible } : division,
          ),
        })),
      );
      setNotice(
        "Visibility saved. Hiding a main set also hides its divisions in both filters.",
      );
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const d = await api("login", {
        email: f.get("email"),
        password: f.get("password"),
      });
      applyUser(d.user);
      setSession("in");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api("logout", {});
      setSession("out");
      setRows([]);
      setModal(null);
      setStats({});
      setError("");
      setNotice("");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await api("data", {
        ...f,
        quantity: Number(f.quantity),
        price_clp: Number(f.price_clp),
        action: modal,
        printing_id: selected?.id,
        listing_id: selected?.id,
      });
      setModal(null);
      setNotice(
        result.warning ||
          (modal === "listing"
            ? "Listing created and stock added."
            : modal === "subtract"
              ? "Stock subtracted successfully."
              : "Stock received successfully."),
      );
      setRevision((x) => x + 1);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function runImport(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResults([]);
    try {
      const data = await api("data", {
        action: "import",
        codes: [
          ...new Set(
            codes
              .trim()
              .toLowerCase()
              .split(/[\s,;]+/)
              .filter(Boolean),
          ),
        ],
      });
      setResults(data.results);
      setRevision((x) => x + 1);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  if (session === "loading")
    return (
      <main className="boot">
        <div className="brand-mark">
          B<span>↗</span>
        </div>
        <p>Connecting to your control room…</p>
      </main>
    );
  if (session === "out")
    return (
      <main className="login">
        <section className="login-story">
          <div className="brand">
            <div className="brand-mark">
              B<span>↗</span>
            </div>
            <div>
              BANNED CARDS<small>THE CONTROL ROOM</small>
            </div>
          </div>
          <div>
            <span className="eyebrow">BUILT FOR THE COLLECTION</span>
            <h1>
              Great cards.
              <br />
              Better managed.
            </h1>
            <p>
              Your catalog, your stock, your next order.
              <br />
              Everything behind the collection, in one place.
            </p>
            <div className="card-art" aria-hidden="true">
              <div>
                BC<small>THE COLLECTION</small>
                <b>✧</b>
              </div>
              <div>
                BC<small>THE COLLECTION</small>
                <b>✧</b>
              </div>
              <div>
                BC<small>THE COLLECTION</small>
                <b>✧</b>
              </div>
            </div>
          </div>
          <span className="login-footer">BANNED CARDS / ADMINISTRATION</span>
        </section>
        <section className="login-form">
          <div>
            <span className="eyebrow">ADMIN ACCESS</span>
            <h2>Welcome back.</h2>
            <p className="muted">Sign in to manage Banned Cards.</p>
            <form onSubmit={login}>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@bannedcards.com"
                  required
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                />
              </label>
              {error && (
                <div role="alert" className="alert error">
                  {error}
                </div>
              )}
              <button className="primary full" disabled={busy}>
                {busy ? "Signing in…" : "Enter control room →"}
              </button>
            </form>
            <p className="access-note">
              Access is restricted to assigned CMS accounts. Contact your administrator for access.
            </p>
          </div>
        </section>
      </main>
    );
  const title =
    page === "settings"
      ? "Workspace"
      : page === "import"
        ? "Import set"
        : page === "card_import"
          ? "Import cards"
          : navigation.find((n) => n.id === page)?.label;
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Banned Cards home">
          <div className="brand-mark">
            B<span>↗</span>
          </div>
          <div>
            BANNED CARDS<small>CONTROL ROOM</small>
          </div>
        </a>
        <div className="workspace">
          <span className="workspace-icon">BC</span>
          <div>
            Banned Cards<small>Store administration</small>
          </div>
          <span className="live-dot" />
        </div>
        <nav aria-label="Main navigation">
          {["Stock", "Administration"].map(group => {
            const items = navigation.filter(n => n.group === group && (permissions.admin || permissions.sections.includes(n.id)));
            return items.length > 0 && <section className="nav-group" key={group} aria-label={group}>
              <h2 className="nav-label">{group}</h2>
              {items.map(n => <button
                key={n.id}
                className={page === n.id ? "active" : ""}
                onClick={() => go(n.id)}
              >
                <span><NavigationIcon name={n.id}/></span>
                {n.label}
              </button>)}
            </section>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="tip">
            <span>✧</span>
            <b>Make room for the next set.</b>
            <p>Import a whole set, then add the stock you have on hand.</p>
            <button onClick={() => go("sets")}>Browse sets ↗</button>
          </div>
          <button className="workspace-link" onClick={() => go("settings")}>
            ⚙ Workspace & access
          </button>
          <div className="profile">
            <span className="avatar">{email.slice(0, 2).toUpperCase()}</span>
            <div>
              <b>{permissions.admin ? "Administrator" : "Team member"}</b>
              <small title={email}>{email}</small>
            </div>
            <button
              onClick={logout}
              disabled={busy}
              aria-label="Sign out"
              title="Sign out"
            >
              ↪
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span>
            Workspace <i>/</i> <b>{title}</b>
          </span>
          <div className="topbar-actions">
            <span className="admin-badge">
              <span className="live-dot" /> Admin access
            </span>
            <button className="text-button" onClick={logout} disabled={busy}>
              Sign out
            </button>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                BANNED CARDS /{" "}
                {page === "overview" ? "AT A GLANCE" : "OPERATIONS"}
              </span>
              <h1>
                {page === "overview" ? "Your collection, in motion." : title}
              </h1>
              <p>
                {
                  {
                    storefront: "Choose which sections customers can see.",
                    users: "Manage user access to sections and warehouses.",
                    stores: "Choose the warehouses each storefront can sell from.",
                    pricing: "Set card conversion rates and minimum prices.",
                    backups: "Protect and restore your store data.",
                    overview:
                      "A clear view of what’s in store and what’s next.",
                    cards: "Every printing, ready for its next collector.",
                    sets: "The building blocks of your card catalog.",
                    stock: "Receive new stock and keep your shelves in sync.",
                    sealed:
                      "Manage sealed groups, products, prices and warehouse stock.",
                    custom:
                      "Sell your own token packs, custom decks and other made-in-house products.",
                    accessories:
                      "Sleeves, dice, playmats and other playing accessories.",
                    orders: "Follow every order, from checkout to completion.",
                    import:
                      "Bring entire sets and their card printings into your catalog.",
                    card_import: "Receive stock from a list of cards.",
                    settings: "Your connection and administrator access.",
                  }[page]
                }
              </p>
            </div>
            {(page === "cards" || page === "sets") && (
              <button
                className="primary"
                onClick={() => go(page === "cards" ? "card_import" : "import")}
              >
                ＋ {page === "cards" ? "Import cards" : "Import set"}
              </button>
            )}
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button onClick={() => setRevision((x) => x + 1)}>Retry</button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              ✓ {notice}
            </div>
          )}
          {page === "storefront" && <StorefrontSections/>}
          {page === "pricing" && permissions.admin && <PricingSettings request={api}/>}
          {page === "backups" && permissions.admin && <DatabaseBackups request={api}/>}
          {page === "users" && permissions.admin && <CmsUsers request={api} locations={locations}/>}
          {page === "stores" && permissions.admin && <StoresWarehouses request={api} onWarehousesChanged={()=>{api("data?resource=locations").then(d=>setLocations(d.rows)).catch(fail)}}/>}
          {["cards","stock","card_import","sealed","custom","accessories"].includes(page) && <label className="table-toolbar">{page === "stock" ? "Warehouse" : "Default warehouse"}<select aria-label="Default warehouse" value={warehouse} onChange={e=>{setWarehouse(e.target.value);if(page === "stock")setOffset(0)}}>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
          {page === "overview" && (
            <>
              <div className="stats">
                {[
                  {
                    label: "Card printings",
                    key: "cards",
                    icon: "▤",
                    sub: "In your catalog",
                  },
                  {
                    label: "Imported sets",
                    key: "sets",
                    icon: "◈",
                    sub: "Ready to browse",
                  },
                  {
                    label: "Stock listings",
                    key: "listings",
                    icon: "▦",
                    sub: "Unique sellable variants",
                  },
                  {
                    label: "Open orders",
                    key: "openOrders",
                    icon: "▣",
                    sub: "Waiting for your next move",
                  },
                ].map((s) => (
                  <div className="stat" key={s.key}>
                    <div>
                      {s.label}
                      <span>{s.icon}</span>
                    </div>
                    <strong>
                      {loading ? "—" : (stats[s.key]?.toLocaleString() ?? "—")}
                    </strong>
                    <small>{s.sub}</small>
                  </div>
                ))}
              </div>
              <section className="overview-grid">
                <div className="hero-panel">
                  <span className="eyebrow">GROW YOUR CATALOG</span>
                  <h2>
                    New set.
                    <br />
                    New possibilities.
                  </h2>
                  <p>
                    Load a complete Magic set from Scryfall.
                    <br />
                    Card names, printings and artwork, together.
                  </p>
                  <button className="primary" onClick={() => go("sets")}>
                    Browse sets <span>↗</span>
                  </button>
                  <div className="hero-symbol" aria-hidden="true">
                    ✧
                  </div>
                  <div className="hero-bottom">
                    CATALOG TOOLS <span>01 / BULK IMPORT</span>
                  </div>
                </div>
                <div className="panel quick">
                  <div className="section-head">
                    <h2>Keep things moving</h2>
                    <span>↗</span>
                  </div>
                  {[
                    {
                      p: "cards" as Page,
                      n: "01",
                      title: "List your cards",
                      text: "Choose a printing and add sellable stock.",
                    },
                    {
                      p: "stock" as Page,
                      n: "02",
                      title: "Receive inventory",
                      text: "Add new arrivals to an existing SKU.",
                    },
                    {
                      p: "orders" as Page,
                      n: "03",
                      title: "Review open orders",
                      text: "See what needs your attention.",
                    },
                  ].map((x) => (
                    <button key={x.n} onClick={() => go(x.p)}>
                      <span>{x.n}</span>
                      <div>
                        <b>{x.title}</b>
                        <small>{x.text}</small>
                      </div>
                      <i>↗</i>
                    </button>
                  ))}
                </div>
              </section>
              <div className="info-strip">
                <span>ⓘ</span>
                <div>
                  <b>One catalog. One source of truth.</b>
                  <p>
                    Imports and inventory changes are saved to your Banned Cards
                    server.
                  </p>
                </div>
                <span className="pill">MEDUSA COMMERCE</span>
              </div>
            </>
          )}
          {(page === "import" || page === "card_import") && (
            <button
              className="text-button"
              onClick={() => go(page === "import" ? "sets" : "cards")}
            >
              ← Back to {page === "import" ? "sets" : "card catalog"}
            </button>
          )}
          {(page === "sealed" || page === "custom" || page === "accessories") && (
            <SealedProducts key={page} section={page} request={api} locations={locations} defaultWarehouse={warehouse} canCreate={page === "sealed" ? permissions.admin || permissions.canCreateSealed === true : true} />
          )}
          {page === "card_import" && (
            <CardImport locations={locations} request={api} defaultWarehouse={warehouse} />
          )}
          {page === "import" && (
            <div className="import-grid">
              <section className="panel import-form">
                <div className="section-head">
                  <h2>Import set printings</h2>
                  <span className="pill">SCRYFALL</span>
                </div>
                <p className="muted">
                  Enter up to 10 set codes. Each set imports all its card
                  printings. Existing printings are updated safely by Scryfall
                  ID. Base prices refresh using your pricing settings, rounded
                  up to your configured increment. Custom prices are kept.
                </p>
                <form onSubmit={runImport}>
                  <label>
                    Set codes
                    <textarea
                      required
                      value={codes}
                      onChange={(e) => setCodes(e.target.value)}
                      placeholder={"LTR, MH3, DSK"}
                      rows={4}
                    />
                  </label>
                  <small className="muted">
                    Separate codes with commas, spaces, or new lines.
                  </small>
                  <div className="import-summary">
                    <span>◈</span>
                    <div>
                      <b>Catalog import only</b>
                      <p>
                        After importing, create listings to set condition,
                        finish, price and available stock.
                      </p>
                    </div>
                  </div>
                  <button className="primary" disabled={busy || !codes.trim()}>
                    {busy
                      ? "Importing sets… this can take several minutes"
                      : "↥ Start import"}
                  </button>
                </form>
                {busy && (
                  <p role="status" className="muted">
                    Keep this page open while cards are imported and their
                    images are copied to your storage.
                  </p>
                )}
                {results.length > 0 && (
                  <div className="results" role="status">
                    {results.map((r) => (
                      <div key={r.code}>
                        <b>
                          {r.ok ? "✓" : "!"} {r.code.toUpperCase()}
                        </b>
                        <span>
                          {r.ok ? "Imported successfully" : r.message}
                        </span>
                      </div>
                    ))}
                    <button className="secondary" onClick={() => go("cards")}>
                      View card catalog →
                    </button>
                  </div>
                )}
              </section>
              <aside className="panel guide">
                <span className="eyebrow">HOW IT WORKS</span>
                <h2>From set to shelf.</h2>
                {[
                  [
                    "01",
                    "Import a set",
                    "We fetch set details and printings, then copy card images to your storage.",
                  ],
                  [
                    "02",
                    "Create a listing",
                    "Pick a card, condition, language and finish.",
                  ],
                  [
                    "03",
                    "Add your stock",
                    "Choose a warehouse and price it in CLP.",
                  ],
                ].map(([n, t, d]) => (
                  <div key={n}>
                    <span>{n}</span>
                    <h3>{t}</h3>
                    <p>{d}</p>
                  </div>
                ))}
              </aside>
            </div>
          )}
          {["cards", "sets", "stock", "orders"].includes(page) && (
            <section className="panel table-panel">
              <div className="table-toolbar">
                <div className="tabs">
                  {page === "orders" ? (
                    ["open", "closed"].map((s) => (
                      <button
                        key={s}
                        className={orderStatus === s ? "selected" : ""}
                        onClick={() => {
                          setOrderStatus(s);
                          setOffset(0);
                        }}
                      >
                        {s === "open" ? "Open orders" : "Closed orders"}
                      </button>
                    ))
                  ) : (
                    <b>
                      {page === "cards"
                        ? "All printings"
                        : page === "sets"
                          ? "Set families · newest first"
                          : "Stock listings"}{" "}
                      <span className="count">{count}</span>
                    </b>
                  )}
                </div>
                {(page === "cards" || page === "stock") && (
                  <label className="set-filter">
                    Set
                    <select
                      aria-label="Filter by set"
                      value={setFilter}
                      onChange={(e) => {
                        setSetFilter(e.target.value);
                        setPrintingFilter(null);
                        setOffset(0);
                      }}
                    >
                      <option value="">All sets</option>
                      {setOptions.map((set) => (
                        <option key={set.id} value={set.id}>
                          {set.name} ({set.code?.toUpperCase()})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {(page === "cards" || page === "stock" || page === "sets") && (
                  <form
                    className="search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setOffset(0);
                      setSearch(query);
                    }}
                  >
                    <input
                      aria-label={
                        page === "cards" ? "Search card names" : page === "sets" ? "Search sets by name or code" : "Search SKU"
                      }
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={
                        page === "cards"
                          ? "Search card names…"
                          : page === "sets"
                            ? "Set name or code (e.g. LTR)…"
                            : "Search by SKU…"
                      }
                    />
                    <button aria-label="Search">⌕</button>
                  </form>
                )}
                {page === "sets" && (
                  <SetSync request={api} onDone={() => setRevision((x) => x + 1)} />
                )}
                <button
                  className="secondary"
                  title="Reloads this table from your database. Does not contact Scryfall."
                  onClick={() => setRevision((x) => x + 1)}
                  disabled={loading}
                >
                  ↻ Reload table
                </button>
              </div>
              {page === "stock" && printingFilter && (
                <div className="filter-banner">
                  <span>
                    Stock for <b>{printingFilter.name}</b> ·{" "}
                    {printingFilter.set_code?.toUpperCase()}
                  </span>
                  <button
                    className="text-button"
                    onClick={() => {
                      setPrintingFilter(null);
                      setOffset(0);
                    }}
                  >
                    Show all inventory
                  </button>
                </div>
              )}
              <div className="table-scroll">
                <table
                  className={page === "cards" ? "catalogue-table" : undefined}
                >
                  <thead>
                    <tr>
                      {(page === "cards"
                        ? [
                            "Card",
                            "SKU",
                            "Set",
                            "Collector no.",
                            "Rarity",
                            "Actions",
                          ]
                        : page === "sets"
                          ? [
                              "Main set & divisions",
                              "Code",
                              "Release date ↓",
                              "Visible in filters",
                              "Actions",
                            ]
                          : page === "stock"
                            ? [
                                "Card / SKU",
                                "Set",
                                "Condition",
                                "Price",
                                "Available / reserved",
                                "Actions",
                              ]
                            : [
                                "Order",
                                "Customer",
                                "Date",
                                "Status",
                                "Payment",
                                "Total",
                                "",
                              ]
                      ).map((s, i) => (
                        <th key={i}>{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!loading &&
                      rows.map((r, index) => (
                        <Fragment key={r.id}>
                          {(page === "cards" || page === "stock") &&
                            (index === 0 ||
                              rows[index - 1].set_id !== r.set_id) && (
                              <tr className="set-heading">
                                <th colSpan={6} scope="colgroup">
                                  {r.set_name || "Unknown set"}{" "}
                                  <small>{r.set_code?.toUpperCase()}</small>
                                </th>
                              </tr>
                            )}
                          <tr>
                            {page === "cards" ? (
                              <>
                                <td>
                                  <div className="card-cell">
                                    {r.image_small_url ? (
                                      <img src={r.image_small_url} alt="" />
                                    ) : (
                                      <span className="card-placeholder">
                                        ✧
                                      </span>
                                    )}
                                    <div>
                                      <b>{r.name}</b>
                                      <small>{r.id}</small>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <InlineField
                                    initial={r.card_sku || ""}
                                    label={`SKU for ${r.name} #${r.collector_number}`}
                                    placeholder="Optional SKU"
                                    save={async (value) => {
                                      await api("data", {
                                        action: "card_sku",
                                        printing_id: r.id,
                                        sku: value,
                                      });
                                      r.card_sku = value || null;
                                      setNotice(
                                        "Card SKU saved for all conditions and languages.",
                                      );
                                    }}
                                  />
                                </td>
                                <td>
                                  <span className="pill" title={r.set_name}>
                                    {r.set_code?.toUpperCase() || "—"}
                                  </span>
                                </td>
                                <td>#{r.collector_number}</td>
                                <td>
                                  <span className="pill capitalize">
                                    {r.rarity || "—"}
                                  </span>
                                </td>
                                <td>
                                  <ConditionStock
                                    printing={r}
                                    locations={locations}
                                    defaultWarehouse={warehouse}
                                    revision={revision}
                                    notify={setNotice}
                                  />
                                </td>
                              </>
                            ) : page === "sets" ? (
                              <>
                                <td>
                                  <details className="set-family">
                                    <summary>
                                      <b>{r.name}</b>
                                      <small>
                                        {r.divisions?.length || 1}{" "}
                                        {(r.divisions?.length || 1) === 1
                                          ? "division"
                                          : "divisions"}
                                      </small>
                                    </summary>
                                    <ul>
                                      {(r.divisions || []).map((division) => (
                                        <li key={division.id}>
                                          <div>
                                            <b>{division.name}</b>
                                            <small>
                                              {division.code.toUpperCase()} ·{" "}
                                              {date(
                                                division.released_at ||
                                                  undefined,
                                              )}
                                            </small>
                                          </div>
                                          <label className="visibility-toggle">
                                            <input
                                              type="checkbox"
                                              aria-label={`Show ${division.name} in filters`}
                                              checked={
                                                r.isVisible !== false &&
                                                division.isVisible !== false
                                              }
                                              disabled={
                                                busy || r.isVisible === false
                                              }
                                              onChange={(e) =>
                                                setVisibility(
                                                  division.id,
                                                  e.target.checked,
                                                )
                                              }
                                            />
                                            {r.isVisible === false
                                              ? "Hidden with family"
                                              : "Visible"}
                                          </label>
                                          <button
                                            className="text-button"
                                            onClick={() => {
                                              setNotice(
                                                "Set selected. Use Import set above.",
                                              );
                                              setCodes(division.code);
                                            }}
                                          >
                                            Select for import
                                          </button>
                                          <button className="text-button" onClick={()=>setPriceSet(division)}>Check prices</button>
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                </td>
                                <td>
                                  <span className="pill">
                                    {r.code?.toUpperCase()}
                                  </span>
                                </td>
                                <td>{date(r.released_at)}</td>
                                <td>
                                  <label className="visibility-toggle">
                                    <input
                                      type="checkbox"
                                      aria-label={`Show ${r.name} family in filters`}
                                      checked={r.isVisible !== false}
                                      disabled={busy}
                                      onChange={(e) =>
                                        setVisibility(r.id, e.target.checked)
                                      }
                                    />
                                    Visible
                                  </label>
                                </td>
                                <td>
                                  <button
                                    className="text-button"
                                    onClick={() => {
                                      setNotice(
                                        "Set selected. Use Import set above.",
                                      );
                                      setCodes(r.code || "");
                                    }}
                                  >
                                    Select for import
                                  </button>
                                  <button className="text-button" onClick={()=>setPriceSet(r)}>Check prices</button>
                                </td>
                              </>
                            ) : page === "stock" ? (
                              <>
                                <td>
                                  <b>{r.name}</b>
                                  <small>
                                    #{r.collector_number} · {r.sku}
                                  </small>
                                </td>
                                <td>
                                  <span className="pill" title={r.set_name}>
                                    {r.set_code?.toUpperCase() || "—"}
                                  </span>
                                </td>
                                <td className="capitalize">
                                  {human(r.condition)}
                                  <small>
                                    {r.language} · {human(r.finish)}
                                  </small>
                                </td>
                                <td>{money(r.price_clp)}</td>
                                <td>
                                  <span
                                    className={
                                      (r.levels || []).reduce(
                                        (n, l) =>
                                          n + Number(l.available_quantity),
                                        0,
                                      ) <= 3
                                        ? "stock-low"
                                        : "stock-good"
                                    }
                                  >
                                    {(r.levels || []).reduce(
                                      (n, l) =>
                                        n + Number(l.available_quantity),
                                      0,
                                    )}{" "}
                                    available
                                  </span>
                                  <small>
                                    {(r.levels || []).reduce(
                                      (n, l) => n + Number(l.reserved_quantity),
                                      0,
                                    )}{" "}
                                    reserved
                                  </small>
                                </td>
                                <td>
                                  <button
                                    className="text-button"
                                    onClick={() => {
                                      setSelected(r);
                                      setWarehouse(v=>v || locations[0]?.id || "");
                                      setModal("receive");
                                      setError("");
                                    }}
                                  >
                                    ＋ Receive stock
                                  </button>
                                  <button
                                    className="text-button subtract-button"
                                    disabled={
                                      !(r.levels || []).some(
                                        (level) =>
                                          Number(level.available_quantity) > 0,
                                      )
                                    }
                                    onClick={() => {
                                      setSelected(r);
                                      setWarehouse(v=>v || locations[0]?.id || "");
                                      setModal("subtract");
                                      setError("");
                                    }}
                                  >
                                    − Subtract stock
                                  </button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td>
                                  <b>#{r.display_id}</b>
                                </td>
                                <td>{r.email}</td>
                                <td>{date(r.created_at)}</td>
                                <td>
                                  <span className="pill capitalize">
                                    {human(r.status)}
                                  </span>
                                </td>
                                <td>
                                  <span className={`pill payment-pill payment-${r.payment === "paid" ? "paid" : "unpaid"}`}>
                                    {r.payment === "paid" ? "Paid" : "Not paid"}
                                  </span>
                                  {r.test_order && <small className="muted"> test</small>}
                                </td>
                                <td>{money(r.total, r.currency_code)}</td>
                                <td>
                                  <button
                                    className="text-button"
                                    onClick={() => {
                                      setSelected(r);
                                      setModal("order");
                                    }}
                                  >
                                    View →
                                  </button>
                                </td>
                              </>
                            )}
                          </tr>
                        </Fragment>
                      ))}
                  </tbody>
                </table>
              </div>
              {loading ? (
                <div className="empty" role="status">
                  <span className="spinner" />
                  Loading {page}…
                </div>
              ) : (
                rows.length === 0 && (
                  <div className="empty">
                    <span>◈</span>
                    <h3>
                      {error
                        ? "Data could not be loaded"
                        : search
                          ? "No matches found"
                          : `No ${page === "orders" ? orderStatus + " orders" : page} yet`}
                    </h3>
                    <p>
                      {search
                        ? "Try a different search."
                        : page === "orders"
                          ? "Orders will appear here when customers check out."
                          : page === "stock"
                            ? "Choose a card in the catalog to create your first listing."
                            : "Start by importing a set to build your catalog."}
                    </p>
                    {!error && page !== "orders" && (
                      <button
                        className="secondary"
                        onClick={() => go(page === "stock" ? "cards" : "sets")}
                      >
                        {page === "stock" ? "Browse cards" : "Browse sets"} →
                      </button>
                    )}
                  </div>
                )
              )}
              <footer className="pagination">
                <span>
                  {count
                    ? `${offset + 1}–${Math.min(offset + 30, count)} of ${count}`
                    : "0 results"}
                </span>
                <div>
                  <button
                    className="secondary"
                    disabled={offset === 0 || loading}
                    onClick={() => setOffset((x) => Math.max(0, x - 30))}
                  >
                    ← Previous
                  </button>
                  <button
                    className="secondary"
                    disabled={offset + 30 >= count || loading}
                    onClick={() => setOffset((x) => x + 30)}
                  >
                    Next →
                  </button>
                </div>
              </footer>
            </section>
          )}
          {priceSet && <SetPrices set={priceSet} request={api} onClose={()=>setPriceSet(null)}/>}
          {page === "settings" && (
            <section className="panel settings">
              <h2>Workspace & access</h2>
              <dl>
                <dt>Commerce backend</dt>
                <dd>
                  Banned Cards server (configured with MEDUSA_BACKEND_URL)
                </dd>
                <dt>Signed in as</dt>
                <dd>{email}</dd>
                <dt>Permission</dt>
                <dd>
                  <span className="pill">{permissions.admin ? "Administrator" : "Assigned sections and warehouses"}</span>
                </dd>
                <dt>Currency</dt>
                <dd>Chilean peso · CLP</dd>
              </dl>
              <h3>Administrator access</h3>
              <p>
                CMS access is checked against the server user record on every
                request. A server administrator can grant or revoke access with
                the <code>set-cms-admin.ts</code> command.
              </p>
              <h3>Warehouses</h3>
              {locations.length ? (
                <ul>
                  {locations.map((l) => (
                    <li key={l.id}>{l.name}</li>
                  ))}
                </ul>
              ) : (
                <p>
                  No warehouses configured. Create and connect a stock location
                  to your sales channel in Medusa before receiving stock.
                </p>
              )}
            </section>
          )}
          <footer className="page-footer">
            <span>
              BANNED CARDS <i>/</i> CONTROL ROOM
            </span>
            <span>A little order for your collection.</span>
          </footer>
        </main>
      </div>
      {modal && selected && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="modal-close"
              aria-label="Close dialog"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              ×
            </button>
            <span className="eyebrow">
              {modal === "order" ? "ORDER DETAILS" : "INVENTORY"}
            </span>
            <h2 id="modal-title">
              {modal === "listing"
                ? "Create a listing"
                : modal === "receive"
                  ? "Receive new stock"
                  : modal === "subtract"
                    ? "Subtract stock"
                    : `Order #${selected.display_id}`}
            </h2>
            <p className="muted">{selected.name || selected.email}</p>
            {error && (
              <div role="alert" className="alert error">
                {error}
              </div>
            )}
            {modal === "order" ? (
              <>
                <dl>
                  <dt>Status</dt>
                  <dd className="capitalize">{human(selected.status)}</dd>
                  <dt>Placed</dt>
                  <dd>{date(selected.created_at)}</dd>
                  <dt>Payment</dt>
                  <dd>
                    <span className={`pill payment-pill payment-${selected.payment === "paid" ? "paid" : "unpaid"}`}>
                      {selected.payment === "paid" ? "Paid" : "Not paid"}
                    </span>{" "}
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={async () => {
                        const paid = selected.payment !== "paid";
                        setBusy(true);
                        setError("");
                        try {
                          await api("data", { action: "order_payment", order_id: selected.id, paid });
                          const next = { ...selected, payment: paid ? ("paid" as const) : ("not_paid" as const) };
                          setSelected(next);
                          setRows((current) => current.map((row) => (row.id === next.id ? { ...row, payment: next.payment } : row)));
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Could not update the payment status");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {selected.payment === "paid" ? "Mark as not paid" : "Mark as paid"}
                    </button>
                  </dd>
                  <dt>Total</dt>
                  <dd>{money(selected.total, selected.currency_code)}</dd>
                </dl>
                <h3>Items</h3>
                {selected.items?.map((i) => (
                  <div className="order-item" key={i.id}>
                    <span>
                      {i.quantity} × {i.title}
                    </span>
                    <b>
                      {money(i.unit_price * i.quantity, selected.currency_code)}
                    </b>
                  </div>
                ))}
                <h3>Shipping address</h3>
                <p>
                  {selected.shipping_address
                    ? [
                        [selected.shipping_address.first_name, selected.shipping_address.last_name].filter(Boolean).join(" "),
                        [selected.shipping_address.address_1, selected.shipping_address.address_2].filter(Boolean).join(", "),
                        [selected.shipping_address.city, selected.shipping_address.province].filter(Boolean).join(", "),
                        selected.shipping_address.country_code?.toUpperCase(),
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "No shipping address"}
                </p>
                {(selected.shipping_address?.phone || selected.metadata?.contact_phone) && (
                  <p className="muted">Phone: {selected.shipping_address?.phone || selected.metadata?.contact_phone}</p>
                )}
                {selected.metadata?.shipping_method && (
                  <p className="muted">
                    Shipping: Starken · pay on delivery
                    {selected.metadata.starken_branch ? ` · Branch: ${selected.metadata.starken_branch}` : ""}
                  </p>
                )}
                {selected.metadata?.document_type && (
                  <>
                    <h3>Tax document</h3>
                    <p>
                      <b>{selected.metadata.document_type === "factura" ? "Factura" : "Boleta"}</b> · RUT {selected.metadata.document_rut}
                    </p>
                    {selected.metadata.company && (
                      <p className="muted">
                        {[selected.metadata.company.name, selected.metadata.company.activity, selected.metadata.company.address, selected.metadata.company.comuna]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </>
                )}
                {selected.metadata?.customer_notes && (
                  <>
                    <h3>Customer notes</h3>
                    <p>{selected.metadata.customer_notes}</p>
                  </>
                )}
              </>
            ) : (
              <form onSubmit={save}>
                {modal === "listing" && (
                  <>
                    <label>
                      SKU
                      <input
                        name="sku"
                        required
                        maxLength={120}
                        placeholder="e.g. LTR-001-NM-EN-NF"
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        Condition
                        <select
                          name="condition"
                          defaultValue={listingCondition}
                        >
                          {[
                            "near_mint",
                            "lightly_played",
                            "moderately_played",
                            "heavily_played",
                            "damaged",
                          ].map((v) => (
                            <option key={v} value={v}>
                              {human(v)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Finish
                        <select name="finish">
                          {["non_foil", "foil", "etched", "other"].map((v) => (
                            <option key={v} value={v}>
                              {human(v)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Language
                        <input
                          name="language"
                          defaultValue="English"
                          maxLength={60}
                          required
                        />
                      </label>
                      <label>
                        Price (CLP)
                        <input
                          name="price_clp"
                          type="number"
                          min="1"
                          max="100000000"
                          step="1"
                          required
                        />
                      </label>
                    </div>
                  </>
                )}
                <div className="form-grid">
                  <label>
                    {modal === "subtract"
                      ? "Quantity to subtract"
                      : "Quantity to add"}
                    <input
                      autoFocus={modal === "receive" || modal === "subtract"}
                      name="quantity"
                      type="number"
                      min="1"
                      max={
                        modal === "subtract"
                          ? Math.max(
                              0,
                              Number(
                                selected.levels?.find(
                                  (l) => l.location_id === warehouse,
                                )?.available_quantity || 0,
                              ),
                            )
                          : 1000000
                      }
                      step="1"
                      required
                      defaultValue="1"
                    />
                  </label>
                  <label>
                    Warehouse
                    <select
                      name="location_id"
                      required
                      value={warehouse}
                      onChange={(e) => setWarehouse(e.target.value)}
                    >
                      <option value="" disabled>
                        Select warehouse
                      </option>
                      {locations
                        .filter(
                          (l) =>
                            modal !== "subtract" ||
                            selected.levels?.some(
                              (level) =>
                                level.location_id === l.id &&
                                Number(level.available_quantity) > 0,
                            ),
                        )
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                {modal === "subtract" && (
                  <p className="muted">
                    {warehouse
                      ? `${Math.max(0, Number(selected.levels?.find((l) => l.location_id === warehouse)?.available_quantity || 0))} units available at this warehouse. `
                      : "Choose a warehouse. "}
                    Reserved units cannot be subtracted. This updates available
                    stock immediately.
                  </p>
                )}
                {!locations.length && (
                  <p className="alert error">
                    Create a warehouse in Medusa before adding stock.
                  </p>
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => setModal(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !locations.length ||
                      (modal === "subtract" && !warehouse)
                    }
                  >
                    {busy
                      ? "Saving…"
                      : modal === "listing"
                        ? "Create listing & add stock"
                        : modal === "subtract"
                          ? "Subtract stock"
                          : "Receive stock"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

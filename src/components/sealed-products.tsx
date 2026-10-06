"use client";
import { useEffect, useRef, useState } from "react";
import SealedFinder from "./sealed-finder";
import InlineField from "./inline-field";
type Category = {
  id: string;
  name: string;
  handle: string;
  parent_category_id?: string;
};
type Variant = {
  id: string;
  title: string;
  sku?: string;
  price_clp: number | null;
  stock_editable: boolean;
  levels: {
    location_id: string;
    available_quantity: number;
    reserved_quantity: number;
  }[];
};
type Product = {
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;
  status: string;
  metadata: Record<string, unknown>;
  categories: Category[];
  variants: Variant[];
};
type Form = {
  title: string;
  description: string;
  thumbnail: string;
  status: string;
  category_id: string;
  set: string;
  set_code: string;
  language: string;
  sku: string;
  price_clp: string;
};
const blank: Form = {
  title: "",
  description: "",
  thumbnail: "",
  status: "draft",
  category_id: "",
  set: "",
  set_code: "",
  language: "English",
  sku: "",
  price_clp: "",
};
export default function SealedProducts({
  request,
  locations,
  defaultWarehouse,
  canCreate,
}: {
  request: (path: string, body?: unknown) => Promise<any>;
  locations: { id: string; name?: string }[];
  defaultWarehouse: string;
  canCreate: boolean;
}) {
  const [finder, setFinder] = useState(false);
  const [rows, setRows] = useState<Product[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [count, setCount] = useState(0);
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [group, setGroup] = useState(""),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Product | null | undefined>(undefined),
    [form, setForm] = useState<Form>(blank);
  const [warehouse, setWarehouse] = useState(""),
    [quantity, setQuantity] = useState("1");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (editing !== undefined) dialog.current?.showModal();
    else dialog.current?.close();
  }, [editing]);
  const active = useRef(false);
  const location = warehouse || defaultWarehouse || locations[0]?.id || "";
  useEffect(()=>setWarehouse(""),[defaultWarehouse]);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    request(
      `data?resource=sealed&offset=${offset}&q=${encodeURIComponent(search)}&category_id=${encodeURIComponent(group)}`,
    )
      .then((d) => {
        if (current) {
          setRows(d.rows);
          setCount(d.count);
          setCategories(d.categories);
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [search, group, offset, revision, request]);
  const [rowBusy, setRowBusy] = useState("");
  async function mutate(body: any) {
    if (active.current) throw new Error("An update is already running.");
    active.current = true;
    const inline = ["sealed_stock", "sealed_status", "sealed_price"].includes(
      body.action,
    );
    if (inline) setRowBusy(body.variant_id || body.product_id);
    else setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request("data", body);
      if (inline)
        setRows((current) =>
          current.map((p) =>
            p.id !== body.product_id
              ? p
              : {
                  ...p,
                  status:
                    body.action === "sealed_status" ? body.status : p.status,
                  variants: p.variants.map((v) =>
                    v.id !== body.variant_id
                      ? v
                      : {
                          ...v,
                          ...(body.action === "sealed_price"
                            ? { price_clp: body.price_clp }
                            : {}),
                          ...(body.action === "sealed_stock"
                            ? { levels: result.levels }
                            : {}),
                        },
                  ),
                },
          ),
        );
      else setRevision((x) => x + 1);
      setNotice(
        "Saved. Storefront uses these same products, prices and stock.",
      );
    } catch (e) {
      setError(
        (e as Error).message +
          " Refresh before repeating an uncertain adjustment.",
      );
      throw e;
    } finally {
      active.current = false;
      setBusy(false);
      setRowBusy("");
    }
  }
  function edit(p: Product | null) {
    setEditing(p);
    setForm(
      p
        ? {
            ...blank,
            title: p.title,
            description: p.description || "",
            thumbnail: p.thumbnail || "",
            status: p.status === "published" ? "published" : "draft",
            category_id:
              p.categories.find((c) => c.handle !== "sealed-products")?.id ||
              "",
            set: String(p.metadata?.set || ""),
            set_code: String(p.metadata?.set_code || ""),
            language: String(p.metadata?.language || "English"),
          }
        : blank,
    );
  }
  const field = (key: keyof Form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <>
      {finder && canCreate && (
        <SealedFinder
          request={request}
          onSaved={() => setRevision((x) => x + 1)}
          onClose={() => setFinder(false)}
        />
      )}
      {canCreate && <div className="table-toolbar">
        <button className="primary" onClick={() => setFinder(true)}>
          Find products by set
        </button>
        <button
          className="primary"
          disabled={busy || !categories.length}
          onClick={() => edit(null)}
        >
          ＋ New sealed product
        </button>

      </div>}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="alert" role="status">
          {notice}
        </p>
      )}
      <dialog ref={dialog} className="sealed-dialog" aria-labelledby="sealed-dialog-title" onCancel={e => { if (busy) e.preventDefault(); else setEditing(undefined); }}>
      {editing !== undefined && (
        <form
          className="panel import-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await mutate({
                ...form,
                action: editing ? "sealed_save" : "sealed_create",
                product_id: editing?.id,
                price_clp: Number(form.price_clp),
              });
              setEditing(undefined);
            } catch {}
          }}
        >
          <h2 id="sealed-dialog-title">{editing ? "Edit sealed product" : "New sealed product"}</h2>
          {error && <p className="alert error" role="alert">{error}</p>}
          <div className="sealed-form-grid">
            <label>
              Product name
              <input
                required
                maxLength={200}
                value={form.title}
                onChange={(e) => field("title", e.target.value)}
              />
            </label>
            <label>
              Group
              <select
                required
                value={form.category_id}
                onChange={(e) => field("category_id", e.target.value)}
              >
                <option value="">Select group</option>
                {categories
                  .filter((c) => c.handle !== "sealed-products")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(e) => field("status", e.target.value)}
              >
                <option value="draft">Draft — hidden from store</option>
                <option value="published">Published</option>
              </select>
            </label>
            <label>
              Set name
              <input
                value={form.set}
                onChange={(e) => field("set", e.target.value)}
              />
            </label>
            <label>
              Set code
              <input
                value={form.set_code}
                onChange={(e) => field("set_code", e.target.value)}
              />
            </label>
            {!editing && (
              <>
                <label>
                  Language
                  <input
                    required
                    value={form.language}
                    onChange={(e) => field("language", e.target.value)}
                  />
                </label>
                <label>
                  SKU (optional)
                  <input
                    value={form.sku}
                    onChange={(e) => field("sku", e.target.value)}
                  />
                </label>
                <label>
                  Price (CLP)
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={form.price_clp}
                    onChange={(e) => field("price_clp", e.target.value)}
                  />
                </label>
              </>
            )}
            <label>
              Product image URL
              <input
                value={form.thumbnail}
                onChange={(e) => field("thumbnail", e.target.value)}
                placeholder="Your storage image URL"
              />
            </label>
          </div>
          <label>
            Description
            <textarea
              value={form.description}
              onChange={(e) => field("description", e.target.value)}
            />
          </label>
          {!editing && (
            <p className="muted">
              Created with zero stock. Receive stock below after saving.
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save product"}
          </button>{" "}
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setEditing(undefined)}
          >
            Cancel
          </button>
        </form>
      )}
      </dialog>
      <section className="panel table-panel">
        <div className="table-toolbar">
          <label>
            Group
            <select
              aria-label="Sealed group"
              value={group}
              onChange={(e) => {
                setGroup(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All sealed groups</option>
              {categories
                .filter((c) => c.handle !== "sealed-products")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(query);
              setOffset(0);
            }}
          >
            <input
              aria-label="Search sealed products"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sealed products…"
            />
            <button className="primary">Search</button>
          </form>
          <label>
            Warehouse
            <select
              value={location}
              onChange={(e) => setWarehouse(e.target.value)}
            >
              <option value="">Select warehouse</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name || l.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Adjustment quantity
            <input
              type="number"
              min="1"
              max="10000"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
        </div>
        {loading ? (
          <p role="status" className="empty">
            Loading sealed products…
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Product / group</th>
                  <th>Status</th>
                  <th>Variant / SKU</th>
                  <th>Price CLP</th>
                  <th>Warehouse stock</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.flatMap((p) =>
                  p.variants.map((v, i) => (
                    <tr key={v.id}>
                      <td>
                        {i === 0 && (
                          <>
                            <button
                              className="text-button"
                              onClick={() => edit(p)}
                            >
                              {p.title}
                            </button>
                            <small>
                              {p.categories
                                .filter((c) => c.handle !== "sealed-products")
                                .map((c) => c.name)
                                .join(" · ")}
                            </small>
                            <small>{String(p.metadata?.set || "")}</small>
                          </>
                        )}
                      </td>
                      <td>
                        <select
                          aria-label={`Status for ${p.title}`}
                          value={p.status}
                          disabled={busy || rowBusy === p.id}
                          onChange={(e) =>
                            void mutate({
                              action: "sealed_status",
                              product_id: p.id,
                              status: e.target.value,
                            }).catch(() => {})
                          }
                        >
                          <option value="draft">Draft</option>
                          <option value="published">Published</option>
                          {!["draft", "published"].includes(p.status) && (
                            <option value={p.status}>{p.status}</option>
                          )}
                        </select>
                      </td>
                      <td>
                        {v.title}
                        <small>{v.sku}</small>
                      </td>
                      <td>
                        <InlineField
                          label={`Price for ${p.title} ${v.title}`}
                          initial={
                            v.price_clp == null ? "" : String(v.price_clp)
                          }
                          numeric
                          save={async (value) => {
                            await mutate({
                              action: "sealed_price",
                              product_id: p.id,
                              variant_id: v.id,
                              price_clp: Number(value),
                            });
                          }}
                        />
                      </td>
                      <td>
                        {Number(
                          v.levels.find((l) => l.location_id === location)
                            ?.available_quantity || 0,
                        )}{" "}
                        available
                        <small>
                          {Number(
                            v.levels.find((l) => l.location_id === location)
                              ?.reserved_quantity || 0,
                          )}{" "}
                          reserved
                        </small>
                      </td>
                      <td>
                        <div
                          className="sealed-actions"
                          aria-busy={rowBusy === v.id}
                        >
                          {rowBusy === v.id ? (
                            <span role="status">Updating…</span>
                          ) : (
                            [-1, 1].map((sign) => (
                              <button
                                key={sign}
                                disabled={
                                  busy ||
                                  rowBusy === v.id ||
                                  !location ||
                                  !v.stock_editable ||
                                  !Number.isInteger(Number(quantity)) ||
                                  Number(quantity) < 1 ||
                                  Number(quantity) > 10000
                                }
                                aria-label={`${sign > 0 ? "Receive" : "Subtract"} ${p.title} ${v.title}`}
                                onClick={() =>
                                  void mutate({
                                    action: "sealed_stock",
                                    product_id: p.id,
                                    variant_id: v.id,
                                    location_id: location,
                                    quantity: sign * Number(quantity),
                                  }).catch(() => {})
                                }
                              >
                                {sign > 0 ? "+" : "−"}
                              </button>
                            ))
                          )}
                        </div>
                        {!v.stock_editable && (
                          <small>Inventory setup required</small>
                        )}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
            {!rows.length && (
              <p className="empty">
                No sealed products match. Add one or change the filter.
              </p>
            )}
          </div>
        )}
        <footer className="pagination">
          <span>{count} products</span>
          <button
            disabled={loading || busy || offset === 0}
            onClick={() => setOffset((x) => Math.max(0, x - 20))}
          >
            Previous
          </button>
          <button
            disabled={loading || busy || offset + 20 >= count}
            onClick={() => setOffset((x) => x + 20)}
          >
            Next
          </button>
        </footer>
      </section>
    </>
  );
}

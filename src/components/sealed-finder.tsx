"use client";
import { useState, useRef, useEffect } from "react";
type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  images: string[];
  existing?: boolean;
  price_clp?: number;
  msrp_usd?: number;
  price_date?: string;
};
type Asset = { id: string; title: string; url: string; kind: string };
type Preview = {
  name: string;
  code: string;
  source: string;
  token: string;
  priceWarning?: string;
  products: Product[];
  assets: Asset[];
};
export default function SealedFinder({
  request,
  onSaved,
  onClose,
}: {
  request: (path: string, body?: unknown) => Promise<any>;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState(""),
    [source, setSource] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [products, setProducts] = useState<string[]>([]),
    [assets, setAssets] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [results, setResults] = useState<
      {
        id: string;
        title: string;
        status: string;
        message?: string;
        url?: string;
      }[]
    >([]),
    [submitted, setSubmitted] = useState(false);
  const [savedGraphics, setSavedGraphics] = useState<Asset[]>([]);
  const [banner, setBanner] = useState("");
  const [graphicsCode, setGraphicsCode] = useState("");
  async function loadGraphics() {
    setBusy(true); setError("");
    try {
      const result = await request("data", { action: "sealed_graphics", code });
      setSavedGraphics(result.assets); setBanner(result.banner); setGraphicsCode(code);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function useBanner(asset: Asset) {
    setBusy(true); setError("");
    try {
      const result = await request("data", { action: "sealed_banner", code: graphicsCode, asset_id: asset.id });
      setBanner(result.banner); onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const active = useRef(false);
  const toggle = (values: string[], id: string) =>
    values.includes(id) ? values.filter((v) => v !== id) : [...values, id];
  async function find() {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError("");
    setPreview(null);
    setResults([]);
    setProducts([]);
    setAssets([]);
    setSubmitted(false);
    try {
      setPreview(
        await request("data", {
          action: "sealed_find",
          game: "magic-the-gathering",
          code,
          source: source || undefined,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      active.current = false;
    }
  }
  async function accept() {
    if (active.current || !preview || submitted) return;
    active.current = true;
    setBusy(true);
    setSubmitted(true);
    setError("");
    try {
      const result = await request("data", {
        action: "sealed_accept",
        token: preview.token,
        products,
        assets,
      });
      setResults(result.results);
      onSaved();
      const stored = await request("data", { action: "sealed_graphics", code: preview.code });
      setSavedGraphics(stored.assets); setBanner(stored.banner); setGraphicsCode(preview.code);
    } catch (e) {
      setError(
        (e as Error).message +
          " Check saved products before trying again. Search again to refresh the preview.",
      );
    } finally {
      setBusy(false);
      active.current = false;
    }
  }
  return (
    <dialog ref={dialog} className="sealed-dialog sealed-finder-dialog" aria-labelledby="sealed-finder-title"
      onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <section className="panel import-form sealed-finder">
      <div className="section-head">
        <h2 id="sealed-finder-title">Find sealed products by set</h2>
        <button disabled={busy} className="text-button" onClick={onClose}>
          Close
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void find();
        }}
      >
        <div className="sealed-form-grid">
          <label>
            Game
            <select disabled={busy}>
              <option>Magic: The Gathering</option>
            </select>
          </label>
          <label>
            Set code
            <input
              required
              disabled={busy}
              placeholder="SOS"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <label>
            Official WPN page (optional)
            <input
              disabled={busy}
              type="url"
              placeholder="Use if the automatic page lookup fails"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setPreview(null);
              }}
            />
          </label>
        </div>
        <button className="primary" disabled={busy}>
          {busy ? "Working…" : "Find products & artwork"}
        </button>
      </form>
      <p className="muted">
        Search previews official WPN products and graphics. Nothing is saved
        until you accept selected items. Imported products are drafts with zero stock. Available official USD prices are converted to estimated CLP prices; review before publishing. Artwork archives are
        saved intact.
      </p>
      <button className="text-button" disabled={busy || !code.trim()} onClick={() => void loadGraphics()}>Manage saved set banner</button>
      {graphicsCode && <section>
        <h3>Saved graphics · {graphicsCode.toUpperCase()}</h3>
        <p className="muted">Choose an image to use as the storefront banner for this set. ZIP and PDF downloads cannot be displayed as banners.</p>
        {!savedGraphics.length && <p>No graphics saved for this set yet.</p>}
        <div className="finder-grid">{savedGraphics.map(a => <div className="finder-card" key={a.id}>
          {/\.(png|jpe?g|webp)(?:\?|$)/i.test(a.url) && <img src={a.url} alt={a.title} loading="lazy" />}
          <b>{a.title}</b>
          <a href={a.url} target="_blank" rel="noreferrer">Stored file ↗</a>
          {/\.(png|jpe?g|webp)(?:\?|$)/i.test(a.url) && <button className="primary" disabled={busy || banner === a.url} onClick={() => void useBanner(a)}>{banner === a.url ? "Current banner" : "Use as set banner"}</button>}
        </div>)}</div>
      </section>}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <>
          <h3>{preview.name}</h3>
          {preview.priceWarning && <p className="alert">{preview.priceWarning}</p>}
          <a href={preview.source} target="_blank" rel="noreferrer">
            Official source ↗
          </a>
          <h3>Products ({preview.products.length})</h3>
          <button
            className="text-button"
            disabled={busy || submitted}
            onClick={() =>
              setProducts(
                preview.products.filter((p) => !p.existing).map((p) => p.id),
              )
            }
          >
            Select all new products
          </button>
          <div className="finder-grid">
            {preview.products.map((p) => (
              <label className="finder-card" key={p.id}>
                <input
                  type="checkbox"
                  disabled={busy || submitted || p.existing}
                  checked={products.includes(p.id)}
                  onChange={() => setProducts((v) => toggle(v, p.id))}
                />
                <img src={p.images[0]} alt={p.name} loading="lazy" />
                <b>{p.name}</b>
                <small>
                  {p.category} · {p.sku}
                </small>
                <small>{p.price_clp ? `Estimated CLP $${p.price_clp.toLocaleString("es-CL")} · MSRP US$${p.msrp_usd} · rate ${p.price_date?.slice(0,10)}` : "No sourced CLP estimate — set price manually"}</small>
                {p.existing && <small>Already in catalog · existing price kept</small>}
                <small>{p.images.length} product image(s)</small>
              </label>
            ))}
          </div>
          <h3>Graphics & downloads ({preview.assets.length})</h3>
          <button
            className="text-button"
            disabled={busy || submitted}
            onClick={() => setAssets(preview.assets.map((a) => a.id))}
          >
            Select all graphics
          </button>
          <div className="finder-grid">
            {preview.assets.map((a) => (
              <label className="finder-card" key={a.id}>
                <input
                  type="checkbox"
                  disabled={busy || submitted}
                  checked={assets.includes(a.id)}
                  onChange={() => setAssets((v) => toggle(v, a.id))}
                />
                {a.kind === "image" ? (
                  <img src={a.url} alt={a.title} loading="lazy" />
                ) : (
                  <span>Artwork archive / document</span>
                )}
                <b>{a.title}</b>
                <a href={a.url} target="_blank" rel="noreferrer">
                  Preview source ↗
                </a>
              </label>
            ))}
          </div>
          <p>
            Selected: {products.length} products and {assets.length} graphics.
            Graphics are stored separately under{" "}
            <code>sealed/magic-the-gathering/{preview.code}/graphics</code>.
          </p>
          <button
            className="primary"
            disabled={busy || submitted || (!products.length && !assets.length)}
            onClick={() => void accept()}
          >
            {busy ? "Saving selected items…" : "Accept & save selected items"}
          </button>
        </>
      )}
      {results.length > 0 && (
        <div role="status">
          <h3>Import results</h3>
          {results.map((r) => (
            <p key={r.id}>
              <b>{r.title}</b>: {r.status}
              {r.message && ` — ${r.message}`}
              {r.url && (
                <>
                  {" "}
                  ·{" "}
                  <a href={r.url} target="_blank" rel="noreferrer">
                    Stored file ↗
                  </a>
                </>
              )}
            </p>
          ))}
          <p>
            Run the finder again to retry failed items. Already saved items are
            reused.
          </p>
        </div>
      )}
    </section>
    </dialog>
  );
}

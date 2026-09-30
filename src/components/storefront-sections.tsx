"use client";
import { useEffect, useState } from "react";
const sections = [
  [
    "sealed",
    "Sealed products — master switch",
    "Hides sealed navigation, all Home sealed content, and sealed pages.",
  ],
  ["homeBanner", "Home banner", "Promotional carousel on Home."],
  [
    "homeSealed",
    "Home: newest sealed products",
    "Requires the sealed master switch.",
  ],
  [
    "homeSingles",
    "Home: featured singles",
    "The 20 most expensive available cards.",
  ],
  ["sealedBanner", "Sealed: set banner", "Five newest sets."],
  ["sealedCategories", "Sealed: shop by product", "Category tiles."],
  [
    "sealedLatest",
    "Sealed: latest releases",
    "Products ordered by set release date.",
  ],
  ["sealedAlmostGone", "Sealed: almost gone", "Products with low stock."],
  ["sealedDeals", "Sealed: deals", "Discounted products."],
  ["sealedNew", "Sealed: novedades", "Full grid ordered by date added."],
  [
    "buyCards",
    "Bottom: we buy your cards",
    "Buying information and rates page.",
  ],
  ["bulkFinder", "Bulk card finder", "Banner entry and bottom link."],
  ["family", "Bottom: family business", "About our family business."],
];
async function request(body?: unknown) {
  const response = await fetch("/api/cms/data?resource=storefront_settings", {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.message || "Could not load storefront settings");
  if (!data.settings || typeof data.settings !== "object" ||
      sections.some(([key]) => typeof data.settings[key] !== "boolean"))
    throw new Error("The server returned incomplete storefront settings. Please retry.");
  return data;
}
export default function StorefrontSections() {
  const [settings, setSettings] = useState<Record<string, boolean> | null>(
      null,
    ),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [saved, setSaved] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    request()
      .then((data) => {
        if (active) {
          setSettings(data.settings);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const data = await request({ action: "storefront_settings", settings });
      setSettings(data.settings);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="panel import-form">
      <h2>Storefront sections</h2>
      <p>
        Changes apply after saving. Return to the storefront tab or refresh it
        to see them. Products and inventory are preserved.
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <button className="secondary" disabled={saving} onClick={() => setAttempt((v) => v + 1)}>Retry</button>
        </p>
      )}
      {!settings && !error && <p>Loading settings…</p>}
      {settings && (
        <>
          <div style={{ display: "grid", gap: 16, margin: "24px 0" }}>
            {sections.map(([key, label, help]) => (
              <label
                key={key}
                style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
              >
                <input
                  type="checkbox"
                  checked={settings[key] !== false}
                  disabled={saving}
                  onChange={(e) => {
                    setSettings({ ...settings, [key]: e.target.checked });
                    setSaved(false);
                  }}
                />
                <span>
                  <strong>{label}</strong>
                  <small style={{ display: "block" }}>{help}</small>
                </span>
              </label>
            ))}
          </div>
          <button
            className="primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save visibility"}
          </button>
          {saved && <p role="status">Storefront visibility saved.</p>}
        </>
      )}
    </section>
  );
}

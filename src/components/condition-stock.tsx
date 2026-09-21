"use client";
import { useEffect, useRef, useState } from "react";
import InlineField from "./inline-field";
export const CONDITIONS = [
  { value: "near_mint", label: "NM", name: "Near mint" },
  { value: "lightly_played", label: "LP", name: "Lightly played" },
  { value: "moderately_played", label: "MP", name: "Moderately played" },
  { value: "heavily_played", label: "HP", name: "Heavily played" },
  { value: "damaged", label: "DMG", name: "Damaged" },
];
type Listing = {
  id: string;
  condition: string;
  language: string;
  finish: string;
  price_clp: number;
  metadata?: { price_pending?: boolean };
  levels: {
    location_id: string;
    available_quantity: number;
    reserved_quantity: number;
  }[];
};
type Props = {
  printing: { id: string; name?: string };
  locations: { id: string; name?: string }[];
  revision: number;
  notify: (message: string) => void;
};
async function request(url: string, body?: unknown) {
  const res = await fetch(`/api/cms/data${url}`, {
    method: body ? "POST" : "GET",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Unable to update stock");
  return data;
}
function languageGroup(language: string) {
  const l = language.trim().toLowerCase();
  return ["english", "en"].includes(l)
    ? "English"
    : ["spanish", "es", "español"].includes(l)
      ? "Spanish"
      : "Other";
}
export default function ConditionStock({
  printing,
  locations,
  revision,
  notify,
}: Props) {
  const [open, setOpen] = useState(false),
    [warehouse, setWarehouse] = useState("");
  const [language, setLanguage] = useState("English"),
    [otherLanguage, setOtherLanguage] = useState("Other"),
    [finish, setFinish] = useState("non_foil");
  const [rows, setRows] = useState<Listing[]>([]),
    [loading, setLoading] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const inFlight = useRef(false);
  const locationId =
    warehouse || (locations.length === 1 ? locations[0].id : "");
  const selectedLanguage =
    language === "Other" ? otherLanguage.trim() : language;
  useEffect(() => {
    if (!open) return;
    let canceled = false;
    setLoading(true);
    setError("");
    (async () => {
      const listings: Listing[] = [];
      for (let offset = 0; ; offset += 30) {
        const page = await request(
          `?resource=stock&printing_id=${encodeURIComponent(printing.id)}&offset=${offset}`,
        );
        listings.push(...page.rows);
        if (!page.rows.length || listings.length >= page.count) break;
      }
      if (!canceled) setRows(listings);
    })()
      .catch((e) => {
        if (!canceled) setError(e.message);
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [open, printing.id, revision, refresh]);
  async function adjust(
    condition: string,
    action: "receive" | "subtract",
    listing?: Listing,
  ) {
    if (inFlight.current || loading || !locationId || !selectedLanguage) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      const result = await request(
        "",
        listing
          ? {
              action,
              listing_id: listing.id,
              location_id: locationId,
              quantity: 1,
            }
          : {
              action: "quick_add",
              printing_id: printing.id,
              condition,
              language: selectedLanguage,
              finish,
              location_id: locationId,
            },
      );
      notify(
        result.warning ||
          `${action === "receive" ? "Added" : "Subtracted"} 1 ${CONDITIONS.find((c) => c.value === condition)?.label} ${printing.name} (${listing?.language || selectedLanguage}).`,
      );
      setLoading(true);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(
        `${(e as Error).message}. Refresh quantities before repeating an uncertain adjustment.`,
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  const blocked =
    pending || loading || !locationId || !selectedLanguage || !!error;
  return (
    <details
      className="condition-stock"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        Stock by condition <span>NM · LP · MP · HP · DMG</span>
      </summary>
      {open && (
        <div className="condition-panel">
          <div
            className="stock-language-tabs"
            role="tablist"
            aria-label={`Languages for ${printing.name}`}
          >
            {["English", "Spanish", "Other"].map((l) => (
              <button
                type="button"
                role="tab"
                aria-selected={language === l}
                key={l}
                disabled={pending}
                onClick={() => setLanguage(l)}
              >
                {l === "Other" ? "Other languages" : l}
              </button>
            ))}
          </div>
          <div className="stock-options">
            <label>
              Warehouse
              <select
                aria-label={`Warehouse for ${printing.name}`}
                value={locationId}
                disabled={pending}
                onChange={(e) => setWarehouse(e.target.value)}
              >
                <option value="">Select warehouse</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Finish
              <select
                aria-label={`Finish for ${printing.name}`}
                value={finish}
                disabled={pending}
                onChange={(e) => setFinish(e.target.value)}
              >
                {["non_foil", "foil", "etched", "other"].map((f) => (
                  <option key={f} value={f}>
                    {f.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {language === "Other" && (
            <label>
              Language for new stock
              <input
                aria-label={`Other language for ${printing.name}`}
                value={otherLanguage}
                maxLength={60}
                disabled={pending}
                onChange={(e) => setOtherLanguage(e.target.value)}
                placeholder="Other, Japanese, French…"
              />
              <small>Existing languages remain separate below.</small>
            </label>
          )}
          <p className="muted">
            + adds one copy immediately. Unpriced stock stays unavailable for
            sale until you enter a CLP price.
          </p>
          {error && (
            <div className="alert error" role="alert">
              {error}{" "}
              <button
                disabled={loading || pending}
                onClick={() => setRefresh((n) => n + 1)}
              >
                Refresh quantities
              </button>
            </div>
          )}
          {loading ? (
            <p role="status">Loading quantities…</p>
          ) : (
            CONDITIONS.map((condition) => {
              const listings = rows.filter(
                (r) =>
                  r.condition === condition.value &&
                  r.finish === finish &&
                  languageGroup(r.language) === language,
              );
              const hasSelected = listings.some(
                (l) =>
                  l.language.toLowerCase() === selectedLanguage.toLowerCase() ||
                  (language !== "Other" &&
                    languageGroup(l.language) === language),
              );
              return (
                <div className="condition-group" key={condition.value}>
                  <strong title={condition.name}>
                    {condition.label}
                    <small>{condition.name}</small>
                  </strong>
                  <div>
                    {listings.map((listing) => {
                      const level = listing.levels.find(
                        (l) => l.location_id === locationId,
                      );
                      const available = Math.max(
                        0,
                        Number(level?.available_quantity || 0),
                      );
                      const label = `${printing.name}, ${condition.label}, ${listing.language}, ${finish}`;
                      return (
                        <div className="condition-listing" key={listing.id}>
                          <div className="condition-listing-label">
                            <span>{listing.language}</span>
                            <small>
                              {Number(level?.reserved_quantity || 0)} reserved
                            </small>
                            <InlineField
                              initial={
                                listing.metadata?.price_pending ||
                                !listing.price_clp
                                  ? ""
                                  : String(listing.price_clp)
                              }
                              label={`Price CLP for ${label}`}
                              placeholder="Price CLP"
                              numeric
                              save={async (value) => {
                                await request("", {
                                  action: "price",
                                  listing_id: listing.id,
                                  price_clp: Number(value),
                                });
                                notify(`Price saved for ${printing.name}.`);
                                setRefresh((n) => n + 1);
                              }}
                            />
                          </div>
                          <div className="stock-stepper">
                            <button
                              type="button"
                              aria-label={`Subtract one ${label}`}
                              disabled={blocked || available < 1}
                              onClick={() =>
                                adjust(condition.value, "subtract", listing)
                              }
                            >
                              −
                            </button>
                            <output aria-label={`Available ${label}`}>
                              {locationId ? available : "—"}
                            </output>
                            <button
                              type="button"
                              aria-label={`Add one ${label}`}
                              disabled={blocked}
                              onClick={() =>
                                adjust(condition.value, "receive", listing)
                              }
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {!hasSelected && (
                      <div className="condition-listing">
                        <span>
                          {selectedLanguage || "Choose a language"}
                          <small>No stock yet</small>
                        </span>
                        <div className="stock-stepper">
                          <button
                            type="button"
                            disabled
                            aria-label={`Subtract ${condition.label} ${selectedLanguage} ${printing.name}`}
                          >
                            −
                          </button>
                          <output>0</output>
                          <button
                            type="button"
                            aria-label={`Add one ${condition.label} ${selectedLanguage} ${printing.name}`}
                            disabled={blocked}
                            onClick={() => adjust(condition.value, "receive")}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </details>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
type Row = {
  line: number;
  quantity: number;
  name: string;
  code: string;
  collector: string;
  finish: string;
  language: string;
  error?: string;
  ok?: boolean;
  message?: string;
  warning?: string;
};
export default function CardImport({
  locations,
  request,
  defaultWarehouse,
}: {
  locations: { id: string; name?: string }[];
  defaultWarehouse: string;
  request: (resource: string, body?: unknown) => Promise<any>;
}) {
  const [text, setText] = useState("");
  const [condition, setCondition] = useState("near_mint");
  const [location, setLocation] = useState(defaultWarehouse || locations[0]?.id || "");
  useEffect(()=>{setLocation(defaultWarehouse);setValid(false);setRows([]);},[defaultWarehouse]);
  const [rows, setRows] = useState<Row[]>([]);
  const [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef(false);
  function changed() {
    setValid(false);
    setRows([]);
    setMessage("");
    setSubmitted(false);
  }
  async function run(commit: boolean) {
    if (active.current || (commit && (!valid || submitted))) return;
    active.current = true;
    setBusy(true);
    setMessage("");
    if (commit) {
      setSubmitted(true);
      setValid(false);
    }
    try {
      const result = await request("data", {
        action: commit ? "stock_import" : "stock_import_preview",
        text,
        condition,
        location_id: location,
      });
      setRows(result.rows || []);
      setValid(!commit && result.valid);
      setMessage(
        commit
          ? result.applied
            ? result.completed
              ? "Stock received. New unpriced listings remain drafts until you add a price."
              : "Import stopped. Review the results and inventory before submitting only the remaining lines."
            : "Nothing imported. Correct the validation errors."
          : result.valid
            ? "All lines match. Review quantities before importing."
            : "Nothing imported. Correct the highlighted lines.",
      );
    } catch (error) {
      setMessage(
        (error as Error).message +
          (commit
            ? " The result may be uncertain. Check inventory before importing again."
            : ""),
      );
    } finally {
      setBusy(false);
      active.current = false;
    }
  }
  return (
    <section className="panel import-form">
      <h2>Receive card stock</h2>
      <p>
        One card per line: quantity, name, set code, collector number, optional
        foil, language. Each line uses the condition and warehouse below.
      </p>
      <pre>
        {"2x The One Ring (LTR) 246 *F* S\n1x The One Ring (LTR) 246 E"}
      </pre>
      <p className="muted">
        F = foil; NF or no marker = non-foil. E = English (default), S =
        Spanish, O = Other, or other:Japanese. Cards not yet in your catalog are
        found on Scryfall and imported automatically (data, image and price)
        when you receive the stock. SKU is optional and stays on the card’s catalog row.
      </p>
      <label>
        Condition
        <select
          disabled={busy}
          value={condition}
          onChange={(e) => {
            setCondition(e.target.value);
            changed();
          }}
        >
          {[
            ["near_mint", "NM"],
            ["lightly_played", "LP"],
            ["moderately_played", "MP"],
            ["heavily_played", "HP"],
            ["damaged", "DMG"],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Warehouse
        <select
          disabled={busy}
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            changed();
          }}
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
        Card lines
        <textarea
          rows={10}
          maxLength={50000}
          disabled={busy}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            changed();
          }}
          placeholder="2x The One Ring (LTR) 246 *F* S"
        />
      </label>
      <p className="muted">
        Up to 100 lines. Importing adds to existing stock; it does not replace
        quantities.
      </p>
      <button
        className="secondary"
        disabled={busy || !text.trim() || !location || submitted}
        onClick={() => run(false)}
      >
        Preview
      </button>{" "}
      <button
        className="primary"
        disabled={busy || !valid || submitted}
        onClick={() => run(true)}
      >
        {busy ? "Working…" : "Import stock"}
      </button>
      {message && <p role="status">{message}</p>}
      {rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Line</th>
                <th>Qty</th>
                <th>Card</th>
                <th>Set / no.</th>
                <th>Finish</th>
                <th>Language</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line}>
                  <td>{r.line}</td>
                  <td>{r.quantity}</td>
                  <td>{r.name}</td>
                  <td>
                    {r.code.toUpperCase()} / {r.collector}
                  </td>
                  <td>{r.finish === "foil" ? "Foil" : "Non-foil"}</td>
                  <td>{r.language}</td>
                  <td>
                    {r.error ||
                      r.warning ||
                      r.message ||
                      (r.ok === true
                        ? "Received"
                        : r.ok === false
                          ? "Stopped — check inventory"
                          : "Ready")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

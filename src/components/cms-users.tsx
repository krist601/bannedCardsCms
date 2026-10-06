"use client";
import { useEffect, useState } from "react";
const sections = [
  "overview",
  "storefront",
  "cards",
  "sets",
  "stock",
  "sealed",
  "orders",
];
const labels: Record<string, string> = {
  overview: "Overview",
  storefront: "Storefront sections",
  cards: "Card catalog",
  sets: "Sets",
  stock: "Inventory",
  sealed: "Sealed products",
  orders: "Orders",
};
type Member = {
  id: string;
  email: string;
  name: string;
  enabled: boolean;
  admin: boolean;
  canCreateSealed?: boolean;
  sections: string[];
  warehouseIds: string[] | null;
};
export default function CmsUsers({
  request,
  locations,
}: {
  request: (path: string, body?: unknown) => Promise<any>;
  locations: { id: string; name?: string }[];
}) {
  const [users, setUsers] = useState<Member[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Member | null>(null),
    [password, setPassword] = useState("");
  const load = () =>
    request("data?resource=users")
      .then((d) => setUsers(d.rows))
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  const toggle = (values: string[], id: string) =>
    values.includes(id) ? values.filter((v) => v !== id) : [...values, id];
  return (
    <section className="panel import-form cms-users">
      <h2>Users & access</h2>
      <p>
        Enable sections and warehouses per user. Administrators retain full
        access.
      </p>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      <button
        className="primary"
        disabled={busy}
        onClick={() => {
          setPassword("");
          setDraft({
            id: "",
            email: "",
            name: "",
            admin: false,
            enabled: true,
            sections: ["cards", "stock", "sealed"],
            warehouseIds: [],
          });
        }}
      >
        New user
      </button>
      {users.map((u) => (
        <div key={u.id} className="table-toolbar">
          <span>
            {u.name} · {u.email} ·{" "}
            {u.admin ? "Administrator" : u.enabled ? "Enabled" : "Disabled"}
          </span>
          <button
            className="secondary"
            disabled={busy || u.admin}
            onClick={() => {
              setPassword("");
              setDraft(u);
            }}
          >
            Edit access
          </button>
        </div>
      ))}
      {draft && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await request("data", {
                action: draft.id ? "user_save" : "user_create",
                user_id: draft.id,
                ...draft,
                password,
              });
              setPassword("");
              setDraft(null);
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>{draft.id ? "Edit access" : "Create CMS user"}</h3>
          {!draft.id && (
            <div className="sealed-form-grid">
              <label>
                Name
                <input
                  required
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label>
                Email
                <input
                  required
                  type="email"
                  value={draft.email}
                  onChange={(e) =>
                    setDraft({ ...draft, email: e.target.value })
                  }
                />
              </label>
              <label>
                Password
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            </div>
          )}
          <label>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) =>
                setDraft({ ...draft, enabled: e.target.checked })
              }
            />{" "}
            CMS access enabled
          </label>
          <h4>Sections</h4>
          {sections.map((s) => (
            <label key={s}>
              <input
                type="checkbox"
                checked={draft.sections.includes(s)}
                onChange={() =>
                  setDraft({ ...draft, sections: toggle(draft.sections, s) })
                }
              />{" "}
              {labels[s]}
            </label>
          ))}
          <h4>Product permissions</h4>
          <label>
            <input type="checkbox" checked={draft.canCreateSealed === true}
              onChange={(e) => setDraft({ ...draft, canCreateSealed: e.target.checked })} />
            Create sealed products
          </label>
          <p className="muted">Allows manual creation and bulk imports. Sealed products section access is also required.</p>
          <h4>Warehouses</h4>
          {locations.map((l) => (
            <label key={l.id}>
              <input
                type="checkbox"
                checked={draft.warehouseIds?.includes(l.id) || false}
                onChange={() =>
                  setDraft({
                    ...draft,
                    warehouseIds: toggle(draft.warehouseIds || [], l.id),
                  })
                }
              />{" "}
              {l.name}
            </label>
          ))}
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save access"}
          </button>{" "}
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              setDraft(null);
              setPassword("");
            }}
          >
            Cancel
          </button>
        </form>
      )}
    </section>
  );
}

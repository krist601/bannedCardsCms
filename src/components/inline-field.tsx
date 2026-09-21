"use client";
import { useEffect, useRef, useState } from "react";
export default function InlineField({
  initial,
  label,
  placeholder,
  numeric = false,
  save,
}: {
  initial: string;
  label: string;
  placeholder?: string;
  numeric?: boolean;
  save: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const saved = useRef(initial),
    inFlight = useRef(false);
  useEffect(() => {
    saved.current = initial;
    setValue(initial);
  }, [initial]);
  async function commit(next: string) {
    next = next.trim();
    if (next === saved.current || inFlight.current) return;
    if (
      numeric &&
      (!/^\d+$/.test(next) || Number(next) < 1 || Number(next) > 100000000)
    ) {
      setError("Enter a positive whole CLP amount");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await save(next);
      saved.current = next;
      setValue(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="inline-field">
      <input
        aria-label={label}
        title="Press Enter or leave the field to save. Escape cancels."
        placeholder={placeholder}
        inputMode={numeric ? "numeric" : undefined}
        maxLength={numeric ? 9 : 120}
        disabled={busy}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => void commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setValue(saved.current);
            e.currentTarget.value = saved.current;
            e.currentTarget.blur();
          }
        }}
      />
      {busy && <small role="status">Saving…</small>}
      {error && (
        <small role="alert" className="inline-error">
          {error}
        </small>
      )}
    </div>
  );
}

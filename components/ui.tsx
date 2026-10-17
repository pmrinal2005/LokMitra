"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

/** Shared dashboard primitives (no UI framework). */

export function PageHead({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </header>
  );
}

export function Panel({ title, sub, right, children, className = "", id }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section className={`panel ${className}`} id={id}>
      <div className="panel-head">
        <div>
          <h2 className="panel-title">
            <span className="glyph" /> {title}
          </h2>
          {sub && <div className="panel-sub">{sub}</div>}
        </div>
        {right && <div className="row">{right}</div>}
      </div>
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "teal" | "amber" | "jade" }) {
  return (
    <div className={`kpi ${tone ?? ""}`}>
      <span className="k-label">{label}</span>
      <span className="k-val">{value}</span>
      {sub && <span className="k-sub">{sub}</span>}
    </div>
  );
}

export function Loading({ label = "loading" }: { label?: string }) {
  return (
    <div className="row note" role="status">
      <span className="school" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>{" "}
      {label}…
    </div>
  );
}

/** Poll a JSON endpoint; `reload()` forces a refresh. */
export function useApi<T>(path: string | null, everyMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api<T>(path);
      if (alive.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    alive.current = true;
    void load();
    const t = everyMs ? setInterval(load, everyMs) : null;
    return () => {
      alive.current = false;
      if (t) clearInterval(t);
    };
  }, [load, everyMs]);
  return { data, error, loading, reload: load, setData };
}

/** Run an async action with busy/error/notice state. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = useCallback(async <R,>(label: string, fn: () => Promise<R>, ok?: (r: R) => string | void): Promise<R | null> => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      const msg = ok?.(r);
      if (msg) setNotice(msg);
      return r;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, error, notice, run, setError, setNotice };
}

export function Flash({ busy, error, notice }: { busy?: string | null; error?: string | null; notice?: string | null }) {
  return (
    <>
      {busy && <Loading label={busy} />}
      {error && <p className="note err">⚠ {error}</p>}
      {notice && <p className="note ok">✓ {notice}</p>}
    </>
  );
}

export function Json({ value, max = 260 }: { value: unknown; max?: number }) {
  return (
    <pre className="mono note json-pre" style={{ maxHeight: max }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export const usd = (n: unknown, d = 4) => {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(d)}` : "—";
};

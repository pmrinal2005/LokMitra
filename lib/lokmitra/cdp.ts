import "server-only";

/**
 * Minimal Chrome DevTools Protocol client over the runtime's global WebSocket
 * (Node 22 / Vercel). Used to drive TinyFish remote browsers that expose a `cdp_url`:
 *   - Browser API sessions (POST api.browser.tinyfish.ai)
 *   - Browser Context Profile setup sessions (POST /v1/profiles/{id}/setup-session)
 * Serverless-friendly: every HTTP request opens a short CDP connection, performs one
 * action, captures a screenshot and disconnects — the remote browser stays alive
 * until its inactivity timeout.
 */

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export class CdpError extends Error {}

export class Cdp {
  private ws: WebSocket;
  private id = 0;
  private pending = new Map<number, Pending>();
  private listeners: ((m: { method: string; params: Record<string, unknown>; sessionId?: string }) => void)[] = [];

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener("message", (ev: MessageEvent) => {
      let msg: { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: Record<string, unknown>; sessionId?: string };
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data as ArrayBuffer).toString("utf8"));
      } catch {
        return;
      }
      if (typeof msg.id === "number") {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new CdpError(msg.error.message));
        else p.resolve(msg.result);
      } else if (msg.method) {
        this.listeners.forEach((l) => l({ method: msg.method!, params: msg.params ?? {}, sessionId: msg.sessionId }));
      }
    });
    ws.addEventListener("close", () => {
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new CdpError("CDP socket closed"));
      }
      this.pending.clear();
    });
  }

  static async connect(url: string, timeoutMs = 15_000): Promise<Cdp> {
    if (typeof WebSocket === "undefined") throw new CdpError("WebSocket is not available in this runtime (needs Node 22+)");
    if (!/^wss?:\/\//.test(url)) throw new CdpError("cdp_url must be ws(s)://");
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => {
        try {
          ws.close();
        } catch {}
        reject(new CdpError(`CDP connect timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      ws.addEventListener("open", () => (clearTimeout(t), resolve()), { once: true });
      ws.addEventListener("error", () => (clearTimeout(t), reject(new CdpError("CDP connection failed"))), { once: true });
    });
    return new Cdp(ws);
  }

  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, sessionId?: string, timeoutMs = 20_000): Promise<T> {
    const id = ++this.id;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CdpError(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      const msg: Record<string, unknown> = { id, method, params };
      if (sessionId) msg.sessionId = sessionId;
      this.ws.send(JSON.stringify(msg));
    });
  }

  on(fn: (m: { method: string; params: Record<string, unknown>; sessionId?: string }) => void) {
    this.listeners.push(fn);
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

/* ------------------------------------------------------------------ */
/* Page controller                                                     */
/* ------------------------------------------------------------------ */
export interface PageField {
  idx: number;
  tag: string;
  type: string;
  label: string;
  value: string;
  kind: "text" | "select" | "button" | "captcha" | "otp" | "checkbox" | "radio" | "link";
  options?: { value: string; label: string }[];
}

export interface PageSnapshot {
  url: string;
  title: string;
  fields: PageField[];
  captcha_present: boolean;
  text_excerpt: string;
  screenshot?: string; // data:image/jpeg;base64,…
}

/** Runs in the remote page: tags interactive elements with data-lm-idx and describes them. */
const SCAN_JS = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const txt = (s) => String(s || '').replace(/\\s+/g, ' ').trim().slice(0, 90);
  const labelOf = (el) => {
    if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) return txt(l.innerText); }
    const wrap = el.closest('label'); if (wrap) return txt(wrap.innerText);
    if (el.getAttribute('aria-label')) return txt(el.getAttribute('aria-label'));
    if (el.placeholder) return txt(el.placeholder);
    if (el.tagName === 'BUTTON' || el.tagName === 'A') return txt(el.innerText || el.value || el.title);
    if (el.type === 'submit' || el.type === 'button') return txt(el.value);
    const prev = el.closest('td,div,li,p'); if (prev && prev.previousElementSibling) return txt(prev.previousElementSibling.innerText);
    return txt(el.name || el.id || el.type);
  };
  const els = [...document.querySelectorAll('input:not([type=hidden]), select, textarea, button, a[role=button], a.btn, input[type=submit]')].filter(vis).slice(0, 60);
  const out = els.map((el, i) => {
    el.setAttribute('data-lm-idx', String(i));
    const tag = el.tagName.toLowerCase(); const type = (el.type || tag).toLowerCase(); const label = labelOf(el);
    const hay = (label + ' ' + (el.name || '') + ' ' + (el.id || '')).toLowerCase();
    let kind = 'text';
    if (tag === 'select') kind = 'select';
    else if (tag === 'button' || tag === 'a' || type === 'submit' || type === 'button') kind = tag === 'a' ? 'link' : 'button';
    else if (type === 'checkbox') kind = 'checkbox'; else if (type === 'radio') kind = 'radio';
    else if (/captcha|security code|verification code|image code/.test(hay)) kind = 'captcha';
    else if (/otp|one time|one-time/.test(hay)) kind = 'otp';
    const f = { idx: i, tag, type, label, kind, value: type === 'password' ? (el.value ? '••••' : '') : String(el.value || '').slice(0, 60) };
    if (tag === 'select') f.options = [...el.options].slice(0, 40).map(o => ({ value: o.value, label: txt(o.text) }));
    return f;
  });
  const captcha = !!document.querySelector('img[src*="aptcha" i], img[id*="aptcha" i], img[alt*="aptcha" i], canvas[id*="aptcha" i], iframe[src*="recaptcha"], iframe[src*="hcaptcha"]');
  return { url: location.href, title: document.title, fields: out, captcha_present: captcha, text_excerpt: String((document.body && document.body.innerText) || '').replace(/\\s+/g, ' ').trim().slice(0, 600) };
})()`;

export class PageCtl {
  constructor(
    public cdp: Cdp,
    public sessionId: string,
  ) {}

  async eval<T = unknown>(expression: string, timeoutMs = 15_000): Promise<T> {
    const r = await this.cdp.send<{ result: { value?: T }; exceptionDetails?: { text?: string; exception?: { description?: string } } }>(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      this.sessionId,
      timeoutMs,
    );
    if (r.exceptionDetails) throw new CdpError(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? "evaluate failed");
    return r.result.value as T;
  }

  async navigate(url: string) {
    await this.cdp.send("Page.navigate", { url }, this.sessionId, 30_000);
    await this.waitIdle(8000);
  }

  async waitIdle(maxMs = 6000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      try {
        const st = await this.eval<string>("document.readyState", 4000);
        if (st === "complete") break;
      } catch {
        /* navigating */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  async screenshot(quality = 55): Promise<string> {
    const r = await this.cdp.send<{ data: string }>("Page.captureScreenshot", { format: "jpeg", quality, captureBeyondViewport: false }, this.sessionId, 20_000);
    return `data:image/jpeg;base64,${r.data}`;
  }

  async scan(withShot = true): Promise<PageSnapshot> {
    const snap = await this.eval<PageSnapshot>(SCAN_JS);
    if (withShot) {
      try {
        snap.screenshot = await this.screenshot();
      } catch {
        /* screenshot optional */
      }
    }
    return snap;
  }

  /** Fill an element tagged by scan() using the native setter so React/Angular forms notice. */
  async fill(idx: number, value: string) {
    const js = `(() => { const el = document.querySelector('[data-lm-idx="${Number(idx)}"]'); if (!el) return 'missing';
      el.focus();
      if (el.tagName === 'SELECT') { el.value = ${JSON.stringify(value)}; }
      else if (el.type === 'checkbox' || el.type === 'radio') { el.checked = ${JSON.stringify(value)} !== 'false'; }
      else { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); }
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.blur(); return 'ok'; })()`;
    const r = await this.eval<string>(js);
    if (r !== "ok") throw new CdpError(`field #${idx} not found — rescan the page`);
  }

  async click(idx: number) {
    const r = await this.eval<string>(`(() => { const el = document.querySelector('[data-lm-idx="${Number(idx)}"]'); if (!el) return 'missing'; el.scrollIntoView({block:'center'}); el.click(); return 'ok'; })()`);
    if (r !== "ok") throw new CdpError(`element #${idx} not found — rescan the page`);
    await this.waitIdle(7000);
  }
}

/** Connect to a browser-level cdp_url, attach to its first page target and run `fn`. */
export async function withPage<T>(cdpUrl: string, fn: (p: PageCtl) => Promise<T>): Promise<T> {
  const cdp = await Cdp.connect(cdpUrl);
  try {
    const { targetInfos } = await cdp.send<{ targetInfos: { targetId: string; type: string; url: string }[] }>("Target.getTargets");
    let target = targetInfos.find((t) => t.type === "page" && !t.url.startsWith("devtools://"));
    if (!target) {
      const { targetId } = await cdp.send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
      target = { targetId, type: "page", url: "about:blank" };
    }
    const { sessionId } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    await cdp.send("Page.enable", {}, sessionId).catch(() => null);
    await cdp.send("Runtime.enable", {}, sessionId).catch(() => null);
    return await fn(new PageCtl(cdp, sessionId));
  } finally {
    cdp.close();
  }
}

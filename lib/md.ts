/** Tiny, XSS-safe markdown → HTML for LLM reports (escape first, then a whitelist of constructs). Shared client/server. */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function inline(s: string) {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,!?]|$)/g, "$1<i>$2</i>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|[\s(>])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
}

export function mdToHtml(md: string): string {
  const lines = esc(String(md ?? "")).split(/\r?\n/);
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const l of lines) {
    const ul = l.match(/^\s*[-*•]\s+(.*)$/);
    const ol = l.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const kind = ul ? "ul" : "ol";
      if (list !== kind) (close(), out.push(`<${kind}>`), (list = kind));
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
      continue;
    }
    close();
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) out.push(`<h${Math.min(h[1].length + 2, 5)}>${inline(h[2])}</h${Math.min(h[1].length + 2, 5)}>`);
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  close();
  return out.join("\n");
}

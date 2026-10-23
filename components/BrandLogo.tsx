/**
 * Official LokMitra brand mark (public/logo.png — transparent 512×512 PNG).
 * Single source of truth for every place the brand icon is shown: deck nav, sidebar header,
 * mobile drawer bar, loading screen, 404, printable report slip, etc.
 *
 * Plain <img> (not next/image) on purpose: works in server + client components, in print,
 * and needs no image-optimizer config on Vercel. Size is controlled via the `size` prop and
 * the `.brand-logo` CSS (which also clamps it responsively on small viewports).
 */
export const LOGO_SRC = "/logo.png";

export function BrandLogo({
  size = 36,
  className = "",
  alt = "LokMitra logo",
  decorative = false,
  priority = false,
}: {
  size?: number;
  className?: string;
  alt?: string;
  /** true when a visible "LokMitra" word sits right next to the logo (avoids double read-out) */
  decorative?: boolean;
  priority?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_SRC}
      width={size}
      height={size}
      alt={decorative ? "" : alt}
      aria-hidden={decorative ? true : undefined}
      className={`brand-logo ${className}`.trim()}
      style={{ ["--logo-size" as string]: `${size}px` }}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      draggable={false}
    />
  );
}

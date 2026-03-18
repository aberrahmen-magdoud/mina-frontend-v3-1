// src/lib/cfInput1080.ts
// Cloudflare image resizing helper — shared across StudioLeft, Profile, SceneLibraryModal

export function cfInput1080(
  url: string,
  kind: "product" | "logo" | "style" = "product",
  width = 1080
): string {
  const u = String(url || "").trim();
  if (!u) return "";
  if (!u.includes("assets.faltastudio.com/")) return u;
  if (u.includes("/cdn-cgi/image/")) return u;

  const format = kind === "logo" ? "png" : "jpeg";
  const opts = `width=${width},fit=scale-down,quality=90,format=${format}`;

  return `https://assets.faltastudio.com/cdn-cgi/image/${opts}/${u.replace(
    "https://assets.faltastudio.com/",
    ""
  )}`;
}

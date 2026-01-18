export type SceneLibraryItem = {
  id: string;
  title: string;
  url: string;
  keywords: string[];
};

function clean(s: any) {
  return String(s || "")
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/^'(.*)'$/, "$1")
    .trim();
}

function tryJson(raw: string) {
  const s = clean(raw);
  if (!s) return null;
  if (!(s.startsWith("[") || s.startsWith("{"))) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Supports:
 * 1) JSON: [{"id":"1","title":"...","url":"...","keywords":["a","b"]}]
 * 2) Pipe: ID,title,url,kw1;kw2;kw3|ID,title,url,kw1;kw2|
 */
export function parseSceneLibraryEnv(raw: any): SceneLibraryItem[] {
  const input = clean(raw);
  if (!input) return [];

  const j = tryJson(input);
  if (Array.isArray(j)) {
    return j
      .map((x: any) => ({
        id: clean(x?.id ?? x?.ID),
        title: clean(x?.title ?? x?.name),
        url: clean(x?.url ?? x?.imageUrl),
        keywords: Array.isArray(x?.keywords)
          ? x.keywords.map(clean).filter(Boolean)
          : clean(x?.keywords)
              .split(/[;,\s]+/)
              .map(clean)
              .filter(Boolean),
      }))
      .filter((x) => x.id && x.title && x.url);
  }

  // Pipe format
  const rows = input.split("|").map((r) => clean(r)).filter(Boolean);

  const out: SceneLibraryItem[] = [];

  for (const row of rows) {
    // Robust parsing: find the token that starts with http(s) -> that's the URL
    const parts = row.split(",").map((p) => clean(p)).filter((p) => p !== "");
    if (parts.length < 3) continue;

    const id = parts[0];

    const urlIdx = parts.findIndex((p) => /^https?:\/\//i.test(p));
    if (urlIdx === -1) continue;

    const title = parts.slice(1, urlIdx).join(",").trim();
    const url = parts[urlIdx];

    const kwRaw = parts.slice(urlIdx + 1).join(",").trim();
    const keywords = kwRaw ? kwRaw.split(";").map(clean).filter(Boolean) : [];

    if (!id || !title || !url) continue;
    out.push({ id, title, url, keywords });
  }

  return out;
}

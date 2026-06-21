// OOTD Studio — outfit helper functions
// Adapted from TanStack Start original, ported to Next.js API routes.
// Product resolution: multi-provider fallback (Tavily → Serper → Apiserpent → affiliate URL)
// Removed: MOBILE_UA, extractAmazonSearchBlocks()

const AFFILIATE_TAG = "abaddix-20";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const ALL_CATEGORIES = ["dress", "bag", "sunglasses", "hat", "bracelet", "sandals"] as const;
type Category = (typeof ALL_CATEGORIES)[number];

// ---------- helpers ----------

function buildAffiliateUrl(searchQuery: string): string {
  const q = encodeURIComponent(searchQuery.trim());
  return `https://www.amazon.com/s?k=${q}&tag=${AFFILIATE_TAG}`;
}

function appendAffiliateTag(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("tag", AFFILIATE_TAG);
    return u.toString();
  } catch {
    return url;
  }
}

function extractAmazonKeywords(rawUrl: string): {
  slug: string;
  searchKeywords: string;
  asin: string;
} {
  let slug = "";
  let searchKeywords = "";
  let asin = "";
  try {
    const u = new URL(rawUrl);
    searchKeywords = (u.searchParams.get("keywords") || "").replace(/\+/g, " ").trim();
    const parts = u.pathname.split("/").filter(Boolean);
    const dpIdx = parts.findIndex((p) => p === "dp" || p === "gp");
    if (dpIdx > 0) slug = parts[dpIdx - 1].replace(/-/g, " ");
    if (dpIdx >= 0 && parts[dpIdx + 1]) asin = parts[dpIdx + 1];
  } catch {
    /* ignore */
  }
  return { slug, searchKeywords, asin };
}

function detectCategory(text: string): Category | null {
  const t = text.toLowerCase();
  if (/\b(sandal|sandals|flip[- ]?flop|espadrille|wedge|slide)s?\b/.test(t)) return "sandals";
  if (/\b(sunglass|sunglasses|eyewear|aviator|shades)\b/.test(t)) return "sunglasses";
  if (/\b(hat|fedora|cap|beanie|visor|bucket hat|sun hat|straw hat)\b/.test(t)) return "hat";
  if (/\b(bracelet|bangle|cuff|wristband|charm bracelet)\b/.test(t)) return "bracelet";
  if (/\b(handbag|tote|crossbody|clutch|backpack|purse|satchel|shoulder bag|hobo bag|bag)\b/.test(t)) return "bag";
  if (/\b(dress|gown|maxi|midi|sundress|jumpsuit|romper)\b/.test(t)) return "dress";
  return null;
}

function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

async function fetchProductMeta(url: string): Promise<{ title: string; imageUrl: string }> {
  try {
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent": BROWSER_UA,
          "Accept-Language": "en-US,en;q=0.9",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        },
      },
      6000,
    );
    if (!res.ok) return { title: "", imageUrl: "" };
    const html = await res.text();
    const productTitle =
      html.match(/id="productTitle"[^>]*>\s*([^<]+)\s*<\/span>/i)?.[1] ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ||
      "";
    let imageUrl = "";
    const dynMatch = html.match(/data-a-dynamic-image="([^"]+)"/i);
    if (dynMatch) {
      try {
        const obj = JSON.parse(dynMatch[1].replace(/&quot;/g, '"'));
        const urls = Object.keys(obj);
        urls.sort((a, b) => (obj[b][0] || 0) - (obj[a][0] || 0));
        imageUrl = urls[0] || "";
      } catch {
        /* ignore */
      }
    }
    if (!imageUrl) {
      imageUrl =
        html.match(/id="landingImage"[^>]*data-old-hires="([^"]+)"/i)?.[1] ||
        html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1] ||
        "";
    }
    return { title: productTitle.trim().slice(0, 300), imageUrl };
  } catch {
    return { title: "", imageUrl: "" };
  }
}

async function imageUrlToDataUrl(url: string, timeoutMs = 6000): Promise<string> {
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: "https://www.amazon.com/",
      },
    },
    timeoutMs,
  );
  if (!res.ok) throw new Error(`image fetch ${res.status}`);
  const ctype = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${ctype};base64,${buf.toString("base64")}`;
}

function upscaleAmazonImage(url: string, size = "_SL1500_"): string {
  return url.replace(/\._[A-Z0-9_,]+_\.(jpg|jpeg|png|webp)/i, `.${size}.$1`);
}

async function fetchImageWithRetry(rawUrl: string): Promise<string> {
  const candidates = Array.from(
    new Set([
      upscaleAmazonImage(rawUrl, "_SL1500_"),
      upscaleAmazonImage(rawUrl, "_SL1200_"),
      upscaleAmazonImage(rawUrl, "_SL1000_"),
      rawUrl,
    ]),
  );
  let lastErr: unknown = null;
  for (const u of candidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const d = await imageUrlToDataUrl(u, 6000);
        if (d) return d;
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("image fetch failed");
}

// ---------- Multi-provider product resolution ----------

const ASIN_REGEX = /amazon\.com\/(dp|gp\/product)\/([A-Z0-9]{10})/i;

type ResolveResult = {
  imageUrl: string;
  title: string;
  productUrl: string;
};

export type ApiKeys = {
  tavily?: string;
  serper?: string;
  apiserpent?: string;
};

async function resolveAsinFromUrl(
  asin: string,
  fallbackTitle?: string,
  fallbackImageUrl?: string
): Promise<ResolveResult> {
  const canonicalUrl = `https://www.amazon.com/dp/${asin}`;
  const productUrl = appendAffiliateTag(canonicalUrl);
  const meta = await fetchProductMeta(canonicalUrl);

  // If fetchProductMeta found no image, build CDN URL directly from ASIN
  // Amazon CDN pattern: https://images-na.ssl-images-amazon.com/images/P/{ASIN}.jpg
  const cdnImageUrl = `https://images-na.ssl-images-amazon.com/images/P/${asin}.jpg`;

  return {
    imageUrl: meta.imageUrl || fallbackImageUrl || cdnImageUrl,
    title: meta.title || fallbackTitle || "",
    productUrl,
  };
}

// --- Tavily ---
async function resolveViaTavily(query: string, apiKey?: string): Promise<ResolveResult | null> {
  const key = apiKey || process.env.TAVILY_API_KEY;
  if (!key) {
    console.log("[Tavily] Skipped — no API key");
    return null;
  }

  console.log(`[Tavily] Trying query: "${query}"`);
  try {
    const res = await fetchWithTimeout(
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: key,
          query: `site:amazon.com/dp ${query} ${["", "women", "new", "top rated", "best"][Math.floor(Math.random() * 5)]}`.trim(),
          max_results: 5,
          include_domains: ["amazon.com"],
          search_depth: "basic",
        }),
      },
      8000,
    );

    if (!res.ok) {
      console.warn(`[Tavily] API error status ${res.status}`);
      return null;
    }

    const json = await res.json();
    const results: Array<{
      url?: string;
      title?: string;
      image?: string;
    }> = json.results || [];
    console.log(`[Tavily] Got ${results.length} results, URLs:`, results.map((r) => r.url));

    for (const r of results) {
      const match = r.url?.match(ASIN_REGEX);
      if (match) {
        console.log(`[Tavily] ✓ ASIN found: ${match[2]} from ${r.url}`);
        return resolveAsinFromUrl(match[2], r.title, r.image);
      }
    }

    console.log("[Tavily] ✗ No /dp/ link found in results");
    return null;
  } catch (e) {
    console.warn("[Tavily] Request failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// --- Serper ---
async function resolveViaSerper(query: string, apiKey?: string): Promise<ResolveResult | null> {
  const key = apiKey || process.env.SERPER_API_KEY;
  if (!key) {
    console.log("[Serper] Skipped — no API key");
    return null;
  }

  console.log(`[Serper] Trying query: "${query}"`);
  try {
    const res = await fetchWithTimeout(
      "https://google.serper.dev/search",
      {
        method: "POST",
        headers: {
          "X-API-KEY": key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: `site:amazon.com/dp/ ${query} ${["", "women", "new", "top rated", "best"][Math.floor(Math.random() * 5)]}`.trim(),
          num: 5,
          gl: "us",
          hl: "en",
        }),
      },
      8000,
    );

    if (!res.ok) {
      console.warn(`[Serper] API error status ${res.status}`);
      return null;
    }

    const json = await res.json();
    const organic: Array<{
      link?: string;
      title?: string;
      snippet?: string;
      imageUrl?: string;
    }> = json.organic || [];
    console.log(`[Serper] Got ${organic.length} organic results, URLs:`, organic.map((r) => r.link));

    for (const r of organic) {
      const match = r.link?.match(ASIN_REGEX);
      if (match) {
        console.log(`[Serper] ✓ ASIN found: ${match[2]} from ${r.link}`);
        return resolveAsinFromUrl(match[2], r.title, r.imageUrl);
      }
    }

    console.log("[Serper] ✗ No /dp/ link found in organic results");
    return null;
  } catch (e) {
    console.warn("[Serper] Request failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// --- Apiserpent ---
async function resolveViaApiserpent(query: string, apiKey?: string): Promise<ResolveResult | null> {
  const key = apiKey || process.env.APISERPENT_API_KEY;
  if (!key) {
    console.log("[Apiserpent] Skipped — no API key");
    return null;
  }

  console.log(`[Apiserpent] Trying query: "${query}"`);
  try {
    const suffix = ["", "women", "new", "top rated", "best"][Math.floor(Math.random() * 5)];
    const q = encodeURIComponent(`site:amazon.com/dp/ ${query} ${suffix}`.trim());
    const res = await fetchWithTimeout(
      `https://apiserpent.com/v1/search?q=${q}&api_key=${key}&num=5`,
      { method: "GET" },
      8000,
    );

    if (!res.ok) {
      console.warn(`[Apiserpent] API error status ${res.status}`);
      return null;
    }

    const json = await res.json();
    const organic: Array<{
      link?: string;
      title?: string;
      thumbnail?: string;
    }> = json.organic || [];
    console.log(`[Apiserpent] Got ${organic.length} organic results, URLs:`, organic.map((r) => r.link));

    for (const r of organic) {
      const match = r.link?.match(ASIN_REGEX);
      if (match) {
        console.log(`[Apiserpent] ✓ ASIN found: ${match[2]} from ${r.link}`);
        return resolveAsinFromUrl(match[2], r.title, r.thumbnail);
      }
    }

    console.log("[Apiserpent] ✗ No /dp/ link found in organic results");
    return null;
  } catch (e) {
    console.warn("[Apiserpent] Request failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// --- Helper: simplify a query for retry ---
function simplifyQuery(originalQuery: string): string {
  const words = originalQuery.trim().split(/\s+/).slice(0, 3);
  return [...words, "amazon"].join(" ");
}

// --- Fallback orchestrator: Tavily → Serper → Apiserpent → simplified retry → buildAffiliateUrl ---
async function resolveProductWithFallback(query: string, keys?: ApiKeys): Promise<ResolveResult> {
  const fallback: ResolveResult = { imageUrl: "", title: "", productUrl: buildAffiliateUrl(query) };
  console.log(`\n=== resolveProductWithFallback === query: "${query}"`);

  // Pass 1: Try all providers with original query
  // 1. Try Tavily
  const tavilyResult = await resolveViaTavily(query, keys?.tavily);
  if (tavilyResult) { console.log(`[Fallback] ✓ Resolved via Tavily`); return tavilyResult; }

  // 2. Try Serper
  const serperResult = await resolveViaSerper(query, keys?.serper);
  if (serperResult) { console.log(`[Fallback] ✓ Resolved via Serper`); return serperResult; }

  // 3. Try Apiserpent
  const apiserpentResult = await resolveViaApiserpent(query, keys?.apiserpent);
  if (apiserpentResult) { console.log(`[Fallback] ✓ Resolved via Apiserpent`); return apiserpentResult; }

  // Pass 2: Simplify query and retry all providers
  const simple = simplifyQuery(query);
  console.log(`[Fallback] All providers failed with original query. Retrying with simplified: "${simple}"`);

  const tavilyRetry = await resolveViaTavily(simple, keys?.tavily);
  if (tavilyRetry) { console.log(`[Fallback] ✓ Resolved via Tavily (retry)`); return tavilyRetry; }

  const serperRetry = await resolveViaSerper(simple, keys?.serper);
  if (serperRetry) { console.log(`[Fallback] ✓ Resolved via Serper (retry)`); return serperRetry; }

  const apiserpentRetry = await resolveViaApiserpent(simple, keys?.apiserpent);
  if (apiserpentRetry) { console.log(`[Fallback] ✓ Resolved via Apiserpent (retry)`); return apiserpentRetry; }

  // All failed → affiliate search URL
  console.log(`[Fallback] ✗ All providers failed (including retry). Using affiliate search URL.`);
  return fallback;
}

// ---------- types ----------

export type Accessory = {
  category: Category;
  name: string;
  search_query: string;
  description: string;
  amazon_url: string;
  image_url?: string | null;
  product_title?: string | null;
};

export type DressInfo = {
  title: string;
  style: string;
  color: string;
  vibe: string;
  occasion: string;
  url: string;
  image_url: string | null;
  category: Category;
};

export type SeoPin = {
  title: string;
  description: string;
  hashtags: string[];
};

export type AnalysisResult = {
  dress: DressInfo;
  accessories: Accessory[];
  seo: SeoPin;
};

// ---------- exported orchestrators ----------

export { ALL_CATEGORIES, appendAffiliateTag, buildAffiliateUrl, detectCategory, extractAmazonKeywords, fetchImageWithRetry, fetchProductMeta, fetchWithTimeout, imageUrlToDataUrl, upscaleAmazonImage, resolveProductWithFallback };
export type { Category };

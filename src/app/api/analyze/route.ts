import { NextRequest, NextResponse } from "next/server";
import {
  type Accessory,
  type AnalysisResult,
  type Category,
  appendAffiliateTag,
  buildAffiliateUrl,
  detectCategory,
  extractAmazonKeywords,
  fetchProductMeta,
  resolveProductWithFallback,
} from "@/utils/outfit.functions";
import { getApiKeys } from "@/utils/get-api-keys";

// Sanitize hashtags — keep only clean English alphanumeric ones
function cleanHashtags(hashtags: string[]): string[] {
  return (hashtags || [])
    .map((h) => h.replace(/^#/, "").trim())
    .filter((h) => /^[a-zA-Z0-9_]+$/.test(h) && h.length > 1 && h.length < 50)
    .slice(0, 12);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dressUrl: string = body?.dressUrl;

    if (!dressUrl || typeof dressUrl !== "string") {
      return NextResponse.json({ error: "dressUrl is required" }, { status: 400 });
    }

    // ── Step 1: Extract keywords & scrape product meta ──
    const { slug, searchKeywords, asin } = extractAmazonKeywords(dressUrl);
    const { title: scrapedTitle, imageUrl: productImageUrl } = await fetchProductMeta(dressUrl);
    const heuristicCategory = detectCategory(`${slug} ${searchKeywords} ${scrapedTitle}`) || "dress";

    const urlContext = [
      searchKeywords && `Search keywords: ${searchKeywords}`,
      slug && `URL slug: ${slug}`,
      asin && `ASIN: ${asin}`,
      scrapedTitle && `Product title: ${scrapedTitle}`,
      `Heuristic category guess: ${heuristicCategory}`,
    ]
      .filter(Boolean)
      .join("\n");

    const dressKeywordHint = searchKeywords || slug || scrapedTitle || "the product";

    // ── Step 2: Call AI for outfit analysis ──
    const systemPrompt = `CRITICAL RULES — NEVER BREAK THESE:
1. ALL 5 accessories must be WOMEN'S fashion items only
2. NEVER suggest men's products of any kind
3. NEVER suggest DIY supplies, craft kits, bulk packs, or non-wearable items
4. Each outfit must be unique — never repeat the same product names
5. search_query MUST include 'women' and the anchor's SPECIFIC color
6. Accessories must match the anchor's color story

PRODUCT TYPE RULES — CRITICAL:
- bracelet search_query: MUST produce a WEARABLE bracelet (e.g. "women red beaded stretch bracelet boho"). NEVER use words like "making", "kit", "diy", "bulk", "pcs", "beads", "cord" — these find craft supplies, not jewelry
- bag search_query: MUST produce a FASHION bag. NEVER use "clear", "transparent", "stadium" — these find security/event bags
- hat search_query: MUST produce a WOMEN'S FASHION hat. NEVER use "fishing", "safari", "hunting", "hard hat", "boater" — these find men's/utility hats
- sandals search_query: MUST produce women's sandals. NEVER use "men" or "unisex"
- sunglasses search_query: ALWAYS start with the word "sunglasses"

COLOR COORDINATION RULES — CRITICAL:
- Identify the EXACT primary color of the anchor product (e.g. "scarlet red", "navy blue", "sage green")
- For EVERY accessory search_query, the color must COORDINATE with the anchor color
- If anchor is RED: accessories should be red, gold, black, cream, or white — NOT blue, green, or purple
- If anchor is BLUE: accessories should be blue, silver, white, cream, or gold
- If anchor is GREEN: accessories should be green, tan, brown, gold, or cream
- The color word MUST appear in the search_query

VARIETY RULES:
- Add a style modifier to each search_query: boho, minimalist, elegant, casual, chic, vintage, modern, luxe
- search_query format: [category] + [coordinating color] + [style] + [material/descriptor]
- Examples for a RED boho dress:
  bag: "women red leather crossbody bag boho"
  sunglasses: "sunglasses gold frame women boho oversized"
  hat: "women red wide brim sun hat boho straw"
  bracelet: "women red beaded stretch bracelet boho gold"
  sandals: "women red strappy flat sandals boho summer"

You are an expert Amazon fashion stylist + SEO specialist building Pinterest OOTD pins.

STEP 1 — Identify the ANCHOR product:
- Determine its exact category (dress, bag, sunglasses, hat, bracelet, or sandals)
- Identify its PRIMARY color (be specific: "scarlet red" not just "red")
- Describe its style, vibe, and occasion

STEP 2 — Build a complete outfit with EXACTLY 5 accessories from the OTHER 5 categories:
  - If anchor is DRESS → propose: bag, sunglasses, hat, bracelet, sandals
  - If anchor is BAG → propose: dress, sunglasses, hat, bracelet, sandals
  - If anchor is SUNGLASSES → propose: dress, bag, hat, bracelet, sandals
  - If anchor is HAT → propose: dress, bag, sunglasses, bracelet, sandals
  - If anchor is BRACELET → propose: dress, bag, sunglasses, hat, sandals
  - If anchor is SANDALS → propose: dress, bag, sunglasses, hat, bracelet

STEP 3 — Write SEO Pin metadata:
- title: 60-95 chars, keyword-rich, sentence case
- description: 380-490 chars, 3-5 sentences, mention "amazon finds", end with "tap to shop the look"
- hashtags: 8-12 tags, ONLY English letters/numbers/underscores, NO spaces, NO foreign words, NO special characters

Respond with valid JSON only — no markdown, no explanation:
{
  "anchor": {
    "category": "dress|bag|sunglasses|hat|bracelet|sandals",
    "title": "string",
    "style": "string",
    "color": "string (specific, e.g. scarlet red)",
    "vibe": "string",
    "occasion": "string"
  },
  "accessories": [
    {
      "category": "string",
      "name": "string",
      "search_query": "string (4-7 words, includes color + women)",
      "description": "string"
    }
  ],
  "seo": {
    "title": "string (60-95 chars)",
    "description": "string (380-490 chars)",
    "hashtags": ["string"]
  }
}`;

    const userText = `Anchor product reference:
${urlContext || `URL: ${dressUrl}`}

${productImageUrl ? "Use the attached product image as the PRIMARY source of truth for category, color, pattern, silhouette, and material." : "No product image available — infer from text above."}

Identify the anchor's category and EXACT color, then style 5 matching accessories, then write SEO metadata. Respond with JSON only.`;

    const userContent: Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> = [
      { type: "text", text: userText },
    ];

    if (productImageUrl) {
      userContent.push({ type: "image_url", image_url: { url: productImageUrl } });
    }

    const apiKeys = await getApiKeys();
    const openrouterKey = apiKeys.openrouter || process.env.OPENROUTER_API_KEY;

    if (!openrouterKey) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY not configured. Add it in Settings → API Keys." },
        { status: 400 }
      );
    }

    const openrouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen/qwen2.5-vl-72b-instruct",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!openrouterRes.ok) {
      const errText = await openrouterRes.text();
      console.error("[OpenRouter] Error:", openrouterRes.status, errText.slice(0, 300));
      return NextResponse.json(
        { error: `AI analysis failed (${openrouterRes.status})` },
        { status: 502 }
      );
    }

    const completionJson = await openrouterRes.json();
    const aiResponseText = completionJson.choices?.[0]?.message?.content;
    if (!aiResponseText) {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    let cleaned = aiResponseText.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }
    const parsed = JSON.parse(cleaned);

    const anchorCategory: Category = parsed.anchor.category;

    const cleanAccessories = (parsed.accessories as Accessory[]).filter(
      (a) => a.category !== anchorCategory,
    );

    // ── Step 3: Refine search queries with anchor style tokens ──
    const stopWords = new Set([
      "dress", "women", "with", "from", "this", "that", "the", "and", "for", "her",
      "style", "vibe", "look", "outfit", "bag", "hat", "sandals", "bracelet", "sunglasses",
    ]);
    function tokenize(s: string): string[] {
      return (s || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w));
    }
    const anchorColor = (parsed.anchor.color || "").toLowerCase().split(/[\s,/]+/).filter(Boolean)[0] || "";
    const anchorStyleTokens = tokenize(parsed.anchor.style);
    const anchorVibeTokens = tokenize(parsed.anchor.vibe);
    const urlTokens = tokenize(dressKeywordHint);
    const styleHint = anchorStyleTokens[0] || anchorVibeTokens[0] || "";
    const vibeHint = anchorVibeTokens[0] || "";
    const occasionHint = tokenize(parsed.anchor.occasion)[0] || "";

    const categoryBoost: Record<Category, string> = {
      dress: "women summer",
      bag: "women crossbody",
      sunglasses: "women uv400",
      hat: "women wide brim",
      bracelet: "women",
      sandals: "women",
    };

    const refined = cleanAccessories.map((a) => {
      const lower = a.search_query.toLowerCase();
      const parts = [a.search_query.trim()];
      if (anchorColor && !lower.includes(anchorColor)) parts.push(anchorColor);
      if (styleHint && !lower.includes(styleHint)) parts.push(styleHint);
      if (vibeHint && vibeHint !== styleHint && !lower.includes(vibeHint)) parts.push(vibeHint);
      if (occasionHint && !lower.includes(occasionHint) && parts.join(" ").split(/\s+/).length < 7) {
        parts.push(occasionHint);
      }
      const boost = categoryBoost[a.category];
      const boostKeyword = boost?.split(" ")[1];
      if (boostKeyword && !lower.includes(boostKeyword)) parts.push(boost);
      const joined = parts.join(" ").toLowerCase();
      const hasUrlTok = urlTokens.some((t) => joined.includes(t));
      if (!hasUrlTok && urlTokens[0]) parts.push(urlTokens[0]);
      const finalQ = parts.join(" ").split(/\s+/).slice(0, 10).join(" ");
      return { accessory: a, query: finalQ };
    });

    // ── Step 4: Resolve each accessory in parallel ──
    const scraped = await Promise.all(
      refined.map(async ({ accessory, query }) => {
        const result = await resolveProductWithFallback(query, apiKeys);
        return { accessory, query, result };
      }),
    );

    // ── Step 5: Validate resolved products ──
    const CATEGORY_KEYWORDS: Record<Category, string[]> = {
      dress: ["dress", "gown", "maxi", "midi", "sundress", "jumpsuit", "romper", "skirt"],
      bag: ["bag", "tote", "handbag", "purse", "crossbody", "clutch", "backpack",
            "satchel", "hobo", "shoulder bag", "wristlet", "wallet", "pouch"],
      sunglasses: ["sunglasses", "sunglass", "sun glasses", "eyewear", "shades",
                   "aviator", "uv400", "polarized", "anti-glare"],
      hat: ["hat", "cap", "fedora", "beanie", "visor", "bucket hat", "sun hat", "straw hat"],
      bracelet: ["bracelet", "bangle", "cuff", "wristband", "anklet", "jewelry",
                 "jewellery", "charm", "necklace", "chain", "pendant", "earring",
                 "ring", "gold plated", "sterling silver", "dainty", "layered", "delicate"],
      sandals: ["sandals", "sandal", "flip flop", "espadrille", "wedge", "slide", "mule", "flat"],
    };

    // Global reject words (wrong product type entirely)
    const GLOBAL_REJECT = [
      "coffee", "food", "drink", "supplement", "vitamin", "book", "kindle",
      "cable", "phone case", "sweatshirt", "hoodie", "t-shirt", "tshirt",
      "sweater", "pullover", "crewneck", "graphic tee", "leggings", "shorts",
      "pajama", "swimsuit", "poster", "sticker", "mug", "tumbler",
    ];

    // Category-specific reject words (DIY supplies, wrong-type items)
    const CATEGORY_REJECT: Record<Category, string[]> = {
      bracelet: ["making", "diy", "kit", "bulk", "pcs", "piece", "supply",
                 "beads bead", "cord wire", "twisted cord", "jewelry making",
                 "bracelet making", "craft"],
      bag: ["clear", "transparent", "stadium", "security event", "see through"],
      hat: ["fishing", "safari", "hunting", "hard hat", "boater", "costume",
            "helmets", "bump cap"],
      sunglasses: ["reading glasses", "magnif", "bifocal"],
      dress: [],
      sandals: [],
    };

    function isRejectedProduct(title: string, category: Category): boolean {
      const lower = title.toLowerCase();
      if (GLOBAL_REJECT.some(w => lower.includes(w))) return true;
      if (CATEGORY_REJECT[category]?.some(w => lower.includes(w))) return true;
      return false;
    }

    function isCorrectCategory(title: string, category: Category): boolean {
      if (!title) return true;
      const lower = title.toLowerCase();
      return CATEGORY_KEYWORDS[category].some(kw => lower.includes(kw));
    }

    const accessoriesWithLinks: Accessory[] = scraped.map(({ accessory, query, result }) => {
      let finalResult = result;

      if (result.title && isRejectedProduct(result.title, accessory.category)) {
        console.warn(`[Validate] ✗ Rejected (wrong type): "${result.title}"`);
        finalResult = { imageUrl: "", title: "", productUrl: buildAffiliateUrl(query) };
      }

      if (finalResult.title && !isCorrectCategory(finalResult.title, accessory.category)) {
        console.warn(`[Validate] ✗ Category mismatch for ${accessory.category}: "${finalResult.title}"`);
        finalResult = { imageUrl: "", title: "", productUrl: buildAffiliateUrl(query) };
      }

      const productUrl = finalResult.productUrl
        ? appendAffiliateTag(finalResult.productUrl)
        : buildAffiliateUrl(query);

      return {
        ...accessory,
        search_query: query,
        amazon_url: productUrl,
        image_url: finalResult.imageUrl || null,
        product_title: finalResult.title || null,
      };
    });

    const analysisResult: AnalysisResult = {
      dress: {
        title: parsed.anchor.title,
        style: parsed.anchor.style,
        color: parsed.anchor.color,
        vibe: parsed.anchor.vibe,
        occasion: parsed.anchor.occasion,
        category: anchorCategory,
        url: appendAffiliateTag(dressUrl),
        image_url: productImageUrl || null,
      },
      accessories: accessoriesWithLinks,
      seo: {
        ...parsed.seo,
        hashtags: cleanHashtags(parsed.seo.hashtags),
      },
    };

    return NextResponse.json(analysisResult);
  } catch (e) {
    console.error("analyzeOutfit error", e);
    const message = e instanceof Error ? e.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

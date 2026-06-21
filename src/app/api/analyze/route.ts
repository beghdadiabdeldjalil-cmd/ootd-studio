import { NextRequest, NextResponse } from "next/server";
import {
  type Accessory,
  type AnalysisResult,
  type Category,
  ALL_CATEGORIES,
  appendAffiliateTag,
  buildAffiliateUrl,
  detectCategory,
  extractAmazonKeywords,
  fetchProductMeta,
  resolveProductWithFallback,
} from "@/utils/outfit.functions";
import { getApiKeys } from "@/utils/get-api-keys";

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
1. ALL 5 accessories must be WOMEN'S items only
2. NEVER suggest men's products of any kind
3. Each outfit must be unique — never repeat the same
   product names across different requests
4. search_query MUST start with women's or include 'women'
   Example: 'women boho crossbody bag tan leather'
5. Accessories must match the anchor's color story

VARIETY RULES — CRITICAL:
- NEVER suggest the same product name twice
- For search_query, always include the anchor's
  SPECIFIC color (e.g. 'sage green', 'dusty rose',
  not just 'green' or 'pink')
- Rotate styles: if anchor is boho, suggest boho accessories.
  If anchor is elegant, suggest elegant accessories.
- Add a random style modifier to each search_query from this list:
  boho, minimalist, elegant, casual, chic, vintage, modern, luxe
- search_query format must be:
  [category] + [color] + [style] + [material or descriptor]
  Example: 'sunglasses tortoiseshell women boho oversized'
  Example: 'straw hat women wide brim beach boho'
  Example: 'crossbody bag tan leather minimalist women'

You are an expert Amazon fashion stylist + SEO specialist building Pinterest "Outfit of the Day" pins.

The user pastes ANY Amazon fashion product link — it could be a DRESS, BAG, SUNGLASSES, HAT, BRACELET, or SANDALS. That product is the OUTFIT ANCHOR (centerpiece of the look).

STEP 1 — Identify the ANCHOR product:
- Determine its exact category (one of: dress, bag, sunglasses, hat, bracelet, sandals).
- Describe its color, pattern, material, style, vibe, and ideal occasion.

STEP 2 — Build a complete outfit AROUND the anchor with EXACTLY 5 matching products from the OTHER categories. The 6 categories are: dress, bag, sunglasses, hat, bracelet, sandals. Whichever category the anchor belongs to is EXCLUDED from the 5 accessories. The remaining 5 categories MUST all be present.
  - If anchor is a DRESS → propose: bag, sunglasses, hat, bracelet, sandals
  - If anchor is a BAG → propose: dress, sunglasses, hat, bracelet, sandals
  - If anchor is SUNGLASSES → propose: dress, bag, hat, bracelet, sandals
  - If anchor is a HAT → propose: dress, bag, sunglasses, bracelet, sandals
  - If anchor is a BRACELET → propose: dress, bag, sunglasses, hat, sandals
  - If anchor is SANDALS → propose: dress, bag, sunglasses, hat, bracelet

CRITICAL — search_query rules (these become Amazon search URLs):
- 4-7 words, very specific
- Always include color + material/style words that match/complement the anchor
- Include the anchor's style keyword (e.g. "boho", "summer", "beach") so the look is cohesive
- For sunglasses search_query: ALWAYS include the word 'sunglasses' as the FIRST word. Example: 'sunglasses tortoise shell women retro'. NEVER use 'tortoise shell cat eye' without 'sunglasses' first.
- Example for a tan straw tote bag anchor: dress="white floral midi dress boho summer", sunglasses="sunglasses tortoise shell women retro summer", hat="wide brim straw beach hat women", bracelet="gold layered chain bracelet boho", sandals="tan strappy flat sandals women summer"

STEP 3 — Write a hybrid SEO Pin block tuned for Pinterest + Google + Amazon shoppers:
- title: 60-95 chars, keyword-rich, click-worthy, sentence case
- description: 380-490 chars (Pinterest hard limit is 500). 3-5 flowing sentences. Open with the look + vibe, describe each piece and how it pairs together, mention occasion/season, end with a soft call-to-action like "tap to shop the look". Natural, conversational. Weave in keywords like "amazon finds", "amazon fashion", "outfit inspo".
- hashtags: 8-12 lowercase tags, mix of broad + niche + intent (#amazonfinds, #ootd).

You MUST respond with valid JSON only, following this exact schema. No markdown fences, no explanation, just the raw JSON object:
{
  "anchor": {
    "category": "dress|bag|sunglasses|hat|bracelet|sandals",
    "title": "string",
    "style": "string",
    "color": "string",
    "vibe": "string",
    "occasion": "string"
  },
  "accessories": [
    {
      "category": "string (one of the remaining 5 categories)",
      "name": "string",
      "search_query": "string (4-7 words for Amazon search)",
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

${productImageUrl ? "Use the attached product image as the primary source of truth for category, color, pattern, silhouette, material." : "No product image available — infer from text above."}

Identify the anchor's category, then style 5 matching items from the OTHER 5 categories, then write SEO pin metadata. Respond with JSON only.`;

    // Build messages for VLM (supports image_url content)
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

    // Parse JSON from AI response — strip markdown fences if present
    let cleaned = aiResponseText.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }
    const parsed = JSON.parse(cleaned);

    const anchorCategory: Category = parsed.anchor.category;

    // Filter out any accessory that accidentally repeats the anchor category
    const cleanAccessories: Accessory[] = (parsed.accessories as Accessory[]).filter(
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
      const boostKeyword = boost.split(" ")[1];
      if (boostKeyword && !lower.includes(boostKeyword)) parts.push(boost);
      const joined = parts.join(" ").toLowerCase();
      const hasUrlTok = urlTokens.some((t) => joined.includes(t));
      if (!hasUrlTok && urlTokens[0]) parts.push(urlTokens[0]);
      const finalQ = parts.join(" ").split(/\s+/).slice(0, 10).join(" ");
      return { accessory: a, query: finalQ };
    });

    // ── Step 4: Resolve each accessory via multi-provider fallback ──
    const scraped = await Promise.all(
      refined.map(async ({ accessory, query }) => {
        const result = await resolveProductWithFallback(query, apiKeys);
        return { accessory, query, result };
      }),
    );

    // Category keywords for validation
    const CATEGORY_KEYWORDS: Record<Category, string[]> = {
      dress: ["dress", "gown", "maxi", "midi", "sundress", "jumpsuit", "romper", "skirt"],
      bag: ["bag", "tote", "handbag", "purse", "crossbody",
            "clutch", "backpack", "satchel", "hobo", "shoulder bag",
            "wristlet", "wallet", "pouch"],
      sunglasses: [
        "sunglasses", "sunglass", "sun glasses",
        "eyewear", "shades", "aviator",
        "uv400", "polarized", "anti-glare",
        "optical", "lens protection",
      ],
      hat: ["hat", "cap", "fedora", "beanie", "visor", "bucket hat", "sun hat", "straw hat"],
      bracelet: [
        "bracelet", "bangle", "cuff", "wristband", "anklet",
        "jewelry", "jewellery", "charm", "necklace", "chain",
        "pendant", "earring", "ring", "gold plated", "sterling silver",
        "dainty", "layered", "delicate"
      ],
      sandals: ["sandals", "sandal", "flip flop", "espadrille", "wedge", "slide", "mule", "flat"],
    };

    function isCorrectCategory(title: string, category: Category): boolean {
      if (!title) return true; // no title = can't validate, allow it
      const lower = title.toLowerCase();
      const keywords = CATEGORY_KEYWORDS[category];
      return keywords.some(kw => lower.includes(kw));
    }

    const REJECT_WORDS = [
      "coffee", "food", "drink", "supplement", "vitamin",
      "book", "kindle", "cable", "phone case",
      "sweatshirt", "hoodie", "t-shirt", "tshirt",
      "sweater", "pullover", "crewneck", "graphic tee",
      "leggings", "shorts", "pajama", "swimsuit",
      "poster", "sticker", "mug", "tumbler",
    ];

    function isRejectedProduct(title: string): boolean {
      const lower = title.toLowerCase();
      return REJECT_WORDS.some(w => lower.includes(w));
    }

    const accessoriesWithLinks: Accessory[] = scraped.map(({ accessory, query, result }) => {
      let finalResult = result;

      // If resolved product title contains reject words, reject immediately
      if (result.title && isRejectedProduct(result.title)) {
        console.warn(
          `[Validate] ✗ Rejected product: "${result.title}"`
        );
        finalResult = {
          imageUrl: "",
          title: "",
          productUrl: buildAffiliateUrl(query),
        };
      }

      // If resolved product title doesn't match expected category,
      // fall back to affiliate search URL instead of showing wrong product
      if (finalResult.title && !isCorrectCategory(finalResult.title, accessory.category)) {
        console.warn(
          `[Validate] ✗ Category mismatch for ${accessory.category}: "${finalResult.title}" → using search URL`
        );
        finalResult = {
          imageUrl: "",
          title: "",
          productUrl: buildAffiliateUrl(query),
        };
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

    // ── Step 5: Build and return result ──
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
      seo: parsed.seo,
    };

    return NextResponse.json(analysisResult);
  } catch (e) {
    console.error("analyzeOutfit error", e);
    const message = e instanceof Error ? e.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

"use client";

import { useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import {
  Sparkles,
  Link2,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  ShoppingBag,
  Wand2,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiKeySettings } from "@/components/api-key-settings";
import CollageEditor from "@/components/CollageEditor";
import type { AnalysisResult } from "@/utils/outfit.functions";

const categoryIcon: Record<string, string> = {
  dress: "👗",
  bag: "👜",
  sunglasses: "🕶️",
  hat: "👒",
  bracelet: "💍",
  sandals: "👡",
};

export default function Home() {
  const [dressUrl, setDressUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [collageUrl, setCollageUrl] = useState<string | null>(null);
  const [copiedLinks, setCopiedLinks] = useState(false);
  const [copiedSeo, setCopiedSeo] = useState(false);

  const handleAnalyze = async () => {
    const liveValue = inputRef.current?.value ?? "";
    const url = (dressUrl || liveValue).trim();
    if (!url) {
      toast.error("Paste an Amazon fashion link first");
      inputRef.current?.focus();
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      toast.error("That doesn't look like a valid link. It should start with https://");
      return;
    }
    if (!dressUrl && liveValue) setDressUrl(liveValue);

    setLoading(true);
    setResult(null);
    setCollageUrl(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dressUrl: url }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Analysis failed");
      }
      const data: AnalysisResult = await res.json();
      setResult(data);
      setLoading(false);
      toast.success("Outfit curated ✨");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  };

  const copyAllLinks = async () => {
    if (!result) return;
    const anchorIcon2 = categoryIcon[result.dress.category] || "✨";
    const lines = [
      `✨ ${result.seo.title}`,
      ``,
      `${anchorIcon2} ${result.dress.title}: ${result.dress.url}`,
      ...result.accessories.map(
        (a) => `${categoryIcon[a.category] || "•"} ${a.name}: ${a.amazon_url}`,
      ),
    ].join("\n");
    await navigator.clipboard.writeText(lines);
    setCopiedLinks(true);
    toast.success("All links copied");
    setTimeout(() => setCopiedLinks(false), 2000);
  };

  const copySeo = async () => {
    if (!result) return;
    const block = [
      result.seo.title,
      ``,
      result.seo.description,
      ``,
      result.seo.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" "),
    ].join("\n");
    await navigator.clipboard.writeText(block);
    setCopiedSeo(true);
    toast.success("Pin SEO copied");
    setTimeout(() => setCopiedSeo(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--gradient-warm)" }}>
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="font-display text-xl font-semibold">OOTD Studio</span>
        </div>
        <div className="flex items-center gap-2">
          <ApiKeySettings />
          <Badge variant="secondary" className="hidden sm:inline-flex">
            Amazon Influencers
          </Badge>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-6 pt-6 pb-12">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="secondary" className="mb-4">
            <Wand2 className="mr-1 h-3 w-3" />
            AI-powered OOTD styling
          </Badge>
          <h1 className="font-display text-4xl font-semibold leading-[1.05] sm:text-6xl">
            Your perfect outfit,
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--gradient-primary)" }}
            >
              styled & matched
            </span>{" "}
            for you.
          </h1>
          <p className="mt-5 text-base text-muted-foreground sm:text-lg">
            Paste any Amazon fashion piece — a dress, bag, hat, sunglasses, sandals,
            or bracelet — and we&apos;ll build a complete, coordinating outfit around it.
            Get a stunning OOTD collage, perfectly matched accessories, and direct
            Amazon links ready to shop and share.
          </p>

          {/* Input */}
          <div className="mx-auto mt-8 max-w-2xl">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://www.amazon.com/.../dp/..."
                  value={dressUrl}
                  onChange={(e) => setDressUrl(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text");
                    if (pasted) {
                      setTimeout(() => setDressUrl(pasted.trim()), 0);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!loading) handleAnalyze();
                    }
                  }}
                  className="h-12 pl-9"
                />
              </div>
              <Button
                type="button"
                onClick={handleAnalyze}
                disabled={loading}
                size="lg"
                className="h-12 shrink-0 px-6"
                style={{ background: "var(--gradient-primary)" }}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Styling...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" /> Style it
                  </>
                )}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Direct Amazon product links — no setup needed.
            </p>
          </div>
        </div>
      </section>

      {/* Results */}
      {(loading || result) && (
        <section className="container mx-auto px-6 pb-20">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            {/* Left: collage editor */}
            <div className="space-y-4">
              {result && (
                <CollageEditor
                  result={result}
                  onExport={(dataUrl) => setCollageUrl(dataUrl)}
                />
              )}
              {!result && loading && (
                <Card
                  className="overflow-hidden p-0"
                  style={{ boxShadow: "var(--shadow-soft)" }}
                >
                  <div className="relative aspect-[2/3] w-full bg-muted flex flex-col items-center justify-center gap-3">
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">
                      Analyzing your product...
                    </p>
                  </div>
                </Card>
              )}
            </div>

            {/* Right: details */}
            <div className="space-y-6">
              {result && (
                <>
                  {/* Style analysis */}
                  <Card className="p-5">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Style analysis
                    </p>
                    <h3 className="mt-1 font-display text-xl font-semibold">
                      {result.dress.title}
                    </h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="secondary">{result.dress.style}</Badge>
                      <Badge variant="secondary">{result.dress.color}</Badge>
                      <Badge variant="secondary">{result.dress.vibe}</Badge>
                      <Badge variant="secondary">{result.dress.occasion}</Badge>
                    </div>
                  </Card>

                  {/* SEO Pin */}
                  <Card className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4 text-primary" />
                        <p className="text-sm font-semibold">Pinterest SEO pin</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={copySeo}>
                        {copiedSeo ? (
                          <>
                            <Check className="mr-1 h-3.5 w-3.5" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                          </>
                        )}
                      </Button>
                    </div>
                    <h4 className="mt-3 font-display text-lg leading-snug">
                      {result.seo.title}
                    </h4>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {result.seo.description}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {result.seo.hashtags.map((h) => (
                        <span
                          key={h}
                          className="rounded-full bg-accent/40 px-2.5 py-0.5 text-xs text-accent-foreground"
                        >
                          {h.startsWith("#") ? h : `#${h}`}
                        </span>
                      ))}
                    </div>
                  </Card>

                  {/* Products grid */}
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-display text-lg font-semibold">
                        Products in this look
                      </h3>
                      <Button size="sm" variant="outline" onClick={copyAllLinks}>
                        {copiedLinks ? (
                          <>
                            <Check className="mr-1 h-3.5 w-3.5" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="mr-1 h-3.5 w-3.5" /> Copy all links
                          </>
                        )}
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {/* Anchor product card */}
                      <a
                        href={result.dress.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group"
                      >
                        <Card className="h-full overflow-hidden p-0 transition-all hover:shadow-lg ring-2 ring-primary/40">
                          <div className="aspect-square w-full overflow-hidden bg-muted">
                            {result.dress.image_url ? (
                              <img
                                src={result.dress.image_url}
                                alt={result.dress.title}
                                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-4xl">
                                {categoryIcon[result.dress.category] || "✨"}
                              </div>
                            )}
                          </div>
                          <div className="p-3">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-primary">
                              {result.dress.category} · your pick
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm font-medium">
                              {result.dress.title}
                            </p>
                            <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                              Shop on Amazon{" "}
                              <ExternalLink className="h-3 w-3" />
                            </span>
                          </div>
                        </Card>
                      </a>

                      {/* Accessories */}
                      {result.accessories.map((a) => (
                        <a
                          key={a.category}
                          href={a.amazon_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group"
                        >
                          <Card className="h-full overflow-hidden p-0 transition-all hover:shadow-lg">
                            <div className="aspect-square w-full overflow-hidden bg-accent/30">
                              {a.image_url ? (
                                <img
                                  src={a.image_url}
                                  alt={a.product_title || a.name}
                                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-5xl">
                                  {categoryIcon[a.category] || "✨"}
                                </div>
                              )}
                            </div>
                            <div className="p-3">
                              <p className="text-[10px] font-medium uppercase tracking-wider text-primary">
                                {a.category}
                              </p>
                              <p className="mt-1 line-clamp-2 text-sm font-medium">
                                {a.product_title || a.name}
                              </p>
                              <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                                Shop on Amazon{" "}
                                <ExternalLink className="h-3 w-3" />
                              </span>
                            </div>
                          </Card>
                        </a>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {loading && !result && (
                <div className="space-y-3">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-32 w-full" />
                  <div className="grid grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-48 w-full" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {!loading && !result && (
        <section className="container mx-auto px-6 pb-20 flex-1">
          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { icon: Sparkles, title: "AI outfit matching", text: "Paste any fashion piece and get a full coordinating outfit — colors, vibes, and styles that work together." },
              { icon: ShoppingBag, title: "Shop the look", text: "Every matched piece links directly to Amazon — one click to cart the whole outfit." },
              { icon: Hash, title: "OOTD-ready", text: "Collage, SEO copy, and hashtags — everything you need to post your outfit of the day." },
            ].map((f) => (
              <Card key={f.title} className="p-5">
                <f.icon className="h-5 w-5 text-primary" />
                <p className="mt-3 font-display text-base font-semibold">{f.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t py-6 text-center text-xs text-muted-foreground mt-auto">
        OOTD Studio — AI-powered outfit coordination for women who love to style. Verify products before purchasing.
      </footer>
    </div>
  );
}

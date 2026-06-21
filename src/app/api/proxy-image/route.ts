import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const allowedDomains = [
    "m.media-amazon.com",
    "images-na.ssl-images-amazon.com",
    "images-eu.ssl-images-amazon.com",
    "images-fe.ssl-images-amazon.com",
  ];

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (!allowedDomains.some(d => hostname.endsWith(d))) {
    return NextResponse.json({ error: "domain not allowed" }, { status: 403 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.amazon.com/",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json({ error: "upstream failed" }, { status: 502 });
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/jpeg";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "proxy failed" }, { status: 500 });
  }
}

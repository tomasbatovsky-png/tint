import { NextResponse } from "next/server";
import dns from "node:dns/promises";
import net from "node:net";
import { extractReadableText, scoreText, summarizeMix } from "../../../lib/atmosphere";

export const runtime = "nodejs";

const PRIVATE_HOSTS = new Set(["localhost", "0.0.0.0", "127.0.0.1", "::1"]);

function isPrivateIp(ip) {
  if (!ip) return true;
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    );
  }
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
  }
  return true;
}

async function validatePublicUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Enter a valid URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http and https URLs can be scanned.");
  if (PRIVATE_HOSTS.has(url.hostname.toLowerCase())) throw new Error("This URL cannot be scanned.");

  const records = await dns.lookup(url.hostname, { all: true, verbatim: false });
  if (!records.length || records.some(record => isPrivateIp(record.address))) {
    throw new Error("This URL cannot be scanned.");
  }

  return url;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const url = await validatePublicUrl(body?.url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "user-agent": "TintAtmospherePreview/0.1"
      }
    });
    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("text/html")) {
      return NextResponse.json(
        { error: "Couldn’t read this page. Some sites block automated previews." },
        { status: 422 }
      );
    }

    const html = await response.text();
    const text = extractReadableText(html);
    if (text.length < 80) {
      return NextResponse.json(
        { error: "Couldn’t read enough visible text from this page." },
        { status: 422 }
      );
    }

    const mix = scoreText(text);
    return NextResponse.json({
      url: url.toString(),
      summary: summarizeMix(mix),
      mix,
      note: "Atmosphere mix, not truth probability."
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Couldn’t read this page. Some sites block automated previews." },
      { status: 400 }
    );
  }
}

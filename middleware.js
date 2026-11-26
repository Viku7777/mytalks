import { readFileSync } from "node:fs";
import { join } from "node:path";
import { next } from "@vercel/functions/middleware";
import {
  canonicalHref,
  isProfileOrArticle,
  noindexShellHtml,
  rewritePageHtml,
} from "./lib/page-canonical.mjs";
import { prerenderDocument } from "./lib/prerender-pages.mjs";

export const config = {
  runtime: "nodejs",
  matcher: [
    "/pages/blog-details",
    "/pages/advisor-profile",
    "/pages/blog-details.html",
    "/pages/advisor-profile.html",
  ],
};

function readFirst(primary, fallbackName) {
  try {
    return readFileSync(primary, "utf8");
  } catch (err) {
    try {
      return readFileSync(join(process.cwd(), "pages", fallbackName), "utf8");
    } catch (fallbackErr) {
      return null;
    }
  }
}

const blogTemplate = readFirst(
  new URL("./pages/blog-details.html", import.meta.url),
  "blog-details.html"
);
const advisorTemplate = readFirst(
  new URL("./pages/advisor-profile.html", import.meta.url),
  "advisor-profile.html"
);

function readTemplate(pathname) {
  return String(pathname).includes("advisor-profile") ? advisorTemplate : blogTemplate;
}

export default function middleware(request) {
  const url = new URL(request.url);
  if (!isProfileOrArticle(url.pathname)) return next();
  if (request.method !== "GET" && request.method !== "HEAD") return next();

  const href = canonicalHref(url.pathname, url.searchParams);
  if (!href) {
    const dest = String(url.pathname).includes("advisor-profile")
      ? "/pages/find-advisor"
      : "/pages/blog";
    return new Response(null, {
      status: 301,
      headers: { Location: dest, "Cache-Control": "no-store" },
    });
  }

  const template = readTemplate(url.pathname);
  if (!template) return next();
  const rendered = prerenderDocument(template, url.pathname, url.searchParams);
  let body;
  if (href && (rendered.found || rendered.dataMissing)) {
    const source = rendered.found ? rendered.html : template;
    body = rewritePageHtml(source, href).html;
  } else {
    body = noindexShellHtml(rendered.html || template);
  }

  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  if (href) headers.set("Link", "<" + href + '>; rel="canonical"');
  return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
}

const SAFE_ID = /^[a-z0-9-]{1,120}$/i;

export function pagePath(pathname) {
  return String(pathname || "").replace(/\.html$/i, "").replace(/\/+$/, "") || "/";
}

export function isProfileOrArticle(pathname) {
  const path = pagePath(pathname);
  return path === "/pages/blog-details" || path === "/pages/advisor-profile";
}

/** Self-referencing canonical, or null when the query does not identify one page. */
export function canonicalHref(pathname, searchParams) {
  const path = pagePath(pathname);
  if (path === "/pages/blog-details") {
    const slug = searchParams.get("slug") || "";
    if (!SAFE_ID.test(slug)) return null;
    return "https://mytalk.in/pages/blog-details?slug=" + slug;
  }
  if (path === "/pages/advisor-profile") {
    const id = searchParams.get("id") || "";
    if (!SAFE_ID.test(id)) return null;
    return "https://mytalk.in/pages/advisor-profile?id=" + id;
  }
  return null;
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function rewritePageHtml(html, href) {
  const safe = escapeAttr(href);
  const linkRe = /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/;
  const ogRe = /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/;
  const linkReplaced = linkRe.test(html);
  const ogReplaced = ogRe.test(html);
  const next = html
    .replace(linkRe, '<link rel="canonical" href="' + safe + '" />')
    .replace(ogRe, '<meta property="og:url" content="' + safe + '" />');
  return { html: next, linkReplaced, ogReplaced };
}

export function noindexShellHtml(html) {
  if (/<meta\s+name="robots"/i.test(html)) return html;
  return html.replace(
    "</head>",
    '<meta name="robots" content="noindex, follow" />\n</head>'
  );
}

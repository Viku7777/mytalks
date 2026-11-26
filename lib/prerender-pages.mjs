import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pagePath } from "./page-canonical.mjs";

function readJson(primary, fallback) {
  try {
    return JSON.parse(readFileSync(primary, "utf8"));
  } catch (err) {
    try {
      return JSON.parse(readFileSync(fallback, "utf8"));
    } catch (fallbackErr) {
      return null;
    }
  }
}

const blogs = readJson(
  new URL("../data/blogs.json", import.meta.url),
  join(process.cwd(), "data", "blogs.json")
);
const advisors = readJson(
  new URL("../data/advisors.json", import.meta.url),
  join(process.cwd(), "data", "advisors.json")
);

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function replaceTitle(html, title) {
  return html.replace(/<title>[^<]*<\/title>/, "<title>" + esc(title) + "</title>");
}

function replaceMeta(html, attr, key, content) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    "(<meta\\s+" + attr + '="' + escapedKey + '"\\s+content=")[^"]*(")',
    "i"
  );
  if (!re.test(html)) return html;
  return html.replace(re, "$1" + esc(content) + "$2");
}

function replaceJsonLd(html, id, data) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const re = new RegExp(
    '<script id="' + id + '" type="application/ld\\+json">[\\s\\S]*?</script>'
  );
  const tag =
    '<script id="' + id + '" type="application/ld+json">' + json + "</script>";
  if (re.test(html)) return html.replace(re, tag);
  return html.replace("</head>", tag + "\n</head>");
}

function blogArticle(post) {
  const paragraphs = (post.content || [])
    .map(function (paragraph) {
      return "<p>" + esc(paragraph) + "</p>";
    })
    .join("");
  const related = (blogs || [])
    .filter(function (item) {
      return item.slug !== post.slug && item.category === post.category;
    })
    .concat(
      (blogs || []).filter(function (item) {
        return item.slug !== post.slug && item.category !== post.category;
      })
    )
    .slice(0, 3);
  const relatedHtml = related
    .map(function (item) {
      return (
        '<a class="card" href="/pages/blog-details?slug=' +
        esc(item.slug) +
        '"><strong>' +
        esc(item.title) +
        '</strong><p class="hint mt-4">' +
        esc(item.category) +
        "</p></a>"
      );
    })
    .join("");
  return (
    '<img class="blog-detail__hero" src="' +
    esc(post.image) +
    '" alt="' +
    esc(post.title) +
    '" width="1200" height="514" />' +
    "<h1>" +
    esc(post.title) +
    "</h1>" +
    '<div class="blog-detail__meta"><span>By ' +
    esc(post.author) +
    "</span><span>" +
    esc(post.date) +
    "</span><span>" +
    esc(post.readingTime) +
    ' min read</span><span class="tag">' +
    esc(post.category) +
    "</span></div>" +
    '<div class="prose">' +
    paragraphs +
    "</div>" +
    '<h2 class="mt-8">Related posts</h2><div class="grid-3 mt-6">' +
    relatedHtml +
    "</div>"
  );
}

function advisorArticle(person) {
  const skills = (person.skills || [])
    .map(function (skill) {
      return '<span class="tag">' + esc(skill) + "</span>";
    })
    .join("");
  const specs = (person.specialties || [])
    .map(function (item) {
      return "<li>" + esc(item) + "</li>";
    })
    .join("");
  const days = (person.availability || []).join(", ");
  const hours =
    person.hoursStart && person.hoursEnd
      ? person.hoursStart + "–" + person.hoursEnd
      : "";
  const photo = String(person.photo || "").split("?")[0];
  const price =
    (person.durationPrices && (person.durationPrices["30"] || person.durationPrices[30])) ||
    person.price30 ||
    person.price ||
    "";
  return (
    '<div class="profile-layout">' +
    '<div class="profile-header">' +
    '<img src="' +
    esc(photo) +
    '" alt="Portrait of ' +
    esc(person.name) +
    '" width="128" height="128" />' +
    "<div><h1>" +
    esc(person.name) +
    "</h1>" +
    '<p class="mt-4">' +
    esc((person.languages || []).join(", ")) +
    " · " +
    esc(person.experience) +
    " years experience</p>" +
    '<div class="rating mt-4"><i class="fa-solid fa-star"></i> ' +
    esc(person.rating) +
    " <span>(" +
    esc(person.reviewsCount) +
    " reviews)</span></div></div></div>" +
    '<aside class="card profile-sidebar">' +
    '<p class="profile-price__label">Starting at</p>' +
    '<p class="profile-price"><span class="profile-price__amount">₹' +
    esc(price) +
    '</span><span class="profile-price__unit">30 minute session</span></p>' +
    '<a class="btn btn--primary btn--block profile-price__book" href="/pages/book-session?advisor=' +
    esc(person.id) +
    '">Book Session</a></aside>' +
    '<div class="profile-body"><h2>Biography</h2><p class="mt-4">' +
    esc(person.bio) +
    "</p>" +
    '<h2 class="mt-8">Education</h2><p class="mt-4">' +
    esc(person.education) +
    "</p>" +
    '<h2 class="mt-8">Specialties</h2><ul class="values-list mt-4">' +
    specs +
    "</ul>" +
    '<h2 class="mt-8">Skills</h2><div class="advisor-card__tags mt-4">' +
    skills +
    "</div>" +
    '<h2 class="mt-8">Availability</h2><p class="mt-4">' +
    esc(days + (hours ? " · " + hours : "")) +
    "</p></div></div>"
  );
}

function advisorDescription(person) {
  const focus = (person.specialties || []).slice(0, 2).join(" and ");
  let description =
    "Book a private session with " +
    person.name +
    (focus ? " for " + focus.toLowerCase() : "") +
    ". Confidential conversation by chat, voice, or video.";
  if (description.length > 158) description = description.slice(0, 155).trim() + "…";
  return description;
}

function applyHead(html, fields) {
  let next = replaceTitle(html, fields.title);
  next = replaceMeta(next, "name", "description", fields.description);
  next = replaceMeta(next, "property", "og:title", fields.title);
  next = replaceMeta(next, "property", "og:description", fields.description);
  next = replaceMeta(next, "property", "og:type", fields.type);
  next = replaceMeta(next, "property", "og:image", fields.image);
  next = replaceMeta(next, "name", "twitter:title", fields.title);
  next = replaceMeta(next, "name", "twitter:description", fields.description);
  next = replaceMeta(next, "name", "twitter:image", fields.image);
  return next;
}

function swapLoading(html, marker, replacement) {
  const re = new RegExp(
    "<p class=\"empty-state\">" + marker + "(?:…|\\.\\.\\.)<\\/p>"
  );
  if (!re.test(html)) return { html: html, swapped: false };
  return { html: html.replace(re, replacement), swapped: true };
}

function summarize(html, title) {
  const h1 = (html.match(/<h1>([^<]*)<\/h1>/) || [])[1] || "";
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    title: title,
    h1: h1,
    words: text.split(" ").filter(Boolean).length,
    loadingLeft: /Loading article|Loading advisor/.test(html),
  };
}

export function prerenderDocument(html, pathname, searchParams) {
  const path = pagePath(pathname);
  if (path === "/pages/blog-details") {
    if (!Array.isArray(blogs)) {
      return { html: html, found: false, dataMissing: true, kind: "blog" };
    }
    const slug = searchParams.get("slug") || "";
    const post = blogs.find(function (item) {
      return item.slug === slug;
    });
    if (!post) {
      const missing = swapLoading(html, "Loading article", "<p class=\"empty-state\">Article not found.</p>");
      return Object.assign({ html: missing.html, found: false, dataMissing: false, kind: "blog", swapped: missing.swapped }, summarize(missing.html, ""));
    }
    const title = post.title + " | MyTalk Blog";
    const description = post.excerpt || "";
    const url = "https://mytalk.in/pages/blog-details?slug=" + encodeURIComponent(post.slug);
    let next = applyHead(html, {
      title: title,
      description: description,
      type: "article",
      image: post.image || "https://mytalk.in/assets/images/hero.jpg",
    });
    const body = swapLoading(next, "Loading article", blogArticle(post));
    next = replaceJsonLd(body.html, "blog-article-jsonld", {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: description,
      image: post.image || "",
      datePublished: post.date || "",
      author: { "@type": "Person", name: post.author || "MyTalk Editorial" },
      mainEntityOfPage: url,
      articleSection: post.category || "",
    });
    return Object.assign(
      { html: next, found: true, dataMissing: false, kind: "blog", swapped: body.swapped, slug: post.slug },
      summarize(next, title)
    );
  }

  if (path === "/pages/advisor-profile") {
    if (!Array.isArray(advisors)) {
      return { html: html, found: false, dataMissing: true, kind: "advisor" };
    }
    const id = searchParams.get("id") || "";
    const person = advisors.find(function (item) {
      return String(item.id) === String(id);
    });
    if (!person) {
      const missing = swapLoading(html, "Loading advisor", "<p class=\"empty-state\">Advisor not found.</p>");
      return Object.assign({ html: missing.html, found: false, dataMissing: false, kind: "advisor", swapped: missing.swapped }, summarize(missing.html, ""));
    }
    const title = person.name + " — Private listener on MyTalk";
    const description = advisorDescription(person);
    const url = "https://mytalk.in/pages/advisor-profile?id=" + encodeURIComponent(person.id);
    const photo = String(person.photo || "");
    const image = photo.charAt(0) === "/" ? "https://mytalk.in" + photo.split("?")[0] : photo;
    let next = applyHead(html, {
      title: title,
      description: description,
      type: "profile",
      image: image || "https://mytalk.in/assets/images/hero.jpg",
    });
    const body = swapLoading(next, "Loading advisor", advisorArticle(person));
    next = replaceJsonLd(body.html, "advisor-jsonld", {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      url: url,
      name: title,
      description: description,
      mainEntity: {
        "@type": "Person",
        name: person.name,
        description: person.bio || description,
        worksFor: { "@type": "Organization", name: "MyTalk", url: "https://mytalk.in/" },
      },
    });
    return Object.assign(
      { html: next, found: true, dataMissing: false, kind: "advisor", swapped: body.swapped, id: person.id },
      summarize(next, title)
    );
  }

  return { html: html, found: false, dataMissing: false, kind: "" };
}

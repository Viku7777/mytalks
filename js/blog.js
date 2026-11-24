(function () {
  const esc = function (s) {
    return window.MyTalksData.escapeHtml(s);
  };

  async function initList() {
    const grid = document.querySelector("[data-blog-grid]");
    if (!grid) return;
    const base = window.MyTalksBase || ".";
    const posts = await window.MyTalksData.getBlogs();
    const filter = document.querySelector("[data-blog-filter]");
    const pager = document.querySelector("[data-blog-pager]");
    const prevBtn = document.querySelector("[data-blog-prev]");
    const nextBtn = document.querySelector("[data-blog-next]");
    const pageStatus = document.querySelector("[data-blog-page-status]");
    const pageSize = 20;
    let page = 1;
    const initialPage = Number(new URLSearchParams(window.location.search).get("page"));
    if (initialPage > 1) page = initialPage;

    function filteredPosts() {
      const cat = filter ? filter.value : "";
      return cat
        ? posts.filter(function (p) {
            return p.category === cat;
          })
        : posts;
    }

    function syncPageUrl() {
      const url = new URL(window.location.href);
      if (page <= 1) url.searchParams.delete("page");
      else url.searchParams.set("page", String(page));
      history.replaceState(null, "", url);
    }

    function render(scrollToList) {
      const list = filteredPosts();
      const pages = Math.max(1, Math.ceil(list.length / pageSize));
      if (page > pages) page = pages;
      if (page < 1) page = 1;
      const start = (page - 1) * pageSize;
      const visible = list.slice(start, start + pageSize);
      grid.innerHTML = visible.length
        ? visible
            .map(function (p) {
              return (
                '<a class="card blog-card" href="' +
                base +
                "/pages/blog-details?slug=" +
                esc(p.slug) +
                '">' +
                '<img class="blog-card__image" src="' +
                esc(p.image) +
                '" alt="" width="640" height="400" loading="lazy" />' +
                '<div class="blog-card__meta"><span class="tag">' +
                esc(p.category) +
                "</span><span>" +
                esc(p.date) +
                "</span><span>" +
                esc(p.readingTime) +
                " min read</span></div>" +
                "<h3>" +
                esc(p.title) +
                "</h3>" +
                "<p>" +
                esc(p.excerpt) +
                "</p></a>"
              );
            })
            .join("")
        : '<p class="empty-state">No articles in this category.</p>';

      if (pager) {
        pager.hidden = pages <= 1;
        if (pageStatus) pageStatus.textContent = "Page " + page + " of " + pages;
        if (prevBtn) prevBtn.disabled = page <= 1;
        if (nextBtn) nextBtn.disabled = page >= pages;
      }
      syncPageUrl();
      if (scrollToList && filter) {
        filter.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        if (page <= 1) return;
        page -= 1;
        render(true);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        const pages = Math.ceil(filteredPosts().length / pageSize);
        if (page >= pages) return;
        page += 1;
        render(true);
      });
    }

    if (filter) {
      filter.addEventListener("change", function () {
        page = 1;
        render(false);
        if (filter.value && window.MyTalksAnalytics) {
          window.MyTalksAnalytics.track("search", {
            search_term: filter.value,
            content_type: "blog",
          });
          if (window.MyTalksPixel) {
            window.MyTalksPixel.track("Search", {
              search_string: filter.value,
              content_category: "blog",
            });
          }
        }
      });
    }
    render();
    const origin = "https://mytalk.in";
    upsertJsonLd("blog-list-jsonld", {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "MyTalk Blog",
      description:
        "Relationship advice, dating tips, mental wellness, and communication guides from MyTalk.",
      url: origin + "/pages/blog",
      blogPost: posts.map(function (p) {
        return {
          "@type": "BlogPosting",
          headline: p.title,
          description: p.excerpt,
          datePublished: p.date,
          url: origin + "/pages/blog-details?slug=" + p.slug,
          author: { "@type": "Person", name: p.author },
        };
      }),
    });
  }

  function setMeta(attr, name, content) {
    let el = document.querySelector("meta[" + attr + '="' + name + '"]');
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  }

  function upsertJsonLd(id, data) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
  }

  function applyArticleSeo(post) {
    const url =
      "https://mytalk.in/pages/blog-details?slug=" +
      encodeURIComponent(post.slug);
    const title = post.title + " | MyTalk Blog";
    const descText = post.excerpt || "";
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", url);
    setMeta("name", "description", descText);
    setMeta("name", "keywords", post.category + ", MyTalk, relationship advice, emotional support");
    setMeta("property", "og:type", "article");
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", descText);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", post.image || "");
    setMeta("property", "article:published_time", post.date || "");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", descText);
    setMeta("name", "twitter:image", post.image || "");
    upsertJsonLd("blog-article-jsonld", {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: descText,
      image: post.image || "",
      datePublished: post.date || "",
      author: { "@type": "Person", name: post.author || "MyTalk Editorial" },
      publisher: {
        "@type": "Organization",
        name: "MyTalk",
        url: "https://mytalk.in",
      },
      mainEntityOfPage: url,
      articleSection: post.category || "",
      keywords:
        post.category +
        ", MyTalk, relationship advice, emotional support, communication",
    });
  }

  async function initDetails() {
    const root = document.querySelector("[data-blog-details]");
    if (!root) return;
    const slug = new URLSearchParams(window.location.search).get("slug");
    const post = slug
      ? await window.MyTalksData.getBlogBySlug(slug)
      : (await window.MyTalksData.getBlogs())[0];
    if (!post) {
      root.innerHTML = '<p class="empty-state">Article not found.</p>';
      return;
    }
    document.title = post.title + " | MyTalk Blog";
    applyArticleSeo(post);
    if (window.MyTalksAnalytics) {
      window.MyTalksAnalytics.track("view_item", {
        item_id: post.slug || "",
        item_name: post.title || "",
        item_category: "blog",
      });
    }

    const body = (post.content || [])
      .map(function (p) {
        return "<p>" + esc(p) + "</p>";
      })
      .join("");

    const allPosts = await window.MyTalksData.getBlogs();
    const related = allPosts
      .filter(function (p) {
        return p.slug !== post.slug && p.category === post.category;
      })
      .concat(
        allPosts.filter(function (p) {
          return p.slug !== post.slug && p.category !== post.category;
        })
      )
      .slice(0, 3);
    const base = window.MyTalksBase || ".";

    root.innerHTML =
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
      " min read</span><span class=\"tag\">" +
      esc(post.category) +
      "</span></div>" +
      '<div class="prose">' +
      body +
      "</div>" +
      '<div class="share-buttons">' +
      '<button type="button" class="btn btn--ghost btn--sm" data-share="copy"><i class="fa-solid fa-link"></i> Copy link</button>' +
      '<a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=' +
      encodeURIComponent(post.title) +
      '"><i class="fa-brands fa-x-twitter"></i> Share</a>' +
      "</div>" +
      '<h2 class="mt-8">Related posts</h2><div class="grid-3 mt-6">' +
      related
        .map(function (p) {
          return (
            '<a class="card" href="' +
            base +
            "/pages/blog-details?slug=" +
            esc(p.slug) +
            '"><strong>' +
            esc(p.title) +
            "</strong><p class=\"hint mt-4\">" +
            esc(p.category) +
            "</p></a>"
          );
        })
        .join("") +
      "</div>" +
      '<div class="comment-form"><h2>Comments</h2><p class="mt-4 mb-4">Share your thoughts.</p>' +
      '<form data-demo-form data-success="Comment submitted."><div class="form-group"><label for="c-name">Name</label><input class="form-control" id="c-name" required /></div><div class="form-group"><label for="c-body">Comment</label><textarea class="form-textarea" id="c-body" required></textarea></div><button class="btn btn--primary" type="submit">Post comment</button></form></div>';

    root.querySelector("[data-share=copy]").addEventListener("click", function () {
      navigator.clipboard.writeText(window.location.href).then(function () {
        window.MyTalksUI.showToast("Link copied.");
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!window.MyTalksData) return;
    initList();
    initDetails();
  });
})();

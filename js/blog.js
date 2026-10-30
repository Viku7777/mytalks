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

    function render() {
      const cat = filter ? filter.value : "";
      const list = cat
        ? posts.filter(function (p) {
            return p.category === cat;
          })
        : posts;
      grid.innerHTML = list
        .map(function (p) {
          return (
            '<article class="card blog-card">' +
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
            "<h3><a href=\"" +
            base +
            "/pages/blog-details?slug=" +
            esc(p.slug) +
            '">' +
            esc(p.title) +
            "</a></h3>" +
            "<p>" +
            esc(p.excerpt) +
            "</p></article>"
          );
        })
        .join("");
    }

    if (filter) {
      filter.addEventListener("change", function () {
        render();
        if (filter.value && window.MyTalksAnalytics) {
          window.MyTalksAnalytics.track("search", {
            search_term: filter.value,
            content_type: "blog",
          });
        }
      });
    }
    render();
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
    if (window.MyTalksAnalytics) {
      window.MyTalksAnalytics.track("view_item", {
        item_id: post.slug || "",
        item_name: post.title || "",
        item_category: "blog",
      });
    }
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", post.excerpt);

    const body = (post.content || [])
      .map(function (p) {
        return "<p>" + esc(p) + "</p>";
      })
      .join("");

    const related = (await window.MyTalksData.getBlogs())
      .filter(function (p) {
        return p.slug !== post.slug;
      })
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

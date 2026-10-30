(function () {
  const esc = function (s) {
    return window.MyTalksData.escapeHtml(s);
  };

  async function init() {
    const listEl = document.querySelector("[data-faq-list]");
    if (!listEl || !window.MyTalksData) return;
    const faqs = await window.MyTalksData.getFaqs();
    const search = document.querySelector("[data-faq-search]");
    const cats = document.querySelector("[data-faq-categories]");
    let activeCat = "";

    const categories = Array.from(
      new Set(
        faqs.map(function (f) {
          return f.category;
        })
      )
    );

    if (cats) {
      cats.innerHTML =
        '<button type="button" class="btn btn--sm btn--secondary" data-cat="">All</button>' +
        categories
          .map(function (c) {
            return (
              '<button type="button" class="btn btn--sm btn--ghost" data-cat="' +
              esc(c) +
              '">' +
              esc(c) +
              "</button>"
            );
          })
          .join("");
      cats.addEventListener("click", function (e) {
        const btn = e.target.closest("[data-cat]");
        if (!btn) return;
        activeCat = btn.getAttribute("data-cat");
        cats.querySelectorAll("button").forEach(function (b) {
          b.className =
            "btn btn--sm " +
            (b.getAttribute("data-cat") === activeCat
              ? "btn--secondary"
              : "btn--ghost");
        });
        render();
      });
    }

    function render() {
      const q = (search && search.value.trim().toLowerCase()) || "";
      const items = faqs.filter(function (f) {
        const catOk = !activeCat || f.category === activeCat;
        const text = (f.question + " " + f.answer).toLowerCase();
        return catOk && (!q || text.includes(q));
      });
      listEl.innerHTML = items
        .map(function (f, i) {
          return (
            '<div class="accordion-item' +
            (i === 0 ? " is-open" : "") +
            '">' +
            '<button class="accordion-trigger" type="button" aria-expanded="' +
            (i === 0 ? "true" : "false") +
            '">' +
            esc(f.question) +
            ' <i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>' +
            '<div class="accordion-panel"><p>' +
            esc(f.answer) +
            "</p><p class=\"hint mt-4\">Category: " +
            esc(f.category) +
            "</p></div></div>"
          );
        })
        .join("");

      listEl.querySelectorAll(".accordion-trigger").forEach(function (btn) {
        btn.addEventListener("click", function () {
          const item = btn.closest(".accordion-item");
          const open = item.classList.contains("is-open");
          listEl.querySelectorAll(".accordion-item").forEach(function (other) {
            other.classList.remove("is-open");
            const t = other.querySelector(".accordion-trigger");
            if (t) t.setAttribute("aria-expanded", "false");
          });
          if (!open) {
            item.classList.add("is-open");
            btn.setAttribute("aria-expanded", "true");
            if (window.MyTalksAnalytics) {
              window.MyTalksAnalytics.track("select_content", {
                content_type: "faq",
                item_name: (btn.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
              });
            }
          }
        });
      });
    }

    if (search) search.addEventListener("input", render);
    render();

    const ld = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map(function (f) {
        return {
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        };
      }),
    };
    let script = document.getElementById("faq-jsonld");
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = "faq-jsonld";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(ld);
  }

  async function initPreview() {
    const listEl = document.querySelector("[data-faq-preview]");
    if (!listEl || !window.MyTalksData) return;
    const faqs = (await window.MyTalksData.getFaqs()).slice(0, 6);
    listEl.setAttribute("data-accordion-single", "");
    listEl.innerHTML = faqs
      .map(function (f, i) {
        return (
          '<div class="accordion-item' +
          (i === 0 ? " is-open" : "") +
          '">' +
          '<button class="accordion-trigger" type="button" aria-expanded="' +
          (i === 0 ? "true" : "false") +
          '">' +
          esc(f.question) +
          ' <i class="fa-solid fa-chevron-down"></i></button>' +
          '<div class="accordion-panel"><p>' +
          esc(f.answer) +
          "</p></div></div>"
        );
      })
      .join("");
    // re-bind via main accordion if already initialized; otherwise manual
    listEl.querySelectorAll(".accordion-trigger").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const item = btn.closest(".accordion-item");
        const open = item.classList.contains("is-open");
        listEl.querySelectorAll(".accordion-item.is-open").forEach(function (o) {
          o.classList.remove("is-open");
        });
        if (!open) item.classList.add("is-open");
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    init();
    initPreview();
  });
})();

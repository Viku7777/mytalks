(function () {
  var motionEnabled =
    !window.matchMedia ||
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initReveal() {
    if (!motionEnabled) {
      document.querySelectorAll(".reveal").forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    autoMarkReveals();

    var els = document.querySelectorAll(".reveal");
    if (!els.length) return;

    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );

    els.forEach(function (el) {
      io.observe(el);
    });
  }

  function autoMarkReveals() {
    var groups = [
      { selector: ".section__header", variant: "" },
      { selector: ".trust-bar__list li", variant: "" },
      { selector: ".steps__item", variant: "" },
      { selector: ".home-split__intro", variant: "" },
      { selector: ".topic-list li", variant: "" },
      { selector: ".reason-grid article", variant: "" },
      { selector: ".home-faq__intro", variant: "" },
      { selector: ".step-card", variant: "" },
      { selector: ".service-tile", variant: "" },
      { selector: ".why-card", variant: "" },
      { selector: "[data-home-advisors] .advisor-card", variant: "" },
      { selector: "[data-testimonials] .testimonial", variant: "" },
      { selector: "[data-advisors-grid] .advisor-card", variant: "" },
      { selector: "[data-pricing-grid] .pricing-card", variant: "" },
      { selector: ".cta-band__inner", variant: "reveal--scale" },
      { selector: ".faq-preview .accordion-item", variant: "" },
      { selector: ".page-hero .container", variant: "" },
    ];

    groups.forEach(function (group) {
      document.querySelectorAll(group.selector).forEach(function (el, i) {
        if (el.classList.contains("reveal")) return;
        el.classList.add("reveal");
        if (group.variant) el.classList.add(group.variant);
        el.style.setProperty("--reveal-delay", Math.min(i * 0.07, 0.42) + "s");
      });
    });
  }

  function observeDynamic(root) {
    if (!root || !motionEnabled) return;
    var cards = root.querySelectorAll(
      ".advisor-card, .testimonial, .pricing-card, .service-tile, .accordion-item"
    );
    if (!cards.length) return;

    if (!("IntersectionObserver" in window)) {
      cards.forEach(function (el) {
        el.classList.add("reveal", "is-visible");
      });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );

    cards.forEach(function (el, i) {
      el.classList.add("reveal");
      el.style.setProperty("--reveal-delay", Math.min(i * 0.07, 0.42) + "s");
      io.observe(el);
    });
  }

  function initHeroParallax() {
    if (!motionEnabled) return;
    var media = document.querySelector(".home-hero__media img");
    var hero = document.querySelector(".home-hero");
    if (!media || !hero) return;

    var ticking = false;
    window.addEventListener(
      "scroll",
      function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          var rect = hero.getBoundingClientRect();
          if (rect.bottom > 0 && rect.top < window.innerHeight) {
            var progress = Math.min(Math.max(-rect.top / rect.height, 0), 1);
            media.style.transform = "scale(" + (1 + progress * 0.06) + ") translateY(" + progress * 24 + "px)";
          }
          ticking = false;
        });
      },
      { passive: true }
    );
  }

  function initAccordion() {
    document.querySelectorAll(".accordion-trigger").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var item = btn.closest(".accordion-item");
        var open = item.classList.contains("is-open");
        var group = item.parentElement;
        if (group) {
          group.querySelectorAll(".accordion-item.is-open").forEach(function (other) {
            if (other !== item) {
              other.classList.remove("is-open");
              var t = other.querySelector(".accordion-trigger");
              if (t) t.setAttribute("aria-expanded", "false");
            }
          });
        }
        item.classList.toggle("is-open", !open);
        btn.setAttribute("aria-expanded", !open ? "true" : "false");
      });
    });
  }

  function showToast(message, type) {
    var host = document.querySelector(".toast-container");
    if (!host) {
      host = document.createElement("div");
      host.className = "toast-container";
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    }
    var toast = document.createElement("div");
    toast.className = "toast" + (type === "error" ? " toast--error" : "");
    toast.textContent = message;
    host.appendChild(toast);
    setTimeout(function () {
      toast.remove();
    }, 3500);
  }

  window.MyTalksUI = {
    showToast: showToast,
    observeDynamic: observeDynamic,
  };

  function initNewsletter() {
    document.querySelectorAll("[data-newsletter-form]").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var email = form.querySelector('input[type="email"]');
        if (!email || !email.value) return;
        showToast("Thanks for subscribing! We'll be in touch.");
        form.reset();
      });
    });
  }

  function initYear() {
    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initReveal();
    initHeroParallax();
    initAccordion();
    initNewsletter();
    initYear();
  });

  document.addEventListener("mytalks:layout-ready", function () {
    initNewsletter();
    initYear();
  });

  // Re-bind animations when dynamic lists inject content
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.addedNodes && m.addedNodes.length) {
        observeDynamic(m.target);
      }
    });
  });

  document.addEventListener("DOMContentLoaded", function () {
    ["[data-home-advisors]", "[data-testimonials]", "[data-advisors-grid]", "[data-pricing-grid]", "[data-faq-preview]", "[data-services-grid]"].forEach(
      function (sel) {
        var node = document.querySelector(sel);
        if (node) observer.observe(node, { childList: true });
      }
    );
  });
})();

(function () {
  function getBasePath() {
    const scripts = document.querySelectorAll("script[src]");
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].getAttribute("src") || "";
      if (src.includes("includes.js")) {
        if (src.startsWith("../")) return "..";
        return ".";
      }
    }
    const path = window.location.pathname;
    if (path.includes("/pages/")) return "..";
    return ".";
  }

  const BASE = getBasePath();

  function pageUrl(path) {
    // Extensionless public URLs: /pages/about (not about.html)
    return BASE + "/" + String(path || "").replace(/^\//, "").replace(/\.html$/i, "");
  }

  function rewriteLinks(root) {
    root.querySelectorAll("[data-link]").forEach(function (el) {
      const key = el.getAttribute("data-link");
      const map = {
        home: pageUrl("index"),
        about: pageUrl("pages/about"),
        how: pageUrl("pages/how-it-works"),
        services: pageUrl("pages/services"),
        advisors: pageUrl("pages/find-advisor"),
        pricing: pageUrl("pages/pricing"),
        testimonials: pageUrl("pages/testimonials"),
        blog: pageUrl("pages/blog"),
        faq: pageUrl("pages/faq"),
        contact: pageUrl("pages/contact"),
        book: pageUrl("pages/book-session"),
        login: pageUrl("pages/login"),
        register: pageUrl("pages/register"),
        dashboard: pageUrl("pages/dashboard"),
        admin: pageUrl("pages/admin"),
        help: pageUrl("pages/help-center"),
        support: pageUrl("pages/support"),
        careers: pageUrl("pages/careers"),
        become: pageUrl("pages/become-advisor"),
        privacy: pageUrl("pages/privacy"),
        terms: pageUrl("pages/terms"),
        cookie: pageUrl("pages/cookie-policy"),
        refund: pageUrl("pages/refund-policy"),
        cancellation: pageUrl("pages/cancellation-policy"),
        disclaimer: pageUrl("pages/disclaimer"),
        community: pageUrl("pages/community-guidelines"),
        conduct: pageUrl("pages/code-of-conduct"),
        safety: pageUrl("pages/safety-policy"),
        emergency: pageUrl("pages/emergency"),
      };
      if (map[key]) el.setAttribute("href", map[key]);
    });
  }

  function pageKey(pathOrHref) {
    var seg = String(pathOrHref || "")
      .split("?")[0]
      .split("#")[0]
      .replace(/\/+$/, "")
      .split("/")
      .pop();
    if (!seg || seg === "." || seg === "..") return "index";
    return seg.replace(/\.html$/i, "") || "index";
  }

  function markActiveNav(root) {
    const current = pageKey(window.location.pathname);
    root.querySelectorAll("a[data-link]").forEach(function (a) {
      const href = a.getAttribute("href") || "";
      if (pageKey(href) === current) a.classList.add("is-active");
    });
  }

  async function loadPartial(selector, file) {
    const el = document.querySelector(selector);
    if (!el) return null;
    try {
      const res = await fetch(BASE + "/partials/" + file);
      if (!res.ok) throw new Error("Failed to load " + file);
      el.innerHTML = await res.text();
      rewriteLinks(el);
      markActiveNav(el);
      return el;
    } catch (err) {
      console.warn(err);
      el.innerHTML =
        '<div class="container" style="padding:1rem 0;color:#ef4444">Unable to load layout. Please serve this site via a local server (e.g. <code>npx serve</code>).</div>';
      return el;
    }
  }

  function initMobileNav(headerRoot) {
    if (!headerRoot) return;
    const toggle = headerRoot.querySelector(".nav-toggle");
    const mobile = headerRoot.querySelector(".mobile-nav");
    if (!toggle || !mobile) return;

    function setOpen(open) {
      mobile.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      document.body.style.overflow = open ? "hidden" : "";
    }

    toggle.addEventListener("click", function () {
      setOpen(!mobile.classList.contains("is-open"));
    });
    function closeMobile() {
      setOpen(false);
    }
    mobile.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeMobile);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && mobile.classList.contains("is-open")) {
        closeMobile();
      }
    });
  }

  function initCookieBanner(root) {
    if (!root) return;
    const banner = root.querySelector(".cookie-banner");
    if (!banner) return;
    if (localStorage.getItem("mytalks-cookies")) return;
    banner.classList.add("is-visible");
    root.querySelectorAll("[data-cookie-accept]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        localStorage.setItem("mytalks-cookies", "accepted");
        banner.classList.remove("is-visible");
        document.dispatchEvent(new CustomEvent("mytalks:cookies-accepted"));
      });
    });
    root.querySelectorAll("[data-cookie-decline]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        localStorage.setItem("mytalks-cookies", "declined");
        banner.classList.remove("is-visible");
      });
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[data-src="' + src + '"], script[src="' + src + '"]')) {
        resolve();
        return;
      }
      var s = document.createElement("script");
      s.src = src;
      s.setAttribute("data-src", src);
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Failed to load " + src));
      };
      document.body.appendChild(s);
    });
  }

  async function loadFirebaseStack() {
    var sdk = "https://www.gstatic.com/firebasejs/11.0.2";
    try {
      if (!window.MyTalksFirebase) {
        await loadScript(sdk + "/firebase-app-compat.js");
        await Promise.all([
          loadScript(sdk + "/firebase-auth-compat.js"),
          loadScript(sdk + "/firebase-firestore-compat.js"),
          loadScript(sdk + "/firebase-analytics-compat.js").catch(function (analyticsErr) {
            console.warn("Firebase Analytics SDK failed to load:", analyticsErr);
          }),
        ]);
        await loadScript(BASE + "/js/firebase-config.js");
      }
      try {
        if (!window.MyTalksErrors) {
          await loadScript(BASE + "/js/error-reporting.js");
        }
      } catch (errReportErr) {
        /* Error reporting optional */
      }
      if (!window.MyTalksDB) {
        await loadScript(BASE + "/js/firestore.js");
      }
      if (!window.MyTalksAuth) {
        await loadScript(BASE + "/js/auth.js");
      }
      await loadScript(BASE + "/js/auth-ui.js");
    } catch (err) {
      console.warn("Firebase stack failed to load:", err);
    }
  }

  function applySessionHintToHeader(headerRoot) {
    if (!headerRoot) return;
    var hint = null;
    try {
      hint = JSON.parse(localStorage.getItem("mytalks-session") || "null");
    } catch (e) {
      hint = null;
    }
    var isUser = !!(hint && hint.uid);
    document.documentElement.setAttribute(
      "data-auth-state",
      isUser ? "user" : "guest"
    );
    headerRoot.querySelectorAll("[data-auth-guest]").forEach(function (el) {
      el.hidden = isUser;
      el.setAttribute("aria-hidden", isUser ? "true" : "false");
    });
    headerRoot.querySelectorAll("[data-auth-user]").forEach(function (el) {
      el.hidden = !isUser;
      el.setAttribute("aria-hidden", isUser ? "false" : "true");
    });
    if (isUser) {
      headerRoot.querySelectorAll("[data-auth-name]").forEach(function (el) {
        el.textContent = hint.name || "Account";
        if (hint.email) el.setAttribute("title", hint.email);
      });
    }
  }

  var firebaseStack = loadFirebaseStack();

  async function init() {
    const [header, footer, cookie] = await Promise.all([
      loadPartial("#header-root", "header.html"),
      loadPartial("#footer-root", "footer.html"),
      loadPartial("#cookie-root", "cookie-banner.html"),
    ]);
    applySessionHintToHeader(header);
    initMobileNav(header);
    initCookieBanner(cookie);
    document.dispatchEvent(new CustomEvent("mytalks:layout-ready"));
    await firebaseStack;
  }

  window.MyTalksBase = BASE;
  init();
})();

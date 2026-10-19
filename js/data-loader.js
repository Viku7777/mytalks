/**
 * Central data access layer.
 * Advisors prefer Firestore, then local JSON. Pricing prefers Firestore, then local JSON.
 */
(function () {
  function base() {
    return typeof window.MyTalksBase === "string" ? window.MyTalksBase : ".";
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function loadJson(path) {
    const url = base() + "/data/" + path.replace(/^\//, "");
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load " + path);
    return res.json();
  }

  function advisorRank(advisor) {
    var rank = Number(advisor && advisor.rank);
    return rank > 0 ? rank : 100000;
  }

  function sortAdvisors(list) {
    return (list || []).slice().sort(function (a, b) {
      var diff = advisorRank(a) - advisorRank(b);
      if (diff) return diff;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }

  var advisorsCache = null;
  var remoteAdvisorsStarted = false;
  var ADVISOR_CACHE_KEY = "mytalks-advisors-v1";

  function waitForAdvisorDb(timeoutMs) {
    if (window.MyTalksDB && window.MyTalksDB.listAdvisors) {
      return Promise.resolve(window.MyTalksDB);
    }
    return new Promise(function (resolve) {
      var done = false;
      function finish(db) {
        if (done) return;
        done = true;
        resolve(db || null);
      }
      function onReady() {
        if (window.MyTalksDB && window.MyTalksDB.listAdvisors) {
          finish(window.MyTalksDB);
        }
      }
      document.addEventListener("mytalks:firestore-ready", onReady);
      setTimeout(function () {
        finish((window.MyTalksDB && window.MyTalksDB.listAdvisors && window.MyTalksDB) || null);
      }, timeoutMs == null ? 8000 : timeoutMs);
    });
  }

  function readAdvisorCache() {
    try {
      var parsed = JSON.parse(sessionStorage.getItem(ADVISOR_CACHE_KEY) || "null");
      if (parsed && parsed.length) return sortAdvisors(parsed);
    } catch (err) {
      /* Ignore a bad cache and load fresh data. */
    }
    return null;
  }

  function publishAdvisors(list) {
    advisorsCache = list;
    try {
      sessionStorage.setItem(ADVISOR_CACHE_KEY, JSON.stringify(list));
    } catch (err) {
      /* Private mode can block storage. The in-memory list still works. */
    }
    document.dispatchEvent(
      new CustomEvent("mytalks:advisors-updated", { detail: list })
    );
  }

  function kickRemoteAdvisors() {
    if (remoteAdvisorsStarted) return;
    remoteAdvisorsStarted = true;
    waitForAdvisorDb(8000)
      .then(async function (DB) {
        if (!DB || !DB.listAdvisors) return null;
        if (DB.ready) await DB.ready;
        return DB.listAdvisors();
      })
      .then(function (remote) {
        if (!remote || !remote.length) return;
        var sorted = sortAdvisors(remote);
        if (JSON.stringify(sorted) === JSON.stringify(advisorsCache || [])) return;
        publishAdvisors(sorted);
      })
      .catch(function (err) {
        console.warn("Using local advisors fallback:", err);
      });
  }

  async function getAdvisors() {
    kickRemoteAdvisors();
    if (advisorsCache && advisorsCache.length) return advisorsCache.slice();
    var stored = readAdvisorCache();
    if (stored && stored.length) {
      advisorsCache = stored;
      return stored.slice();
    }
    var local = sortAdvisors(await loadJson("advisors.json"));
    if (!advisorsCache || !advisorsCache.length) advisorsCache = local;
    return advisorsCache.slice();
  }

  async function getAdvisorById(id) {
    const list = await getAdvisors();
    return (
      list.find(function (a) {
        return String(a.id) === String(id);
      }) || null
    );
  }

  async function getTestimonials() {
    return loadJson("testimonials.json");
  }

  async function getFaqs() {
    return loadJson("faqs.json");
  }

  async function getBlogs() {
    return loadJson("blogs.json");
  }

  async function getBlogBySlug(slug) {
    const list = await getBlogs();
    return (
      list.find(function (b) {
        return b.slug === slug;
      }) || null
    );
  }

  async function getLocalPricing() {
    var data = await loadJson("pricing.json");
    if (!data.coupons) data.coupons = { SAFE10: 10 };
    data.source = "local";
    return data;
  }

  function waitForMyTalksDB(timeoutMs) {
    timeoutMs = timeoutMs || 6000;
    if (window.MyTalksDB) return Promise.resolve(window.MyTalksDB);
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        resolve(window.MyTalksDB || null);
      }
      document.addEventListener("mytalks:firestore-ready", finish, { once: true });
      document.addEventListener("mytalks:firebase-ready", finish, { once: true });
      setTimeout(finish, timeoutMs);
    });
  }

  async function getPricing() {
    var local = null;
    try {
      local = await getLocalPricing();
    } catch (err) {
      console.warn(err);
    }

    if (local && local.plans && local.plans.length) return local;

    var DB = window.MyTalksDB || (await waitForMyTalksDB());
    if (DB && DB.getPricing) {
      try {
        if (DB.ready) await DB.ready;
        var remote = await DB.getPricing();
        if (remote) return remote;
      } catch (err) {
        console.warn("Using local pricing fallback:", err);
      }
    }

    if (!local) throw new Error("Pricing data unavailable");
    return local;
  }

  async function getServices() {
    return loadJson("services.json");
  }

  async function getCareers() {
    return loadJson("careers.json");
  }

  async function getDashboard() {
    // Always empty defaults — real sessions/tickets come from Firestore only.
    try {
      var data = await loadJson("dashboard.json");
      return {
        user: {
          name: "",
          email: "",
          walletBalance: (data.user && data.user.walletBalance) || 0,
          referralEarnings: (data.user && data.user.referralEarnings) || 0,
        },
        upcoming: [],
        past: [],
        invoices: [],
        notifications: [],
        tickets: [],
      };
    } catch (err) {
      return {
        user: { name: "", email: "", walletBalance: 0, referralEarnings: 0 },
        upcoming: [],
        past: [],
        invoices: [],
        notifications: [],
        tickets: [],
      };
    }
  }

  window.MyTalksData = {
    loadJson: loadJson,
    escapeHtml: escapeHtml,
    getAdvisors: getAdvisors,
    sortAdvisors: sortAdvisors,
    getAdvisorById: getAdvisorById,
    getTestimonials: getTestimonials,
    getFaqs: getFaqs,
    getBlogs: getBlogs,
    getBlogBySlug: getBlogBySlug,
    getPricing: getPricing,
    getServices: getServices,
    getCareers: getCareers,
    getDashboard: getDashboard,
  };
})();

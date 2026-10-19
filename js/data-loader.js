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

  async function getAdvisors() {
    var DB = window.MyTalksDB || (await waitForMyTalksDB(4000));
    if (DB && DB.listAdvisors) {
      try {
        if (DB.ready) await DB.ready;
        var remote = await DB.listAdvisors();
        if (remote && remote.length) return remote;
      } catch (err) {
        console.warn("Using local advisors fallback:", err);
      }
    }
    return loadJson("advisors.json");
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

    var DB = window.MyTalksDB || (await waitForMyTalksDB());
    if (DB && DB.getPricing) {
      try {
        if (DB.ready) await DB.ready;
        var remote = await DB.getPricing();
        if (remote) return remote;
        if (local) {
          try {
            await DB.seedPricing(local);
            var seeded = await DB.getPricing();
            if (seeded) return seeded;
          } catch (seedErr) {
            console.warn("Pricing seed skipped:", seedErr);
          }
        }
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

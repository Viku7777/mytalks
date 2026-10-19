(function () {
  const esc = function (s) {
    return window.MyTalksData.escapeHtml(s);
  };

  function durationPrices(a) {
    var stored = (a && a.durationPrices) || {};
    var base = Number(a && (a.price30 || stored["30"] || stored[30] || a.price)) || 0;
    var tiers = [
      { minutes: 30, discount: 0 },
      { minutes: 45, discount: 0.05 },
      { minutes: 60, discount: 0.1 },
      { minutes: 90, discount: 0.15 },
      { minutes: 120, discount: 0.2 },
    ];
    return tiers.map(function (tier) {
      var saved = stored[String(tier.minutes)] != null ? stored[String(tier.minutes)] : stored[tier.minutes];
      var price =
        saved != null
          ? Number(saved)
          : Math.round(base * (tier.minutes / 30) * (1 - tier.discount));
      return { minutes: tier.minutes, price: price };
    });
  }

  function durationLine(a) {
    return durationPrices(a)
      .map(function (tier) {
        return tier.minutes + " min ₹" + tier.price;
      })
      .join(" · ");
  }

  function shownRank(a, index) {
    var rank = Number(a && a.rank);
    return rank > 0 ? rank : index + 1;
  }

  function advisorCard(a, base, index) {
    var rank = shownRank(a, index || 0);
    const tags = (a.specialties || [])
      .slice(0, 3)
      .map(function (t) {
        return '<span class="tag">' + esc(t) + "</span>";
      })
      .join("");
    return (
      '<article class="card advisor-card">' +
      '<div class="advisor-card__media">' +
      '<span class="advisor-card__rank">#' +
      rank +
      "</span>" +
      '<img class="advisor-card__photo" src="' +
      esc(a.photo) +
      '" alt="Portrait of ' +
      esc(a.name) +
      '" width="72" height="72" loading="lazy" />' +
      "<div>" +
      "<h3>" +
      esc(a.name) +
      "</h3>" +
      '<p class="advisor-card__meta">' +
      "Rank " +
      rank +
      " · " +
      esc((a.languages || []).join(", ")) +
      " · " +
      esc(a.experience) +
      " yrs experience</p>" +
      '<div class="rating"><i class="fa-solid fa-star" aria-hidden="true"></i> ' +
      esc(a.rating) +
      " <span>(" +
      esc(a.reviewsCount) +
      ")</span></div>" +
      "</div></div>" +
      '<div class="advisor-card__tags">' +
      tags +
      "</div>" +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-top:auto">' +
      '<div class="price">₹' +
      esc((durationPrices(a)[0] || {}).price || a.price) +
      " <small>/ 30 min</small></div>" +
      '<div class="btn-group">' +
      '<a class="btn btn--ghost btn--sm" href="' +
      base +
      "/pages/advisor-profile?id=" +
      esc(a.id) +
      '">Profile</a>' +
      '<a class="btn btn--primary btn--sm" href="' +
      base +
      "/pages/book-session?advisor=" +
      esc(a.id) +
      '">Book</a>' +
      "</div></div></article>"
    );
  }

  async function initList() {
    const grid = document.querySelector("[data-advisors-grid]");
    if (!grid) return;
    const base = window.MyTalksBase || ".";
    let advisors = await window.MyTalksData.getAdvisors();

    const search = document.querySelector("[data-filter-search]");
    const gender = document.querySelector("[data-filter-gender]");
    const language = document.querySelector("[data-filter-language]");
    const specialty = document.querySelector("[data-filter-specialty]");
    const rating = document.querySelector("[data-filter-rating]");
    const statusEl = document.querySelector("[data-advisors-status]");

    function render() {
      let list = window.MyTalksData.sortAdvisors
        ? window.MyTalksData.sortAdvisors(advisors)
        : advisors.slice();
      const q = (search && search.value.trim().toLowerCase()) || "";
      if (q) {
        list = list.filter(function (a) {
          return (
            a.name.toLowerCase().includes(q) ||
            (a.specialties || []).join(" ").toLowerCase().includes(q) ||
            (a.languages || []).join(" ").toLowerCase().includes(q)
          );
        });
      }
      if (gender && gender.value) {
        list = list.filter(function (a) {
          return a.gender === gender.value;
        });
      }
      if (language && language.value) {
        list = list.filter(function (a) {
          return (a.languages || []).includes(language.value);
        });
      }
      if (specialty && specialty.value) {
        list = list.filter(function (a) {
          return (a.specialties || []).includes(specialty.value);
        });
      }
      if (rating && rating.value) {
        const min = parseFloat(rating.value);
        list = list.filter(function (a) {
          return a.rating >= min;
        });
      }
      grid.removeAttribute("aria-busy");
      if (statusEl) {
        statusEl.removeAttribute("aria-busy");
        statusEl.textContent =
          list.length +
          (list.length === 1 ? " advisor available" : " advisors available");
      }
      grid.innerHTML = list.length
        ? list.map(function (a, index) {
            return advisorCard(a, base, index);
          }).join("")
        : '<p class="empty-state">No advisors match your filters.</p>';
    }

    [search, gender, language, specialty, rating].forEach(function (el) {
      if (!el) return;
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });
    render();
    document.addEventListener("mytalks:advisors-updated", function (event) {
      if (!event.detail || !event.detail.length) return;
      advisors = event.detail;
      render();
    });
  }

  async function initProfile() {
    const root = document.querySelector("[data-advisor-profile]");
    if (!root) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id") || "1";
    const a = await window.MyTalksData.getAdvisorById(id);
    const base = window.MyTalksBase || ".";
    if (!a) {
      root.innerHTML = '<p class="empty-state">Advisor not found.</p>';
      return;
    }
    document.title = a.name + " | MyTalk Advisor";
    const skills = (a.skills || [])
      .map(function (s) {
        return '<span class="tag">' + esc(s) + "</span>";
      })
      .join("");
    const specs = (a.specialties || [])
      .map(function (s) {
        return "<li>" + esc(s) + "</li>";
      })
      .join("");
    const days = (a.availability || [])
      .map(function (d) {
        return '<span class="available">' + esc(d) + "</span>";
      })
      .join("");

    root.innerHTML =
      '<div class="profile-layout">' +
      "<div>" +
      '<div class="profile-header">' +
      '<img src="' +
      esc(a.photo) +
      '" alt="Portrait of ' +
      esc(a.name) +
      '" width="128" height="128" />' +
      "<div>" +
      "<h1>" +
      esc(a.name) +
      "</h1>" +
      '<p class="advisor-rank">Rank ' +
      shownRank(a, 0) +
      "</p>" +
      '<p class="mt-4">' +
      esc((a.languages || []).join(", ")) +
      " · " +
      esc(a.experience) +
      " years experience</p>" +
      '<div class="rating mt-4"><i class="fa-solid fa-star"></i> ' +
      esc(a.rating) +
      " <span>(" +
      esc(a.reviewsCount) +
      " reviews)</span></div>" +
      "</div></div>" +
      "<h2>Biography</h2><p class=\"mt-4\">" +
      esc(a.bio) +
      "</p>" +
      '<h2 class="mt-8">Education</h2><p class="mt-4">' +
      esc(a.education) +
      "</p>" +
      '<h2 class="mt-8">Specialties</h2><ul class="values-list mt-4">' +
      specs +
      "</ul>" +
      '<h2 class="mt-8">Skills</h2><div class="advisor-card__tags mt-4">' +
      skills +
      "</div>" +
      '<h2 class="mt-8">Availability</h2><div class="calendar-placeholder mt-4"><div class="calendar-days">' +
      days +
      "</div><p class=\"hint mt-4\">" +
      (a.hoursStart && a.hoursEnd
        ? "Available " + esc(a.hoursStart) + "–" + esc(a.hoursEnd) + "."
        : "Select a time on the booking page.") +
      "</p></div>" +
      "</div>" +
      '<aside class="card profile-sidebar">' +
      '<div class="price">₹' +
      esc((a.durationPrices && (a.durationPrices["30"] || a.durationPrices[30])) || a.price30 || a.price) +
      " <small>/ 30 min</small></div>" +
      "<p class=\"mt-4\">" +
      durationLine(a) +
      "</p>" +
      '<a class="btn btn--primary btn--block mt-6" href="' +
      base +
      "/pages/book-session?advisor=" +
      esc(a.id) +
      '">Book Session</a>' +
      '<p class="hint mt-4">Verified advisor · Confidential sessions</p>' +
      "</aside></div>";
  }

  async function initHomePreview() {
    const grid = document.querySelector("[data-home-advisors]");
    if (!grid) return;
    const base = window.MyTalksBase || ".";
    let advisors = await window.MyTalksData.getAdvisors();
    function renderHome() {
      var ranked = window.MyTalksData.sortAdvisors
        ? window.MyTalksData.sortAdvisors(advisors)
        : advisors;
      grid.innerHTML = ranked
        .slice(0, 3)
        .map(function (a, index) {
          return advisorCard(a, base, index);
        })
        .join("");
    }
    renderHome();
    grid.removeAttribute("aria-busy");
    document.addEventListener("mytalks:advisors-updated", function (event) {
      if (!event.detail || !event.detail.length) return;
      advisors = event.detail;
      renderHome();
    });
  }

  async function initTestimonials() {
    const grid = document.querySelector("[data-testimonials]");
    if (!grid) return;
    const list = await window.MyTalksData.getTestimonials();
    const limit = parseInt(grid.getAttribute("data-limit") || "0", 10);
    const items = limit ? list.slice(0, limit) : list;
    grid.innerHTML = items
      .map(function (t) {
        var rating =
          t.rating != null
            ? '<div class="rating" aria-label="Rated ' +
              esc(t.rating) +
              ' out of 5"><i class="fa-solid fa-star" aria-hidden="true"></i> ' +
              esc(t.rating) +
              "</div>"
            : "";
        return (
          '<article class="card testimonial">' +
          '<p class="testimonial__quote">“' +
          esc(t.quote) +
          '”</p>' +
          '<div class="testimonial__author">' +
          '<img src="' +
          esc(t.photo) +
          '" alt="' +
          esc(t.name) +
          '" width="48" height="48" loading="lazy" />' +
          "<div><strong>" +
          esc(t.name) +
          "</strong><span>" +
          esc(t.role) +
          "</span>" +
          rating +
          "</div></div></article>"
        );
      })
      .join("");
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!window.MyTalksData) return;
    initList();
    initProfile();
    initHomePreview();
    initTestimonials();
  });
})();

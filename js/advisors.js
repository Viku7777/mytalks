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
    if (window.MyTalksAnalytics) {
      window.MyTalksAnalytics.track("view_item_list", {
        item_list_id: "advisors",
        item_list_name: "Advisors",
      });
    }
    var searchTimer = null;
    function trackSearch() {
      var term = (search && search.value.trim()) || "";
      var filters = [];
      if (gender && gender.value) filters.push(gender.value);
      if (language && language.value) filters.push(language.value);
      if (specialty && specialty.value) filters.push(specialty.value);
      if (rating && rating.value) filters.push("rating " + rating.value);
      if (!term && !filters.length) return;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        if (!window.MyTalksAnalytics) return;
        window.MyTalksAnalytics.track("search", {
          search_term: (term || filters.join(", ")).slice(0, 80),
          content_type: "advisor",
        });
        if (window.MyTalksPixel) {
          window.MyTalksPixel.track("Search", {
            search_string: (term || filters.join(", ")).slice(0, 100),
            content_category: "advisor",
          });
        }
      }, 700);
    }
    [search, gender, language, specialty, rating].forEach(function (el) {
      if (!el) return;
      el.addEventListener("input", trackSearch);
      el.addEventListener("change", trackSearch);
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
    if (window.MyTalksAnalytics) {
      window.MyTalksAnalytics.track("view_item", {
        item_id: String(a.id || id),
        item_name: a.name || "",
        item_category: "advisor",
      });
      if (window.MyTalksPixel) {
        window.MyTalksPixel.track("ViewContent", {
          content_ids: [String(a.id || id)],
          content_name: a.name || "Advisor",
          content_type: "product",
          content_category: "advisor",
          value: Number(a.price) || 0,
          currency: "INR",
        });
      }
    }
    function paintProfile(person) {
      root.innerHTML = profileHtml(person, base);
    }

    paintProfile(a);
    document.addEventListener("mytalks:advisors-updated", function (event) {
      var next = (event.detail || []).find(function (item) {
        return String(item.id) === String(id);
      });
      if (next) paintProfile(next);
    });
  }

  function dayCode(value) {
    var text = String(value || "").trim().toLowerCase();
    if (text.indexOf("thur") === 0) return "Thu";
    var key = text.slice(0, 3);
    var map = { sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" };
    return map[key] || "";
  }

  function slotMinutes(slot) {
    var parts = String(slot || "").split(":");
    var hours = Number(parts[0]);
    var mins = Number(parts[1] || 0);
    if (!isFinite(hours) || !isFinite(mins)) return NaN;
    return hours * 60 + mins;
  }

  function prettyClock(value) {
    var mins = slotMinutes(value);
    if (!isFinite(mins)) return "";
    if (mins >= 24 * 60) return "midnight";
    var h = Math.floor(mins / 60) % 24;
    var m = mins % 60;
    var suffix = h >= 12 ? "PM" : "AM";
    var hour12 = h % 12 || 12;
    return hour12 + (m ? ":" + String(m).padStart(2, "0") : "") + " " + suffix;
  }

  function availabilityHtml(person) {
    var order = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var todayCode = order[new Date().getDay()];
    var selected = {};
    (person.availability || []).forEach(function (day) {
      var code = dayCode(day);
      if (code) selected[code] = true;
    });
    var listed = Object.keys(selected).length > 0;
    var cells = order
      .map(function (code) {
        var open = !listed || !!selected[code];
        var isToday = code === todayCode;
        return (
          '<span class="week-day' +
          (open ? " is-open" : "") +
          (isToday ? " is-today" : "") +
          '"><small>' +
          code +
          "</small><strong>" +
          (isToday ? "Today" : open ? "Open" : "Off") +
          "</strong></span>"
        );
      })
      .join("");
    var openMin = slotMinutes(person.hoursStart);
    var closeMin = slotMinutes(person.hoursEnd);
    var hours = "";
    if (person.hoursStart && person.hoursEnd && isFinite(openMin) && isFinite(closeMin)) {
      hours =
        openMin <= 0 && closeMin >= 24 * 60
          ? "Open all day"
          : "Open " + prettyClock(person.hoursStart) + " – " + prettyClock(person.hoursEnd);
    }
    var nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    var withinHours =
      (!isFinite(openMin) || nowMins >= openMin) && (!isFinite(closeMin) || nowMins < closeMin);
    var todayOpen = !listed || !!selected[todayCode];
    var status =
      (todayOpen && withinHours
        ? "Available today"
        : todayOpen
          ? "Finished for today"
          : "Not scheduled today") + (hours ? " · " + hours : "");
    return (
      '<h2 class="mt-8">Availability</h2><div class="calendar-placeholder mt-4">' +
      '<p class="week-status">' +
      esc(status) +
      "</p>" +
      '<div class="week-days" aria-label="Weekly availability">' +
      cells +
      "</div></div>"
    );
  }

  function profileHtml(a, base) {
    var skills = (a.skills || [])
      .map(function (s) {
        return '<span class="tag">' + esc(s) + "</span>";
      })
      .join("");
    var specs = (a.specialties || [])
      .map(function (s) {
        return "<li>" + esc(s) + "</li>";
      })
      .join("");
    return (
      '<div class="profile-layout">' +
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
      '<aside class="card profile-sidebar">' +
      '<p class="profile-price__label">Starting at</p>' +
      '<p class="profile-price"><span class="profile-price__amount">₹' +
      esc((a.durationPrices && (a.durationPrices["30"] || a.durationPrices[30])) || a.price30 || a.price) +
      '</span><span class="profile-price__unit">30 minute session</span></p>' +
      '<a class="btn btn--primary btn--block profile-price__book" href="' +
      base +
      "/pages/book-session?advisor=" +
      esc(a.id) +
      '">Book Session</a>' +
      '<ul class="profile-price__notes">' +
      '<li><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Verified advisor</li>' +
      '<li><i class="fa-solid fa-lock" aria-hidden="true"></i> Confidential sessions</li>' +
      "</ul></aside>" +
      '<div class="profile-body"><h2>Biography</h2><p class="mt-4">' +
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
      availabilityHtml(a) +
      "</div></div>"
    );
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

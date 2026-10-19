(function () {
  const esc = function (s) {
    return window.MyTalksData.escapeHtml(s);
  };

  function advisorCard(a, base) {
    const tags = (a.specialties || [])
      .slice(0, 3)
      .map(function (t) {
        return '<span class="tag">' + esc(t) + "</span>";
      })
      .join("");
    return (
      '<article class="card advisor-card">' +
      '<div class="advisor-card__media">' +
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
      esc(a.price) +
      " <small>/ session</small></div>" +
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
    const countEl = document.querySelector("[data-advisors-count]");

    function render() {
      let list = advisors.slice();
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
      if (countEl) countEl.textContent = String(list.length);
      grid.innerHTML = list.length
        ? list.map(function (a) {
            return advisorCard(a, base);
          }).join("")
        : '<p class="empty-state">No advisors match your filters.</p>';
    }

    [search, gender, language, specialty, rating].forEach(function (el) {
      if (!el) return;
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });
    render();
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
    document.title = a.name + " | MyTalks Advisor";
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
      "</div><p class=\"hint mt-4\">Select a slot on the booking page for exact times.</p></div>" +
      "</div>" +
      '<aside class="card profile-sidebar">' +
      '<div class="price">From ₹' +
      esc(a.price) +
      "</div>" +
      "<p class=\"mt-4\">Chat ₹" +
      esc(a.sessionPrices.chat) +
      " · Voice ₹" +
      esc(a.sessionPrices.voice) +
      " · Video ₹" +
      esc(a.sessionPrices.video) +
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
    const advisors = await window.MyTalksData.getAdvisors();
    grid.innerHTML = advisors
      .slice(0, 3)
      .map(function (a) {
        return advisorCard(a, base);
      })
      .join("");
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

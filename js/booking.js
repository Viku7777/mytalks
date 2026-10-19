(function () {
  const slots = ["09:00", "10:30", "12:00", "15:00", "17:30", "19:00", "20:30"];
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toLocalDateString(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function parseLocalDate(value) {
    if (!value) return null;
    var parts = String(value).split("-");
    if (parts.length !== 3) return null;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return isNaN(d.getTime()) ? null : d;
  }

  function slotMinutes(slot) {
    var parts = String(slot).split(":");
    return Number(parts[0]) * 60 + Number(parts[1] || 0);
  }

  function waitForAuth() {
    if (window.MyTalksAuth && window.MyTalksAuth.ready) {
      return window.MyTalksAuth.ready.then(function () {
        return window.MyTalksAuth;
      });
    }
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        resolve(window.MyTalksAuth || null);
      }
      document.addEventListener("mytalks:auth-ready", finish, { once: true });
      setTimeout(finish, 4000);
    });
  }

  function trackEvent(name, params) {
    try {
      if (window.MyTalksFirebase && typeof window.MyTalksFirebase.logEvent === "function") {
        window.MyTalksFirebase.logEvent(name, params || {});
      }
    } catch (e) {
      /* Analytics must never break booking */
    }
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function isValidPhone(value) {
    var digits = value.replace(/\D/g, "");
    return digits.length >= 8 && /^[0-9+\-\s()]+$/.test(value);
  }

  function prefillContact(form, Auth) {
    if (!Auth) return;
    var user = Auth.getUser();
    if (!user) return;

    var emailInput =
      form.querySelector("[name=contactEmail]") || form.querySelector("[name=email]");
    var phoneInput =
      form.querySelector("[name=contactPhone]") || form.querySelector("[name=phone]");
    var local = Auth.getLocalProfile ? Auth.getLocalProfile(user.uid) : null;

    if (emailInput && !emailInput.value && user.email) {
      emailInput.value = user.email;
    }
    if (phoneInput && !phoneInput.value) {
      var phone = user.phoneNumber || (local && local.phone) || "";
      if (phone) phoneInput.value = phone;
    }
  }

  function showBookingUI() {
    var loading = document.querySelector("[data-booking-loading]");
    if (loading) loading.hidden = true;

    document.querySelectorAll("[data-booking-ui]").forEach(function (el) {
      el.hidden = false;
    });

    var section = document.querySelector("[data-booking-section]");
    if (section) section.setAttribute("aria-busy", "false");
  }

  function summaryRow(label, value) {
    if (!value) return "";
    return (
      "<div><dt>" +
      label +
      "</dt><dd>" +
      value +
      "</dd></div>"
    );
  }

  async function init() {
    const form = document.querySelector("[data-booking-form]");
    if (!form || !window.MyTalksData) return;

    const Auth = await waitForAuth();
    if (!Auth || !Auth.requireAuth) {
      var base = window.MyTalksBase || "..";
      var next = encodeURIComponent(
        window.location.pathname + window.location.search
      );
      var loadingTitle = document.querySelector(".booking-loading__title");
      var loadingText = document.querySelector(".booking-loading__text");
      if (loadingTitle) loadingTitle.textContent = "Redirecting to sign in";
      if (loadingText) {
        loadingText.textContent =
          "You need an account to book. Taking you to login…";
      }
      window.location.href = base + "/pages/login?next=" + next;
      return;
    }
    var user = await Auth.requireAuth();
    if (!user) return;

    // Track page open for admin funnel (who opened book-session, when, from where)
    try {
      if (window.MyTalksDB && window.MyTalksDB.trackBookingPageVisit) {
        var visitParams = new URLSearchParams(window.location.search);
        await window.MyTalksDB.trackBookingPageVisit(user, {
          advisorId: visitParams.get("advisor") || "",
        });
      }
    } catch (trackErr) {
      console.warn("Booking page visit tracking failed:", trackErr);
    }

    showBookingUI();

    const advisorPicker = form.querySelector("[data-advisor-picker]");
    const dateInput = form.querySelector("[name=date]");
    const slotsEl = form.querySelector("[data-slots]");
    const modeInputs = form.querySelectorAll("[name=mode]");
    const couponInput = form.querySelector("[name=coupon]");
    const emailInput =
      form.querySelector("[name=contactEmail]") || form.querySelector("[name=email]");
    const phoneInput =
      form.querySelector("[name=contactPhone]") || form.querySelector("[name=phone]");
    const contactHint = form.querySelector("[data-contact-hint]");
    const summary = document.querySelector("[data-booking-summary]");
    let selectedSlot = "";
    let advisors = [];
    let dateTimeManual = false;

    prefillContact(form, Auth);

    if (advisorPicker) {
      advisorPicker.disabled = true;
      advisorPicker.classList.add("is-skeleton");
      advisorPicker.setAttribute("aria-busy", "true");
      advisorPicker.innerHTML = '<option value="">Loading advisors…</option>';
    }

    advisors = await window.MyTalksData.getAdvisors();
    var pricingConfig = null;
    try {
      pricingConfig = await window.MyTalksData.getPricing();
    } catch (err) {
      pricingConfig = { coupons: { SAFE10: 10 } };
    }

    const params = new URLSearchParams(window.location.search);
    const preselect = params.get("advisor");
    trackEvent("book_session_start", {
      advisor_id: preselect || "",
    });

    function selectedAdvisorId() {
      return advisorPicker ? advisorPicker.value : "";
    }

    function currentAdvisor() {
      var id = selectedAdvisorId();
      return advisors.find(function (a) {
        return a.id === id;
      });
    }

    function advisorAvailableOn(advisor, date) {
      if (!date) return false;
      if (!advisor || !advisor.availability || !advisor.availability.length) {
        return true;
      }
      return advisor.availability.indexOf(DAY_NAMES[date.getDay()]) !== -1;
    }

    function availableSlotsForDate(dateValue, now) {
      var date = typeof dateValue === "string" ? parseLocalDate(dateValue) : dateValue;
      if (!date) return [];
      var nowDate = now || new Date();
      var isToday = toLocalDateString(date) === toLocalDateString(nowDate);
      var nowMins = nowDate.getHours() * 60 + nowDate.getMinutes();
      return slots.filter(function (s) {
        if (!isToday) return true;
        return slotMinutes(s) > nowMins;
      });
    }

    function findNextDefault(advisor, fromDate) {
      var now = new Date();
      var start = fromDate ? new Date(fromDate) : new Date(now);
      start.setHours(0, 0, 0, 0);
      var i;
      for (i = 0; i < 28; i++) {
        var d = new Date(start);
        d.setDate(start.getDate() + i);
        if (!advisorAvailableOn(advisor, d)) continue;
        var remaining = availableSlotsForDate(d, now);
        if (remaining.length) {
          return { date: toLocalDateString(d), slot: remaining[0] };
        }
      }
      return null;
    }

    function applySmartDefault(force) {
      if (!force && dateTimeManual) {
        // Still recover if the current choice is empty or unavailable
        var advisor = currentAdvisor();
        var remaining = availableSlotsForDate(dateInput.value, new Date());
        var dateOk =
          dateInput.value &&
          advisorAvailableOn(advisor, parseLocalDate(dateInput.value));
        if (dateOk && remaining.length && remaining.indexOf(selectedSlot) !== -1) {
          return;
        }
        if (dateOk && remaining.length && !selectedSlot) {
          selectedSlot = remaining[0];
          return;
        }
      }

      var next = findNextDefault(currentAdvisor(), new Date());
      if (next) {
        dateInput.value = next.date;
        selectedSlot = next.slot;
      } else {
        dateInput.value = toLocalDateString(new Date());
        selectedSlot = "";
      }
    }

    function renderAdvisorPicker() {
      if (!advisorPicker) return;
      advisorPicker.classList.remove("is-skeleton");
      advisorPicker.setAttribute("aria-busy", "false");
      if (!advisors.length) {
        advisorPicker.innerHTML =
          '<option value="">No advisors available right now.</option>';
        advisorPicker.disabled = true;
        return;
      }

      advisorPicker.disabled = false;
      advisorPicker.innerHTML =
        '<option value="">Select your advisor</option>' +
        advisors
          .map(function (a) {
            var specialty =
              (a.specialties && a.specialties[0]) ||
              (a.skills && a.skills[0]) ||
              "";
            var fromPrice =
              (a.sessionPrices && a.sessionPrices.chat) || a.price || 0;
            var label = a.name || "Advisor";
            if (specialty) label += " — " + specialty;
            if (fromPrice) label += " (from ₹" + fromPrice + ")";
            return (
              '<option value="' +
              window.MyTalksData.escapeHtml(a.id) +
              '"' +
              (preselect === a.id ? " selected" : "") +
              ">" +
              window.MyTalksData.escapeHtml(label) +
              "</option>"
            );
          })
          .join("");
    }

    renderAdvisorPicker();
    // Ensure URL preselect becomes the real <select> value (not just a selected attribute)
    if (advisorPicker && preselect) {
      var preselectExists = advisors.some(function (a) {
        return a.id === preselect;
      });
      if (preselectExists) advisorPicker.value = preselect;
    }

    dateInput.min = toLocalDateString(new Date());
    // Only default date/time once an advisor is chosen (URL or user)
    if (selectedAdvisorId()) {
      applySmartDefault(true);
    } else {
      dateInput.value = "";
      selectedSlot = "";
    }

    function renderSlots() {
      if (!selectedAdvisorId()) {
        slotsEl.innerHTML =
          '<p class="hint" data-slots-empty>Select an advisor to see available times.</p>';
        return;
      }
      if (!dateInput.value) {
        slotsEl.innerHTML =
          '<p class="hint" data-slots-empty>Select a date to see available times.</p>';
        return;
      }

      var remaining = availableSlotsForDate(dateInput.value, new Date());
      if (!remaining.length) {
        slotsEl.innerHTML =
          '<p class="hint" data-slots-empty>No times left on this date. Try another day.</p>';
        return;
      }

      if (selectedSlot && remaining.indexOf(selectedSlot) === -1) {
        selectedSlot = remaining[0];
      }

      slotsEl.innerHTML = remaining
        .map(function (s) {
          return (
            '<button type="button" class="slot-btn' +
            (selectedSlot === s ? " is-selected" : "") +
            '" data-slot="' +
            s +
            '" aria-pressed="' +
            (selectedSlot === s ? "true" : "false") +
            '">' +
            s +
            "</button>"
          );
        })
        .join("");
      slotsEl.querySelectorAll(".slot-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          dateTimeManual = true;
          selectedSlot = btn.getAttribute("data-slot");
          renderSlots();
          updateSummary();
        });
      });
    }

    function selectedMode() {
      const checked = form.querySelector("[name=mode]:checked");
      return checked ? checked.value : "chat";
    }

    function modeLabel(mode) {
      var labels = { chat: "Chat", voice: "Voice", video: "Video" };
      return labels[mode] || mode;
    }

    function priceFor() {
      const a = currentAdvisor();
      if (!a) return 0;
      const mode = selectedMode();
      return (a.sessionPrices && a.sessionPrices[mode]) || a.price;
    }

    function updateSummary() {
      if (!summary) return;

      const a = currentAdvisor();
      if (!a) {
        summary.hidden = true;
        summary.innerHTML = "";
        return;
      }

      let total = priceFor();
      const coupon = (couponInput.value || "").trim().toUpperCase();
      let discountNote = "";
      const pct =
        ((pricingConfig && pricingConfig.coupons) || { SAFE10: 10 })[coupon] || 0;
      if (pct > 0) {
        total = Math.round(total * (1 - Number(pct) / 100));
        discountNote = coupon + " (−" + pct + "%)";
      }

      const email = emailInput ? emailInput.value.trim() : "";
      const phone = phoneInput ? phoneInput.value.trim() : "";
      const contactParts = [];
      if (email) contactParts.push(window.MyTalksData.escapeHtml(email));
      if (phone) contactParts.push(window.MyTalksData.escapeHtml(phone));

      const rows =
        summaryRow("Advisor", window.MyTalksData.escapeHtml(a.name)) +
        summaryRow("Date", dateInput.value || "") +
        summaryRow("Time", selectedSlot || "") +
        summaryRow("Mode", modeLabel(selectedMode())) +
        summaryRow("Contact", contactParts.join(" · "));

      summary.hidden = false;
      summary.innerHTML =
        '<dl class="booking-summary__list">' +
        rows +
        "</dl>" +
        '<div class="booking-summary__total">' +
        "<span>Total" +
        (discountNote
          ? ' <small class="booking-summary__discount">' +
            discountNote +
            "</small>"
          : "") +
        "</span>" +
        "<strong>₹" +
        total +
        "</strong>" +
        "</div>";
    }

    function validateContact() {
      const email = emailInput ? emailInput.value.trim() : "";
      const phone = phoneInput ? phoneInput.value.trim() : "";

      if (!email && !phone) {
        if (contactHint) {
          contactHint.hidden = false;
          contactHint.textContent =
            "Please provide an email or a phone number (at least one).";
          contactHint.classList.add("hint--error");
        }
        if (window.MyTalksUI) {
          window.MyTalksUI.showToast(
            "Email or phone is required — at least one.",
            "error"
          );
        }
        return null;
      }

      if (email && !isValidEmail(email)) {
        if (contactHint) {
          contactHint.hidden = false;
          contactHint.textContent = "Please enter a valid email address.";
          contactHint.classList.add("hint--error");
        }
        if (window.MyTalksUI) {
          window.MyTalksUI.showToast("Please enter a valid email address.", "error");
        }
        return null;
      }

      if (phone && !isValidPhone(phone)) {
        if (contactHint) {
          contactHint.hidden = false;
          contactHint.textContent = "Please enter a valid phone number.";
          contactHint.classList.add("hint--error");
        }
        if (window.MyTalksUI) {
          window.MyTalksUI.showToast("Please enter a valid phone number.", "error");
        }
        return null;
      }

      if (contactHint) {
        contactHint.classList.remove("hint--error");
        contactHint.textContent =
          "Provide an email or a phone number—whichever you prefer.";
      }
      return { email: email, phone: phone };
    }

    if (advisorPicker) {
      advisorPicker.addEventListener("change", function () {
        applySmartDefault(false);
        renderSlots();
        updateSummary();
      });
    }

    dateInput.addEventListener("change", function () {
      dateTimeManual = true;
      var remaining = availableSlotsForDate(dateInput.value, new Date());
      var advisor = currentAdvisor();
      var dateObj = parseLocalDate(dateInput.value);

      if (!dateObj || !advisorAvailableOn(advisor, dateObj) || !remaining.length) {
        // User picked an unavailable day — jump to next sensible default from that day
        var from = dateObj || new Date();
        var next = findNextDefault(advisor, from);
        if (next) {
          dateInput.value = next.date;
          selectedSlot = next.slot;
        } else {
          selectedSlot = "";
        }
      } else if (!selectedSlot || remaining.indexOf(selectedSlot) === -1) {
        selectedSlot = remaining[0];
      }

      renderSlots();
      updateSummary();
    });

    modeInputs.forEach(function (input) {
      input.addEventListener("change", updateSummary);
    });
    couponInput.addEventListener("input", updateSummary);
    if (emailInput) emailInput.addEventListener("input", updateSummary);
    if (phoneInput) phoneInput.addEventListener("input", updateSummary);

    function couponPercent(code) {
      var coupons = (pricingConfig && pricingConfig.coupons) || { SAFE10: 10 };
      var key = String(code || "").trim().toUpperCase();
      return Number(coupons[key]) || 0;
    }

    function missingSelectionMessage() {
      var missing = [];
      if (!selectedAdvisorId()) missing.push("an advisor");
      if (!dateInput.value) missing.push("a date");
      if (!selectedSlot) missing.push("a time");
      if (!missing.length) return "";
      if (missing.length === 1) return "Please select " + missing[0] + ".";
      if (missing.length === 2) {
        return "Please select " + missing[0] + " and " + missing[1] + ".";
      }
      return "Please select advisor, date, and time.";
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (form.querySelector("[name=website]").value) return;
      var missingMsg = missingSelectionMessage();
      if (missingMsg) {
        window.MyTalksUI.showToast(missingMsg, "error");
        return;
      }

      const contact = validateContact();
      if (!contact) return;

      const sessionUser = Auth && Auth.getUser ? Auth.getUser() : null;
      const advisor = currentAdvisor();
      let total = priceFor();
      const coupon = (couponInput.value || "").trim().toUpperCase();
      const pct = couponPercent(coupon);
      if (pct > 0) total = Math.round(total * (1 - pct / 100));

      const booking = {
        advisorId: selectedAdvisorId(),
        advisorName: advisor ? advisor.name : "",
        date: dateInput.value,
        time: selectedSlot,
        mode: selectedMode(),
        coupon: coupon,
        email: contact.email,
        phone: contact.phone,
        userId: sessionUser ? sessionUser.uid : null,
        total: total,
        createdAt: new Date().toISOString(),
      };

      var submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      trackEvent("begin_checkout", {
        currency: "INR",
        value: total,
        item_name: advisor ? advisor.name : "",
      });

      try {
        if (window.MyTalksDB && window.MyTalksDB.createBooking) {
          var saved = await window.MyTalksDB.createBooking(booking);
          booking.bookingId = saved.bookingId || saved.id;
        }
        localStorage.setItem("mytalks-last-booking", JSON.stringify(booking));
        trackEvent("book_session_complete", {
          advisor_id: booking.advisorId || "",
          mode: booking.mode || "",
          value: total,
          currency: "INR",
        });
        const modal = document.querySelector("[data-booking-modal]");
        if (modal) modal.classList.add("is-open");
        window.MyTalksUI.showToast(
          booking.bookingId
            ? "Booking confirmed. Ref " + booking.bookingId + "."
            : "Booking confirmed."
        );
      } catch (err) {
        console.error(err);
        try {
          if (window.MyTalksErrors && typeof window.MyTalksErrors.report === "function") {
            window.MyTalksErrors.report(
              (err && err.message) || "booking_sync_failed",
              { fatal: false, error: err }
            );
          }
        } catch (reportErr) {
          /* ignore */
        }
        localStorage.setItem("mytalks-last-booking", JSON.stringify(booking));
        const modal = document.querySelector("[data-booking-modal]");
        if (modal) modal.classList.add("is-open");
        window.MyTalksUI.showToast(
          "Booking saved locally. Cloud sync failed — check Firebase rules.",
          "error"
        );
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    document.querySelectorAll("[data-close-modal]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const modal = document.querySelector("[data-booking-modal]");
        if (modal) modal.classList.remove("is-open");
      });
    });

    renderSlots();
    updateSummary();

    document.addEventListener("mytalks:auth-changed", function () {
      prefillContact(form, window.MyTalksAuth);
      updateSummary();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();

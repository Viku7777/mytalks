(function () {
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const LEAD_MS = 2 * 60 * 60 * 1000;
  const FALLBACK_DURATIONS = [
    { minutes: 30, price: 499 },
    { minutes: 45, price: 699 },
    { minutes: 60, price: 899 },
    { minutes: 90, price: 1299 },
    { minutes: 120, price: 1699 },
  ];

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

  function formatTime(d) {
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function earliestStart(now) {
    var d = new Date((now || new Date()).getTime() + LEAD_MS);
    if (d.getSeconds() || d.getMilliseconds()) {
      d.setMinutes(d.getMinutes() + 1);
    }
    d.setSeconds(0, 0);
    return d;
  }

  function combineDateTime(dateValue, timeValue) {
    var d = parseLocalDate(dateValue);
    if (!d || !timeValue) return null;
    var parts = String(timeValue).split(":");
    d.setHours(Number(parts[0]), Number(parts[1] || 0), 0, 0);
    return isNaN(d.getTime()) ? null : d;
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
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value);
  }

  function phoneDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function isValidPhone(value) {
    return phoneDigits(value).length === 10;
  }

  function displayPhone(value) {
    var digits = phoneDigits(value);
    if (digits.length === 12 && digits.slice(0, 2) === "91") digits = digits.slice(2);
    return digits.slice(0, 10);
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
      var phone = displayPhone((local && local.phone) || user.phoneNumber || "");
      if (phone) phoneInput.value = phone;
    }
  }

  async function rememberPhone(Auth, user, phone) {
    phone = String(phone || "").trim();
    if (!Auth || !user || !phone) return;
    if (Auth.saveLocalProfile) {
      Auth.saveLocalProfile(user.uid, { phone: phone, email: user.email || "" });
    }
    if (window.MyTalksDB && window.MyTalksDB.updateUserProfile) {
      try {
        await window.MyTalksDB.updateUserProfile(user.uid, { phone: phone });
      } catch (err) {
        console.warn("Could not save phone on profile:", err);
      }
    }
  }

  async function fillPhoneFromProfile(phoneInput, Auth) {
    if (!phoneInput || phoneInput.value.trim() || !Auth || !Auth.getUser) return;
    var user = Auth.getUser();
    if (!user || !window.MyTalksDB || !window.MyTalksDB.getUserProfile) return;
    try {
      var profile = await window.MyTalksDB.getUserProfile(user.uid);
      var phone = displayPhone(profile && profile.phone);
      if (!phone || phoneInput.value.trim()) return;
      phoneInput.value = phone;
      if (Auth.saveLocalProfile) {
        Auth.saveLocalProfile(user.uid, { phone: phone });
      }
    } catch (err) {
      console.warn("Could not load profile phone:", err);
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

    var Auth = null;
    var sessionHint = null;
    try {
      sessionHint = JSON.parse(localStorage.getItem("mytalks-session") || "null");
    } catch (hintErr) {
      sessionHint = null;
    }
    if (sessionHint && sessionHint.uid) showBookingUI();

    var authReady = waitForAuth().then(async function (readyAuth) {
      Auth = readyAuth;
      if (!readyAuth || !readyAuth.requireAuth) {
        var base = window.MyTalksBase || "..";
        var next = encodeURIComponent(window.location.pathname + window.location.search);
        var loadingTitle = document.querySelector(".booking-loading__title");
        var loadingText = document.querySelector(".booking-loading__text");
        if (loadingTitle) loadingTitle.textContent = "Redirecting to sign in";
        if (loadingText) {
          loadingText.textContent = "You need an account to book. Taking you to login…";
        }
        window.location.href = base + "/pages/login?next=" + next;
        return null;
      }
      var signedIn = await readyAuth.requireAuth();
      if (!signedIn) return null;
      showBookingUI();
      prefillContact(form, readyAuth);
      if (phoneInput && typeof updateSummary === "function") {
        fillPhoneFromProfile(phoneInput, readyAuth).then(function () {
          updateSummary();
        });
      }
      if (window.MyTalksDB && window.MyTalksDB.trackBookingPageVisit) {
        var visitParams = new URLSearchParams(window.location.search);
        window.MyTalksDB.trackBookingPageVisit(signedIn, {
          advisorId: visitParams.get("advisor") || "",
        }).catch(function (trackErr) {
          console.warn("Booking page visit tracking failed:", trackErr);
        });
      }
      return signedIn;
    });

    const advisorPicker = form.querySelector("[data-advisor-picker]");
    const dateInput = form.querySelector("[name=date]");
    const timeInput = form.querySelector("[name=startTime]");
    const durationHost = form.querySelector("[data-duration-options]");
    const couponInput = form.querySelector("[name=coupon]");
    const emailInput =
      form.querySelector("[name=contactEmail]") || form.querySelector("[name=email]");
    const phoneInput =
      form.querySelector("[name=contactPhone]") || form.querySelector("[name=phone]");
    const contactHint = form.querySelector("[data-contact-hint]");
    const summary = document.querySelector("[data-booking-summary]");
    let advisors = [];

    if (sessionHint && sessionHint.uid) {
      if (emailInput && !emailInput.value && sessionHint.email) {
        emailInput.value = sessionHint.email;
      }
      if (phoneInput && !phoneInput.value && sessionHint.phone) {
        phoneInput.value = displayPhone(sessionHint.phone);
      }
    }

    if (advisorPicker) {
      advisorPicker.disabled = true;
      advisorPicker.classList.add("is-skeleton");
      advisorPicker.setAttribute("aria-busy", "true");
      advisorPicker.innerHTML = '<option value="">Loading advisors…</option>';
    }

    advisors = await window.MyTalksData.getAdvisors();
    if (!sessionHint || !sessionHint.uid) {
      var gateUser = await authReady;
      if (!gateUser) return;
    }
    document.addEventListener("mytalks:advisors-updated", function (event) {
      if (!event.detail || !event.detail.length) return;
      var keep = advisorPicker ? advisorPicker.value : "";
      advisors = event.detail;
      if (typeof renderAdvisorPicker === "function") {
        renderAdvisorPicker();
        if (advisorPicker && keep) advisorPicker.value = keep;
        ensureOpenDate();
        refreshTimer();
      }
    });
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

    function dayCode(value) {
      var text = String(value || "").trim().toLowerCase();
      if (text.indexOf("thur") === 0) return "Thu";
      var key = text.slice(0, 3);
      var map = {
        sun: "Sun",
        mon: "Mon",
        tue: "Tue",
        wed: "Wed",
        thu: "Thu",
        fri: "Fri",
        sat: "Sat",
      };
      return map[key] || "";
    }

    function advisorAvailableOn(advisor, date) {
      if (!date) return false;
      var days = advisor && advisor.availability;
      if (!days || !days.length) return true;
      var want = DAY_NAMES[date.getDay()];
      return days.some(function (day) {
        return dayCode(day) === want;
      });
    }

    function nextOpenDate(advisor, from) {
      var earliest = earliestStart(new Date());
      var start = from
        ? new Date(from.getFullYear(), from.getMonth(), from.getDate())
        : new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate());
      var earliestDay = new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate());
      if (start < earliestDay) start = earliestDay;
      var i;
      for (i = 0; i < 21; i++) {
        var day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        if (advisorAvailableOn(advisor, day)) return toLocalDateString(day);
      }
      return toLocalDateString(start);
    }

    function ensureOpenDate() {
      if (!dateInput || !selectedAdvisorId()) return;
      var advisor = currentAdvisor();
      var selected = dateInput.value ? parseLocalDate(dateInput.value) : null;
      if (selected && advisorAvailableOn(advisor, selected)) return;
      dateInput.value = nextOpenDate(advisor, selected || new Date());
      if (typeof paintDatePicker === "function") paintDatePicker();
    }

    function advisorDurationChoices(advisor) {
      if (!advisor) return null;
      var stored = advisor.durationPrices || {};
      var base = Number(advisor.price30 || stored["30"] || stored[30] || advisor.price) || 0;
      if (!base && !stored["30"] && stored[30] == null) return null;
      return [30, 45, 60, 90, 120].map(function (minutes) {
        var discount = { 30: 0, 45: 0.05, 60: 0.1, 90: 0.15, 120: 0.2 }[minutes];
        var saved = stored[String(minutes)] != null ? stored[String(minutes)] : stored[minutes];
        var price =
          saved != null
            ? Number(saved)
            : Math.round(base * (minutes / 30) * (1 - discount));
        return { minutes: minutes, price: price };
      });
    }

    function durationChoices() {
      var fromAdvisor = advisorDurationChoices(currentAdvisor());
      if (fromAdvisor) return fromAdvisor;
      var plans = (pricingConfig && pricingConfig.plans) || [];
      var fromPlans = plans
        .map(function (p) {
          var mins = parseInt(String(p.id), 10);
          if (!mins) {
            var match = String(p.duration || "").match(/(\d+)/);
            mins = match ? Number(match[1]) : 0;
          }
          if (!mins || p.price == null) return null;
          return { minutes: mins, price: Number(p.price) };
        })
        .filter(Boolean);
      return fromPlans.length ? fromPlans : FALLBACK_DURATIONS.slice();
    }

    function selectedDuration() {
      var checked = form.querySelector("[name=duration]:checked");
      return checked ? Number(checked.value) : durationChoices()[0].minutes;
    }

    function selectedStart() {
      if (!dateInput || !timeInput) return null;
      return combineDateTime(dateInput.value, timeInput.value);
    }

    function endFromStart(start, minutes) {
      if (!start || !minutes) return null;
      return new Date(start.getTime() + minutes * 60 * 1000);
    }

    function formatEndLabel(start, end) {
      if (!end) return "—";
      var label = formatTime(end);
      if (start && toLocalDateString(end) !== toLocalDateString(start)) {
        label += " next day";
      }
      return label;
    }

    var DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    var DAY_FULL = {
      Mon: "Monday",
      Tue: "Tuesday",
      Wed: "Wednesday",
      Thu: "Thursday",
      Fri: "Friday",
      Sat: "Saturday",
      Sun: "Sunday",
    };

    function friendlyTime(value) {
      var mins = slotMinutes(value);
      if (mins >= 24 * 60) return "midnight";
      var h = Math.floor(mins / 60);
      var m = mins % 60;
      var suffix = h >= 12 ? "PM" : "AM";
      var hour12 = h % 12 || 12;
      return hour12 + ":" + pad2(m) + " " + suffix;
    }

    function dayPhrase(days) {
      if (!days || !days.length || days.length >= 7) return "every day";
      var selected = {};
      days.forEach(function (day) {
        selected[day] = true;
      });
      var indexes = [];
      DAY_ORDER.forEach(function (day, index) {
        if (selected[day]) indexes.push(index);
      });
      if (!indexes.length) return days.join(", ");
      var missing = DAY_ORDER.filter(function (day) {
        return !selected[day];
      });
      if (missing.length === 1 && indexes.length === 6) {
        return "every day except " + DAY_FULL[missing[0]];
      }
      var consecutive = indexes.every(function (n, i) {
        return i === 0 || n === indexes[i - 1] + 1;
      });
      if (consecutive && indexes.length > 1) {
        return DAY_FULL[DAY_ORDER[indexes[0]]] + " to " + DAY_FULL[DAY_ORDER[indexes[indexes.length - 1]]];
      }
      return indexes
        .map(function (index) {
          return DAY_FULL[DAY_ORDER[index]];
        })
        .join(", ");
    }

    function hoursPhrase(advisor) {
      if (!advisor || !advisor.hoursStart || !advisor.hoursEnd) return "";
      var open = slotMinutes(advisor.hoursStart);
      var close = slotMinutes(advisor.hoursEnd);
      if (open <= 0 && close >= 24 * 60) return "";
      return "between " + friendlyTime(advisor.hoursStart) + " and " + friendlyTime(advisor.hoursEnd);
    }

    function whenAdvisorWorks(advisor) {
      var days = dayPhrase(advisor && advisor.availability);
      var hours = hoursPhrase(advisor);
      if (hours) return days + ", " + hours;
      return days;
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
            var fromPrice = a.price30 || a.price || 0;
            var rank = Number(a.rank) > 0 ? Number(a.rank) : 0;
            var label = (rank ? "#" + rank + " " : "") + (a.name || "Advisor");
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

    function syncTimeLimits(now) {
      var earliest = earliestStart(now || new Date());
      var earliestDate = toLocalDateString(earliest);
      if (dateInput) dateInput.min = earliestDate;
      if (!timeInput) return earliest;
      if (dateInput && dateInput.value === earliestDate) {
        timeInput.min = formatTime(earliest);
      } else {
        timeInput.removeAttribute("min");
      }
      return earliest;
    }

    function startProblem(now) {
      function issue(tone, text) {
        return { tone: tone, text: text };
      }
      if (!selectedAdvisorId()) {
        return issue("error", "Choose an advisor first.");
      }
      var advisor = currentAdvisor();
      if (!dateInput.value) {
        return issue("error", "Choose a date first.");
      }
      var chosenDate = parseLocalDate(dateInput.value);
      if (!advisorAvailableOn(advisor, chosenDate)) {
        return issue(
          "error",
          "Not available on this day. Choose " + whenAdvisorWorks(advisor) + "."
        );
      }
      if (!timeInput || !timeInput.value) {
        return issue("hint", "Slide to choose a start time.");
      }
      var spoken = friendlyTime(timeInput.value);
      var startMin = slotMinutes(timeInput.value);
      if (advisor && advisor.hoursStart && advisor.hoursEnd) {
        var open = slotMinutes(advisor.hoursStart);
        var close = slotMinutes(advisor.hoursEnd);
        var hours = hoursPhrase(advisor);
        if (startMin < open || startMin >= close) {
          return issue(
            "error",
            spoken +
              " is outside this advisor’s hours. They are available " +
              (hours || whenAdvisorWorks(advisor)) +
              "."
          );
        }
        if (startMin + selectedDuration() > close) {
          return issue(
            "error",
            "A " +
              selectedDuration() +
              " minute session starting at " +
              spoken +
              " would run past " +
              friendlyTime(advisor.hoursEnd) +
              ". Choose an earlier time."
          );
        }
      }
      var start = selectedStart();
      if (!start) return issue("error", "Choose a valid start time.");
      var earliest = earliestStart(now || new Date());
      if (start.getTime() < earliest.getTime()) {
        return issue(
          "error",
          "That’s too soon. The earliest start is " +
            friendlyTime(formatTime(earliest)) +
            ", two hours from now."
        );
      }
      return issue("", "");
    }

    var resetStartPicker = function () {};

    function syncStartVisibility() {
      var block = form.querySelector("[data-start-block]");
      var note = form.querySelector("[data-date-note]");
      var advisor = currentAdvisor();
      var date = dateInput && dateInput.value ? parseLocalDate(dateInput.value) : null;
      var open = !!(selectedAdvisorId() && date && advisorAvailableOn(advisor, date));
      if (block) {
        block.hidden = !open;
        if (open) block.removeAttribute("hidden");
      }
      if (!open && timeInput && timeInput.value) resetStartPicker();
      if (!note) return;
      if (!selectedAdvisorId()) {
        note.hidden = false;
        note.classList.add("hint--error");
        note.textContent = "Choose an advisor first.";
      } else if (!date) {
        note.hidden = false;
        note.classList.remove("hint--error");
        note.textContent = "Choose a date first.";
      } else if (!open) {
        note.hidden = false;
        note.classList.add("hint--error");
        note.textContent = "Not available on this day. Choose " + whenAdvisorWorks(advisor) + ".";
      } else {
        note.hidden = true;
        note.textContent = "";
      }
    }

    function refreshTimer() {
      var now = new Date();
      syncTimeLimits(now);
      syncStartVisibility();
      var minutes = selectedDuration();
      var start = selectedStart();
      var issue = startProblem(now);
      var end = !issue.text && start ? endFromStart(start, minutes) : null;
      var note = issue.text
        ? issue.text
        : "This time works. Your " +
          minutes +
          " minute session ends at " +
          friendlyTime(formatTime(end)) +
          (start && toLocalDateString(end) !== toLocalDateString(start) ? " the next day" : "") +
          ".";
      var status = form.querySelector("[data-start-status]");
      if (status) {
        status.textContent = note;
        status.classList.toggle("is-error", issue.tone === "error");
        status.classList.toggle("is-ok", !issue.text && !!start);
      }
    }

    function requestedDuration() {
      var params = new URLSearchParams(window.location.search);
      return String(params.get("duration") || params.get("minutes") || "");
    }

    function renderDurations() {
      if (!durationHost) return;
      var previous = form.querySelector("[name=duration]:checked");
      var keep = previous ? previous.value : requestedDuration() || "30";
      var choices = durationChoices();
      if (!choices.some(function (c) { return String(c.minutes) === keep; })) {
        keep = String(choices[0].minutes);
      }
      durationHost.innerHTML = choices
        .map(function (c) {
          return (
            '<label class="duration-option">' +
            '<input type="radio" name="duration" value="' +
            c.minutes +
            '"' +
            (String(c.minutes) === keep ? " checked" : "") +
            " />" +
            '<span class="duration-option__mins">' +
            c.minutes +
            " min</span>" +
            '<span class="duration-option__price">₹' +
            c.price +
            "</span></label>"
          );
        })
        .join("");
      durationHost.querySelectorAll("[name=duration]").forEach(function (input) {
        input.addEventListener("change", function () {
          refreshTimer();
          updateSummary();
        });
      });
    }

    renderDurations();
    if (requestedDuration() && durationHost) {
      var chosen = durationHost.querySelector("[name=duration]:checked");
      var group = chosen && chosen.closest(".booking-group");
      if (group) group.scrollIntoView({ block: "center" });
    }
    if (dateInput) {
      var today = toLocalDateString(new Date());
      var earliestDay = toLocalDateString(earliestStart(new Date()));
      dateInput.value = today < earliestDay ? earliestDay : today;
      ensureOpenDate();
    }
    if (timeInput) timeInput.value = "";
    syncTimeLimits(new Date());

    function priceFor() {
      var minutes = selectedDuration();
      var match = durationChoices().find(function (c) {
        return c.minutes === minutes;
      });
      if (match) return match.price;
      const a = currentAdvisor();
      if (!a) return 0;
      return a.price || 0;
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

      var start = selectedStart();
      var end = start ? endFromStart(start, selectedDuration()) : null;
      const rows =
        summaryRow("Advisor", window.MyTalksData.escapeHtml(a.name)) +
        summaryRow("Length", selectedDuration() + " min") +
        summaryRow("Date", dateInput.value || "") +
        summaryRow("Starts", start ? formatTime(start) : "") +
        summaryRow("Ends", end ? formatEndLabel(start, end) : "") +
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

    function showContactError(message, field) {
      if (emailInput) emailInput.classList.toggle("is-invalid", field === "email");
      if (phoneInput) phoneInput.classList.toggle("is-invalid", field === "phone");
      if (contactHint) {
        contactHint.hidden = false;
        contactHint.textContent = message;
        contactHint.classList.add("hint--error");
      }
      if (window.MyTalksUI) window.MyTalksUI.showToast(message, "error");
    }

    function clearContactError() {
      if (emailInput) emailInput.classList.remove("is-invalid");
      if (phoneInput) phoneInput.classList.remove("is-invalid");
      if (contactHint) {
        contactHint.classList.remove("hint--error");
        contactHint.textContent = "Enter a valid email, a 10-digit phone number, or both.";
      }
    }

    function validateContact() {
      const email = emailInput ? emailInput.value.trim() : "";
      const phone = phoneDigits(phoneInput ? phoneInput.value : "");

      if (!email && !phone) {
        showContactError("Enter an email or a 10-digit phone number.", "email");
        return null;
      }

      if (email && !isValidEmail(email)) {
        showContactError("Enter a valid email.", "email");
        return null;
      }

      if (phone && !isValidPhone(phone)) {
        showContactError("Phone number must be 10 digits.", "phone");
        return null;
      }

      clearContactError();
      return { email: email, phone: phone };
    }

    if (advisorPicker) {
      advisorPicker.addEventListener("change", function () {
        renderDurations();
        if (dateInput) dateInput.value = "";
        if (typeof paintDatePicker === "function") paintDatePicker();
        var datePanel = form.querySelector("[data-date-panel]");
        if (datePanel) datePanel.hidden = true;
        resetStartPicker();
        refreshTimer();
        updateSummary();
      });
    }

    dateInput.addEventListener("change", function () {
      var earliest = earliestStart(new Date());
      var earliestDate = toLocalDateString(earliest);
      if (dateInput.value && dateInput.value < earliestDate) {
        dateInput.value = earliestDate;
      }
      refreshTimer();
      updateSummary();
    });

    if (timeInput) {
      timeInput.addEventListener("input", function () {
        refreshTimer();
        updateSummary();
      });
      timeInput.addEventListener("change", function () {
        refreshTimer();
        updateSummary();
      });
    }

    var paintDatePicker = function () {};

    function buildDatePicker() {
      var root = form.querySelector("[data-date-picker]");
      var panel = root && root.querySelector("[data-date-panel]");
      var grid = root && root.querySelector("[data-date-grid]");
      var label = root && root.querySelector("[data-date-label]");
      var monthLabel = root && root.querySelector("[data-date-month]");
      var openBtn = root && root.querySelector("[data-date-open]");
      if (!root || !panel || !grid || !dateInput) return;
      var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      var weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      var selected = parseLocalDate(dateInput.value) || new Date();
      var view = new Date(selected.getFullYear(), selected.getMonth(), 1);

      function closePanel() {
        panel.hidden = true;
        if (openBtn) openBtn.setAttribute("aria-expanded", "false");
      }

      function paintLabel() {
        var current = parseLocalDate(dateInput.value);
        if (!label) return;
        label.textContent = current
          ? weekdays[current.getDay()] + ", " + current.getDate() + " " + months[current.getMonth()].slice(0, 3) + " " + current.getFullYear()
          : "Choose a date";
      }

      function renderMonth() {
        if (monthLabel) monthLabel.textContent = months[view.getMonth()] + " " + view.getFullYear();
        var earliest = earliestStart(new Date());
        var minDay = new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate());
        var current = parseLocalDate(dateInput.value);
        var first = new Date(view.getFullYear(), view.getMonth(), 1);
        var startPad = first.getDay();
        var daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
        var html = "";
        var i;
        for (i = 0; i < startPad; i++) html += '<span class="date-picker__empty"></span>';
        for (i = 1; i <= daysInMonth; i++) {
          var day = new Date(view.getFullYear(), view.getMonth(), i);
          var iso = toLocalDateString(day);
          var disabled = day < minDay;
          var isSelected = current && toLocalDateString(current) === iso;
          html +=
            '<button type="button" class="date-picker__day' +
            (isSelected ? " is-selected" : "") +
            '" data-date-value="' +
            iso +
            '"' +
            (disabled ? " disabled" : "") +
            ">" +
            i +
            "</button>";
        }
        grid.innerHTML = html;
      }

      function openPanel() {
        var current = parseLocalDate(dateInput.value) || new Date();
        view = new Date(current.getFullYear(), current.getMonth(), 1);
        renderMonth();
        panel.hidden = false;
        if (openBtn) openBtn.setAttribute("aria-expanded", "true");
      }

      if (openBtn) {
        openBtn.addEventListener("click", function () {
          if (panel.hidden) openPanel();
          else closePanel();
        });
      }
      root.querySelector("[data-date-prev]").addEventListener("click", function () {
        view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
        renderMonth();
      });
      root.querySelector("[data-date-next]").addEventListener("click", function () {
        view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
        renderMonth();
      });
      grid.addEventListener("click", function (e) {
        var dayBtn = e.target.closest("[data-date-value]");
        if (!dayBtn || dayBtn.disabled) return;
        dateInput.value = dayBtn.getAttribute("data-date-value");
        paintLabel();
        closePanel();
        dateInput.dispatchEvent(new Event("change", { bubbles: true }));
      });
      document.addEventListener("click", function (e) {
        if (!root.contains(e.target)) closePanel();
      });
      paintDatePicker = function () {
        paintLabel();
        if (!panel.hidden) renderMonth();
      };
      paintLabel();
    }

    buildDatePicker();

    var pickedHour = null;
    var pickedMinute = null;

    function hourPart(hour) {
      if (hour >= 6 && hour < 12) return "morning";
      if (hour >= 12 && hour < 17) return "afternoon";
      if (hour >= 17 && hour < 21) return "evening";
      return "night";
    }

    function partLabel(hour) {
      return { morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night" }[
        hourPart(hour)
      ];
    }

    function buildStartPicker() {
      var root = form.querySelector("[data-start-picker]");
      var timeRange = root && root.querySelector("[data-time-range]");
      var hourTile = root && root.querySelector("[data-hour-tile]");
      var minuteTile = root && root.querySelector("[data-minute-tile]");
      var readout = root && root.querySelector("[data-time-readout]");
      var periodEl = root && root.querySelector("[data-start-period]");
      if (!root || !timeRange || !timeInput) return;
      var chosen = false;

      function paintSlider() {
        var max = Number(timeRange.max) || 1;
        var wrap = timeRange.closest(".start-picker__slider");
        timeRange.style.setProperty("--fill", (Number(timeRange.value) / max) * 100 + "%");
        if (wrap) wrap.classList.toggle("is-idle", !chosen);
      }

      function paintFace() {
        var ready = pickedHour != null && pickedMinute != null;
        if (hourTile) {
          hourTile.textContent = ready ? pad2(pickedHour) : "–";
          hourTile.classList.toggle("is-set", ready);
        }
        if (minuteTile) {
          minuteTile.textContent = ready ? pad2(pickedMinute) : "–";
          minuteTile.classList.toggle("is-set", ready);
        }
        if (readout) {
          readout.textContent = ready ? pad2(pickedHour) + ":" + pad2(pickedMinute) : "Slide";
          readout.classList.toggle("is-set", ready);
        }
        if (periodEl) {
          periodEl.textContent = ready
            ? partLabel(pickedHour)
            : "Slide to choose the hour and minute";
        }
        paintSlider();
      }

      function commit() {
        timeInput.value =
          pickedHour != null && pickedMinute != null
            ? pad2(pickedHour) + ":" + pad2(pickedMinute)
            : "";
        paintFace();
        refreshTimer();
        updateSummary();
      }

      function take() {
        var total = Number(timeRange.value);
        chosen = true;
        pickedHour = Math.floor(total / 60);
        pickedMinute = total % 60;
        commit();
      }

      timeRange.addEventListener("pointerdown", take);
      timeRange.addEventListener("input", take);
      timeRange.addEventListener("change", take);
      resetStartPicker = function () {
        chosen = false;
        pickedHour = null;
        pickedMinute = null;
        timeRange.value = "0";
        timeInput.value = "";
        paintFace();
      };
      paintFace();
    }

    buildStartPicker();

    couponInput.addEventListener("input", updateSummary);
    if (emailInput) emailInput.addEventListener("input", updateSummary);
    if (emailInput) {
      emailInput.addEventListener("blur", function () {
        var email = emailInput.value.trim();
        if (!email) {
          emailInput.classList.remove("is-invalid");
          return;
        }
        if (!isValidEmail(email)) showContactError("Enter a valid email.", "email");
        else clearContactError();
      });
    }
    if (phoneInput) {
      phoneInput.addEventListener("input", function () {
        var digits = phoneDigits(phoneInput.value).slice(0, 10);
        if (phoneInput.value !== digits) phoneInput.value = digits;
        if (digits && digits.length !== 10) {
          phoneInput.classList.add("is-invalid");
          if (contactHint) {
            contactHint.hidden = false;
            contactHint.textContent = "Phone number must be 10 digits.";
            contactHint.classList.add("hint--error");
          }
        } else if (contactHint && contactHint.classList.contains("hint--error")) {
          clearContactError();
        } else {
          phoneInput.classList.remove("is-invalid");
        }
        updateSummary();
      });
    }

    function couponPercent(code) {
      var coupons = (pricingConfig && pricingConfig.coupons) || { SAFE10: 10 };
      var key = String(code || "").trim().toUpperCase();
      return Number(coupons[key]) || 0;
    }

    function missingSelectionMessage() {
      return startProblem(new Date()).text;
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

      const sessionUser = (await authReady) || (Auth && Auth.getUser ? Auth.getUser() : null);
      if (!sessionUser) return;
      const advisor = currentAdvisor();
      let total = priceFor();
      const coupon = (couponInput.value || "").trim().toUpperCase();
      const pct = couponPercent(coupon);
      if (pct > 0) total = Math.round(total * (1 - pct / 100));

      var start = selectedStart();
      var minutes = selectedDuration();
      var end = endFromStart(start, minutes);
      const booking = {
        advisorId: selectedAdvisorId(),
        advisorName: advisor ? advisor.name : "",
        date: dateInput.value,
        time: formatTime(start),
        endTime: formatTime(end),
        durationMinutes: minutes,
        mode: "voice",
        coupon: coupon,
        email: contact.email,
        phone: contact.phone,
        userId: sessionUser ? sessionUser.uid : null,
        total: total,
        status: "Pending",
        createdAt: new Date().toISOString(),
      };

      var submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.setAttribute("aria-busy", "true");
        if (!submitBtn.getAttribute("data-label")) {
          submitBtn.setAttribute("data-label", submitBtn.textContent);
        }
        submitBtn.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Confirming…';
      }

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
        rememberPhone(Auth, sessionUser, contact.phone);
        if (window.MyTalksMail && window.MyTalksMail.notify) {
          window.MyTalksMail.notify("pending", booking).catch(function () {});
        }
        trackEvent("book_session_complete", {
          advisor_id: booking.advisorId || "",
          mode: booking.mode || "",
          value: total,
          currency: "INR",
        });
        const modal = document.querySelector("[data-booking-modal]");
        if (modal) modal.classList.add("is-open");
        window.MyTalksUI.showToast(
          "Your booking is pending. We’ll email you when your advisor confirms."
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
        rememberPhone(Auth, sessionUser, contact.phone);
        const modal = document.querySelector("[data-booking-modal]");
        if (modal) modal.classList.add("is-open");
        window.MyTalksUI.showToast(
          "Booking saved locally. Cloud sync failed — check Firebase rules.",
          "error"
        );
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.removeAttribute("aria-busy");
          submitBtn.textContent = submitBtn.getAttribute("data-label") || "Confirm & Pay";
        }
      }
    });

    document.querySelectorAll("[data-close-modal]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const modal = document.querySelector("[data-booking-modal]");
        if (modal) modal.classList.remove("is-open");
      });
    });

    refreshTimer();
    updateSummary();
    setInterval(refreshTimer, 1000);

    document.addEventListener("mytalks:auth-changed", function () {
      prefillContact(form, window.MyTalksAuth);
      updateSummary();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();

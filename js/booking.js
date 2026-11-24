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

  function trackMetaCommerce(eventName, advisorId, advisorName, amount, extra) {
    if (!window.MyTalksPixel) return;
    var id = String(advisorId || "session");
    var payload = {
      content_ids: [id],
      content_name: advisorName || "Session",
      content_type: "product",
      content_category: "session",
      contents: [{ id: id, quantity: 1 }],
      value: Number(amount) || 0,
      currency: "INR",
      num_items: 1,
    };
    if (extra) {
      Object.keys(extra).forEach(function (key) {
        payload[key] = extra[key];
      });
    }
    window.MyTalksPixel.track(eventName, payload);
  }

  function trackAdsPurchase(value, transactionId) {
    try {
      if (typeof window.gtag !== "function") return;
      window.gtag("event", "conversion", {
        send_to: "AW-18546580616/BTzkCOWI_64dEIi52YtF",
        value: value,
        currency: "INR",
        transaction_id: transactionId || "",
      });
    } catch (e) {
      /* Ads must never break booking */
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

  function normalizePhoneDigits(value) {
    var digits = phoneDigits(value);
    if (digits.length > 10 && digits.slice(0, 2) === "91") digits = digits.slice(2);
    if (digits.length > 10 && digits.charAt(0) === "0") digits = digits.slice(1);
    return digits.slice(0, 10);
  }

  function displayPhone(value) {
    return normalizePhoneDigits(value);
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
      noteBooking("open");
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
      pricingConfig = { plans: [] };
    }
    var couponCatalog = [];
    var couponQuote = emptyCouponQuote(0);
    var celebratedCode = "";
    var couponTimer = null;
    try {
      var couponDb = window.MyTalksDB || null;
      if (couponDb && couponDb.ready) await couponDb.ready;
      if (couponDb && couponDb.listCoupons) couponCatalog = await couponDb.listCoupons();
    } catch (couponErr) {
      couponCatalog = [];
    }

    const params = new URLSearchParams(window.location.search);
    const preselect = params.get("advisor");
    trackEvent("book_session_start", {
      advisor_id: preselect || "",
    });
    var metaCartSent = false;
    function trackMetaCart(advisor, amount) {
      if (metaCartSent) return;
      metaCartSent = true;
      trackMetaCommerce(
        "AddToCart",
        advisor && advisor.id,
        advisor && advisor.name,
        amount
      );
    }
    if (preselect) {
      var presetAdvisor = advisors.find(function (item) {
        return String(item.id) === String(preselect);
      });
      if (presetAdvisor) trackMetaCart(presetAdvisor, presetAdvisor.price);
    }

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

    function minutesToSlot(mins) {
      var capped = Math.max(0, Math.min(24 * 60, mins));
      return pad2(Math.floor(capped / 60) % 24) + ":" + pad2(capped % 60);
    }

    function startWindow(advisor, day) {
      if (!advisor || !day || !advisorAvailableOn(advisor, day)) return null;
      var earliest = earliestStart(new Date());
      var minDay = new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate());
      var dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      if (dayStart < minDay) return null;
      var open = 0;
      var close = 24 * 60;
      if (advisor.hoursStart && advisor.hoursEnd) {
        open = slotMinutes(advisor.hoursStart);
        close = slotMinutes(advisor.hoursEnd);
        if (!(close > open)) return null;
      }
      var latestStart = close - selectedDuration();
      var earliestMin = 0;
      if (toLocalDateString(dayStart) === toLocalDateString(earliest)) {
        earliestMin = earliest.getHours() * 60 + earliest.getMinutes();
      }
      var min = Math.max(open, earliestMin);
      if (min > latestStart) return null;
      return { min: min, max: latestStart, open: open, close: close };
    }

    function dayIsBookable(advisor, day) {
      return !!startWindow(advisor, day);
    }

    function todayBookingNotice(advisor) {
      if (!advisor || !advisor.name) return "";
      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (!advisorAvailableOn(advisor, today) || dayIsBookable(advisor, today)) return "";
      var earliest = earliestStart(now);
      var when = friendlyTime(formatTime(earliest));
      if (toLocalDateString(earliest) !== toLocalDateString(today)) {
        when += " (after midnight)";
      }
      return advisor.name + " is available today. The earliest session can start at " + when + ".";
    }

    function nextOpenDate(advisor, from) {
      var earliest = earliestStart(new Date());
      var start = from
        ? new Date(from.getFullYear(), from.getMonth(), from.getDate())
        : new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate());
      var earliestDay = new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate());
      if (start < earliestDay) start = earliestDay;
      var i;
      for (i = 0; i < 62; i++) {
        var day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        if (dayIsBookable(advisor, day)) return toLocalDateString(day);
      }
      return "";
    }

    function ensureOpenDate() {
      if (!dateInput || !selectedAdvisorId()) return;
      var advisor = currentAdvisor();
      var selected = dateInput.value ? parseLocalDate(dateInput.value) : null;
      if (selected && dayIsBookable(advisor, selected)) return;
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

    function requestedMode() {
      var mode = String(new URLSearchParams(window.location.search).get("mode") || "").toLowerCase();
      if (mode === "chat" || mode === "voice" || mode === "video") return mode;
      return "";
    }

    function selectedMode() {
      var picked = form.querySelector("[name=mode]:checked");
      var value = picked ? String(picked.value) : "voice";
      if (value === "chat" || value === "voice" || value === "video") return value;
      return "voice";
    }

    function modeLabel(mode) {
      if (mode === "chat") return "Chat";
      if (mode === "video") return "Video";
      return "Voice";
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
      var label = friendlyTime(formatTime(end));
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
        return issue("hint", "Tap a start time.");
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
    var syncStartWindow = function () {};

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
        note.textContent = advisor
          ? "Choose an open day. Available " + whenAdvisorWorks(advisor) + "."
          : "Choose a date first.";
      } else if (!open) {
        note.hidden = false;
        note.classList.add("hint--error");
        note.textContent = "Not available on this day. Choose " + whenAdvisorWorks(advisor) + ".";
      } else {
        var notice = todayBookingNotice(advisor);
        note.hidden = !notice;
        note.classList.remove("hint--error");
        note.textContent = notice;
      }
    }

    function refreshTimer() {
      var now = new Date();
      syncTimeLimits(now);
      syncStartVisibility();
      syncStartWindow();
      var minutes = selectedDuration();
      var start = selectedStart();
      var issue = startProblem(now);
      var end = !issue.text && start ? endFromStart(start, minutes) : null;
      var note = issue.tone === "error"
        ? issue.text
        : start
          ? "Starts at " +
            friendlyTime(formatTime(start)) +
            ". Ends at " +
            friendlyTime(formatTime(end)) +
            (toLocalDateString(end) !== toLocalDateString(start) ? " the next day" : "") +
            "."
          : "";
      var status = form.querySelector("[data-start-status]");
      if (status) {
        status.hidden = !note;
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
          ensureOpenDate();
          refreshTimer();
          updateSummary();
          noteBooking("choose-duration");
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

    function bookingActor() {
      var live = Auth && Auth.getUser ? Auth.getUser() : null;
      if (live && live.uid) return live;
      if (sessionHint && sessionHint.uid) {
        return {
          uid: sessionHint.uid,
          email: sessionHint.email || "",
          displayName: sessionHint.name || "",
        };
      }
      return null;
    }

    function bookingDetailText(extra) {
      var parts = [];
      if (dateInput && dateInput.value) parts.push(dateInput.value);
      if (timeInput && timeInput.value) parts.push(timeInput.value);
      parts.push(selectedDuration() + " min");
      parts.push(modeLabel(selectedMode()));
      var price = priceFor();
      if (price) parts.push("₹" + price);
      var coupon = couponInput && couponInput.value ? String(couponInput.value).trim() : "";
      if (coupon) parts.push("coupon " + coupon.toUpperCase());
      if (extra) parts.push(extra);
      return parts.join(" · ").slice(0, 500);
    }

    function noteBooking(action, extra) {
      var actor = bookingActor();
      if (!actor || !window.MyTalksDB || !window.MyTalksDB.recordActivity) return;
      var advisor = currentAdvisor();
      window.MyTalksDB.recordActivity(actor, {
        kind: "booking",
        action: action,
        page: "book-session",
        path: window.location.pathname || "/pages/book-session",
        label: "Book a session",
        advisorId: selectedAdvisorId(),
        advisorName: advisor && advisor.name ? advisor.name : "",
        detail: bookingDetailText(extra),
      }).catch(function (err) {
        console.warn("Booking activity was not saved:", err);
      });
    }

    function updateSummary() {
      paintSummary();
      if (couponTimer) clearTimeout(couponTimer);
      couponTimer = setTimeout(function () {
        resolveCoupon(priceFor(), couponInput ? couponInput.value : "").then(function (quote) {
          couponQuote = quote;
          paintSummary();
          celebrateCoupon(quote);
        });
      }, 180);
    }

    function paintSummary() {
      if (!summary) return;

      const a = currentAdvisor();
      if (!a) {
        summary.hidden = true;
        summary.innerHTML = "";
        syncPayLabel();
        return;
      }

      var quote = couponQuote && couponQuote.original === priceFor() ? couponQuote : emptyCouponQuote(priceFor());
      var total = quote.payable;
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
        summaryRow("Starts", start ? friendlyTime(formatTime(start)) : "") +
        summaryRow("Ends", end ? formatEndLabel(start, end) : "") +
        summaryRow("Contact", contactParts.join(" · "));
      var saved = quote.ok && !quote.empty && quote.off > 0;
      var totalHtml = saved
        ? '<span>Pay only</span><strong><span class="booking-summary__was">₹' +
          quote.original +
          "</span>₹" +
          total +
          "</strong>"
        : "<span>Total</span><strong>₹" + total + "</strong>";

      summary.hidden = false;
      summary.innerHTML =
        (saved
          ? '<div class="coupon-celebrate" data-coupon-celebrate><p>Coupon applied</p><strong>Pay only ₹' +
            total +
            "</strong></div>"
          : "") +
        '<dl class="booking-summary__list">' +
        rows +
        "</dl>" +
        '<div class="booking-summary__total">' +
        totalHtml +
        "</div>";
      var hint = form.querySelector("[data-coupon-hint]");
      if (hint) {
        hint.hidden = !quote.message;
        hint.textContent = quote.message
          ? quote.message + " You can still book without it."
          : "";
        hint.classList.toggle("hint--error", !!quote.message);
      }
      if (couponInput) couponInput.classList.toggle("is-invalid", !!quote.message);
      syncPayLabel();
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
        noteBooking("choose-advisor");
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
      noteBooking("choose-date");
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
          var bookable = dayIsBookable(currentAdvisor(), day);
          var isSelected = bookable && current && toLocalDateString(current) === iso;
          var reason = bookable ? "" : day < minDay ? "Too soon" : "Not available";
          html +=
            '<button type="button" class="date-picker__day' +
            (isSelected ? " is-selected" : "") +
            '" data-date-value="' +
            iso +
            '"' +
            (bookable ? "" : ' disabled title="' + reason + '"') +
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

    function startSlotList(bounds) {
      var step = 30;
      var first = Math.ceil(bounds.min / step) * step;
      var list = [];
      var minute;
      for (minute = first; minute <= bounds.max; minute += step) list.push(minute);
      if (!list.length && bounds.min <= bounds.max) list.push(bounds.min);
      return list;
    }

    function buildStartPicker() {
      var root = form.querySelector("[data-start-picker]");
      var slotsHost = root && root.querySelector("[data-time-slots]");
      if (!root || !slotsHost || !timeInput) return;
      var slotKey = "";

      function paintSelected() {
        var current = timeInput.value;
        slotsHost.querySelectorAll("[data-slot]").forEach(function (button) {
          var on = button.getAttribute("data-slot") === current;
          button.classList.toggle("is-selected", on);
          button.setAttribute("aria-selected", on ? "true" : "false");
        });
      }

      syncStartWindow = function () {
        var advisor = currentAdvisor();
        var date = dateInput && dateInput.value ? parseLocalDate(dateInput.value) : null;
        var bounds = startWindow(advisor, date);
        var note = form.querySelector("[data-hours-note]");
        if (!bounds) {
          slotKey = "";
          slotsHost.innerHTML = "";
          if (note) {
            note.hidden = true;
            note.textContent = "";
          }
          return;
        }
        var slots = startSlotList(bounds);
        var key =
          (dateInput.value || "") +
          "|" +
          bounds.min +
          "|" +
          bounds.max +
          "|" +
          selectedDuration();
        var current = timeInput.value;
        if (current && !slots.some(function (minute) { return minutesToSlot(minute) === current; })) {
          timeInput.value = "";
          current = "";
        }
        if (key !== slotKey) {
          slotKey = key;
          var groups = [
            { label: "Night", from: 0, to: 6 * 60 },
            { label: "Morning", from: 6 * 60, to: 12 * 60 },
            { label: "Afternoon", from: 12 * 60, to: 17 * 60 },
            { label: "Evening", from: 17 * 60, to: 24 * 60 },
          ];
          slotsHost.innerHTML = groups
            .map(function (group) {
              var mine = slots.filter(function (minute) {
                return minute >= group.from && minute < group.to;
              });
              if (!mine.length) return "";
              return (
                '<div class="slot-group"><p class="slot-group__label">' +
                group.label +
                '</p><div class="slot-grid" role="listbox" aria-label="' +
                group.label +
                ' start times">' +
                mine
                  .map(function (minute) {
                    var value = minutesToSlot(minute);
                    var on = value === current;
                    return (
                      '<button type="button" class="slot-btn' +
                      (on ? " is-selected" : "") +
                      '" data-slot="' +
                      value +
                      '" role="option" aria-selected="' +
                      (on ? "true" : "false") +
                      '">' +
                      friendlyTime(value) +
                      "</button>"
                    );
                  })
                  .join("") +
                "</div></div>"
              );
            })
            .join("");
        } else {
          paintSelected();
        }
        if (note) {
          var name = advisor && advisor.name ? String(advisor.name).split(" ")[0] : "Your advisor";
          note.hidden = false;
          note.textContent = advisor && advisor.hoursStart && advisor.hoursEnd
            ? name + " is free from " + friendlyTime(advisor.hoursStart) + " to " + friendlyTime(advisor.hoursEnd) + "."
            : name + " is free all day. Tap the time you want.";
        }
      };

      slotsHost.addEventListener("click", function (e) {
        var button = e.target.closest("[data-slot]");
        if (!button) return;
        timeInput.value = button.getAttribute("data-slot") || "";
        paintSelected();
        refreshTimer();
        updateSummary();
        noteBooking("choose-time");
      });

      resetStartPicker = function () {
        slotKey = "";
        timeInput.value = "";
        slotsHost.innerHTML = "";
      };
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
    var modeChoice = form.querySelector("[data-mode-options]");
    var presetMode = modeChoice && !modeChoice.closest("[hidden]") ? requestedMode() : "";
    if (presetMode) {
      var modeInput = form.querySelector('[name=mode][value="' + presetMode + '"]');
      if (modeInput) modeInput.checked = true;
    }
    form.querySelectorAll("[name=mode]").forEach(function (input) {
      input.addEventListener("change", function () {
        updateSummary();
        noteBooking("choose-mode");
      });
    });

    if (phoneInput) {
      phoneInput.addEventListener("input", function () {
        var digits = normalizePhoneDigits(phoneInput.value);
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

    function emptyCouponQuote(price) {
      var original = Math.round(Number(price) || 0);
      return {
        ok: true,
        empty: true,
        code: "",
        original: original,
        payable: original,
        off: 0,
        message: "",
      };
    }

    function todayKey() {
      var d = new Date();
      var month = String(d.getMonth() + 1);
      var day = String(d.getDate());
      if (month.length < 2) month = "0" + month;
      if (day.length < 2) day = "0" + day;
      return d.getFullYear() + "-" + month + "-" + day;
    }

    function couponKey(code) {
      return String(code || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
    }

    function waitForCouponDb() {
      if (window.MyTalksDB && window.MyTalksDB.getCoupon) {
        return window.MyTalksDB.ready
          ? window.MyTalksDB.ready.then(function () {
              return window.MyTalksDB;
            })
          : Promise.resolve(window.MyTalksDB);
      }
      return new Promise(function (resolve) {
        var done = false;
        function finish() {
          if (done) return;
          done = true;
          var db = window.MyTalksDB;
          if (db && db.ready) {
            db.ready.then(function () {
              resolve(window.MyTalksDB);
            });
            return;
          }
          resolve(db || null);
        }
        document.addEventListener("mytalks:firestore-ready", finish, { once: true });
        setTimeout(finish, 5000);
      });
    }

    function quoteCoupon(code, price, coupon) {
      var original = Math.round(Number(price) || 0);
      var key = couponKey(code);
      if (!key) return emptyCouponQuote(original);
      if (!coupon) {
        coupon = couponCatalog.find(function (item) {
          return item.code === key;
        });
      }
      if (!coupon || coupon.active === false) {
        return {
          ok: false,
          empty: false,
          code: key,
          original: original,
          payable: original,
          off: 0,
          message: "This coupon is not valid.",
        };
      }
      if (coupon.expiresAt && coupon.expiresAt < todayKey()) {
        return {
          ok: false,
          empty: false,
          code: key,
          original: original,
          payable: original,
          off: 0,
          message: "This coupon has expired.",
        };
      }
      if (coupon.usedCount >= coupon.maxUses) {
        return {
          ok: false,
          empty: false,
          code: key,
          original: original,
          payable: original,
          off: 0,
          message: "This coupon has been fully used.",
        };
      }
      var payable = original > 1 ? Math.max(1, original - coupon.amount) : original;
      return {
        ok: true,
        empty: false,
        code: key,
        original: original,
        payable: payable,
        off: original - payable,
        amount: coupon.amount,
        message: "",
      };
    }

    async function resolveCoupon(price, code) {
      var key = couponKey(code);
      var coupon = null;
      var lookupFailed = false;
      if (key) {
        try {
          var db = await waitForCouponDb();
          if (!db || !db.getCoupon) lookupFailed = true;
          else coupon = await db.getCoupon(key);
        } catch (lookupErr) {
          lookupFailed = true;
          console.warn("Coupon lookup failed:", lookupErr);
        }
        if (coupon) {
          var existing = couponCatalog.findIndex(function (item) {
            return item.code === coupon.code;
          });
          if (existing >= 0) couponCatalog[existing] = coupon;
          else couponCatalog.push(coupon);
        }
      }
      var quote = quoteCoupon(code, price, coupon);
      if (lookupFailed && key && !coupon) {
        quote.ok = false;
        quote.message = "We couldn't check that coupon yet. You can still book without it.";
      }
      if (!quote.ok || quote.empty) return quote;
      var user = window.MyTalksAuth && window.MyTalksAuth.getUser && window.MyTalksAuth.getUser();
      if (user && window.MyTalksDB && window.MyTalksDB.getCouponRedemption) {
        try {
          var prior = await window.MyTalksDB.getCouponRedemption(quote.code, user.uid);
          if (prior) {
            quote.ok = false;
            quote.payable = quote.original;
            quote.off = 0;
            quote.message = "You have already used this coupon.";
          }
        } catch (err) {
          console.warn("Coupon check failed:", err);
        }
      }
      return quote;
    }

    function syncPayLabel() {
      var submitBtn = form.querySelector('[type="submit"]');
      if (!submitBtn || submitBtn.getAttribute("aria-busy") === "true") return;
      var quote = couponQuote;
      var label =
        quote && quote.ok && !quote.empty && quote.off > 0
          ? "Pay only ₹" + quote.payable
          : "Confirm & Pay";
      submitBtn.textContent = label;
    }

    function celebrateCoupon(quote) {
      if (!quote || !quote.ok || quote.empty || quote.off < 1) {
        if (!quote || quote.empty) celebratedCode = "";
        return;
      }
      if (celebratedCode === quote.code + ":" + quote.payable) return;
      celebratedCode = quote.code + ":" + quote.payable;
      var box = summary && summary.querySelector("[data-coupon-celebrate]");
      if (!box) return;
      box.classList.remove("is-on");
      void box.offsetWidth;
      box.classList.add("is-on");
      var colors = ["#16a34a", "#f59e0b", "#7c3aed", "#0ea5e9", "#ec4899"];
      for (var i = 0; i < 14; i += 1) {
        var bit = document.createElement("span");
        bit.className = "coupon-celebrate__bit";
        bit.style.left = 8 + Math.random() * 84 + "%";
        bit.style.background = colors[i % colors.length];
        bit.style.animationDelay = Math.random() * 0.15 + "s";
        box.appendChild(bit);
        setTimeout(function (node) {
          if (node.parentNode) node.parentNode.removeChild(node);
        }, 1000, bit);
      }
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
      const coupon = (couponInput.value || "").trim().toUpperCase();
      var quote = await resolveCoupon(priceFor(), coupon);
      if (coupon && !quote.ok) {
        window.MyTalksUI.showToast(
          (quote.message || "This coupon is not valid.") + " You can still book at the full price."
        );
        quote = emptyCouponQuote(quote.original);
      }
      couponQuote = quote;
      paintSummary();
      let total = quote.payable;
      const subtotal = quote.original;
      const discount = quote.off;

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
        mode: selectedMode(),
        coupon: quote.empty ? "" : quote.code,
        subtotal: subtotal,
        discount: discount,
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
          '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Opening payment…';
      }

      noteBooking("pay");
      trackMetaCart(advisor, total);
      trackMetaCommerce("InitiateCheckout", booking.advisorId, booking.advisorName, total);
      trackEvent("begin_checkout", {
        currency: "INR",
        value: total,
        items: [
          {
            item_id: booking.advisorId || "session",
            item_name: advisor ? advisor.name : "Session",
            item_category: "session",
            price: total,
            quantity: 1,
          },
        ],
      });

      var txId = null;
      var paymentSettled = false;
      var adsPurchaseTracked = false;
      function reportAdsPurchase() {
        if (adsPurchaseTracked) return;
        adsPurchaseTracked = true;
        trackAdsPurchase(total, booking.razorpayPaymentId || booking.bookingId || "");
        trackMetaCommerce("Purchase", booking.advisorId, booking.advisorName, total, {
          order_id: booking.razorpayPaymentId || booking.bookingId || "",
        });
        if (window.MyTalksPixel) {
          window.MyTalksPixel.track("Schedule", {
            content_name: booking.advisorName || "Session",
            value: Number(total) || 0,
            currency: "INR",
          });
        }
      }
      var txClosed = false;

      function markTransaction(fields) {
        if (txClosed || !txId || !window.MyTalksDB || !window.MyTalksDB.updateTransaction) {
          return Promise.resolve();
        }
        txClosed = true;
        return window.MyTalksDB.updateTransaction(txId, fields).catch(function (txErr) {
          txClosed = false;
          console.warn("Transaction update failed:", txErr);
        });
      }

      function failureText(err) {
        var reason = (err && err.reason) || "";
        if (reason === "dismissed") return "Payment cancelled.";
        return (err && err.message) || "Payment failed.";
      }

      try {
        if (window.MyTalksDB && window.MyTalksDB.createTransaction) {
          try {
            var createdTx = await window.MyTalksDB.createTransaction({
              userId: booking.userId,
              name: sessionUser.displayName || "",
              email: booking.email,
              phone: booking.phone,
              advisorId: booking.advisorId,
              advisorName: booking.advisorName,
              date: booking.date,
              time: booking.time,
              endTime: booking.endTime,
              durationMinutes: booking.durationMinutes,
              mode: booking.mode,
              coupon: booking.coupon,
              amount: total,
            });
            txId = createdTx && createdTx.id;
          } catch (txErr) {
            console.warn("Could not record payment attempt:", txErr);
          }
        }

        if (!window.MyTalksPay || typeof window.MyTalksPay.checkout !== "function") {
          throw new Error("Payment is not available. Refresh and try again.");
        }

        var amountPaise = Math.round(Number(total) * 100);
        if (!Number.isFinite(amountPaise) || amountPaise < 100) {
          throw new Error("Session total is too low to charge.");
        }

        trackMetaCommerce("AddPaymentInfo", booking.advisorId, booking.advisorName, total);
        trackEvent("add_payment_info", {
          currency: "INR",
          value: total,
          payment_type: "razorpay",
        });

        var payment = await window.MyTalksPay.checkout({
          amountPaise: amountPaise,
          currency: "INR",
          receipt: "bk_" + Date.now().toString(36),
          description: minutes + " min session" + (advisor ? " with " + advisor.name : ""),
          prefillName: sessionUser.displayName || "",
          prefillEmail: contact.email || "",
          prefillContact: contact.phone || "",
          notes: {
            advisorId: booking.advisorId || "",
            date: booking.date || "",
            time: booking.time || "",
          },
        });
        paymentSettled = true;

        booking.paymentStatus = "paid";
        booking.razorpayOrderId = payment.razorpay_order_id || "";
        booking.razorpayPaymentId = payment.razorpay_payment_id || "";

        if (submitBtn) {
          submitBtn.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Confirming…';
        }

        if (window.MyTalksDB && window.MyTalksDB.createBooking) {
          var saved = await window.MyTalksDB.createBooking(booking);
          booking.bookingId = saved.bookingId || saved.id;
        }
        noteBooking("booked", booking.bookingId ? "#" + booking.bookingId : "");
        if (booking.coupon && window.MyTalksDB && window.MyTalksDB.redeemCoupon) {
          try {
            await window.MyTalksDB.redeemCoupon(booking.coupon, {
              email: booking.email,
              bookingId: booking.bookingId || "",
              paid: total,
            });
          } catch (redeemErr) {
            console.warn("Coupon use was not recorded:", redeemErr);
          }
        }
        await markTransaction({
          status: "paid",
          razorpayOrderId: booking.razorpayOrderId || "",
          razorpayPaymentId: booking.razorpayPaymentId || "",
          bookingId: booking.bookingId || "",
        });
        localStorage.setItem("mytalks-last-booking", JSON.stringify(booking));
        rememberPhone(Auth, sessionUser, contact.phone);
        if (window.MyTalksMail && window.MyTalksMail.notify) {
          window.MyTalksMail.notify("pending", booking).catch(function () {});
        }
        trackEvent("purchase", {
          transaction_id: booking.razorpayPaymentId || booking.bookingId || "",
          currency: "INR",
          value: total,
          items: [
            {
              item_id: booking.advisorId || "session",
              item_name: booking.advisorName || "Session",
              item_category: "session",
              price: total,
              quantity: 1,
            },
          ],
        });
        trackEvent("book_session_complete", {
          advisor_id: booking.advisorId || "",
          mode: booking.mode || "",
          value: total,
          currency: "INR",
        });
        reportAdsPurchase();
        const modal = document.querySelector("[data-booking-modal]");
        if (modal) modal.classList.add("is-open");
        window.MyTalksUI.showToast(
          "Payment successful. Your booking is pending — we’ll email you when your advisor confirms."
        );
      } catch (err) {
        console.error(err);
        if (paymentSettled) {
          reportAdsPurchase();
          await markTransaction({
            status: "paid",
            razorpayOrderId: booking.razorpayOrderId || "",
            razorpayPaymentId: booking.razorpayPaymentId || "",
            bookingId: booking.bookingId || "",
          });
        } else {
          await markTransaction({
            status: "failed",
            failureReason: failureText(err),
          });
        }
        var reason = (err && err.reason) || "";
        if (reason === "dismissed") {
          trackEvent("checkout_cancel", { currency: "INR", value: total });
          window.MyTalksUI.showToast("Payment cancelled. Your booking was not created.", "error");
        } else if (reason === "payment_failed" || reason === "verify_failed") {
          trackEvent("payment_failed", {
            currency: "INR",
            value: total,
            failure_reason: reason,
          });
          window.MyTalksUI.showToast(
            (err && err.message) || "Payment failed. Please try again.",
            "error"
          );
        } else {
          trackEvent("payment_failed", {
            currency: "INR",
            value: total,
            failure_reason: reason || "error",
          });
          try {
            if (window.MyTalksErrors && typeof window.MyTalksErrors.report === "function") {
              window.MyTalksErrors.report(
                (err && err.message) || "booking_pay_failed",
                { fatal: false, error: err }
              );
            }
          } catch (reportErr) {
            /* ignore */
          }
          window.MyTalksUI.showToast(
            (err && err.message) || "Could not complete booking. Please try again.",
            "error"
          );
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.removeAttribute("aria-busy");
          syncPayLabel();
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

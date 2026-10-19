(function () {
  const esc = function (s) {
    return window.MyTalksData.escapeHtml(s);
  };

  var SKELETON_WIDTHS = ["skeleton--xl", "skeleton--md", "skeleton--lg", "skeleton--sm"];

  function waitForAuth() {
    if (window.MyTalksAuth && window.MyTalksAuth.ready) {
      return window.MyTalksAuth.ready.then(function () {
        return window.MyTalksAuth;
      });
    }
    return new Promise(function (resolve) {
      document.addEventListener(
        "mytalks:auth-ready",
        function () {
          resolve(window.MyTalksAuth);
        },
        { once: true }
      );
    });
  }

  function renderTableSkeleton(el, colCount, rowCount) {
    if (!el) return;
    var rows = [];
    for (var r = 0; r < rowCount; r++) {
      var cells = [];
      for (var c = 0; c < colCount; c++) {
        var width = SKELETON_WIDTHS[(r + c) % SKELETON_WIDTHS.length];
        cells.push(
          '<td><span class="skeleton ' + width + '" aria-hidden="true"></span></td>'
        );
      }
      rows.push('<tr class="skeleton-row" aria-hidden="true">' + cells.join("") + "</tr>");
    }
    el.innerHTML = rows.join("");
    el.setAttribute("aria-busy", "true");
  }

  function clearBusy(el) {
    if (el) el.setAttribute("aria-busy", "false");
  }

  function fillProfile(user, Auth) {
    var nameInput = document.querySelector("[data-profile-name]");
    var emailInput = document.querySelector("[data-profile-email]");
    var phoneInput = document.querySelector("[data-profile-phone]");
    var submitBtn = document.querySelector("[data-profile-submit]");
    var profileForm = document.querySelector("[data-profile-form]");
    var local = user && Auth.getLocalProfile ? Auth.getLocalProfile(user.uid) : null;

    if (nameInput && user) {
      nameInput.value = user.displayName || (local && local.name) || "";
    }
    if (emailInput && user) {
      emailInput.value = user.email || "";
    }
    if (phoneInput) {
      phoneInput.value = (local && local.phone) || (user && user.phoneNumber) || "";
    }

    [nameInput, phoneInput].forEach(function (input) {
      if (!input) return;
      input.disabled = false;
      input.classList.remove("is-skeleton");
    });
    if (emailInput) {
      emailInput.disabled = false;
      emailInput.classList.remove("is-skeleton");
    }
    if (submitBtn) submitBtn.disabled = false;
    clearBusy(profileForm);
  }

  async function init() {
    const root = document.querySelector("[data-dashboard]");
    if (!root || !window.MyTalksData) return;

    const sessionsEl = document.querySelector("[data-dash-sessions]");
    const ticketsEl = document.querySelector("[data-tickets]");
    if (sessionsEl && !sessionsEl.querySelector(".skeleton-row")) {
      renderTableSkeleton(sessionsEl, 5, 4);
    }
    if (ticketsEl && !ticketsEl.querySelector(".skeleton-row")) {
      renderTableSkeleton(ticketsEl, 4, 3);
    }

    const Auth = await waitForAuth();
    let user = null;
    if (Auth) {
      user = await Auth.requireAuth();
      if (!user) return;
    }

    const data = await window.MyTalksData.getDashboard();
    const name =
      (Auth && Auth.displayNameFor(user)) ||
      (user && user.email) ||
      data.user.name;

    const nameEl = document.querySelector("[data-user-name]");
    if (nameEl) nameEl.textContent = name;

    const emailEl = document.querySelector("[data-user-email]");
    if (emailEl) emailEl.textContent = (user && user.email) || "";

    fillProfile(user, Auth);

    const profileForm = document.querySelector("[data-profile-form]");
    if (profileForm && Auth && user) {
      profileForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        var nameVal = (profileForm.querySelector("[name=displayName]") || {}).value || "";
        var phoneVal = (profileForm.querySelector("[name=phone]") || {}).value || "";
        nameVal = nameVal.trim();
        phoneVal = phoneVal.trim();
        try {
          if (nameVal && nameVal !== (user.displayName || "")) {
            await user.updateProfile({ displayName: nameVal });
          }
          Auth.saveLocalProfile(user.uid, {
            name: nameVal,
            email: user.email || "",
            phone: phoneVal,
          });
          if (window.MyTalksDB && window.MyTalksDB.updateUserProfile) {
            await window.MyTalksDB.updateUserProfile(user.uid, {
              name: nameVal,
              displayName: nameVal,
              phone: phoneVal,
              email: user.email || "",
            });
          }
          if (nameEl) nameEl.textContent = nameVal || Auth.displayNameFor(user);
          Auth.updateHeader(Auth.getUser());
          if (window.MyTalksUI) {
            window.MyTalksUI.showToast(
              profileForm.getAttribute("data-success") || "Profile saved."
            );
          }
        } catch (err) {
          if (window.MyTalksUI) {
            window.MyTalksUI.showToast(Auth.authErrorMessage(err), "error");
          }
        }
      });
    }

    function activateDashTab(tab) {
      var fallback = "sessions";
      var navBtn = document.querySelector('[data-dash-nav="' + tab + '"]');
      var panel = document.querySelector('[data-dash-panel="' + tab + '"]');
      if (!navBtn || navBtn.hidden || !panel || panel.hidden) {
        tab = fallback;
        navBtn = document.querySelector('[data-dash-nav="' + tab + '"]');
      }
      document.querySelectorAll("[data-dash-nav]").forEach(function (b) {
        b.classList.toggle("is-active", b === navBtn);
      });
      document.querySelectorAll("[data-dash-panel]").forEach(function (p) {
        p.classList.toggle(
          "is-active",
          p.getAttribute("data-dash-panel") === tab
        );
      });
    }

    document.querySelectorAll("[data-dash-nav]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        activateDashTab(btn.getAttribute("data-dash-nav"));
      });
    });

    var activeNav = document.querySelector("[data-dash-nav].is-active");
    if (activeNav && activeNav.hidden) {
      activateDashTab("sessions");
    }

    function sessionSortKey(s) {
      var t = (s.time || "00:00").toString();
      if (t.length === 5) t += ":00";
      var ms = Date.parse((s.date || "") + "T" + t);
      return isNaN(ms) ? 0 : ms;
    }

    function sessionLabel(s, source) {
      var status = (s.status || "").toLowerCase();
      if (status === "completed") return "Completed";
      if (status === "past" || source === "past") return "Past";
      var when = sessionSortKey(s);
      if (when && when < Date.now()) return "Past";
      return "Upcoming";
    }

    function badgeClassFor(label) {
      if (label === "Upcoming") return "badge badge--warning";
      if (label === "Completed") return "badge badge--success";
      return "badge";
    }

    if (sessionsEl) {
      var rows = [];
      var cloudBookings = [];
      if (window.MyTalksDB && user) {
        try {
          cloudBookings = await window.MyTalksDB.getBookingsForUser(
            user.uid,
            user.email || ""
          );
        } catch (err) {
          console.warn(err);
        }
      }

      if (cloudBookings.length) {
        rows = cloudBookings.map(function (b) {
          return {
            advisor: b.advisorName || b.advisorId,
            date: b.date,
            time: b.time,
            mode: b.mode,
            status: b.status || "Confirmed",
            _source: "cloud",
          };
        });
      } else {
        // Only show this device's last booking if it belongs to the signed-in user
        var lastBooking = null;
        try {
          lastBooking = JSON.parse(localStorage.getItem("mytalks-last-booking") || "null");
        } catch (e) {
          lastBooking = null;
        }
        if (
          lastBooking &&
          (lastBooking.userId === (user && user.uid) ||
            (user &&
              lastBooking.email &&
              user.email &&
              lastBooking.email.toLowerCase() === user.email.toLowerCase()))
        ) {
          rows.push({
            advisor: lastBooking.advisorName || lastBooking.advisorId,
            date: lastBooking.date,
            time: lastBooking.time,
            mode: lastBooking.mode,
            status: "Confirmed",
            _source: "upcoming",
          });
        }
      }

      rows.sort(function (a, b) {
        return sessionSortKey(b) - sessionSortKey(a);
      });

      var countEl = document.querySelector("[data-sessions-count]");
      if (countEl) countEl.textContent = String(rows.length);

      var bookHref = (window.MyTalksBase || ".") + "/pages/book-session";
      sessionsEl.innerHTML = rows.length
        ? rows
            .map(function (s) {
              var label = sessionLabel(s, s._source);
              return (
                "<tr><td>" +
                esc(s.advisor) +
                "</td><td>" +
                esc(s.date) +
                "</td><td>" +
                esc(s.time || "—") +
                "</td><td>" +
                esc(s.mode) +
                '</td><td><span class="' +
                badgeClassFor(label) +
                '">' +
                esc(label) +
                "</span></td></tr>"
              );
            })
            .join("")
        : '<tr><td colspan="5">No sessions yet. <a href="' +
          bookHref +
          '">Book a session</a></td></tr>';
      clearBusy(sessionsEl);
    }

    const invoices = document.querySelector("[data-dash-invoices]");
    if (invoices) {
      var invoiceRows = (data && data.invoices) || [];
      invoices.innerHTML = invoiceRows.length
        ? invoiceRows
            .map(function (i) {
              return (
                "<tr><td>" +
                esc(i.id) +
                "</td><td>" +
                esc(i.date) +
                "</td><td>₹" +
                esc(i.amount) +
                "</td><td>" +
                esc(i.status) +
                "</td></tr>"
              );
            })
            .join("")
        : '<tr><td colspan="4">No invoices yet.</td></tr>';
    }

    var walletBalance = (data && data.user && data.user.walletBalance) || 0;
    var referralEarnings = (data && data.user && data.user.referralEarnings) || 0;
    document.querySelectorAll("[data-wallet]").forEach(function (wallet) {
      wallet.textContent = "₹" + walletBalance;
    });
    document.querySelectorAll("[data-referral-earnings]").forEach(function (referral) {
      referral.textContent = "₹" + referralEarnings;
    });

    const notes = document.querySelector("[data-notifications]");
    if (notes) {
      var noteRows = (data && data.notifications) || [];
      notes.innerHTML = noteRows.length
        ? noteRows
            .map(function (n) {
              return (
                '<li class="card" style="margin-bottom:0.75rem"><strong>' +
                esc(n.text) +
                '</strong><p class="hint">' +
                esc(n.time) +
                "</p></li>"
              );
            })
            .join("")
        : '<li class="hint">No notifications yet.</li>';
    }

    if (ticketsEl) {
      // Real tickets only (Firestore). Never use dashboard.json mock rows.
      var ticketRows = [];
      if (window.MyTalksDB && user) {
        try {
          var cloudTickets = await window.MyTalksDB.getTicketsForUser(
            user.uid,
            user.email || ""
          );
          ticketRows = (cloudTickets || [])
            .filter(function (t) {
              var id = String(t.ticketId || t.id || "");
              // Strip legacy demo IDs if they ever appear
              return id !== "T-220" && id !== "T-198";
            })
            .map(function (t) {
              return {
                id: t.ticketId || t.id,
                subject: t.subject,
                status: t.status || "Open",
                updated: (t.updatedAt || t.createdAt || "").toString().slice(0, 10),
              };
            });
        } catch (err) {
          console.warn(err);
        }
      }

      ticketsEl.innerHTML = ticketRows.length
        ? ticketRows
            .map(function (t) {
              return (
                "<tr><td>" +
                esc(t.id) +
                "</td><td>" +
                esc(t.subject) +
                "</td><td>" +
                esc(t.status) +
                "</td><td>" +
                esc(t.updated) +
                "</td></tr>"
              );
            })
            .join("")
        : '<tr><td colspan="4">No tickets yet. <a href="support">Create one</a></td></tr>';
      clearBusy(ticketsEl);
    }

    clearBusy(root);
  }

  document.addEventListener("DOMContentLoaded", init);
})();

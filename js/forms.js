(function () {
  function formPayload(form) {
    var payload = {};
    new FormData(form).forEach(function (value, key) {
      if (key !== "website") payload[key] = value;
    });
    return payload;
  }

  function currentUserId() {
    try {
      var user = window.MyTalksAuth && window.MyTalksAuth.getUser && window.MyTalksAuth.getUser();
      return user ? user.uid : null;
    } catch (err) {
      return null;
    }
  }

  function saveLocalForm(name, payload) {
    try {
      var existing = JSON.parse(localStorage.getItem("mytalks-forms") || "[]");
      existing.push({
        form: name,
        payload: payload,
        at: new Date().toISOString(),
      });
      localStorage.setItem("mytalks-forms", JSON.stringify(existing));
    } catch (err) {
      /* ignore quota */
    }
  }

  function resolveUserEmail() {
    try {
      var Auth = window.MyTalksAuth;
      if (Auth && Auth.getUser) {
        var user = Auth.getUser();
        if (user && user.email) return user.email;
        if (Auth.getSessionHint) {
          var hint = Auth.getSessionHint();
          if (hint && hint.email) return hint.email;
        }
        if (user && Auth.getLocalProfile) {
          var local = Auth.getLocalProfile(user.uid);
          if (local && local.email) return local.email;
        }
      }
      var stored = JSON.parse(localStorage.getItem("mytalks-session") || "null");
      if (stored && stored.email) return stored.email;
    } catch (err) {
      /* ignore */
    }
    return "";
  }

  function prefillSupportEmails() {
    var email = resolveUserEmail();
    if (!email) return;
    document.querySelectorAll('form[name=ticket] [name=email]').forEach(function (input) {
      if (input && !input.value) input.value = email;
    });
  }

  function initTicketForms() {
    var createForm = document.querySelector("form[name=ticket]");
    if (createForm) {
      createForm.removeAttribute("data-demo-form");
      createForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        var hp = createForm.querySelector("[name=website]");
        if (hp && hp.value) return;
        if (!createForm.checkValidity()) {
          createForm.reportValidity();
          return;
        }

        var payload = formPayload(createForm);
        payload.userId = currentUserId();
        var btn = createForm.querySelector('[type="submit"]');
        if (btn) btn.disabled = true;

        try {
          if (!window.MyTalksDB) throw new Error("Support storage is still loading. Try again.");
          var result = await window.MyTalksDB.createTicket(payload);
          saveLocalForm("ticket", Object.assign({}, payload, { ticketId: result.ticketId }));
          if (window.MyTalksAnalytics) {
            window.MyTalksAnalytics.track("generate_lead", {
              form_name: "support_ticket",
              page_path: location.pathname,
            });
          }
          if (window.MyTalksUI) {
            window.MyTalksUI.showToast(
              "Ticket submitted. Your reference is " + result.ticketId + "."
            );
          }
          var trackId = document.querySelector('form[name=track] [name=ticketId]');
          if (trackId) trackId.value = result.ticketId;
          createForm.reset();
          prefillSupportEmails();
        } catch (err) {
          console.error(err);
          if (window.MyTalksUI) {
            window.MyTalksUI.showToast(
              (err && err.message) || "Could not submit ticket. Check Firebase rules and try again.",
              "error"
            );
          }
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    }

    var trackForm = document.querySelector("form[name=track]");
    if (trackForm) {
      trackForm.removeAttribute("data-demo-form");
      var statusBox = document.querySelector("[data-ticket-status]");
      trackForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (!trackForm.checkValidity()) {
          trackForm.reportValidity();
          return;
        }
        var payload = formPayload(trackForm);
        var btn = trackForm.querySelector('[type="submit"]');
        if (btn) btn.disabled = true;
        if (statusBox) statusBox.hidden = true;

        try {
          if (!window.MyTalksDB) throw new Error("Support storage is still loading.");
          var ticket = await window.MyTalksDB.getTicket(payload.ticketId);
          if (!ticket) {
            if (window.MyTalksUI) {
              window.MyTalksUI.showToast("No ticket found for that ID.", "error");
            }
            return;
          }
          if (statusBox) {
            statusBox.hidden = false;
            statusBox.innerHTML =
              "<strong>" +
              window.MyTalksData.escapeHtml(ticket.ticketId || ticket.id) +
              "</strong> — Status: <span class=\"badge badge--success\">" +
              window.MyTalksData.escapeHtml(ticket.status || "Open") +
              "</span><p class=\"hint mt-4\"><strong>Subject:</strong> " +
              window.MyTalksData.escapeHtml(ticket.subject || "") +
              "</p><p class=\"hint\"><strong>Category:</strong> " +
              window.MyTalksData.escapeHtml(ticket.category || "") +
              "</p><p class=\"hint\">" +
              window.MyTalksData.escapeHtml(ticket.description || "") +
              "</p>";
          }
          if (window.MyTalksUI) {
            window.MyTalksUI.showToast(
              "Ticket " + (ticket.ticketId || ticket.id) + " is " + (ticket.status || "Open") + "."
            );
          }
        } catch (err) {
          console.error(err);
          if (window.MyTalksUI) {
            window.MyTalksUI.showToast(
              (err && err.message) || "Could not track ticket.",
              "error"
            );
          }
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    }
  }

  function initDemoForms() {
    document.querySelectorAll("[data-demo-form]").forEach(function (form) {
      if (form.getAttribute("name") === "ticket" || form.getAttribute("name") === "track") {
        return;
      }

      var phoneField = form.querySelector("[name=phone]");
      if (form.getAttribute("name") === "advisor-apply" && phoneField) {
        phoneField.addEventListener("input", function () {
          phoneField.value = String(phoneField.value || "").replace(/\D/g, "").slice(0, 10);
          phoneField.setCustomValidity("");
          phoneField.classList.remove("is-invalid");
        });
      }

      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var hp = form.querySelector("[name=website]");
        if (hp && hp.value) return;
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }

        var name = form.getAttribute("name") || "form";
        var phoneInput = form.querySelector("[name=phone]");
        if (name === "advisor-apply" && phoneInput) {
          var digits = String(phoneInput.value || "").replace(/\D/g, "").slice(0, 10);
          phoneInput.value = digits;
          if (digits.length !== 10) {
            phoneInput.classList.add("is-invalid");
            phoneInput.setCustomValidity("Enter a 10-digit mobile number.");
            phoneInput.reportValidity();
            return;
          }
          phoneInput.setCustomValidity("");
          phoneInput.classList.remove("is-invalid");
        }
        var payload = formPayload(form);
        payload.userId = currentUserId();
        payload.source = name;

        var storedInFirebase = false;
        if (
          (name === "contact" || name === "advisor-apply") &&
          window.MyTalksDB &&
          window.MyTalksDB.createContact
        ) {
          try {
            await window.MyTalksDB.createContact(payload);
            storedInFirebase = true;
          } catch (err) {
            console.warn("Contact Firestore save failed, using local fallback:", err);
          }
        }

        saveLocalForm(name, payload);
        if (
          window.MyTalksAnalytics &&
          (name === "contact" || name === "advisor-apply" || name === "career")
        ) {
          window.MyTalksAnalytics.track("generate_lead", {
            form_name: name,
            page_path: location.pathname,
          });
        }
        var msg =
          form.getAttribute("data-success") ||
          (storedInFirebase
            ? "Thanks! Your message was saved."
            : "Thanks! Your submission was received.");
        if (window.MyTalksUI) window.MyTalksUI.showToast(msg);
        form.reset();
      });
    });
  }

  async function initPricing() {
    var grid = document.querySelector("[data-pricing-grid]");
    if (!grid || !window.MyTalksData) return;
    var data = await window.MyTalksData.getPricing();
    var base = window.MyTalksBase || ".";
    grid.innerHTML = data.plans
      .map(function (p) {
        var price =
          p.price === null ? "Custom" : p.price === 0 ? "Free" : "₹" + p.price;
        var features = (p.features || [])
          .map(function (f) {
            return (
              '<li><i class="fa-solid fa-check"></i> ' +
              window.MyTalksData.escapeHtml(f) +
              "</li>"
            );
          })
          .join("");
        return (
          '<article class="card pricing-card' +
          (p.featured ? " pricing-card--featured" : "") +
          '">' +
          (p.featured ? '<span class="pricing-card__badge">Popular</span>' : "") +
          "<h3>" +
          window.MyTalksData.escapeHtml(p.name) +
          "</h3>" +
          '<div class="price">' +
          price +
          " <small>/" +
          window.MyTalksData.escapeHtml(p.duration) +
          "</small></div>" +
          "<ul>" +
          features +
          "</ul>" +
          '<a class="btn ' +
          (p.featured ? "btn--primary" : "btn--secondary") +
          '" href="' +
          base +
          (p.id === "corporate"
            ? "/pages/contact"
            : "/pages/book-session?duration=" + encodeURIComponent(p.id)) +
          '">' +
          (p.id === "corporate" ? "Contact sales" : "Get started") +
          "</a></article>"
        );
      })
      .join("");

    var methods = document.querySelector("[data-payment-methods]");
    if (methods) {
      methods.innerHTML = (data.paymentMethods || [])
        .map(function (m) {
          return '<span><i class="fa-solid fa-wallet"></i> ' + m + "</span>";
        })
        .join("");
    }

    var source = document.querySelector("[data-pricing-source]");
    if (source) {
      source.textContent =
        data.source === "firestore"
          ? "Prices update live from MyTalk."
          : "Showing current session plans.";
    }
  }

  async function initServices() {
    var grid = document.querySelector("[data-services-grid]");
    if (!grid || !window.MyTalksData) return;
    var services = await window.MyTalksData.getServices();
    grid.classList.add("home-services");
    grid.innerHTML = services
      .map(function (s) {
        var icon = s.icon === "fa-rings-wedding" ? "fa-ring" : s.icon;
        return (
          '<article class="service-tile">' +
          '<div class="feature-item__icon"><i class="fa-solid ' +
          icon +
          '" aria-hidden="true"></i></div>' +
          "<h3>" +
          window.MyTalksData.escapeHtml(s.title) +
          "</h3>" +
          "<p>" +
          window.MyTalksData.escapeHtml(s.description) +
          "</p></article>"
        );
      })
      .join("");
  }

  async function initCareers() {
    var list = document.querySelector("[data-careers-list]");
    if (!list || !window.MyTalksData) return;
    var jobs = await window.MyTalksData.getCareers();
    list.innerHTML = jobs
      .map(function (j) {
        return (
          '<article class="card" style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:center">' +
          "<div><h3>" +
          window.MyTalksData.escapeHtml(j.title) +
          "</h3><p class=\"hint\">" +
          window.MyTalksData.escapeHtml(j.department) +
          " · " +
          window.MyTalksData.escapeHtml(j.location) +
          " · " +
          window.MyTalksData.escapeHtml(j.type) +
          "</p></div>" +
          '<a class="btn btn--secondary btn--sm" href="#apply">Apply</a></article>'
        );
      })
      .join("");
  }

  function bootSupportPrefill() {
    prefillSupportEmails();
    document.addEventListener("mytalks:auth-ready", prefillSupportEmails);
    document.addEventListener("mytalks:auth-changed", prefillSupportEmails);
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTicketForms();
    bootSupportPrefill();
    initDemoForms();
    initPricing();
    initServices();
    initCareers();
  });
})();

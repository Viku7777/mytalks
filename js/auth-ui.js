(function () {
  // #region agent log
  function __dbg73(payload) {
    try {
      var rows = [];
      try {
        rows = JSON.parse(localStorage.getItem("mytalks-dbg-73d7f6") || "[]");
      } catch (e) {
        rows = [];
      }
      if (!Array.isArray(rows)) rows = [];
      rows.push(payload);
      if (rows.length > 40) rows = rows.slice(-40);
      localStorage.setItem("mytalks-dbg-73d7f6", JSON.stringify(rows));
    } catch (e) {}
    try {
      fetch("/api/debug-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "73d7f6" },
        body: JSON.stringify(payload),
      }).catch(function () {});
    } catch (e) {}
    try {
      fetch("http://127.0.0.1:7936/ingest/1fcfce45-4f72-4d34-a1ed-ba61bcd3164f", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "73d7f6" },
        body: JSON.stringify(payload),
      }).catch(function () {});
    } catch (e) {}
  }
  // #endregion

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

  function setFormBusy(form, busy) {
    form.querySelectorAll("button, input, select").forEach(function (el) {
      if (el.name === "website") return;
      el.disabled = !!busy;
    });
    var submit = form.querySelector('[type="submit"]');
    if (submit) {
      if (busy) {
        submit.setAttribute("data-label", submit.textContent);
        submit.textContent = "Please wait…";
      } else if (submit.getAttribute("data-label")) {
        submit.textContent = submit.getAttribute("data-label");
      }
    }
  }

  function showFormError(form, message) {
    var box = form.querySelector("[data-auth-error]") ||
      (form.closest(".auth-panel") &&
        form.closest(".auth-panel").querySelector("[data-auth-error]"));
    if (box) {
      box.textContent = message || "";
      box.hidden = !message;
    }
    if (message && window.MyTalksUI) {
      window.MyTalksUI.showToast(message, "error");
    }
  }

  function clearFormError(form) {
    showFormError(form, "");
  }

  var GOOGLE_REDIRECT_KEY = "mytalks-google-redirect";

  function isGoogleRedirectPending() {
    try {
      return !!(
        sessionStorage.getItem(GOOGLE_REDIRECT_KEY) ||
        localStorage.getItem(GOOGLE_REDIRECT_KEY)
      );
    } catch (e) {
      return false;
    }
  }

  function ensureGoogleAuthLoading() {
    var el = document.querySelector("[data-google-auth-loading]");
    if (el) return el;
    el = document.createElement("div");
    el.className = "auth-google-loading";
    el.setAttribute("data-google-auth-loading", "1");
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-busy", "true");
    el.innerHTML =
      '<div class="auth-google-loading__spinner" aria-hidden="true"></div>' +
      '<p class="auth-google-loading__text">Signing you in…</p>';
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function showGoogleAuthLoading(text) {
    var el = ensureGoogleAuthLoading();
    var label = el.querySelector(".auth-google-loading__text");
    if (label) label.textContent = text || "Signing you in…";
    el.hidden = false;
    el.setAttribute("aria-busy", "true");
    try {
      document.documentElement.classList.add("auth-google-loading-active");
    } catch (e) {
      /* ignore */
    }
  }

  function hideGoogleAuthLoading() {
    var el = document.querySelector("[data-google-auth-loading]");
    if (el) {
      el.hidden = true;
      el.setAttribute("aria-busy", "false");
    }
    try {
      document.documentElement.classList.remove("auth-google-loading-active");
    } catch (e) {
      /* ignore */
    }
  }

  // Return from Google redirect: paint full-screen loader before auth finishes.
  if (isGoogleRedirectPending()) {
    if (document.body) {
      showGoogleAuthLoading("Signing you in…");
    } else {
      document.addEventListener(
        "DOMContentLoaded",
        function () {
          showGoogleAuthLoading("Signing you in…");
        },
        { once: true }
      );
    }
  }

  function preserveNextOnAuthLinks() {
    var params = new URLSearchParams(window.location.search);
    var next = params.get("next");
    if (!next && window.MyTalksAuth && window.MyTalksAuth.resolveAuthNext) {
      next = window.MyTalksAuth.resolveAuthNext();
    }
    if (!next) return;

    if (/book-session/.test(next)) {
      document.querySelectorAll("[data-auth-lead]").forEach(function (lead) {
        var onRegister = /register/.test(window.location.pathname);
        lead.textContent = onRegister
          ? "Create a free account to finish booking. It takes about a minute."
          : "Log in to finish booking. New here? Create a free account below.";
      });
    }

    if (window.MyTalksAuth && window.MyTalksAuth.storeAuthNext) {
      window.MyTalksAuth.storeAuthNext(next);
    }

    var encoded = encodeURIComponent(next);
    document.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute("href") || "";
      if (!/(^|\/)(login|register)(\.html)?(\?|#|$)/.test(href)) return;
      try {
        var url = new URL(href, window.location.href);
        if (!url.searchParams.get("next")) {
          url.searchParams.set("next", next);
          a.setAttribute(
            "href",
            url.pathname.split("/").pop() + url.search + url.hash
          );
        }
      } catch (e) {
        if (href.indexOf("next=") === -1) {
          a.setAttribute(
            "href",
            href + (href.indexOf("?") >= 0 ? "&" : "?") + "next=" + encoded
          );
        }
      }
    });
  }

  async function init() {
    var Auth = await waitForAuth();
    if (!Auth) return;

    // Keep ?next= across Google redirect / login↔register navigation.
    if (Auth.resolveAuthNext) Auth.resolveAuthNext();
    preserveNextOnAuthLinks();

    // Wait for Firebase redirect result (iPhone Google return) before deciding.
    if (isGoogleRedirectPending()) {
      showGoogleAuthLoading("Signing you in…");
    }
    if (Auth.redirectHandled) {
      try {
        await Auth.redirectHandled;
      } catch (redirectWaitErr) {
        /* continue */
      }
    }

    var user = Auth.getUser();
    var onAuthPage =
      document.querySelector("[data-login-form]") ||
      document.querySelector("[data-register-form]");
    if (user && onAuthPage) {
      showGoogleAuthLoading("Signing you in…");
      Auth.redirectAfterAuth();
      return;
    }
    hideGoogleAuthLoading();

    var login = document.querySelector("[data-login-form]");
    var register = document.querySelector("[data-register-form]");

    if (login) {
      var emailField = login.querySelector("[name=email]");
      if (emailField && !emailField.value && Auth.getSessionHint) {
        var hint = Auth.getSessionHint();
        if (hint && hint.email) emailField.value = hint.email;
      }

      login.addEventListener("submit", async function (e) {
        e.preventDefault();
        clearFormError(login);
        var hp = login.querySelector("[name=website]");
        if (hp && hp.value) return;

        var email = login.querySelector("[name=email]").value.trim();
        var password = login.querySelector("[name=password]").value;
        var remember = login.querySelector("[name=remember]");
        if (!email || password.length < 6) {
          showFormError(login, "Enter a valid email and password (6+ characters).");
          return;
        }

        setFormBusy(login, true);
        try {
          await Auth.signInWithEmail(email, password, !remember || remember.checked);
          if (window.MyTalksUI) window.MyTalksUI.showToast("Welcome back!");
          Auth.redirectAfterAuth();
        } catch (err) {
          showFormError(login, Auth.authErrorMessage(err));
          setFormBusy(login, false);
        }
      });

      var forgot = document.querySelector("[data-forgot-password]");
      if (forgot) {
        forgot.addEventListener("click", async function (e) {
          e.preventDefault();
          clearFormError(login);
          var email = ((login.querySelector("[name=email]") || {}).value || "").trim();
          if (!email) {
            showFormError(login, "Enter your email above, then click Forgot password.");
            return;
          }
          try {
            await Auth.sendPasswordReset(email);
            if (window.MyTalksUI) {
              window.MyTalksUI.showToast("Password reset email sent. Check your inbox.");
            }
          } catch (err) {
            showFormError(login, Auth.authErrorMessage(err));
          }
        });
      }
    }

    if (register) {
      register.addEventListener("submit", async function (e) {
        e.preventDefault();
        clearFormError(register);
        var hp = register.querySelector("[name=website]");
        if (hp && hp.value) return;

        var name = register.querySelector("[name=name]").value.trim();
        var email = register.querySelector("[name=email]").value.trim();
        var phoneInput = register.querySelector("[name=phone]");
        var phone = phoneInput ? phoneInput.value.trim() : "";
        var password = register.querySelector("[name=password]").value;
        var confirm = register.querySelector("[name=confirm]").value;
        var terms = register.querySelector("[name=terms]");

        if (!name || !email || password.length < 6) {
          showFormError(register, "Please fill name, email, and a password (6+ characters).");
          return;
        }
        if (password !== confirm) {
          showFormError(register, "Passwords do not match.");
          return;
        }
        if (terms && !terms.checked) {
          showFormError(register, "Please accept the Terms.");
          return;
        }

        setFormBusy(register, true);
        try {
          await Auth.signUpWithEmail(name, email, password, phone);
          if (window.MyTalksUI) window.MyTalksUI.showToast("Account created. Welcome!");
          Auth.redirectAfterAuth();
        } catch (err) {
          showFormError(register, Auth.authErrorMessage(err));
          setFormBusy(register, false);
        }
      });
    }

    document.querySelectorAll('[data-social-auth="Google"]').forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var panel = btn.closest(".auth-panel") || document.body;
        var errorHost = panel.querySelector("[data-auth-error]");
        if (errorHost) {
          errorHost.textContent = "";
          errorHost.hidden = true;
        }
        btn.disabled = true;
        var label = btn.innerHTML;
        showGoogleAuthLoading("Connecting to Google…");
        try {
          var outcome = await Auth.signInWithGoogle(true);
          // #region agent log
          __dbg73({
              sessionId: "73d7f6",
              runId: "pre-fix",
              hypothesisId: "E",
              location: "auth-ui.js:google:outcome",
              message: "Google button outcome",
              data: {
                redirected: !!(outcome && outcome.redirected),
                hasUser: !!(outcome && outcome.user),
              },
              timestamp: Date.now(),
            });
          // #endregion
          // iPhone / Safari: full-page redirect to Google. Keep overlay until leave.
          if (outcome && outcome.redirected) {
            showGoogleAuthLoading("Opening Google…");
            return;
          }
          showGoogleAuthLoading("Signing you in…");
          if (window.MyTalksUI) window.MyTalksUI.showToast("Signed in with Google.");
          Auth.redirectAfterAuth();
        } catch (err) {
          // #region agent log
          __dbg73({
              sessionId: "73d7f6",
              runId: "pre-fix",
              hypothesisId: "A",
              location: "auth-ui.js:google:catch",
              message: "Google button caught error",
              data: {
                code: (err && err.code) || "",
                errMsg: String((err && err.message) || "").slice(0, 160),
              },
              timestamp: Date.now(),
            });
          // #endregion
          hideGoogleAuthLoading();
          if (
            err.code !== "auth/popup-closed-by-user" &&
            err.code !== "auth/cancelled-popup-request"
          ) {
            var msg = Auth.authErrorMessage(err);
            if (errorHost) {
              errorHost.textContent = msg;
              errorHost.hidden = false;
            }
            if (window.MyTalksUI) window.MyTalksUI.showToast(msg, "error");
          }
          btn.disabled = false;
          btn.innerHTML = label;
        }
      });
    });

    document.querySelectorAll('[data-social-auth="Apple"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (window.MyTalksUI) {
          window.MyTalksUI.showToast("Apple sign-in is not available yet.", "error");
        }
      });
    });

    // #region agent log
    try {
      if (/[?&]dbg=1(?:&|$)/.test(String(location.search || ""))) {
        var box = document.createElement("div");
        box.setAttribute("data-dbg73", "1");
        box.style.cssText =
          "margin:1rem 0;padding:0.75rem;border:1px solid #ccc;border-radius:8px;background:#111;color:#0f0;font:12px/1.4 ui-monospace,monospace;white-space:pre-wrap;word-break:break-word;";
        function renderDbg() {
          var rows = [];
          try {
            rows = JSON.parse(localStorage.getItem("mytalks-dbg-73d7f6") || "[]");
          } catch (e) {
            rows = [];
          }
          box.textContent =
            "DEBUG 73d7f6 (" +
            rows.length +
            " events)\n" +
            rows
              .map(function (r) {
                return (
                  (r.timestamp || "") +
                  " | " +
                  (r.hypothesisId || "") +
                  " | " +
                  (r.location || "") +
                  " | " +
                  (r.message || "") +
                  " | " +
                  JSON.stringify(r.data || {})
                );
              })
              .join("\n");
        }
        renderDbg();
        var copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.textContent = "Copy debug log";
        copyBtn.className = "btn btn--ghost btn--block";
        copyBtn.style.marginTop = "0.5rem";
        copyBtn.addEventListener("click", function () {
          try {
            navigator.clipboard.writeText(box.textContent || "");
            if (window.MyTalksUI) window.MyTalksUI.showToast("Debug log copied");
          } catch (e) {
            /* ignore */
          }
        });
        var host =
          document.querySelector(".auth-panel") ||
          document.querySelector("main") ||
          document.body;
        host.appendChild(box);
        host.appendChild(copyBtn);
        setInterval(renderDbg, 1500);
      }
    } catch (dbgErr) {
      /* ignore */
    }
    // #endregion
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

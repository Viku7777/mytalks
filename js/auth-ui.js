(function () {
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

  function preserveNextOnAuthLinks() {
    var params = new URLSearchParams(window.location.search);
    var next = params.get("next");
    if (!next && window.MyTalksAuth && window.MyTalksAuth.resolveAuthNext) {
      next = window.MyTalksAuth.resolveAuthNext();
    }
    if (!next) return;

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
      Auth.redirectAfterAuth();
      return;
    }

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
        btn.innerHTML = '<i class="fa-brands fa-google"></i> Connecting…';
        try {
          var outcome = await Auth.signInWithGoogle(true);
          // iPhone / Safari: full-page redirect to Google. Do not navigate away here.
          if (outcome && outcome.redirected) {
            btn.innerHTML = '<i class="fa-brands fa-google"></i> Opening Google…';
            return;
          }
          if (window.MyTalksUI) window.MyTalksUI.showToast("Signed in with Google.");
          Auth.redirectAfterAuth();
        } catch (err) {
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

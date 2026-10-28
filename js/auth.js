(function () {
  var PROFILE_PREFIX = "mytalks-user-profile:";
  var AUTH_NEXT_KEY = "mytalks-auth-next";
  var SESSION_KEY = "mytalks-session";
  var GOOGLE_REDIRECT_KEY = "mytalks-google-redirect";
  var listeners = [];
  var currentUser = null;
  var ready = false;
  var authReadyDispatched = false;
  var readyResolve;
  var readyPromise = new Promise(function (resolve) {
    readyResolve = resolve;
  });
  var redirectHandledResolve;
  var redirectHandledPromise = new Promise(function (resolve) {
    redirectHandledResolve = resolve;
  });

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
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "73d7f6",
        },
        body: JSON.stringify(payload),
      }).catch(function () {});
    } catch (e) {}
    try {
      fetch("http://127.0.0.1:7936/ingest/1fcfce45-4f72-4d34-a1ed-ba61bcd3164f", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "73d7f6",
        },
        body: JSON.stringify(payload),
      }).catch(function () {});
    } catch (e) {}
  }
  // #endregion

  function getSessionHint() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch (e) {
      return null;
    }
  }

  function saveSessionHint(user) {
    if (!user) {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch (e) {
        /* ignore */
      }
      return;
    }
    var local = getLocalProfile(user.uid) || {};
    var hint = {
      uid: user.uid,
      email: user.email || local.email || "",
      name:
        user.displayName ||
        local.name ||
        (user.email && user.email.split("@")[0]) ||
        "Account",
      phone: local.phone || user.phoneNumber || "",
      at: new Date().toISOString(),
    };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(hint));
    } catch (e) {
      /* ignore */
    }
    return hint;
  }

  function setAuthStateAttr(state) {
    try {
      document.documentElement.setAttribute("data-auth-state", state);
    } catch (e) {
      /* ignore */
    }
  }

  function applyOptimisticHeader() {
    var hint = getSessionHint();
    var root = document.getElementById("header-root");
    if (!hint || !hint.uid) {
      setAuthStateAttr("guest");
      if (root) {
        root.querySelectorAll("[data-auth-guest]").forEach(function (el) {
          setVisibility(el, true);
        });
        root.querySelectorAll("[data-auth-user]").forEach(function (el) {
          setVisibility(el, false);
        });
      }
      return;
    }
    setAuthStateAttr("user");
    if (!root) return;
    root.querySelectorAll("[data-auth-guest]").forEach(function (el) {
      setVisibility(el, false);
    });
    root.querySelectorAll("[data-auth-user]").forEach(function (el) {
      setVisibility(el, true);
    });
    root.querySelectorAll("[data-auth-name]").forEach(function (el) {
      el.textContent = hint.name || "Account";
      if (hint.email) el.setAttribute("title", hint.email);
    });
  }

  function storeAuthNext(next) {
    if (!next) return;
    try {
      sessionStorage.setItem(AUTH_NEXT_KEY, next);
    } catch (e) {
      /* ignore */
    }
    // localStorage survives Google redirect better on some iPhone Safari builds
    try {
      localStorage.setItem(AUTH_NEXT_KEY, next);
    } catch (e) {
      /* ignore */
    }
  }

  function readStoredAuthNext() {
    try {
      return (
        sessionStorage.getItem(AUTH_NEXT_KEY) ||
        localStorage.getItem(AUTH_NEXT_KEY) ||
        ""
      );
    } catch (e) {
      return "";
    }
  }

  function clearAuthNext() {
    try {
      sessionStorage.removeItem(AUTH_NEXT_KEY);
    } catch (e) {
      /* ignore */
    }
    try {
      localStorage.removeItem(AUTH_NEXT_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function markGoogleRedirectPending(pending) {
    try {
      if (pending) {
        sessionStorage.setItem(GOOGLE_REDIRECT_KEY, "1");
        localStorage.setItem(GOOGLE_REDIRECT_KEY, "1");
      } else {
        sessionStorage.removeItem(GOOGLE_REDIRECT_KEY);
        localStorage.removeItem(GOOGLE_REDIRECT_KEY);
      }
    } catch (e) {
      /* ignore */
    }
  }

  function wasGoogleRedirectPending() {
    try {
      return !!(
        sessionStorage.getItem(GOOGLE_REDIRECT_KEY) ||
        localStorage.getItem(GOOGLE_REDIRECT_KEY)
      );
    } catch (e) {
      return false;
    }
  }

  function isSafeNext(next) {
    return (
      !!next &&
      next.indexOf("//") === -1 &&
      (next.charAt(0) === "/" ||
        next.indexOf("pages/") === 0 ||
        next.indexOf("./") === 0)
    );
  }

  function resolveAuthNext() {
    var params = new URLSearchParams(window.location.search);
    var next = params.get("next") || "";
    if (next) storeAuthNext(next);
    if (!next) next = readStoredAuthNext();
    return isSafeNext(next) ? next : "";
  }

  function markAuthReady(user) {
    if (readyResolve) {
      readyResolve(user);
      readyResolve = null;
    }
    if (!authReadyDispatched) {
      authReadyDispatched = true;
      document.dispatchEvent(new CustomEvent("mytalks:auth-ready"));
    }
  }

  function profileKey(uid) {
    return PROFILE_PREFIX + uid;
  }

  function getLocalProfile(uid) {
    if (!uid) return null;
    try {
      return JSON.parse(localStorage.getItem(profileKey(uid)) || "null");
    } catch (e) {
      return null;
    }
  }

  function saveLocalProfile(uid, data) {
    if (!uid) return null;
    var prev = getLocalProfile(uid) || {};
    var next = Object.assign({}, prev, data || {});
    localStorage.setItem(profileKey(uid), JSON.stringify(next));
    if (next.phone) {
      try {
        localStorage.setItem(
          "mytalks-user-phone",
          JSON.stringify({ uid: uid, phone: next.phone })
        );
      } catch (e) {
        /* ignore */
      }
    }
    return next;
  }

  function displayNameFor(user) {
    if (!user) return "";
    var local = getLocalProfile(user.uid);
    return (
      user.displayName ||
      (local && local.name) ||
      (user.email && user.email.split("@")[0]) ||
      "Member"
    );
  }

  function authErrorMessage(err) {
    var code = (err && err.code) || "";
    var map = {
      "auth/email-already-in-use": "An account already exists with this email.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/weak-password": "Password should be at least 6 characters.",
      "auth/user-not-found": "No account found with this email.",
      "auth/wrong-password": "Incorrect password. Please try again.",
      "auth/invalid-credential": "Invalid email or password.",
      "auth/user-disabled": "This account has been disabled.",
      "auth/account-blocked":
        "Your account has been blocked. Please contact support.",
      "auth/operation-not-allowed":
        "This sign-in method is not enabled. Enable it in Firebase Console.",
      "auth/popup-closed-by-user": "Sign-in popup was closed before completing.",
      "auth/cancelled-popup-request": "Sign-in was cancelled.",
      "auth/popup-blocked": "Popup blocked. Allow popups and try again.",
      "auth/unauthorized-domain":
        "Google sign-in is not allowed on " +
        (typeof location !== "undefined" ? location.host : "this site") +
        ". In Firebase Console, enable the Google provider and add this domain under Authentication → Settings → Authorized domains.",
      "auth/operation-not-supported-in-this-environment":
        "Google sign-in cannot run on this page. Open the site with http:// or https://, not as a local file.",
      "auth/network-request-failed": "Network error. Check your connection and try Google again.",
      "auth/too-many-requests": "Too many attempts. Please try again later.",
      "auth/requires-recent-login": "Please sign in again to continue.",
      "auth/account-exists-with-different-credential":
        "An account already exists with this email using a different sign-in method.",
      "auth/redirect-cancelled-by-user": "Google sign-in was cancelled. Please try again.",
      "auth/redirect-operation-pending": "Google sign-in is already in progress.",
    };
    return map[code] || (err && err.message) || "Authentication failed.";
  }

  function ensureFirebase() {
    if (!window.MyTalksFirebase || !window.MyTalksFirebase.auth) {
      throw new Error("Firebase Auth is not initialized.");
    }
    return window.MyTalksFirebase.auth;
  }

  function trackEvent(name, params) {
    try {
      if (window.MyTalksFirebase && typeof window.MyTalksFirebase.logEvent === "function") {
        window.MyTalksFirebase.logEvent(name, params || {});
      }
    } catch (e) {
      /* Analytics must never break auth */
    }
  }

  function setVisibility(el, visible) {
    if (!el) return;
    el.hidden = !visible;
    el.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function updateHeader(user) {
    var root = document.getElementById("header-root");
    setAuthStateAttr(user ? "user" : "guest");
    if (!root) return;

    root.querySelectorAll("[data-auth-guest]").forEach(function (el) {
      setVisibility(el, !user);
    });
    root.querySelectorAll("[data-auth-user]").forEach(function (el) {
      setVisibility(el, !!user);
    });

    var label = displayNameFor(user);
    var hint = !user ? null : getSessionHint();
    root.querySelectorAll("[data-auth-name]").forEach(function (el) {
      el.textContent = label || (hint && hint.name) || "Account";
      if (user && user.email) el.setAttribute("title", user.email);
      else if (hint && hint.email) el.setAttribute("title", hint.email);
      else el.removeAttribute("title");
    });
  }

  function bindLogout(root) {
    if (!root) return;
    root.querySelectorAll("[data-logout]").forEach(function (btn) {
      if (btn.getAttribute("data-logout-bound")) return;
      btn.setAttribute("data-logout-bound", "1");
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        signOut()
          .then(function () {
            if (window.MyTalksUI) window.MyTalksUI.showToast("Signed out.");
            var dash = document.querySelector("[data-auth-required]");
            if (dash) {
              window.location.href = (window.MyTalksBase || ".") + "/pages/login";
            }
          })
          .catch(function (err) {
            if (window.MyTalksUI) {
              window.MyTalksUI.showToast(authErrorMessage(err), "error");
            }
          });
      });
    });
  }

  function notify(user) {
    currentUser = user;
    ready = true;
    if (user) {
      var profilePatch = { email: user.email || "" };
      if (user.displayName) profilePatch.name = user.displayName;
      saveLocalProfile(user.uid, profilePatch);
      saveSessionHint(user);
    } else {
      saveSessionHint(null);
      applyAdminFlag(null);
    }
    updateHeader(user);
    bindLogout(document);
    if (window.MyTalksFirebase && typeof window.MyTalksFirebase.setUserId === "function") {
      window.MyTalksFirebase.setUserId(user ? user.uid : null);
    }
    listeners.slice().forEach(function (fn) {
      try {
        fn(user);
      } catch (e) {
        console.warn(e);
      }
    });
    document.dispatchEvent(
      new CustomEvent("mytalks:auth-changed", { detail: { user: user } })
    );
    markAuthReady(user);
  }

  function onAuthStateChanged(cb) {
    if (typeof cb !== "function") return function () {};
    listeners.push(cb);
    if (ready) cb(currentUser);
    return function () {
      listeners = listeners.filter(function (fn) {
        return fn !== cb;
      });
    };
  }

  function getUser() {
    return currentUser;
  }

  function isReady() {
    return ready;
  }

  function setPersistence(remember) {
    var auth = ensureFirebase();
    var mode = remember
      ? firebase.auth.Auth.Persistence.LOCAL
      : firebase.auth.Auth.Persistence.SESSION;
    return auth.setPersistence(mode);
  }

  function waitForDbApi() {
    if (window.MyTalksDB && window.MyTalksDB.upsertUserProfile) {
      return Promise.resolve(window.MyTalksDB);
    }
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        resolve(window.MyTalksDB || null);
      }
      document.addEventListener("mytalks:firestore-ready", finish, { once: true });
      setTimeout(finish, 6000);
    });
  }

  function syncUserToFirestore(user, extras, options) {
    return waitForDbApi().then(function (DB) {
      if (!DB || !DB.upsertUserProfile) {
        console.warn("MyTalksAuth: Firestore user sync unavailable");
        return null;
      }
      return DB.upsertUserProfile(user, extras || {}, options || {});
    });
  }

  function rejectIfBlockedAndSignOut(err) {
    if (err && err.code === "auth/account-blocked") {
      return ensureFirebase()
        .signOut()
        .catch(function () {
          /* ignore */
        })
        .then(function () {
          throw err;
        });
    }
    return Promise.reject(err);
  }

  function signInWithEmail(email, password, remember) {
    var auth = ensureFirebase();
    return setPersistence(remember !== false)
      .then(function () {
        return auth.signInWithEmailAndPassword(email, password);
      })
      .then(function (cred) {
        trackEvent("login", { method: "email" });
        return syncUserToFirestore(cred.user, {
          email: email,
          name: cred.user.displayName || "",
        })
          .then(function () {
            return cred;
          })
          .catch(function (err) {
            if (err && err.code === "auth/account-blocked") {
              return rejectIfBlockedAndSignOut(err);
            }
            console.warn("User profile sync on login failed:", err);
            return cred;
          });
      });
  }

  function signUpWithEmail(name, email, password, phone) {
    var auth = ensureFirebase();
    return setPersistence(true)
      .then(function () {
        return auth.createUserWithEmailAndPassword(email, password);
      })
      .then(function (cred) {
        var user = cred.user;
        var tasks = [];
        if (name) {
          tasks.push(user.updateProfile({ displayName: name }));
        }
        saveLocalProfile(user.uid, {
          name: name || "",
          email: email,
          phone: phone || "",
        });
        trackEvent("sign_up", { method: "email" });
        return Promise.all(tasks)
          .then(function () {
            return syncUserToFirestore(user, {
              name: name || "",
              email: email,
              phone: phone || "",
            });
          })
          .then(function () {
            return cred;
          })
          .catch(function (err) {
            console.error("Failed to store user profile in Firestore:", err);
            throw err;
          });
      });
  }

  function trackGoogleAuth(cred) {
    if (!cred || !cred.user) return;
    var isNew =
      cred.additionalUserInfo && cred.additionalUserInfo.isNewUser;
    if (isNew) {
      trackEvent("sign_up", { method: "google" });
    } else {
      trackEvent("login", { method: "google" });
    }
  }

  function finishGoogleCredential(cred) {
    var user = cred && cred.user;
    if (!user) return Promise.resolve(cred);
    trackGoogleAuth(cred);
    saveLocalProfile(user.uid, {
      name: user.displayName || "",
      email: user.email || "",
    });
    return syncUserToFirestore(user, {
      name: user.displayName || "",
      email: user.email || "",
    })
      .then(function (profile) {
        applyAdminFlag(profile);
        return cred;
      })
      .catch(function (err) {
        if (err && err.code === "auth/account-blocked") {
          return rejectIfBlockedAndSignOut(err);
        }
        console.warn("User profile sync on Google login failed:", err);
        return cred;
      });
  }

  function applyAdminFlag(profile) {
    var isAdmin = !!(profile && profile.role === "admin");
    try {
      document.documentElement.setAttribute("data-admin", isAdmin ? "true" : "false");
    } catch (e) {
      /* ignore */
    }
    document.querySelectorAll("[data-auth-admin]").forEach(function (el) {
      el.hidden = !isAdmin;
      el.setAttribute("aria-hidden", isAdmin ? "false" : "true");
    });
  }

  function signInWithGoogle(remember) {
    var auth = ensureFirebase();
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope("email");
    provider.addScope("profile");
    provider.setCustomParameters({ prompt: "select_account" });
    resolveAuthNext();

    // #region agent log
    var _ua = String((typeof navigator !== "undefined" && navigator.userAgent) || "");
    var _isiOS = /iPhone|iPad|iPod/i.test(_ua) || (/Macintosh/i.test(_ua) && typeof document !== "undefined" && "ontouchend" in document);
    var _isSafari = /Safari/i.test(_ua) && !/CriOS|FxiOS|EdgiOS|Chrome|Android/i.test(_ua);
    __dbg73({
        sessionId: "73d7f6",
        runId: "post-fix-2",
        hypothesisId: "F",
        location: "auth.js:signInWithGoogle:entry",
        message: "Google sign-in started",
        data: {
          isiOS: _isiOS,
          isSafari: _isSafari,
          host: typeof location !== "undefined" ? location.host : "",
          authDomain: (window.MyTalksFirebase && window.MyTalksFirebase.config && window.MyTalksFirebase.config.authDomain) || "",
          ua: _ua.slice(0, 180),
        },
        timestamp: Date.now(),
      });
    // #endregion

    function redirectSignIn() {
      // #region agent log
      __dbg73({
          sessionId: "73d7f6",
          runId: "post-fix",
          hypothesisId: "A",
          location: "auth.js:redirectSignIn",
          message: "Using signInWithRedirect",
          data: { isiOS: _isiOS },
          timestamp: Date.now(),
        });
      // #endregion
      markGoogleRedirectPending(true);
      return auth.signInWithRedirect(provider).then(
        function () {
          // Page will navigate to Google. Do not continue to redirectAfterAuth.
          return { redirected: true, user: null };
        },
        function (redirectErr) {
          // #region agent log
          __dbg73({
              sessionId: "73d7f6",
              runId: "post-fix-2",
              hypothesisId: "G",
              location: "auth.js:signInWithRedirect:error",
              message: "signInWithRedirect failed",
              data: {
                code: (redirectErr && redirectErr.code) || "",
                errMsg: String((redirectErr && redirectErr.message) || "").slice(0, 180),
                authDomain:
                  (window.MyTalksFirebase &&
                    window.MyTalksFirebase.config &&
                    window.MyTalksFirebase.config.authDomain) ||
                  "",
              },
              timestamp: Date.now(),
            });
          // #endregion
          markGoogleRedirectPending(false);
          throw redirectErr;
        }
      );
    }

    return setPersistence(remember !== false).then(function () {
      // iPhone/iPad Safari closes the Google popup as auth/popup-closed-by-user
      // before OAuth finishes — skip popup and use full-page redirect there.
      if (_isiOS) {
        // #region agent log
        __dbg73({
            sessionId: "73d7f6",
            runId: "post-fix",
            hypothesisId: "A",
            location: "auth.js:signInWithGoogle:iosRedirect",
            message: "iOS: using signInWithRedirect (skip popup)",
            data: { isiOS: true, isSafari: _isSafari },
            timestamp: Date.now(),
          });
        // #endregion
        return redirectSignIn();
      }

      // Desktop: prefer popup; fall back to redirect if blocked.
      return auth.signInWithPopup(provider).then(
        function (cred) {
          // #region agent log
          __dbg73({
              sessionId: "73d7f6",
              runId: "post-fix",
              hypothesisId: "A",
              location: "auth.js:signInWithPopup:success",
              message: "Popup Google sign-in succeeded",
              data: {
                isiOS: _isiOS,
                hasUser: !!(cred && cred.user),
                uidLen: cred && cred.user && cred.user.uid ? String(cred.user.uid).length : 0,
              },
              timestamp: Date.now(),
            });
          // #endregion
          return finishGoogleCredential(cred).then(function () {
            return { redirected: false, user: cred && cred.user ? cred.user : null };
          });
        },
        function (err) {
          var code = (err && err.code) || "";
          var willRedirect =
            code === "auth/popup-blocked" ||
            code === "auth/cancelled-popup-request" ||
            code === "auth/web-storage-unsupported" ||
            code === "auth/operation-not-supported-in-this-environment" ||
            // Safari sometimes reports a closed popup instead of blocked.
            code === "auth/popup-closed-by-user";
          // #region agent log
          __dbg73({
              sessionId: "73d7f6",
              runId: "post-fix",
              hypothesisId: "A",
              location: "auth.js:signInWithPopup:error",
              message: "Popup Google sign-in failed",
              data: {
                isiOS: _isiOS,
                code: code,
                willRedirect: willRedirect,
                errMsg: String((err && err.message) || "").slice(0, 160),
              },
              timestamp: Date.now(),
            });
          // #endregion
          if (willRedirect) {
            return redirectSignIn();
          }
          throw err;
        }
      );
    });
  }

  function sendPasswordReset(email) {
    return ensureFirebase().sendPasswordResetEmail(email);
  }

  function signOut() {
    saveSessionHint(null);
    setAuthStateAttr("guest");
    return ensureFirebase().signOut();
  }

  function requireAuth(options) {
    options = options || {};
    var base = window.MyTalksBase || ".";
    var loginUrl = options.loginUrl || base + "/pages/login";
    return readyPromise.then(function (user) {
      if (user) return user;
      var nextPath = window.location.pathname + window.location.search;
      storeAuthNext(nextPath);
      window.location.href =
        loginUrl + "?next=" + encodeURIComponent(nextPath);
      return null;
    });
  }

  function redirectAfterAuth() {
    var next = resolveAuthNext();
    var base = window.MyTalksBase || ".";
    clearAuthNext();
    if (isSafeNext(next)) {
      window.location.href = next;
      return;
    }
    window.location.href = base + "/pages/dashboard";
  }

  function bindBookingAuthGate() {
    document.addEventListener(
      "click",
      function (e) {
        var link =
          e.target && e.target.closest
            ? e.target.closest("a[href*='book-session']")
            : null;
        if (!link) return;
        // Allow modified clicks (new tab, etc.)
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        ) {
          return;
        }
        // Signed-in users book normally.
        if (currentUser) return;
        // Auth still resolving — let book-session.html enforce requireAuth.
        if (!ready) return;

        e.preventDefault();
        var href = link.getAttribute("href") || "";
        var absolute;
        try {
          absolute = new URL(href, window.location.href);
        } catch (err) {
          absolute = null;
        }
        var nextPath = absolute
          ? absolute.pathname + absolute.search
          : href;
        storeAuthNext(nextPath);
        var base = window.MyTalksBase || ".";
        window.location.href =
          base + "/pages/login?next=" + encodeURIComponent(nextPath);
      },
      true
    );
  }

  function finishRedirectHandled() {
    if (redirectHandledResolve) {
      redirectHandledResolve();
      redirectHandledResolve = null;
    }
  }

  function init() {
    if (!window.MyTalksFirebase || !window.MyTalksFirebase.auth) {
      console.warn("MyTalksAuth: Firebase not ready");
      notify(null);
      finishRedirectHandled();
      return;
    }

    var auth = ensureFirebase();

    var expectedRedirect = wasGoogleRedirectPending();
    // #region agent log
    var _uaInit = String((typeof navigator !== "undefined" && navigator.userAgent) || "");
    __dbg73({
        sessionId: "73d7f6",
        runId: "pre-fix",
        hypothesisId: "B",
        location: "auth.js:init:redirectCheck",
        message: "Auth init redirect pending check",
        data: {
          expectedRedirect: !!expectedRedirect,
          hasCurrentUser: !!auth.currentUser,
          path: typeof location !== "undefined" ? String(location.pathname || "") : "",
          host: typeof location !== "undefined" ? String(location.host || "") : "",
          isiOS: /iPhone|iPad|iPod/i.test(_uaInit),
          sessionFlag: (function () {
            try {
              return sessionStorage.getItem(GOOGLE_REDIRECT_KEY) || "";
            } catch (e) {
              return "err";
            }
          })(),
          localFlag: (function () {
            try {
              return localStorage.getItem(GOOGLE_REDIRECT_KEY) || "";
            } catch (e) {
              return "err";
            }
          })(),
        },
        timestamp: Date.now(),
      });
    // #endregion

    function completeGoogleRedirect(cred) {
      // #region agent log
      __dbg73({
          sessionId: "73d7f6",
          runId: "pre-fix",
          hypothesisId: "C",
          location: "auth.js:completeGoogleRedirect",
          message: "Completing Google redirect credential",
          data: { hasUser: !!(cred && cred.user) },
          timestamp: Date.now(),
        });
      // #endregion
      markGoogleRedirectPending(false);
      return finishGoogleCredential(cred).then(function () {
        var onAuthPage =
          document.querySelector("[data-login-form]") ||
          document.querySelector("[data-register-form]");
        if (onAuthPage) redirectAfterAuth();
        return cred;
      });
    }

    function waitForRedirectUser(timeoutMs) {
      if (auth.currentUser) return Promise.resolve(auth.currentUser);
      return new Promise(function (resolve) {
        var settled = false;
        var unsub = auth.onAuthStateChanged(function (user) {
          if (settled || !user) return;
          settled = true;
          try {
            unsub();
          } catch (e) {
            /* ignore */
          }
          resolve(user);
        });
        setTimeout(function () {
          if (settled) return;
          settled = true;
          try {
            unsub();
          } catch (e) {
            /* ignore */
          }
          resolve(auth.currentUser || null);
        }, timeoutMs);
      });
    }

    auth
      .getRedirectResult()
      .then(function (result) {
        // #region agent log
        __dbg73({
            sessionId: "73d7f6",
            runId: "post-fix-2",
            hypothesisId: "F",
            location: "auth.js:getRedirectResult:then",
            message: "getRedirectResult resolved",
            data: {
              expectedRedirect: !!expectedRedirect,
              hasResultUser: !!(result && result.user),
              hasCurrentUser: !!auth.currentUser,
              operationType: (result && result.operationType) || "",
              authDomain:
                (window.MyTalksFirebase &&
                  window.MyTalksFirebase.config &&
                  window.MyTalksFirebase.config.authDomain) ||
                "",
              href: typeof location !== "undefined" ? String(location.href || "").slice(0, 180) : "",
              search: typeof location !== "undefined" ? String(location.search || "").slice(0, 120) : "",
            },
            timestamp: Date.now(),
          });
        // #endregion
        if (result && result.user) {
          return completeGoogleRedirect(result);
        }
        // Safari often returns an empty redirect result even when sign-in
        // succeeded (or is about to). Wait briefly for auth state.
        if (!expectedRedirect) return result;
        return waitForRedirectUser(3500).then(function (user) {
          // #region agent log
          __dbg73({
              sessionId: "73d7f6",
              runId: "post-fix-2",
              hypothesisId: "F",
              location: "auth.js:waitForRedirectUser:done",
              message: "waitForRedirectUser finished",
              data: {
                hasUser: !!user,
                expectedRedirect: true,
                authDomain:
                  (window.MyTalksFirebase &&
                    window.MyTalksFirebase.config &&
                    window.MyTalksFirebase.config.authDomain) ||
                  "",
              },
              timestamp: Date.now(),
            });
          // #endregion
          if (user) {
            markGoogleRedirectPending(false);
            var onAuthPage =
              document.querySelector("[data-login-form]") ||
              document.querySelector("[data-register-form]");
            if (onAuthPage) redirectAfterAuth();
            return result;
          }
          markGoogleRedirectPending(false);
          if (window.MyTalksUI) {
            window.MyTalksUI.showToast(
              "Google sign-in did not finish. Please try Continue with Google again.",
              "error"
            );
          }
          return result;
        });
      })
      .catch(function (err) {
        // #region agent log
        __dbg73({
            sessionId: "73d7f6",
            runId: "pre-fix",
            hypothesisId: "D",
            location: "auth.js:getRedirectResult:catch",
            message: "getRedirectResult failed",
            data: {
              code: (err && err.code) || "",
              errMsg: String((err && err.message) || "").slice(0, 180),
              expectedRedirect: !!expectedRedirect,
            },
            timestamp: Date.now(),
          });
        // #endregion
        markGoogleRedirectPending(false);
        if (err && err.code === "auth/account-blocked") {
          auth.signOut();
        }
        if (err && window.MyTalksUI) {
          window.MyTalksUI.showToast(authErrorMessage(err), "error");
        }
      })
      .finally(function () {
        finishRedirectHandled();
      });

    // Safety: never leave login UI waiting forever if redirect APIs hang
    setTimeout(finishRedirectHandled, 12000);

    auth.onAuthStateChanged(function (user) {
      if (!user) {
        notify(null);
        return;
      }

      // Show signed-in header immediately — don't wait on Firestore
      notify(user);

      syncUserToFirestore(
        user,
        {
          name: user.displayName || "",
          email: user.email || "",
        },
        { touchOnly: false }
      )
        .then(function (profile) {
          applyAdminFlag(profile);
        })
        .catch(function (err) {
        if (err && err.code === "auth/account-blocked") {
          auth
            .signOut()
            .then(function () {
              notify(null);
              if (window.MyTalksUI) {
                window.MyTalksUI.showToast(authErrorMessage(err), "error");
              }
              var onAuthPage =
                document.querySelector("[data-login-form]") ||
                document.querySelector("[data-register-form]");
              if (!onAuthPage) {
                window.location.href =
                  (window.MyTalksBase || ".") + "/pages/login";
              }
            })
            .catch(function () {
              notify(null);
            });
          return;
        }
        console.warn("User profile sync skipped:", err);
      });
    });
  }

  document.addEventListener("mytalks:layout-ready", function () {
    applyOptimisticHeader();
    if (ready) updateHeader(currentUser);
    bindLogout(document);
  });

  bindBookingAuthGate();

  window.MyTalksAuth = {
    init: init,
    ready: readyPromise,
    redirectHandled: redirectHandledPromise,
    onAuthStateChanged: onAuthStateChanged,
    getUser: getUser,
    isReady: isReady,
    signInWithEmail: signInWithEmail,
    signUpWithEmail: signUpWithEmail,
    signInWithGoogle: signInWithGoogle,
    sendPasswordReset: sendPasswordReset,
    signOut: signOut,
    requireAuth: requireAuth,
    redirectAfterAuth: redirectAfterAuth,
    storeAuthNext: storeAuthNext,
    resolveAuthNext: resolveAuthNext,
    displayNameFor: displayNameFor,
    displayName: displayNameFor,
    getLocalProfile: getLocalProfile,
    saveLocalProfile: saveLocalProfile,
    getSessionHint: getSessionHint,
    authErrorMessage: authErrorMessage,
    mapError: authErrorMessage,
    updateHeader: updateHeader,
    // Aliases used by newer UI code
    signInEmail: function (email, password, remember) {
      return signInWithEmail(email, password, remember);
    },
    signUpEmail: function (email, password, profile) {
      profile = profile || {};
      return signUpWithEmail(profile.name, email, password, profile.phone);
    },
    signInGoogle: signInWithGoogle,
  };

  init();
})();

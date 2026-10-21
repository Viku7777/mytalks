/**
 * Client helper: Razorpay Standard Checkout for MyTalk bookings.
 * KEY_ID comes from the create-order response — never from frontend env secrets.
 */
(function () {
  var CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
  var checkoutLoading = null;

  function apiUrl(path) {
    try {
      return new URL(path, window.location.origin).toString();
    } catch (err) {
      return path;
    }
  }

  function loadCheckoutScript() {
    if (window.Razorpay) return Promise.resolve();
    if (checkoutLoading) return checkoutLoading;
    checkoutLoading = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + CHECKOUT_SRC + '"]');
      if (existing && window.Razorpay) {
        resolve();
        return;
      }
      var script = document.createElement("script");
      script.src = CHECKOUT_SRC;
      script.async = true;
      script.onload = function () {
        if (window.Razorpay) resolve();
        else reject(new Error("Razorpay checkout failed to load."));
      };
      script.onerror = function () {
        checkoutLoading = null;
        reject(new Error("Could not load Razorpay checkout."));
      };
      document.head.appendChild(script);
    });
    return checkoutLoading;
  }

  async function createOrder(options) {
    options = options || {};
    var amountPaise = Number(options.amountPaise);
    if (!Number.isFinite(amountPaise) || amountPaise < 100) {
      throw new Error("Amount must be at least ₹1.");
    }

    var res = await fetch(apiUrl("/api/create-order"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Math.round(amountPaise),
        currency: options.currency || "INR",
        receipt: options.receipt || undefined,
        notes: options.notes || undefined,
      }),
    });

    var json = null;
    try {
      json = await res.json();
    } catch (parseErr) {
      json = null;
    }

    if (!res.ok || !json || !json.ok || !json.order_id) {
      var msg = (json && json.error) || "Could not start payment.";
      var err = new Error(msg);
      err.status = res.status;
      throw err;
    }

    return {
      orderId: json.order_id,
      amount: json.amount,
      currency: json.currency || "INR",
      keyId: json.key_id,
    };
  }

  async function verifyPayment(payload) {
    var res = await fetch(apiUrl("/api/verify-payment"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpay_order_id: payload.razorpay_order_id,
        razorpay_payment_id: payload.razorpay_payment_id,
        razorpay_signature: payload.razorpay_signature,
      }),
    });

    var json = null;
    try {
      json = await res.json();
    } catch (parseErr) {
      json = null;
    }

    if (!res.ok || !json || !json.ok || !json.verified) {
      var msg = (json && json.error) || "Payment verification failed.";
      var err = new Error(msg);
      err.status = res.status;
      throw err;
    }

    return json;
  }

  /**
   * Create order → open Razorpay modal → verify signature.
   * Resolves with verified payment ids, or rejects on cancel/failure.
   */
  function checkout(options) {
    options = options || {};
    return createOrder({
      amountPaise: options.amountPaise,
      currency: options.currency,
      receipt: options.receipt,
      notes: options.notes,
    }).then(function (order) {
      return loadCheckoutScript().then(function () {
        return new Promise(function (resolve, reject) {
          var settled = false;
          var paymentStarted = false;
          function fail(message, reason) {
            if (settled) return;
            settled = true;
            var err = new Error(message || "Payment failed.");
            err.reason = reason || "failed";
            reject(err);
          }

          var rzp = new window.Razorpay({
            key: order.keyId,
            amount: order.amount,
            currency: order.currency,
            name: options.name || "MyTalk",
            description: options.description || "Session booking",
            order_id: order.orderId,
            prefill: {
              name: options.prefillName || "",
              email: options.prefillEmail || "",
              contact: options.prefillContact || "",
            },
            notes: options.notes || {},
            theme: { color: options.themeColor || "#1f6b5a" },
            modal: {
              ondismiss: function () {
                if (paymentStarted || settled) return;
                fail("Payment cancelled.", "dismissed");
              },
            },
            handler: function (response) {
              paymentStarted = true;
              verifyPayment(response)
                .then(function (verified) {
                  if (settled) return;
                  settled = true;
                  resolve({
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                    verified: verified,
                  });
                })
                .catch(function (err) {
                  fail((err && err.message) || "Payment verification failed.", "verify_failed");
                });
            },
          });

          rzp.on("payment.failed", function (response) {
            var desc =
              (response &&
                response.error &&
                (response.error.description || response.error.reason)) ||
              "Payment failed.";
            fail(desc, "payment_failed");
          });

          rzp.open();
        });
      });
    });
  }

  window.MyTalksPay = {
    createOrder: createOrder,
    verifyPayment: verifyPayment,
    checkout: checkout,
  };
})();

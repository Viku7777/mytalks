/**
 * Step 1 check: prove Titan SMTP works.
 *
 * 1. Fill mail/.env from .env.example
 * 2. cd mail && npm install
 * 3. npm run test:smtp
 */
const { verifySmtp, sendMail, smtpConfig } = require("./smtp");

async function main() {
  console.log("Checking Titan SMTP…");
  var cfg = await verifySmtp();
  console.log("SMTP login OK.");
  console.log("  Host:", cfg.host + ":" + cfg.port);
  console.log("  From:", cfg.from);

  var to = process.env.SMTP_TEST_TO;
  if (!to || !String(to).trim()) {
    console.log("Set SMTP_TEST_TO in mail/.env to also send a real test message.");
    return;
  }

  var info = await sendMail({
    to: to,
    subject: "MyTalk Titan SMTP test",
    text:
      "This is a test from MyTalk.\n\nIf you received this, Titan SMTP is working.\n\n— MyTalk",
    html:
      '<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111">' +
      "<h2 style=\"margin:0 0 12px;color:#5b6cff\">MyTalk</h2>" +
      "<p>This is a test from MyTalk.</p>" +
      "<p>If you received this, <strong>Titan SMTP is working</strong>.</p>" +
      "</div>",
  });

  console.log("Test email sent to", to);
  console.log("  Message id:", info.messageId || "(none)");
}

main().catch(function (err) {
  console.error("Titan SMTP failed:");
  console.error((err && err.message) || err);
  console.error("");
  console.error("Checklist:");
  console.error("  1. mail/.env exists with SMTP_USER and SMTP_PASS");
  console.error("  2. Log in at https://bigrock.titan.email/mail/ first");
  console.error("  3. Settings → Enable Titan on Other Apps");
  console.error("  4. If 2FA is on, use an Application Password");
  console.error("  5. Try SMTP_PORT=587 and SMTP_SECURE=false");
  process.exit(1);
});

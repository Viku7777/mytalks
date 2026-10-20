/**
 * Titan SMTP transporter for MyTalk.
 * Credentials come from mail/.env — never hard-code passwords.
 */
const path = require("path");
const nodemailer = require("nodemailer");
require("dotenv").config({ path: path.join(__dirname, ".env") });

function env(name, fallback) {
  var value = process.env[name];
  if (value == null || String(value).trim() === "") return fallback;
  return String(value).trim();
}

function smtpConfig() {
  var user = env("SMTP_USER", "");
  var pass = env("SMTP_PASS", "");
  var host = env("SMTP_HOST", "smtp.titan.email");
  var port = Number(env("SMTP_PORT", "465"));
  var secure = env("SMTP_SECURE", "true") === "true" || port === 465;
  var fromName = env("SMTP_FROM_NAME", "MyTalk");

  if (!user || !pass) {
    throw new Error(
      "Missing SMTP_USER or SMTP_PASS. Copy mail/.env.example to mail/.env and fill Titan details."
    );
  }

  return {
    user: user,
    pass: pass,
    host: host,
    port: port,
    secure: secure,
    fromName: fromName,
    from: '"' + fromName.replace(/"/g, "") + '" <' + user + ">",
  };
}

function createTransporter() {
  var cfg = smtpConfig();
  return {
    config: cfg,
    transporter: nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: {
        user: cfg.user,
        pass: cfg.pass,
      },
    }),
  };
}

async function sendMail(options) {
  var mail = createTransporter();
  var info = await mail.transporter.sendMail({
    from: options.from || mail.config.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    bcc: options.bcc,
    replyTo: options.replyTo,
  });
  return info;
}

async function verifySmtp() {
  var mail = createTransporter();
  await mail.transporter.verify();
  return mail.config;
}

module.exports = {
  smtpConfig: smtpConfig,
  createTransporter: createTransporter,
  sendMail: sendMail,
  verifySmtp: verifySmtp,
};

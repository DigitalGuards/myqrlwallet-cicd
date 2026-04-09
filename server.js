const express = require("express");
const crypto = require("crypto");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");

require("dotenv").config();

const PORT = process.env.PORT || 3001;
const SECRET = process.env.SECRET;
const LOG_DIR = path.join(__dirname, "logs");

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

// ── Logging ─────────────────────────────────────────────────────────────────

function timestamp() {
  return new Date().toISOString();
}

function log(level, category, message, meta = {}) {
  const entry = { time: timestamp(), level, category, message, ...meta };
  const line = JSON.stringify(entry);

  // stdout for PM2
  if (level === "error") console.error(line);
  else console.log(line);

  // Persistent deploy log
  fs.appendFile(path.join(LOG_DIR, "deploy.log"), line + "\n", (err) => {
    if (err) console.error(`Failed to write to deploy.log: ${err.message}`);
  });
}

// ── Security ────────────────────────────────────────────────────────────────

function verifySignature(req, res, buf) {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) {
    throw new Error("Signature missing");
  }

  const expected = `sha256=${crypto.createHmac("sha256", SECRET).update(buf).digest("hex")}`;

  // timingSafeEqual throws on length mismatch — guard against it
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    throw new Error("Invalid signature");
  }
}

const signedJson = express.json({
  verify: verifySignature,
  limit: "1mb", // Cap payload size — GitHub push payloads are typically <100KB
});

// ── Deploy lock ─────────────────────────────────────────────────────────────

const activeDeploys = new Set();

function runDeploy(script, req, res) {
  if (activeDeploys.has(script)) {
    log("warn", "deploy", "Deploy already in progress, rejecting", { script });
    return res.status(409).json({ error: "Deploy already in progress" });
  }

  activeDeploys.add(script);
  const startTime = Date.now();
  const deliveryId = req.headers["x-github-delivery"] || "unknown";
  const pusher = req.body?.pusher?.name || "unknown";
  const headCommit = req.body?.head_commit?.id?.slice(0, 8) || "unknown";

  log("info", "deploy", `Starting ${script}`, { deliveryId, pusher, headCommit });

  // execFile avoids shell — no injection surface
  execFile("bash", [path.join(__dirname, script)], { cwd: __dirname, timeout: 300000 }, (err, stdout, stderr) => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    activeDeploys.delete(script);

    if (stdout) log("info", "deploy", stdout.trim(), { script });
    if (stderr) log("warn", "deploy", stderr.trim(), { script });

    if (err) {
      log("error", "deploy", `${script} failed after ${duration}s`, { deliveryId, error: err.message });
      return res.status(500).json({ error: "Deployment failed" });
    }

    log("info", "deploy", `${script} completed in ${duration}s`, { deliveryId, pusher, headCommit });
    res.json({ status: "ok", duration: `${duration}s` });
  });
}

// ── Routes ──────────────────────────────────────────────────────────────────

const app = express();
app.set("trust proxy", true);

app.post("/frontend-webhook", signedJson, (req, res) => {
  const event = req.headers["x-github-event"];
  const ref = req.body.ref;

  if (event === "push" && ref === "refs/heads/main") {
    return runDeploy("deploy-frontend-prod.sh", req, res);
  }

  log("info", "webhook", "Ignored event", { event, ref });
  res.json({ status: "ignored" });
});

app.post("/backend-webhook", signedJson, (req, res) => {
  const event = req.headers["x-github-event"];
  const ref = req.body.ref;

  if (event === "push" && ref === "refs/heads/main") {
    return runDeploy("deploy-backend-prod.sh", req, res);
  }

  log("info", "webhook", "Ignored event", { event, ref });
  res.json({ status: "ignored" });
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  if (err.message === "Signature missing" || err.message === "Invalid signature") {
    log("warn", "security", err.message, { ip: req.ip });
    return res.status(401).json({ error: "Unauthorized" });
  }
  log("error", "server", "Unhandled error", { error: err.message });
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, "127.0.0.1", () => {
  log("info", "server", `Webhook listener running on 127.0.0.1:${PORT}`);
});

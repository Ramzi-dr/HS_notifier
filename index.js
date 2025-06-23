import dotenv from "dotenv";
dotenv.config();

import express from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { logger } from "./logger.js";
import { sendEmail } from "./emailManager.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Utility: Validate email format (simple regex)
function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

// Middleware: JSON body parsing
app.use(express.json());

// Middleware: Only allow requests from localhost (enable in prod)
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (ip !== "::1" && ip !== "127.0.0.1" && !ip.endsWith("127.0.0.1")) {
    logger.warning(`Blocked remote IP: ${ip}`);
    return res.status(403).json({ msg: "❌ Only localhost allowed" });
  }
  next();
});

// Rate limit for /login — max 20 requests per minute
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: "❌ Too many login attempts. Try again later." },
});

// Middleware: Verify token for all protected routes
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ msg: "❌ Missing token" });
  }

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(403).json({ msg: "❌ Invalid or expired token" });
    }
    req.tokenPayload = decoded;
    next();
  });
}

// /login: Auth with .env user/pass → returns short-lived token
app.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const validUser = process.env.AUTH_USER;
    const validPass = process.env.AUTH_PASS;

    if (!username || !password) {
      return res.status(400).json({ msg: "❌ username and password required" });
    }

    if (username !== validUser || password !== validPass) {
      logger.warning(`Failed login for user: ${username}`);
      return res.status(403).json({ msg: "❌ Invalid credentials" });
    }

    const token = jwt.sign({ session: true }, process.env.SECRET_KEY, {
      expiresIn: "24h",
    });

    return res.json({ token });
  } catch (err) {
    logger.error("/login error: " + err);
    return res.status(500).json({ msg: "❌ Server error" });
  }
});

// /notifier: Send HTML message to one or more receivers
app.post("/notifier", verifyToken, async (req, res) => {
  try {
    const body = req.body || {};
    const { receiver, receivers, title, message } = body;

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ msg: "❌ Empty request body" });
    }

    if (!title || !message) {
      return res
        .status(400)
        .json({ msg: "❌ 'title' and 'message' are required" });
    }

    const targets = receiver
      ? [receiver]
      : Array.isArray(receivers)
      ? receivers
      : [];

    if (targets.length === 0) {
      return res
        .status(400)
        .json({ msg: "❌ Provide 'receiver' or 'receivers' field" });
    }

    const invalids = targets.filter((email) => !isValidEmail(email));
    if (invalids.length > 0) {
      return res
        .status(400)
        .json({ msg: `❌ Invalid email(s): ${invalids.join(", ")}` });
    }

    logger.info(`Notification to ${targets.join(", ")} — ${title}`);
    try {
      await sendEmail(targets, title, message);
    } catch (err) {
      logger.error("sendEmail failed: " + err);
      return res.status(500).json({ msg: "❌ Failed to send email" });
    }

    return res.json({
      msg: "✅ Message accepted",
      to: targets,
      title,
      html: message,
    });
  } catch (err) {
    logger.error("/notifier error: " + err);
    return res.status(500).json({ msg: "❌ Internal error" });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Notifier app running on http://localhost:${PORT}`);
});

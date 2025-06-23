import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { format } from "date-fns-tz";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_DIR = path.join(__dirname, "log");
const TIMEZONE = "Europe/Zurich";

class DailyLogger {
  constructor() {
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    } catch (err) {
      console.error(`[Logger Init Error] Failed to create log dir: ${err}`);
      this.disabled = true;
    }
  }

  _now() {
    try {
      return new Date();
    } catch (err) {
      console.error(`[Logger Time Error] ${err}`);
      return new Date();
    }
  }

  log(level, message) {
    if (this.disabled) return;

    try {
      const now = this._now();
      const dateStr = format(now, "dd.MM.yyyy", { timeZone: TIMEZONE });
      const timeStr = format(now, "HH:mm:ss", { timeZone: TIMEZONE });
      const logFile = path.join(LOG_DIR, `${dateStr}.log`);
      const logEntry = `[${timeStr}] [${level.toUpperCase()}] ${message}\n`;

      fs.appendFileSync(logFile, logEntry, "utf8");
      this._enforceLogLimit();
    } catch (err) {
      console.error(`[Logger Error] ${err}`);
    }
  }

  info(msg) {
    this.log("info", msg);
  }
  warning(msg) {
    this.log("warning", msg);
  }
  error(msg) {
    this.log("error", msg);
  }
  critical(msg) {
    this.log("critical", msg);
  }

  _enforceLogLimit() {
    try {
      const files = fs
        .readdirSync(LOG_DIR)
        .filter((f) => f.endsWith(".log"))
        .map((f) => ({
          name: f,
          time: fs.statSync(path.join(LOG_DIR, f)).mtime,
        }))
        .sort((a, b) => a.time - b.time);

      while (files.length > 170) {
        const oldest = files.shift();
        fs.unlinkSync(path.join(LOG_DIR, oldest.name));
      }
    } catch (err) {
      console.error(`[Logger Cleanup Error] ${err}`);
    }
  }
}

export const logger = new DailyLogger();

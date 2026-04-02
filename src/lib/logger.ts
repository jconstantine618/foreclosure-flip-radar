import pino from "pino";

// ---------------------------------------------------------------------------
// Structured logger (pino)
//
// Usage:
//   import { log } from "@/lib/logger";
//   log.info({ county: "Greenville" }, "Sync started");
//   log.error({ err }, "Provider request failed");
//
//   // Or use the legacy-compatible named export:
//   import { logger } from "@/lib/logger";
//   logger.info({ step: "enrich" }, "Enriching property");
// ---------------------------------------------------------------------------

const level =
  process.env.LOG_LEVEL ??
  (process.env.NODE_ENV === "production" ? "info" : "debug");

export const log = pino({
  level,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  // In browser / edge runtime pino falls back gracefully.
  // For server-side Next.js pino writes to stdout by default.
  browser: {
    asObject: true,
  },
});

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/** Create a child logger with bound context fields. */
export function createLogger(context: Record<string, unknown>) {
  return log.child(context);
}

/**
 * Backward-compatible alias so existing `import { logger }` calls keep
 * working after the migration from the console-based logger.
 */
export const logger = log;

export default log;

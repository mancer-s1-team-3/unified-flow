// Minimal zero-dependency structured logger. Emits one JSON object per line
// (level, time, msg, + arbitrary fields) so log aggregators can parse it without
// a heavyweight dep like winston/pino. All exceptions funnel through
// captureException — the single place to wire an external error tracker.

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const envLevel = process.env.LOG_LEVEL as Level | undefined;
const MIN_LEVEL = LEVELS[envLevel && envLevel in LEVELS ? envLevel : "info"];

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (LEVELS[level] < MIN_LEVEL) return;
  const record: Record<string, unknown> = { level, time: new Date().toISOString(), msg };
  if (meta) {
    for (const [key, val] of Object.entries(meta)) record[key] = serialize(val);
  }
  const line = JSON.stringify(record);
  // Warnings/errors to stderr, everything else to stdout — keeps probes/log
  // shippers able to split severity by stream.
  if (level === "error" || level === "warn") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};

// Single funnel for exceptions: logs structurally and is the one place to forward
// to an external error tracker. To enable Sentry: `npm i @sentry/node`, init it in
// index.ts, then call `Sentry.captureException(err, { extra: context })` below,
// guarded by `process.env.SENTRY_DSN`.
export function captureException(err: unknown, context?: Record<string, unknown>) {
  logger.error("exception", { ...context, err });
}

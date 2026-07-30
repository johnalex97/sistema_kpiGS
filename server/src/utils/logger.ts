import pino from "pino";

export const silentLogger = pino({ level: "silent" });

export function createLogger(level: string, pretty = false) {
  return pino(
    {
      level,
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
    pretty
      ? pino.transport({
          target: "pino-pretty",
          options: { colorize: true },
        })
      : undefined,
  );
}

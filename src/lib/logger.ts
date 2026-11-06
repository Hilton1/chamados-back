import { pino } from "pino";
import { env } from "../config/env.js";

// Em desenvolvimento, saída legível (pino-pretty é devDependency); em produção, JSON puro.
export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
      : undefined,
});

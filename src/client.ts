import pRetry, { AbortError } from "p-retry";
import { version } from "./version.js";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const ABORT_STATUSES = new Set([400, 401, 403, 404, 413]);

export async function apiRequest<T>(method: string, url: string, body?: unknown): Promise<T> {
  return pRetry(
    async () => {
      const res = await fetch(url, {
        method,
        headers: {
          "User-Agent": `satoric/${version}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        const msg = err?.error ?? `HTTP ${res.status}`;
        if (ABORT_STATUSES.has(res.status) || !RETRY_STATUSES.has(res.status))
          throw new AbortError(new ApiError(msg, res.status));
        throw new ApiError(msg, res.status);
      }

      return res.json() as Promise<T>;
    },
    {
      retries: 4,
      minTimeout: 1000,
      factor: 2,
      randomize: true,
      onFailedAttempt: (ctx) => {
        process.stderr.write(
          `\nwarn: ${ctx.error.message}, retrying (${ctx.retriesLeft} left)...\n`
        );
      },
    }
  );
}

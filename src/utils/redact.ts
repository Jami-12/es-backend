import { env } from "../config/env";

const sensitiveValues = new Set<string>();

const addSensitiveValue = (value: string | undefined): void => {
  if (!value || value.trim().length < 4) {
    return;
  }

  sensitiveValues.add(value);
};

addSensitiveValue(env.DATABASE_URL);
addSensitiveValue(env.JWT_ACCESS_SECRET);
addSensitiveValue(env.JWT_REFRESH_SECRET);
addSensitiveValue(env.SUPER_ADMIN_PASSWORD);
addSensitiveValue(env.PAYMENT_WEBHOOK_SECRET);
addSensitiveValue(env.GOOGLE_CLIENT_SECRET);
addSensitiveValue(env.BKASH_APP_SECRET);
addSensitiveValue(env.BKASH_PASSWORD);
addSensitiveValue(env.NAGAD_PRIVATE_KEY);
addSensitiveValue(env.NAGAD_PUBLIC_KEY);
addSensitiveValue(env.STRIPE_SECRET_KEY);
addSensitiveValue(env.STRIPE_WEBHOOK_SECRET);
addSensitiveValue(env.CLOUDINARY_API_SECRET);
addSensitiveValue(env.CLOUDINARY_API_KEY);
addSensitiveValue(env.SMTP_PASS);
addSensitiveValue(env.SMTP_USER);
addSensitiveValue(env.GOOGLE_CLIENT_ID);
addSensitiveValue(env.BKASH_APP_KEY);

try {
  const databaseUrl = new URL(env.DATABASE_URL);
  addSensitiveValue(databaseUrl.password);
  addSensitiveValue(decodeURIComponent(databaseUrl.password));
} catch {
  // DATABASE_URL validation already reports invalid values at startup.
}

const orderedSensitiveValues = [...sensitiveValues].sort(
  (left, right) => right.length - left.length,
);

export const redactText = (value: string): string => {
  let redacted = value;

  for (const sensitiveValue of orderedSensitiveValues) {
    redacted = redacted.split(sensitiveValue).join("[REDACTED]");
  }

  return redacted
    .replace(
      /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g,
      "[REDACTED_PEM]",
    )
    .replace(
      /postgres(?:ql)?:\/\/[^\s"'<>]+/gi,
      "[REDACTED_DATABASE_URL]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(password|secret|token|api[_-]?key|client[_-]?secret|private[_-]?key)\b\s*[:=]\s*[^\s,;]+/gi,
      "$1=[REDACTED]",
    );
};

const isSensitiveKey = (key: string): boolean =>
  /password|secret|token|api[_-]?key|private[_-]?key|authorization|cookie/i.test(
    key,
  );

export const redactValue = (
  input: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown => {
  if (typeof input === "string") {
    return redactText(input);
  }

  if (input instanceof Error) {
    return {
      name: input.name,
      message: redactText(input.message),
      stack: input.stack ? redactText(input.stack) : undefined,
    };
  }

  if (typeof input !== "object" || input === null) {
    return input;
  }

  if (seen.has(input)) {
    return "[Circular]";
  }

  seen.add(input);

  if (Array.isArray(input)) {
    return input.map((entry) => redactValue(entry, seen));
  }

  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    output[key] = isSensitiveKey(key)
      ? "[REDACTED]"
      : redactValue(value, seen);
  }

  return output;
};

export const safeErrorSummary = (error: unknown): string => {
  if (error instanceof Error) {
    return redactText(`${error.name}: ${error.message}`);
  }

  return redactText(String(error));
};

import nodemailer, { type Transporter } from "nodemailer";

import { ApiError } from "../utils/ApiError";
import { safeErrorSummary } from "../utils/redact";
import { env } from "./env";

/**
 * Email is optional infrastructure. An unconfigured server boots normally;
 * only endpoints that actually need to send mail surface the 503 below.
 */
export const isMailConfigured = Boolean(
  env.SMTP_ENABLED &&
    env.SMTP_HOST &&
    env.SMTP_USER &&
    env.SMTP_PASS &&
    env.SMTP_FROM,
);

let transporter: Transporter | undefined;

export const ensureMailConfigured = (): void => {
  if (!isMailConfigured) {
    throw new ApiError(
      503,
      "Email delivery is not configured. Set SMTP_ENABLED=true and provide SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM.",
    );
  }
};

const getTransporter = (): Transporter => {
  ensureMailConfigured();

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
  }

  return transporter;
};

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export const sendMail = async (message: MailMessage): Promise<void> => {
  const mailTransport = getTransporter();

  try {
    await mailTransport.sendMail({
      from: env.SMTP_FROM,
      ...message,
    });
  } catch (error) {
    // Never expose SMTP internals (server names, credentials, responses) to the client.
    console.error("[mail] Failed to deliver email", safeErrorSummary(error));
    throw new ApiError(
      503,
      "The verification email could not be delivered right now. Please try again later.",
    );
  }
};

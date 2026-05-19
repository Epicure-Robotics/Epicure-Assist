import { render } from "@react-email/render";
import nodemailer, { type Transporter } from "nodemailer";
import type { ReactElement } from "react";
import { env } from "@/lib/env";

/** True when SMTP credentials are configured for outbound email (OTP codes, follower notifications). */
export const isSmtpConfigured = (): boolean => !!(env.SMTP_USER && env.SMTP_PASSWORD && env.SMTP_FROM_ADDRESS);

let transporter: Transporter | null = null;

const getTransporter = (): Transporter => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // Port 465 uses implicit TLS; 587/25 upgrade via STARTTLS.
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    });
  }
  return transporter;
};

/**
 * Sends a React Email template over SMTP. Callers must gate on {@link isSmtpConfigured}
 * first — this throws if SMTP is not configured or the send fails.
 */
export const sendEmail = async ({
  to,
  subject,
  react,
}: {
  to: string;
  subject: string;
  react: ReactElement;
}): Promise<void> => {
  const [html, text] = await Promise.all([render(react), render(react, { plainText: true })]);
  await getTransporter().sendMail({
    from: env.SMTP_FROM_ADDRESS,
    to,
    subject,
    html,
    text,
  });
};

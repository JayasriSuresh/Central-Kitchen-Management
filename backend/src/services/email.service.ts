import nodemailer, { Transporter } from 'nodemailer';
import { SentMessageInfo } from 'nodemailer';

/**
 * Creates a fresh transporter each time — reads env vars at call time so
 * changes to .env (+ server restart) are always picked up correctly.
 */
const createTransporter = (): Transporter<SentMessageInfo> => {
  const host = process.env.SMTP_HOST;

  if (!host) {
    throw new Error(
      'SMTP_HOST is not set. Please configure SMTP_HOST in your .env file and restart the server.',
    );
  }

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  }) as Transporter<SentMessageInfo>;
};

const getFromAddress = () =>
  process.env.SMTP_FROM ?? '"Central Kitchen" <no-reply@centralkitchen.com>';

/** Sends a 6-digit OTP email */
export const sendOtpEmail = async (
  to: string,
  otp: string,
  purpose: 'email_verify' | 'password_reset',
) => {
  const subject =
    purpose === 'email_verify'
      ? 'Your Central Kitchen verification code'
      : 'Your Central Kitchen password reset code';

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fafafa; border: 1px solid #dbdbdb; border-radius: 4px;">
      <h2 style="color: #262626; font-size: 20px; margin: 0 0 8px;">Central Kitchen 🍽</h2>
      <p style="color: #737373; font-size: 14px; margin: 0 0 24px;">
        ${purpose === 'email_verify' ? 'Verify your email address' : 'Reset your password'}
      </p>
      <div style="background: #fff; border: 1px solid #dbdbdb; border-radius: 4px; padding: 24px; text-align: center;">
        <p style="color: #737373; font-size: 13px; margin: 0 0 12px;">Your ${purpose === 'email_verify' ? 'verification' : 'reset'} code is:</p>
        <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #262626; margin: 0 0 12px;">${otp}</div>
        <p style="color: #a8a8a8; font-size: 12px; margin: 0;">This code expires in <strong>10 minutes</strong>.</p>
      </div>
      <p style="color: #a8a8a8; font-size: 11px; margin: 24px 0 0;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  const transporter = createTransporter();
  console.log(`\n📧 Sending OTP email to ${to} via ${process.env.SMTP_HOST}...`);

  const info = await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    html,
  });

  console.log(`✅ OTP email sent successfully! Message ID: ${info.messageId}`);
  return info;
};

/** Sends a password reset link email */
export const sendResetLinkEmail = async (to: string, resetUrl: string) => {
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fafafa; border: 1px solid #dbdbdb; border-radius: 4px;">
      <h2 style="color: #262626; font-size: 20px; margin: 0 0 8px;">Central Kitchen 🍽</h2>
      <p style="color: #737373; font-size: 14px; margin: 0 0 24px;">Reset your password</p>
      <div style="background: #fff; border: 1px solid #dbdbdb; border-radius: 4px; padding: 24px; text-align: center;">
        <p style="color: #737373; font-size: 13px; margin: 0 0 20px;">Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 28px; background: #0095f6; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">Reset Password</a>
      </div>
      <p style="color: #a8a8a8; font-size: 11px; margin: 24px 0 0;">If you didn't request a password reset, ignore this email.</p>
    </div>
  `;

  const transporter = createTransporter();
  console.log(`\n📧 Sending reset link email to ${to} via ${process.env.SMTP_HOST}...`);

  const info = await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject: 'Reset your Central Kitchen password',
    html,
  });

  console.log(`✅ Reset email sent successfully! Message ID: ${info.messageId}`);
  return info;
};

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

type OtpPurpose = 'login' | 'email_verify' | 'password_reset' | 'verify_mobile';

const otpMeta: Record<OtpPurpose, { subject: string; heading: string; label: string }> = {
  login: {
    subject: 'Your Central Kitchen login code',
    heading: 'Sign in to Central Kitchen',
    label: 'login',
  },
  email_verify: {
    subject: 'Your Central Kitchen verification code',
    heading: 'Verify your email address',
    label: 'verification',
  },
  password_reset: {
    subject: 'Your Central Kitchen password reset code',
    heading: 'Reset your password',
    label: 'reset',
  },
  verify_mobile: {
    subject: 'Your Central Kitchen mobile verification code',
    heading: 'Verify your mobile number',
    label: 'verification',
  },
};

/** Sends a 6-digit OTP email — supports all four OTP purposes */
export const sendOtpEmail = async (
  to: string,
  otp: string,
  purpose: OtpPurpose,
) => {
  const meta = otpMeta[purpose];

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fafafa; border: 1px solid #dbdbdb; border-radius: 4px;">
      <h2 style="color: #262626; font-size: 20px; margin: 0 0 8px;">Central Kitchen 🍽</h2>
      <p style="color: #737373; font-size: 14px; margin: 0 0 24px;">${meta.heading}</p>
      <div style="background: #fff; border: 1px solid #dbdbdb; border-radius: 4px; padding: 24px; text-align: center;">
        <p style="color: #737373; font-size: 13px; margin: 0 0 12px;">Your ${meta.label} code is:</p>
        <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #262626; margin: 0 0 12px;">${otp}</div>
        <p style="color: #a8a8a8; font-size: 12px; margin: 0;">This code expires in <strong>10 minutes</strong>.</p>
      </div>
      <p style="color: #a8a8a8; font-size: 11px; margin: 24px 0 0;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  const transporter = createTransporter();
  console.log(`\n📧 Sending OTP email to ${to} via ${process.env.SMTP_HOST}...`);
  console.log(`🔑 [DEBUG/FALLBACK] OTP code for ${to}: ${otp}`);

  try {
    const info = await transporter.sendMail({
      from: getFromAddress(),
      to,
      subject: meta.subject,
      html,
    });
    console.log(`✅ OTP email sent successfully! Message ID: ${info.messageId}`);
    return info;
  } catch (error: any) {
    console.error(`❌ SMTP delivery failed: ${error.message}`);
    console.log(`ℹ️ OTP was generated and saved. You can use the code ${otp} to authenticate.`);
    return null;
  }
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

/** Sends login credentials to a newly created user */
export const sendCredentialsEmail = async (
  to: string,
  name: string,
  username: string,
  password: string,
) => {
  console.log(`\n🔑 [CREDENTIALS] Sending to ${to}: username=${username}, password=${password}`);

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fafafa; border: 1px solid #dbdbdb; border-radius: 4px;">
      <h2 style="color: #262626; font-size: 20px; margin: 0 0 8px;">Central Kitchen 🍽</h2>
      <p style="color: #737373; font-size: 14px; margin: 0 0 24px;">Welcome, ${name}! Your account has been created.</p>
      <div style="background: #fff; border: 1px solid #dbdbdb; border-radius: 4px; padding: 24px;">
        <p style="color: #737373; font-size: 13px; margin: 0 0 12px;">Your login credentials are:</p>
        <table style="width:100%; font-size: 14px;">
          <tr><td style="color:#737373; padding: 4px 0;">Username / Email</td><td style="font-weight:600;">${username}</td></tr>
          <tr><td style="color:#737373; padding: 4px 0;">Password</td><td style="font-weight:600;">${password}</td></tr>
        </table>
        <p style="color: #a8a8a8; font-size: 12px; margin: 16px 0 0;">Please change your password after first login.</p>
      </div>
    </div>
  `;

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: getFromAddress(),
      to,
      subject: 'Your Central Kitchen account credentials',
      html,
    });
    console.log(`✅ Credentials email sent! Message ID: ${info.messageId}`);
    return info;
  } catch (error: any) {
    console.error(`❌ SMTP delivery failed: ${error.message}`);
    console.log(`ℹ️ Credentials NOT emailed. Use the console log above to share them manually.`);
    return null;
  }
};

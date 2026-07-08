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

// ─── Onboarding Emails ───────────────────────────────────────────────────────

/** Sends an invitation email to a restaurant contact */
export const sendOnboardingInvitation = async (
  to: string,
  contactPerson: string,
  restaurantName: string,
  ckName: string,
  registrationUrl: string,
) => {
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 36px 32px; background: #fafafa; border: 1px solid #e0e0e0; border-radius: 6px;">
      <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 8px;">You're invited! 🎉</h2>
      <p style="color: #555; font-size: 14px; margin: 0 0 20px;">Hello ${contactPerson},</p>
      <p style="color: #555; font-size: 14px; margin: 0 0 20px;">
        <strong>${ckName}</strong> has invited <strong>${restaurantName}</strong> to join their ordering platform.
        Click the button below to complete your registration.
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${registrationUrl}" style="display: inline-block; padding: 14px 32px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 600;">Complete Registration →</a>
      </div>
      <p style="color: #a8a8a8; font-size: 12px; margin: 24px 0 0;">This invitation link expires in 7 days. If you didn't expect this email, you can safely ignore it.</p>
    </div>
  `;
  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject: `You're invited to join ${ckName} Management`,
    html,
  });
  console.log(`✅ Invitation email sent to ${to}! Message ID: ${info.messageId}`);
  return info;
};

/** Sends a welcome email after onboarding is approved */
export const sendWelcomeEmail = async (
  to: string,
  contactPerson: string,
  username: string,
  restaurantName: string,
) => {
  const loginUrl = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/login` : 'http://localhost:5173/login';
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 36px 32px; background: #fafafa; border: 1px solid #e0e0e0; border-radius: 6px;">
      <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 8px;">Welcome aboard! ✅</h2>
      <p style="color: #555; font-size: 14px; margin: 0 0 16px;">Hello ${contactPerson},</p>
      <p style="color: #555; font-size: 14px; margin: 0 0 16px;">
        <strong>${restaurantName}</strong> has been approved and your account is ready.
      </p>
      <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 4px; padding: 20px; margin: 0 0 20px;">
        <p style="color: #555; font-size: 13px; margin: 0 0 8px;"><strong>Your login username:</strong></p>
        <p style="font-size: 22px; font-weight: 700; color: #1a1a1a; letter-spacing: 2px; margin: 0;">${username}</p>
      </div>
      <p style="color: #555; font-size: 13px; margin: 0 0 20px;">Use the password you set during registration.</p>
      <div style="text-align: center;">
        <a href="${loginUrl}" style="display: inline-block; padding: 14px 32px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 600;">Log In Now →</a>
      </div>
    </div>
  `;
  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject: `${restaurantName} is now live on the platform!`,
    html,
  });
  console.log(`✅ Welcome email sent to ${to}! Message ID: ${info.messageId}`);
  return info;
};

/** Sends a rejection email */
export const sendRejectionEmail = async (
  to: string,
  contactPerson: string,
  restaurantName: string,
  reason: string,
) => {
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 36px 32px; background: #fafafa; border: 1px solid #e0e0e0; border-radius: 6px;">
      <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 8px;">Registration Update</h2>
      <p style="color: #555; font-size: 14px; margin: 0 0 16px;">Hello ${contactPerson},</p>
      <p style="color: #555; font-size: 14px; margin: 0 0 16px;">
        Unfortunately, the registration for <strong>${restaurantName}</strong> could not be approved at this time.
      </p>
      <div style="background: #fff5f5; border: 1px solid #fcc; border-radius: 4px; padding: 16px; margin: 0 0 20px;">
        <p style="color: #c00; font-size: 13px; font-weight: 600; margin: 0 0 6px;">Reason:</p>
        <p style="color: #555; font-size: 14px; margin: 0;">${reason}</p>
      </div>
      <p style="color: #a8a8a8; font-size: 12px; margin: 0;">If you have questions, please contact your Central Kitchen directly.</p>
    </div>
  `;
  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject: `Update on your ${restaurantName} registration`,
    html,
  });
  console.log(`✅ Rejection email sent to ${to}! Message ID: ${info.messageId}`);
  return info;
};

/** Sends a changes-requested email with a link back to the registration form */
export const sendChangesRequestedEmail = async (
  to: string,
  contactPerson: string,
  restaurantName: string,
  reason: string,
  registrationUrl: string,
) => {
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 36px 32px; background: #fafafa; border: 1px solid #e0e0e0; border-radius: 6px;">
      <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 8px;">Action Required 📝</h2>
      <p style="color: #555; font-size: 14px; margin: 0 0 16px;">Hello ${contactPerson},</p>
      <p style="color: #555; font-size: 14px; margin: 0 0 16px;">
        Your registration for <strong>${restaurantName}</strong> requires some changes before it can be approved.
      </p>
      <div style="background: #fffbea; border: 1px solid #f0d060; border-radius: 4px; padding: 16px; margin: 0 0 20px;">
        <p style="color: #7a5c00; font-size: 13px; font-weight: 600; margin: 0 0 6px;">Changes Required:</p>
        <p style="color: #555; font-size: 14px; margin: 0;">${reason}</p>
      </div>
      <div style="text-align: center; margin: 20px 0;">
        <a href="${registrationUrl}" style="display: inline-block; padding: 14px 32px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 600;">Update Registration →</a>
      </div>
    </div>
  `;
  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject: `Action required: Update your ${restaurantName} registration`,
    html,
  });
  console.log(`✅ Changes-requested email sent to ${to}! Message ID: ${info.messageId}`);
  return info;
};


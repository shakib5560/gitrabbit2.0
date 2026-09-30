import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    const host = process.env.MAIL_HOST || 'smtp.gmail.com';
    const port = Number(process.env.MAIL_PORT) || 587;
    const user = process.env.MAIL_USER;
    const pass = process.env.MAIL_PASSWORD;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  private getFromHeader(): string {
    const raw = process.env.MAIL_FROM?.trim();
    const mailUser = process.env.MAIL_USER || 'no-reply@gitrabbit.co';
    if (!raw) {
      return `GitRabbit <${mailUser}>`;
    }
    if (raw.includes('<') && raw.includes('>')) {
      return raw;
    }
    return `"${raw}" <${mailUser}>`;
  }

  private getApiUrl(): string {
    return process.env.API_URL || 'https://gitrabbit.co/api/v2.0';
  }

  private getDashboardUrl(): string {
    return process.env.DASHBOARD_URL || 'https://gitrabbit.co/app/v2.0';
  }

  private getLoginUrl(): string {
    return process.env.LOGIN_URL || 'https://www.gitrabbit.co/login';
  }

  private getFrontendUrl(): string {
    return process.env.FRONTEND_URL || 'https://gitrabbit.co';
  }

  private getLogoPath(): string | null {
    const candidates = [
      path.join(__dirname, '../assets/logo.png'),
      path.join(__dirname, '../../src/assets/logo.png'),
      path.join(process.cwd(), 'services/auth/src/assets/logo.png'),
      path.join(process.cwd(), 'src/assets/logo.png'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return null;
  }

  private getLogoAttachment(): nodemailer.Attachment[] {
    const localPath = this.getLogoPath();
    if (localPath) {
      return [
        {
          filename: 'gitrabbit-logo.png',
          path: localPath,
          cid: 'gitrabbit-logo',
        },
      ];
    }
    return [];
  }

  private getLogoSrc(): string {
    if (this.getLogoPath()) {
      return 'cid:gitrabbit-logo';
    }
    return 'https://i.ibb.co.com/MDPkQZy5/mainlogo.png';
  }

  private renderBaseEmailTemplate(params: {
    badge: string;
    title: string;
    name: string;
    paragraphs: string[];
    buttonText?: string;
    buttonUrl?: string;
    codeBoxLabel?: string;
    codeBoxContent?: string;
    accountDetails?: { label: string; value: string }[];
    notice: string;
  }): string {
    const logoSrc = this.getLogoSrc();
    const currentYear = new Date().getFullYear();

    const paragraphsHtml = params.paragraphs
      .map(
        (p) =>
          `<p class="text-body" style="font-size: 15px; line-height: 1.65; color: #334155; margin: 0 0 18px 0;">${p}</p>`,
      )
      .join('');

    const buttonHtml =
      params.buttonText && params.buttonUrl
        ? `
        <table border="0" cellspacing="0" cellpadding="0" style="margin: 26px 0 28px 0;">
          <tr>
            <td align="center" style="border-radius: 10px; background-color: #F5C518;">
              <a href="${params.buttonUrl}" target="_blank" style="display: inline-block; padding: 13px 30px; font-size: 14px; font-weight: 700; color: #000000; text-decoration: none; border-radius: 10px; letter-spacing: 0.3px; border: 1px solid #E5B80B; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                ${params.buttonText} &rarr;
              </a>
            </td>
          </tr>
        </table>`
        : '';

    const codeBoxHtml = params.codeBoxContent
      ? `
        <div class="text-muted" style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #64748B; margin: 0 0 8px 0;">
          ${params.codeBoxLabel || 'Or copy and paste this link into your browser:'}
        </div>
        <div class="code-box" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 14px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #334155; word-break: break-all; line-height: 1.5; margin-bottom: 24px;">
          ${params.codeBoxContent}
        </div>`
      : '';

    const accountDetailsHtml = params.accountDetails
      ? `
        <div class="account-box" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
          ${params.accountDetails
            .map(
              (item, idx) => `
            <div style="${idx > 0 ? 'margin-top: 14px;' : ''}">
              <div class="account-label" style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #64748B; margin-bottom: 4px;">
                ${item.label}
              </div>
              <div class="account-val" style="font-size: 15px; font-weight: 700; color: #0F172A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                ${item.value}
              </div>
            </div>`,
            )
            .join('')}
        </div>`
      : '';

    return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${params.title}</title>
  <style>
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    body {
      margin: 0 !important;
      padding: 0 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    a {
      text-decoration: none;
    }

    /* Dynamic Dark Mode Overrides */
    @media (prefers-color-scheme: dark) {
      .email-bg {
        background-color: #0A0B10 !important;
      }
      .card-bg {
        background-color: #12141C !important;
        border-color: #1E2230 !important;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5) !important;
      }
      .badge-bg {
        background-color: #191D28 !important;
        border-color: #272E40 !important;
        color: #F5C518 !important;
      }
      .text-title {
        color: #FFFFFF !important;
      }
      .text-body {
        color: #94A3B8 !important;
      }
      .text-muted {
        color: #64748B !important;
      }
      .code-box {
        background-color: #181C26 !important;
        border-color: #262D3D !important;
        color: #CBD5E1 !important;
      }
      .account-box {
        background-color: #181C26 !important;
        border-color: #262D3D !important;
      }
      .account-label {
        color: #64748B !important;
      }
      .account-val {
        color: #F8FAFC !important;
      }
      .footer-divider {
        border-color: #1E2230 !important;
      }
      .footer-text {
        color: #64748B !important;
      }
    }

    /* Vendor-specific dark mode prefixes (Outlook, Samsung, Web clients) */
    [data-ogsc] .email-bg { background-color: #0A0B10 !important; }
    [data-ogsc] .card-bg { background-color: #12141C !important; border-color: #1E2230 !important; }
    [data-ogsc] .badge-bg { background-color: #191D28 !important; border-color: #272E40 !important; color: #F5C518 !important; }
    [data-ogsc] .text-title { color: #FFFFFF !important; }
    [data-ogsc] .text-body { color: #94A3B8 !important; }
    [data-ogsc] .text-muted { color: #64748B !important; }
    [data-ogsc] .code-box { background-color: #181C26 !important; border-color: #262D3D !important; color: #CBD5E1 !important; }
    [data-ogsc] .account-box { background-color: #181C26 !important; border-color: #262D3D !important; }
    [data-ogsc] .account-label { color: #64748B !important; }
    [data-ogsc] .account-val { color: #F8FAFC !important; }
    [data-ogsc] .footer-divider { border-color: #1E2230 !important; }
    [data-ogsc] .footer-text { color: #64748B !important; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F6F8FA;">
  <div class="email-bg" style="width: 100%; background-color: #F6F8FA; margin: 0; padding: 44px 16px; box-sizing: border-box;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 540px; margin: 0 auto;">
      <tr>
        <td>
          <div class="card-bg" style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 40px 36px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);">
            
            <!-- Logo Header -->
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 28px;">
              <tr>
                <td>
                  <img src="${logoSrc}" alt="GitRabbit" width="160" style="display: block; width: 160px; max-width: 100%; height: auto; border: 0;" />
                </td>
              </tr>
            </table>

            <!-- Badge -->
            <div class="badge-bg" style="display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 4px 10px; border-radius: 20px; background-color: #F1F5F9; border: 1px solid #E2E8F0; color: #475569; margin-bottom: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              ${params.badge}
            </div>

            <!-- Title -->
            <h1 class="text-title" style="font-size: 22px; font-weight: 700; line-height: 1.3; color: #0F172A; margin: 0 0 18px 0; letter-spacing: -0.3px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              ${params.title}
            </h1>

            <!-- Body Paragraphs -->
            ${paragraphsHtml}

            <!-- CTA Button -->
            ${buttonHtml}

            <!-- Raw Link / Code Box -->
            ${codeBoxHtml}

            <!-- Account Details (if provided) -->
            ${accountDetailsHtml}

            <!-- Notice / Security Note -->
            <p class="text-muted" style="font-size: 13px; line-height: 1.55; color: #64748B; margin: 0 0 24px 0;">
              ${params.notice}
            </p>

            <!-- Footer -->
            <div class="footer-divider" style="border-top: 1px solid #E2E8F0; margin: 28px 0 20px 0;"></div>
            <p class="footer-text" style="font-size: 12px; line-height: 1.5; color: #94A3B8; margin: 0;">
              © ${currentYear} GitRabbit. Autonomous AI-powered code intelligence.
            </p>
          </div>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
  }

  async sendVerificationEmail(
    to: string,
    name: string,
    token: string,
  ): Promise<boolean> {
    const apiUrl = this.getApiUrl();
    const verificationUrl = `${apiUrl}/auth/verify-email?token=${token}`;

    const text = `Hi ${name},

Welcome to GitRabbit! Please verify your email address to activate your account.

Click the following link to verify your email:
${verificationUrl}

This verification token will expire in 24 hours.

If you did not create a GitRabbit account, you can safely ignore this email.

--
GitRabbit Security Team
Autonomous AI-Powered Code Intelligence`;

    const html = this.renderBaseEmailTemplate({
      badge: 'Email Verification',
      title: 'Verify your email address',
      name,
      paragraphs: [
        `Hi ${name},`,
        'Welcome to GitRabbit! Confirm your email address to activate your account and start autonomous AI reviews and code intelligence.',
      ],
      buttonText: 'Verify Email',
      buttonUrl: verificationUrl,
      codeBoxLabel:
        'Or copy and paste this verification link directly into your browser:',
      codeBoxContent: verificationUrl,
      notice:
        'This verification link will expire in 24 hours. If you did not create an account, you can safely ignore this email.',
    });

    try {
      await this.transporter.sendMail({
        from: this.getFromHeader(),
        to,
        replyTo: process.env.MAIL_USER,
        subject: 'Verify your GitRabbit email address',
        text,
        html,
        attachments: this.getLogoAttachment(),
        headers: {
          'X-Entity-Ref-ID': `verify-${token.substring(0, 16)}`,
          'Auto-Submitted': 'auto-generated',
        },
      });
      this.logger.log(`Verification email successfully dispatched to ${to}`);
      return true;
    } catch (error: any) {
      this.logger.error(
        `Failed to send verification email to ${to}: ${error.message}`,
      );
      return false;
    }
  }

  async sendPasswordResetEmail(
    to: string,
    name: string,
    token: string,
  ): Promise<boolean> {
    const frontendUrl = this.getFrontendUrl();
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    const text = `Hi ${name},

We received a request to reset your GitRabbit account password.

Click the following link to choose a new password:
${resetUrl}

This reset link is valid for 1 hour. If you did not request a password reset, you can safely ignore this email.

--
GitRabbit Security Team
Autonomous AI-Powered Code Intelligence`;

    const html = this.renderBaseEmailTemplate({
      badge: 'Security Notice',
      title: 'Reset your password',
      name,
      paragraphs: [
        `Hi ${name},`,
        'We received a request to reset your GitRabbit account password. Click below to choose a new password:',
      ],
      buttonText: 'Reset Password',
      buttonUrl: resetUrl,
      codeBoxLabel: 'Or copy and paste this link into your browser:',
      codeBoxContent: resetUrl,
      notice:
        'This reset link is valid for <strong>1 hour</strong>. If you did not request a password reset, no further action is required and your account remains secure.',
    });

    try {
      await this.transporter.sendMail({
        from: this.getFromHeader(),
        to,
        replyTo: process.env.MAIL_USER,
        subject: 'Reset your GitRabbit password',
        text,
        html,
        attachments: this.getLogoAttachment(),
        headers: {
          'X-Entity-Ref-ID': `pwd-${token.substring(0, 16)}`,
          'Auto-Submitted': 'auto-generated',
        },
      });
      this.logger.log(`Password reset email successfully dispatched to ${to}`);
      return true;
    } catch (error: any) {
      this.logger.error(
        `Failed to send password reset email to ${to}: ${error.message}`,
      );
      return false;
    }
  }

  async sendForgotUsernameEmail(to: string, name: string): Promise<boolean> {
    const loginUrl = this.getLoginUrl();

    const text = `Hi ${name},

We received a request for your GitRabbit account details.

Registered Name: ${name}
Login Email: ${to}

Login to your dashboard:
${loginUrl}

--
GitRabbit Security Team
Autonomous AI-Powered Code Intelligence`;

    const html = this.renderBaseEmailTemplate({
      badge: 'Account Recovery',
      title: 'Your account details',
      name,
      paragraphs: [
        'Hi there,',
        'Here is the GitRabbit account associated with this email address:',
      ],
      accountDetails: [
        { label: 'Account Display Name', value: name },
        { label: 'Registered Login Email', value: to },
      ],
      buttonText: 'Proceed to Login',
      buttonUrl: loginUrl,
      notice:
        'If you did not request this information, you can safely disregard this email.',
    });

    try {
      await this.transporter.sendMail({
        from: this.getFromHeader(),
        to,
        replyTo: process.env.MAIL_USER,
        subject: 'Your GitRabbit account details',
        text,
        html,
        attachments: this.getLogoAttachment(),
        headers: {
          'X-Entity-Ref-ID': `user-${Date.now()}`,
          'Auto-Submitted': 'auto-generated',
        },
      });
      this.logger.log(`Forgot username email successfully dispatched to ${to}`);
      return true;
    } catch (error: any) {
      this.logger.error(
        `Failed to send forgot username email to ${to}: ${error.message}`,
      );
      return false;
    }
  }
}

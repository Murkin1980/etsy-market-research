import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('mailer');

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailerConfig {
  from: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  publicBaseUrl: string;
  verificationTtlHours: number;
  resetTtlHours: number;
  mailDir: string;
}

export interface Mailer {
  readonly configured: boolean;
  readonly mode: 'smtp' | 'file';
  sendVerificationEmail(to: string, name: string, token: string): Promise<void>;
  sendPasswordResetEmail(to: string, name: string, token: string): Promise<void>;
  sendWelcomeEmail(to: string, name: string): Promise<void>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character] ?? character));
}

function layout(title: string, bodyHtml: string): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="ru">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    '<style>',
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;margin:0;padding:24px;background:#f5f4f1;color:#1c1c1e}',
    '.card{max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px}',
    '.brand{font-weight:700;font-size:15px;letter-spacing:.2px;margin-bottom:16px}',
    'h1{font-size:20px;margin:0 0 12px}',
    'p{font-size:15px;line-height:1.55;color:#3c3c40;margin:0 0 16px}',
    '.button{display:inline-block;background:#b3471b;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:11px 20px;border-radius:8px}',
    '.hint{font-size:13px;color:#8a8a90;line-height:1.5}',
    'code{word-break:break-all;font-size:13px}',
    '</style>',
    '</head>',
    '<body>',
    '<div class="card">',
    '<div class="brand">Signal Lab</div>',
    bodyHtml,
    '</div>',
    '</body>',
    '</html>',
  ].join('');
}

function plainLayout(paragraphs: string[], href?: string): string {
  return [...paragraphs, href ? `Перейти по ссылке: ${href}` : ''].filter(Boolean).join('\n\n');
}

export class MailerService implements Mailer {
  readonly configured: boolean;
  readonly mode: 'smtp' | 'file';
  private readonly transporter: ReturnType<typeof nodemailer.createTransport> | null;
  private nextFileId = 1;

  constructor(private readonly config: MailerConfig) {
    this.configured = Boolean(config.smtpHost && config.smtpUser && config.smtpPass);
    this.mode = this.configured ? 'smtp' : 'file';
    this.transporter = this.configured
      ? nodemailer.createTransport({
          host: config.smtpHost,
          port: config.smtpPort,
          secure: config.smtpSecure,
          auth: { user: config.smtpUser, pass: config.smtpPass },
        })
      : null;
  }

  private verificationUrl(token: string): string {
    const base = this.config.publicBaseUrl.replace(/\/$/, '');
    return `${base}/?verify=${encodeURIComponent(token)}`;
  }

  private resetUrl(token: string): string {
    const base = this.config.publicBaseUrl.replace(/\/$/, '');
    return `${base}/?reset=${encodeURIComponent(token)}`;
  }

  private async deliver(message: EmailMessage): Promise<void> {
    if (this.transporter) {
      await this.transporter.sendMail({ from: this.config.from, to: message.to, subject: message.subject, text: message.text, html: message.html });
      log.info({ to: message.to, subject: message.subject }, 'Transactional email sent via SMTP');
      return;
    }
    this.writeToFile(message);
  }

  private writeToFile(message: EmailMessage): void {
    fs.mkdirSync(this.config.mailDir, { recursive: true });
    const safeTo = message.to.replace(/[^a-z0-9@.-]/gi, '_');
    const fileName = `${Date.now()}-${this.nextFileId++}-${safeTo}.eml`;
    const content = [
      `From: ${this.config.from}`,
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      message.html ?? message.text,
    ].join('\r\n');
    fs.writeFileSync(path.join(this.config.mailDir, fileName), content, { encoding: 'utf-8', mode: 0o600 });
    log.info({ file: fileName, to: message.to, subject: message.subject }, 'Transactional email written to file (SMTP not configured)');
  }

  async sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
    const url = this.verificationUrl(token);
    const title = 'Подтвердите адрес электронной почты';
    const paragraphs = [
      `Здравствуйте, ${name}!`,
      'Вы зарегистрировались в Signal Lab. Подтвердите адрес электронной почты, чтобы завершить создание аккаунта.',
      'Ссылка действительна в течение 24 часов.',
    ];
    const html = layout(title, [
      '<h1>Подтверждение почты</h1>',
      `<p>${escapeHtml(paragraphs[0])}</p>`,
      `<p>${escapeHtml(paragraphs[1])}</p>`,
      `<p><a class="button" href="${escapeHtml(url)}">Подтвердить адрес</a></p>`,
      `<p class="hint">${escapeHtml(paragraphs[2])}<br>Если кнопка не открывается, скопируйте ссылку: <code>${escapeHtml(url)}</code></p>`,
    ].join(''));
    await this.deliver({ to, subject: title, text: plainLayout(paragraphs, url), html });
  }

  async sendPasswordResetEmail(to: string, name: string, token: string): Promise<void> {
    const url = this.resetUrl(token);
    const title = 'Восстановление пароля Signal Lab';
    const paragraphs = [
      `Здравствуйте, ${name}!`,
      'Мы получили запрос на восстановление пароля. Перейдите по ссылке, чтобы задать новый пароль.',
      'Ссылка действительна в течение 1 часа. Если вы не запрашивали сброс, просто проигнорируйте это письмо.',
    ];
    const html = layout(title, [
      '<h1>Восстановление пароля</h1>',
      `<p>${escapeHtml(paragraphs[0])}</p>`,
      `<p>${escapeHtml(paragraphs[1])}</p>`,
      `<p><a class="button" href="${escapeHtml(url)}">Задать новый пароль</a></p>`,
      `<p class="hint">${escapeHtml(paragraphs[2])}<br>Если кнопка не открывается, скопируйте ссылку: <code>${escapeHtml(url)}</code></p>`,
    ].join(''));
    await this.deliver({ to, subject: title, text: plainLayout(paragraphs, url), html });
  }

  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    const title = 'Добро пожаловать в Signal Lab';
    const paragraphs = [
      `Здравствуйте, ${name}!`,
      'Ваш адрес подтверждён. Войдите в Signal Lab, чтобы запускать исследования рынка, сравнивать ниши и читать аналитику.',
    ];
    const html = layout(title, [
      '<h1>Добро пожаловать!</h1>',
      `<p>${escapeHtml(paragraphs[0])}</p>`,
      `<p>${escapeHtml(paragraphs[1])}</p>`,
    ].join(''));
    await this.deliver({ to, subject: title, text: plainLayout(paragraphs), html });
  }
}

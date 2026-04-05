/**
 * Lynx — Channel-Agnostic Notifier
 *
 * Supports: Slack, Discord, Email (SMTP/SendGrid), Custom Webhook, Dashboard-only
 * User configures which channel(s) to use in setup wizard.
 * All channels receive the same NotificationPayload — adapters handle formatting.
 */

import type { NotificationPayload, NotificationChannel } from '../types.js';

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface NotificationAdapter {
  readonly channel: NotificationChannel;
  send(payload: NotificationPayload): Promise<void>;
}

// ─── Notifier ─────────────────────────────────────────────────────────────────

class Notifier {
  private adapters: Map<NotificationChannel, NotificationAdapter> = new Map();

  register(adapter: NotificationAdapter): void {
    this.adapters.set(adapter.channel, adapter);
  }

  unregister(channel: NotificationChannel): void {
    this.adapters.delete(channel);
  }

  /**
   * Send to a specific channel or all registered channels.
   */
  async send(payload: NotificationPayload, channel?: NotificationChannel): Promise<void> {
    if (channel) {
      const adapter = this.adapters.get(channel);
      if (adapter) await adapter.send(payload).catch(logError(channel));
    } else {
      await Promise.allSettled(
        [...this.adapters.values()].map((a) => a.send(payload).catch(logError(a.channel))),
      );
    }
  }

  /**
   * Send an alert — convenience wrapper with severity-based routing.
   * CRITICAL → all channels. WARN/ERROR → configured channels.
   */
  async alert(
    title: string,
    body: string,
    severity: NotificationPayload['severity'],
    extra?: Partial<NotificationPayload>,
  ): Promise<void> {
    await this.send({ title, body, severity, ...extra });
  }
}

function logError(channel: NotificationChannel) {
  return (err: unknown) => {
    console.error(`[Lynx Notifier] Failed to send via ${channel}:`, err);
  };
}

export const notifier = new Notifier();

// ─── Slack Adapter ────────────────────────────────────────────────────────────

export class SlackAdapter implements NotificationAdapter {
  readonly channel = 'slack' as const;

  constructor(private webhookUrl: string) {}

  async send(payload: NotificationPayload): Promise<void> {
    const color = severityToColor(payload.severity);
    const blocks: unknown[] = [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${payload.title}*\n${payload.body}` },
      },
    ];

    if (payload.fields?.length) {
      blocks.push({
        type: 'section',
        fields: payload.fields.map((f) => ({
          type: 'mrkdwn',
          text: `*${f.name}*\n${f.value}`,
        })),
      });
    }

    if (payload.actions?.length) {
      blocks.push({
        type: 'actions',
        elements: payload.actions.map((a) => ({
          type: 'button',
          text: { type: 'plain_text', text: a.label },
          url: a.url,
          style: a.style === 'danger' ? 'danger' : 'primary',
        })),
      });
    }

    if (payload.footer) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: payload.footer }],
      });
    }

    const body = JSON.stringify({
      attachments: [{ color, blocks }],
    });

    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  }
}

// ─── Discord Adapter ──────────────────────────────────────────────────────────

export class DiscordAdapter implements NotificationAdapter {
  readonly channel = 'discord' as const;

  constructor(private webhookUrl: string) {}

  async send(payload: NotificationPayload): Promise<void> {
    const color = severityToDiscordColor(payload.severity);
    const embed = {
      title: payload.title,
      description: payload.body,
      color,
      fields: payload.fields?.map((f) => ({
        name: f.name,
        value: f.value,
        inline: f.inline ?? false,
      })),
      footer: payload.footer ? { text: payload.footer } : undefined,
      timestamp: new Date().toISOString(),
    };

    const components = payload.actions?.length
      ? [{
          type: 1,
          components: payload.actions.map((a) => ({
            type: 2,
            label: a.label,
            style: a.style === 'danger' ? 4 : 5,
            url: a.url,
          })),
        }]
      : [];

    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed], components }),
    });
  }
}

// ─── Email Adapter (SMTP via nodemailer or SendGrid) ──────────────────────────

export interface EmailConfig {
  type: 'sendgrid' | 'smtp';
  apiKey?: string;
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from: string;
  to: string | string[];
}

export class EmailAdapter implements NotificationAdapter {
  readonly channel = 'email' as const;

  constructor(private config: EmailConfig) {}

  async send(payload: NotificationPayload): Promise<void> {
    const html = buildEmailHtml(payload);
    const subject = `[Lynx] ${severityLabel(payload.severity)} — ${payload.title}`;

    if (this.config.type === 'sendgrid' && this.config.apiKey) {
      await this.sendViaSendGrid(subject, html);
    } else if (this.config.type === 'smtp') {
      // Lazy import nodemailer to avoid hard dependency
      const nodemailer = await import('nodemailer').catch(() => null);
      if (!nodemailer) throw new Error('nodemailer not installed. Run: pnpm add nodemailer');
      const transport = nodemailer.default.createTransport({
        host: this.config.host,
        port: this.config.port ?? 587,
        auth: { user: this.config.user, pass: this.config.pass },
      });
      await transport.sendMail({
        from: this.config.from,
        to: this.config.to,
        subject,
        html,
      });
    }
  }

  private async sendViaSendGrid(subject: string, html: string): Promise<void> {
    const to = Array.isArray(this.config.to)
      ? this.config.to.map((email) => ({ email }))
      : [{ email: this.config.to }];

    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to }],
        from: { email: this.config.from },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    });
  }
}

// ─── Custom Webhook Adapter ───────────────────────────────────────────────────

export class WebhookAdapter implements NotificationAdapter {
  readonly channel = 'webhook' as const;

  constructor(private url: string, private secret?: string) {}

  async send(payload: NotificationPayload): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.secret) {
      headers['X-Lynx-Signature'] = await signPayload(JSON.stringify(payload), this.secret);
    }

    await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...payload, source: 'lynx', ts: Date.now() }),
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityToColor(s: NotificationPayload['severity']): string {
  return { info: '#378ADD', warning: '#BA7517', error: '#D85A30', critical: '#7F0000' }[s];
}

function severityToDiscordColor(s: NotificationPayload['severity']): number {
  return { info: 0x378ADD, warning: 0xBA7517, error: 0xD85A30, critical: 0x7F0000 }[s];
}

function severityLabel(s: NotificationPayload['severity']): string {
  return { info: 'INFO', warning: 'WARNING', error: 'ERROR', critical: '🚨 CRITICAL' }[s];
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const { createHmac } = await import('crypto');
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function buildEmailHtml(payload: NotificationPayload): string {
  const bgColor = severityToColor(payload.severity);
  const fieldsHtml = payload.fields
    ?.map((f) => `<tr><td style="padding:4px 12px;color:#999;font-size:12px">${f.name}</td><td style="padding:4px 12px;font-size:12px">${f.value}</td></tr>`)
    .join('') ?? '';

  const actionsHtml = payload.actions
    ?.map((a) => `<a href="${a.url}" style="display:inline-block;margin:4px;padding:8px 16px;background:${a.style === 'danger' ? '#D85A30' : '#7F77DD'};color:#fff;border-radius:6px;text-decoration:none;font-size:13px">${a.label}</a>`)
    .join('') ?? '';

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:Inter,sans-serif;color:#e0e0e0">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#13131a;border:1px solid #1e1e2e;border-radius:12px;overflow:hidden">
      <div style="background:${bgColor};padding:16px 24px">
        <h2 style="margin:0;color:#fff;font-size:16px">${payload.title}</h2>
      </div>
      <div style="padding:20px 24px">
        <p style="margin:0 0 16px;color:#b0b0c0;font-size:14px;line-height:1.6">${payload.body}</p>
        ${fieldsHtml ? `<table style="width:100%;border-collapse:collapse;margin-bottom:16px">${fieldsHtml}</table>` : ''}
        ${actionsHtml ? `<div style="margin-bottom:12px">${actionsHtml}</div>` : ''}
        ${payload.footer ? `<p style="margin:12px 0 0;color:#666;font-size:11px">${payload.footer}</p>` : ''}
      </div>
    </div>
    <p style="text-align:center;color:#333;font-size:11px;margin-top:12px">Lynx — Your AI Engineering Partner</p>
  </div>
</body>
</html>`;
}

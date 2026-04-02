// ---------------------------------------------------------------------------
// AlertDispatcher – sends alerts through EMAIL, SMS, SLACK, or WEBHOOK
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getAlertEmailHtml } from './templates';

interface AlertEventInput {
  id: string;
  channel: 'EMAIL' | 'SMS' | 'SLACK' | 'WEBHOOK';
  payload: any;
  alertType: string;
}

const MAX_WEBHOOK_RETRIES = 3;
const WEBHOOK_RETRY_DELAY_MS = 1_000;

export class AlertDispatcher {
  /**
   * Dispatch an alert event through the appropriate channel.
   * Updates the AlertEvent record with sentAt / status on completion.
   */
  async dispatch(alertEvent: AlertEventInput): Promise<void> {
    try {
      switch (alertEvent.channel) {
        case 'EMAIL':
          await this.sendEmail(alertEvent);
          break;

        case 'SMS':
          logger.warn(
            { alertEventId: alertEvent.id },
            'SMS channel is not yet configured – skipping',
          );
          await this.markStatus(alertEvent.id, 'SKIPPED', 'SMS channel not configured');
          return;

        case 'SLACK':
          logger.warn(
            { alertEventId: alertEvent.id },
            'Slack channel is not yet configured – skipping',
          );
          await this.markStatus(alertEvent.id, 'SKIPPED', 'Slack channel not configured');
          return;

        case 'WEBHOOK':
          await this.sendWebhook(alertEvent);
          break;

        default:
          logger.error(
            { channel: (alertEvent as any).channel, alertEventId: alertEvent.id },
            'Unknown alert channel',
          );
          await this.markStatus(alertEvent.id, 'FAILED', `Unknown channel: ${alertEvent.channel}`);
          return;
      }

      // Mark as sent
      await prisma.alertEvent.update({
        where: { id: alertEvent.id },
        data: { sentAt: new Date(), status: 'SENT' },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { alertEventId: alertEvent.id, err: message },
        'Failed to dispatch alert',
      );

      await this.markStatus(alertEvent.id, 'FAILED', message).catch((dbErr) =>
        logger.error({ err: dbErr }, 'Failed to update alert event status after dispatch error'),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Email
  // ---------------------------------------------------------------------------

  private async sendEmail(alertEvent: AlertEventInput): Promise<void> {
    // Dynamic import so the module is only loaded when actually sending email
    let nodemailer: typeof import('nodemailer');
    try {
      nodemailer = await import('nodemailer');
    } catch {
      throw new Error('nodemailer is not installed. Run `npm install nodemailer`.');
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const fromAddress = process.env.SMTP_FROM ?? 'alerts@foreclosureflipradar.com';

    if (!host) {
      throw new Error('SMTP_HOST environment variable is not set');
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });

    // Resolve recipient – accept either a direct email or a userId to look up
    let recipientEmail: string | undefined = alertEvent.payload?.recipientEmail;

    if (!recipientEmail && alertEvent.payload?.recipientUserId) {
      const recipientUser = await prisma.user.findUnique({
        where: { id: alertEvent.payload.recipientUserId },
        select: { email: true },
      });
      recipientEmail = recipientUser?.email ?? undefined;
    }

    if (!recipientEmail) {
      throw new Error('No recipient email address in alert payload');
    }

    // Build email content from template (or use pre-rendered html/subject)
    const { subject, html } = alertEvent.payload?.subject && alertEvent.payload?.html
      ? { subject: alertEvent.payload.subject as string, html: alertEvent.payload.html as string }
      : getAlertEmailHtml(alertEvent.alertType, alertEvent.payload);

    await transporter.sendMail({
      from: fromAddress,
      to: recipientEmail,
      subject,
      html,
    });

    logger.info(
      { alertEventId: alertEvent.id, to: recipientEmail, alertType: alertEvent.alertType },
      'Alert email sent',
    );
  }

  // ---------------------------------------------------------------------------
  // Webhook
  // ---------------------------------------------------------------------------

  private async sendWebhook(alertEvent: AlertEventInput): Promise<void> {
    const webhookUrl: string | undefined =
      alertEvent.payload?.webhookUrl ?? alertEvent.payload?.url ?? process.env.ALERT_WEBHOOK_URL;

    if (!webhookUrl) {
      throw new Error('No webhook URL provided in payload or ALERT_WEBHOOK_URL env');
    }

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_WEBHOOK_RETRIES; attempt++) {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alertType: alertEvent.alertType,
            alertEventId: alertEvent.id,
            channel: alertEvent.channel,
            payload: alertEvent.payload,
            sentAt: new Date().toISOString(),
          }),
        });

        if (!response.ok) {
          throw new Error(`Webhook returned status ${response.status}: ${response.statusText}`);
        }

        logger.info(
          { alertEventId: alertEvent.id, webhookUrl, attempt },
          'Webhook delivered',
        );
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(
          { alertEventId: alertEvent.id, attempt, maxAttempts: MAX_WEBHOOK_RETRIES, err: lastError.message },
          'Webhook attempt failed',
        );

        // Exponential backoff between retries
        if (attempt < MAX_WEBHOOK_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, WEBHOOK_RETRY_DELAY_MS * attempt));
        }
      }
    }

    throw lastError ?? new Error('Webhook delivery failed after all retries');
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async markStatus(alertEventId: string, status: string, error?: string): Promise<void> {
    try {
      await prisma.alertEvent.update({
        where: { id: alertEventId },
        data: { status, error: error ?? null },
      });
    } catch (err) {
      logger.error(
        { alertEventId, err: String(err) },
        'Failed to update alert event status',
      );
    }
  }
}

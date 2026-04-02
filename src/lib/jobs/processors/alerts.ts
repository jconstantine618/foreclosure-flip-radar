// ---------------------------------------------------------------------------
// Alert Job Processor -- evaluates alert rules, dispatches notifications
// ---------------------------------------------------------------------------

import { Worker, Job } from 'bullmq';
import { connection } from '../queue';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { AlertEngine } from '@/lib/alerts/engine';
import { AlertDispatcher } from '@/lib/alerts/dispatcher';

const log = logger.child({ worker: 'alerts' });
const alertEngine = new AlertEngine();
const alertDispatcher = new AlertDispatcher();

// ---------------------------------------------------------------------------
// evaluate-alerts: check a single opportunity against all alert rules
// ---------------------------------------------------------------------------

async function handleEvaluateAlerts(job: Job): Promise<void> {
  const { opportunityId } = job.data as { opportunityId: string };

  log.info({ opportunityId, jobId: job.id }, 'evaluate-alerts: starting');

  try {
    await alertEngine.evaluateOpportunity(opportunityId);

    // Also check for hot lead alerts based on current score
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { flipScore: true },
    });

    if (opportunity?.flipScore) {
      await alertEngine.checkHotLeadAlert(opportunityId, opportunity.flipScore);
    }

    log.info({ opportunityId, jobId: job.id }, 'evaluate-alerts: completed');
  } catch (err) {
    log.error(
      { opportunityId, err: String(err), jobId: job.id },
      'evaluate-alerts: failed',
    );
    throw err;
  }
}

// ---------------------------------------------------------------------------
// dispatch-alert: send a single alert event through the dispatcher
// ---------------------------------------------------------------------------

async function handleDispatchAlert(job: Job): Promise<void> {
  const { alertEventId } = job.data as { alertEventId: string };

  log.info({ alertEventId, jobId: job.id }, 'dispatch-alert: starting');

  try {
    const alertEvent = await prisma.alertEvent.findUnique({
      where: { id: alertEventId },
      include: {
        alertRule: {
          include: { user: { select: { email: true } } },
        },
      },
    });

    if (!alertEvent) {
      log.warn({ alertEventId }, 'dispatch-alert: alert event not found');
      return;
    }

    if (alertEvent.status === 'SENT') {
      log.info({ alertEventId }, 'dispatch-alert: already sent, skipping');
      return;
    }

    const payload = alertEvent.payload as Record<string, unknown>;

    await alertDispatcher.dispatch({
      id: alertEvent.id,
      channel: alertEvent.channel as 'EMAIL' | 'SMS' | 'SLACK' | 'WEBHOOK',
      payload: {
        ...payload,
        recipientUserId: alertEvent.alertRule?.userId,
        recipientEmail: alertEvent.alertRule?.user?.email,
      },
      alertType: alertEvent.alertType,
    });

    log.info({ alertEventId, jobId: job.id }, 'dispatch-alert: completed');
  } catch (err) {
    log.error(
      { alertEventId, err: String(err), jobId: job.id },
      'dispatch-alert: failed',
    );
    throw err;
  }
}

// ---------------------------------------------------------------------------
// daily-digest: generate and send daily digest for all subscribed users
// ---------------------------------------------------------------------------

async function handleDailyDigest(job: Job): Promise<void> {
  log.info({ jobId: job.id }, 'daily-digest: starting');

  try {
    await alertEngine.generateDailyDigest();
    log.info({ jobId: job.id }, 'daily-digest: completed');
  } catch (err) {
    log.error({ err: String(err), jobId: job.id }, 'daily-digest: failed');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// auction-reminders: check upcoming auctions and send milestone reminders
// ---------------------------------------------------------------------------

async function handleAuctionReminders(job: Job): Promise<void> {
  log.info({ jobId: job.id }, 'auction-reminders: starting');

  try {
    await alertEngine.checkAuctionAlerts();
    log.info({ jobId: job.id }, 'auction-reminders: completed');
  } catch (err) {
    log.error({ err: String(err), jobId: job.id }, 'auction-reminders: failed');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Worker registration
// ---------------------------------------------------------------------------

export function createAlertWorker(): Worker {
  const worker = new Worker(
    'alerts',
    async (job: Job) => {
      switch (job.name) {
        case 'evaluate-alerts':
          await handleEvaluateAlerts(job);
          break;
        case 'dispatch-alert':
          await handleDispatchAlert(job);
          break;
        case 'daily-digest':
          await handleDailyDigest(job);
          break;
        case 'auction-reminders':
          await handleAuctionReminders(job);
          break;
        default:
          log.warn({ jobName: job.name }, 'alerts: unknown job name');
      }
    },
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on('completed', (job) => {
    log.info({ jobId: job.id, jobName: job.name }, 'alerts: job completed');
  });

  worker.on('failed', (job, err) => {
    log.error(
      { jobId: job?.id, jobName: job?.name, err: String(err) },
      'alerts: job failed',
    );
  });

  return worker;
}

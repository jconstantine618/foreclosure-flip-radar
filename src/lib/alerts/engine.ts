// ---------------------------------------------------------------------------
// AlertEngine – core alert evaluation logic for Foreclosure Flip Radar
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { AlertDispatcher } from './dispatcher';
import { getAlertEmailHtml } from './templates';

const dispatcher = new AlertDispatcher();

/** Auction-approaching alert milestones (days before auction) */
const AUCTION_MILESTONES = [14, 7, 3, 1];

export class AlertEngine {
  // -------------------------------------------------------------------
  // Evaluate a new / updated opportunity against all active alert rules
  // -------------------------------------------------------------------

  async evaluateOpportunity(opportunityId: string): Promise<void> {
    try {
      // 1. Load opportunity with property data
      const opportunity = await prisma.opportunity.findUnique({
        where: { id: opportunityId },
        include: { property: true },
      });

      if (!opportunity || !opportunity.isActive) {
        logger.warn({ opportunityId }, 'evaluateOpportunity: opportunity not found or inactive');
        return;
      }

      // 2. Load all active NEW_OPPORTUNITY alert rules
      const rules = await prisma.alertRule.findMany({
        where: { isActive: true, alertType: 'NEW_OPPORTUNITY' },
        include: { user: { select: { email: true } } },
      });

      // 3. For each rule, check if opportunity matches filters
      for (const rule of rules) {
        try {
          if (!this.matchesFilters(opportunity, rule)) continue;

          // 4. Build template data, create AlertEvent, and dispatch
          const templateData = this.buildTemplateData(opportunity);
          const { subject, html } = getAlertEmailHtml('NEW_OPPORTUNITY', templateData);

          const alertEvent = await prisma.alertEvent.create({
            data: {
              alertRuleId: rule.id,
              opportunityId: opportunity.id,
              alertType: 'NEW_OPPORTUNITY',
              channel: rule.channel,
              payload: { subject, html } as any,
              status: 'PENDING',
            },
          });

          await dispatcher.dispatch({
            id: alertEvent.id,
            channel: rule.channel,
            payload: { subject, html, recipientUserId: rule.userId, recipientEmail: rule.user?.email },
            alertType: 'NEW_OPPORTUNITY',
          });
        } catch (err) {
          logger.error(
            { ruleId: rule.id, opportunityId, err: String(err) },
            'evaluateOpportunity: failed to process rule',
          );
        }
      }
    } catch (err) {
      logger.error({ opportunityId, err: String(err) }, 'evaluateOpportunity: unexpected error');
    }
  }

  // -------------------------------------------------------------------
  // Check score threshold (HOT_LEAD) alerts
  // -------------------------------------------------------------------

  async checkHotLeadAlert(opportunityId: string, score: number): Promise<void> {
    try {
      const opportunity = await prisma.opportunity.findUnique({
        where: { id: opportunityId },
        include: { property: true },
      });

      if (!opportunity) return;

      // Find rules where alertType = HOT_LEAD and score >= threshold
      const rules = await prisma.alertRule.findMany({
        where: {
          isActive: true,
          alertType: 'HOT_LEAD',
          scoreThreshold: { lte: score },
        },
        include: { user: { select: { email: true } } },
      });

      for (const rule of rules) {
        try {
          if (!this.matchesFilters(opportunity, rule)) continue;

          const templateData = { ...this.buildTemplateData(opportunity), score };
          const { subject, html } = getAlertEmailHtml('HOT_LEAD', templateData);

          const alertEvent = await prisma.alertEvent.create({
            data: {
              alertRuleId: rule.id,
              opportunityId: opportunity.id,
              alertType: 'HOT_LEAD',
              channel: rule.channel,
              payload: { subject, html, score } as any,
              status: 'PENDING',
            },
          });

          await dispatcher.dispatch({
            id: alertEvent.id,
            channel: rule.channel,
            payload: { subject, html, recipientUserId: rule.userId, recipientEmail: rule.user?.email },
            alertType: 'HOT_LEAD',
          });
        } catch (err) {
          logger.error(
            { ruleId: rule.id, opportunityId, err: String(err) },
            'checkHotLeadAlert: failed to process rule',
          );
        }
      }
    } catch (err) {
      logger.error({ opportunityId, err: String(err) }, 'checkHotLeadAlert: unexpected error');
    }
  }

  // -------------------------------------------------------------------
  // Check auction approaching alerts (run daily via cron)
  // -------------------------------------------------------------------

  async checkAuctionAlerts(): Promise<void> {
    try {
      const rules = await prisma.alertRule.findMany({
        where: { isActive: true, alertType: 'AUCTION_APPROACHING' },
        include: { user: { select: { email: true } } },
      });

      if (rules.length === 0) return;

      const now = new Date();

      // Find opportunities at 14, 7, 3, 1 day milestones
      for (const daysOut of AUCTION_MILESTONES) {
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + daysOut);

        const dayStart = new Date(targetDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(targetDate);
        dayEnd.setHours(23, 59, 59, 999);

        const opportunities = await prisma.opportunity.findMany({
          where: {
            isActive: true,
            auctionDate: { gte: dayStart, lte: dayEnd },
          },
          include: { property: true },
        });

        for (const opp of opportunities) {
          for (const rule of rules) {
            try {
              if (!this.matchesFilters(opp, rule)) continue;

              const templateData = { ...this.buildTemplateData(opp), daysUntilSale: daysOut };
              const { subject, html } = getAlertEmailHtml('AUCTION_APPROACHING', templateData);

              const alertEvent = await prisma.alertEvent.create({
                data: {
                  alertRuleId: rule.id,
                  opportunityId: opp.id,
                  alertType: 'AUCTION_APPROACHING',
                  channel: rule.channel,
                  payload: { subject, html, daysUntilAuction: daysOut } as any,
                  status: 'PENDING',
                },
              });

              await dispatcher.dispatch({
                id: alertEvent.id,
                channel: rule.channel,
                payload: { subject, html, recipientUserId: rule.userId, recipientEmail: rule.user?.email },
                alertType: 'AUCTION_APPROACHING',
              });
            } catch (err) {
              logger.error(
                { ruleId: rule.id, opportunityId: opp.id, err: String(err) },
                'checkAuctionAlerts: failed to dispatch',
              );
            }
          }
        }
      }
    } catch (err) {
      logger.error({ err: String(err) }, 'checkAuctionAlerts: unexpected error');
    }
  }

  // -------------------------------------------------------------------
  // Check status change alerts
  // -------------------------------------------------------------------

  async checkStatusChangeAlert(
    opportunityId: string,
    oldStage: string,
    newStage: string,
  ): Promise<void> {
    try {
      const opportunity = await prisma.opportunity.findUnique({
        where: { id: opportunityId },
        include: { property: true },
      });

      if (!opportunity) return;

      const rules = await prisma.alertRule.findMany({
        where: { isActive: true, alertType: 'STATUS_CHANGED' },
        include: { user: { select: { email: true } } },
      });

      for (const rule of rules) {
        try {
          if (!this.matchesFilters(opportunity, rule)) continue;

          const templateData = { ...this.buildTemplateData(opportunity), oldStage, newStage };
          const { subject, html } = getAlertEmailHtml('STATUS_CHANGED', templateData);

          const alertEvent = await prisma.alertEvent.create({
            data: {
              alertRuleId: rule.id,
              opportunityId: opportunity.id,
              alertType: 'STATUS_CHANGED',
              channel: rule.channel,
              payload: { subject, html, oldStage, newStage } as any,
              status: 'PENDING',
            },
          });

          await dispatcher.dispatch({
            id: alertEvent.id,
            channel: rule.channel,
            payload: { subject, html, recipientUserId: rule.userId, recipientEmail: rule.user?.email },
            alertType: 'STATUS_CHANGED',
          });
        } catch (err) {
          logger.error(
            { ruleId: rule.id, opportunityId, err: String(err) },
            'checkStatusChangeAlert: failed to process rule',
          );
        }
      }
    } catch (err) {
      logger.error({ opportunityId, err: String(err) }, 'checkStatusChangeAlert: unexpected error');
    }
  }

  // -------------------------------------------------------------------
  // Generate daily digest (run daily via cron)
  // -------------------------------------------------------------------

  async generateDailyDigest(): Promise<void> {
    try {
      const rules = await prisma.alertRule.findMany({
        where: { isActive: true, alertType: 'DAILY_DIGEST' },
        include: { user: { select: { id: true, email: true } } },
      });

      if (rules.length === 0) return;

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Gather new opportunities from last 24 hours
      const recentOpportunities = await prisma.opportunity.findMany({
        where: {
          isActive: true,
          createdAt: { gte: since },
        },
        include: { property: true },
        orderBy: { flipScore: 'desc' },
      });

      if (recentOpportunities.length === 0) {
        logger.info('generateDailyDigest: no new opportunities in last 24h');
        return;
      }

      for (const rule of rules) {
        try {
          // Filter to only matching opportunities for this rule
          const matches = recentOpportunities.filter((opp) =>
            this.matchesFilters(opp, rule),
          );

          if (matches.length === 0) continue;

          const digestOpportunities = matches.map((opp) => this.buildTemplateData(opp));
          const templateData = { opportunities: digestOpportunities, count: matches.length };
          const { subject, html } = getAlertEmailHtml('DAILY_DIGEST', templateData);

          const alertEvent = await prisma.alertEvent.create({
            data: {
              alertRuleId: rule.id,
              alertType: 'DAILY_DIGEST',
              channel: rule.channel,
              payload: { subject, html, matchCount: matches.length } as any,
              status: 'PENDING',
            },
          });

          await dispatcher.dispatch({
            id: alertEvent.id,
            channel: rule.channel,
            payload: { subject, html, recipientUserId: rule.userId, recipientEmail: rule.user?.email },
            alertType: 'DAILY_DIGEST',
          });
        } catch (err) {
          logger.error(
            { ruleId: rule.id, err: String(err) },
            'generateDailyDigest: failed to process rule',
          );
        }
      }
    } catch (err) {
      logger.error({ err: String(err) }, 'generateDailyDigest: unexpected error');
    }
  }

  // -------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------

  /**
   * Match opportunity against alert rule filters.
   * Checks: countyFilter, scoreThreshold, distressStages, propertyTypes,
   * ARV range, margin range.
   */
  private matchesFilters(opportunity: any, rule: any): boolean {
    const property = opportunity.property;
    const filters = (rule.filters ?? {}) as Record<string, any>;

    // County filter (from dedicated column on AlertRule)
    if (rule.countyFilter && rule.countyFilter.length > 0) {
      const normalised = rule.countyFilter.map((c: string) => c.toLowerCase().trim());
      if (!property?.county || !normalised.includes(property.county.toLowerCase().trim())) {
        return false;
      }
    }

    // Score threshold
    if (rule.scoreThreshold != null && opportunity.flipScore < rule.scoreThreshold) {
      return false;
    }

    // Distress stage filter (from JSON filters)
    if (filters.distressStages && filters.distressStages.length > 0) {
      if (!filters.distressStages.includes(opportunity.distressStage)) {
        return false;
      }
    }

    // Property type filter
    if (filters.propertyTypes && filters.propertyTypes.length > 0) {
      if (!property?.propertyType || !filters.propertyTypes.includes(property.propertyType)) {
        return false;
      }
    }

    // ARV range
    if (filters.minARV != null && (opportunity.estimatedARV == null || opportunity.estimatedARV < filters.minARV)) {
      return false;
    }
    if (filters.maxARV != null && (opportunity.estimatedARV == null || opportunity.estimatedARV > filters.maxARV)) {
      return false;
    }

    // Margin range (projected net margin percentage)
    if (filters.minMargin != null && (opportunity.projectedNetMargin == null || opportunity.projectedNetMargin < filters.minMargin)) {
      return false;
    }
    if (filters.maxMargin != null && (opportunity.projectedNetMargin == null || opportunity.projectedNetMargin > filters.maxMargin)) {
      return false;
    }

    return true;
  }

  /**
   * Build a flat template-friendly data object from an opportunity + property.
   */
  private buildTemplateData(opportunity: any): Record<string, any> {
    const property = opportunity.property ?? {};
    return {
      opportunityId: opportunity.id,
      address: property.streetAddress ?? property.normalizedAddress ?? 'Unknown',
      county: property.county ?? '',
      propertyType: property.propertyType ?? '',
      flipScore: opportunity.flipScore ?? 0,
      estimatedARV: opportunity.estimatedARV,
      estimatedRehabCost: opportunity.estimatedRehabCost,
      maxAllowableOffer: opportunity.maxAllowableOffer,
      targetPurchasePrice: opportunity.targetPurchasePrice,
      projectedGrossMargin: opportunity.projectedGrossMargin,
      projectedNetMargin: opportunity.projectedNetMargin,
      projectedDaysToFlip: opportunity.projectedDaysToFlip,
      auctionDate: opportunity.auctionDate,
      daysUntilSale: opportunity.daysUntilSale,
      distressStage: opportunity.distressStage,
      pipelineStage: opportunity.pipelineStage,
    };
  }
}

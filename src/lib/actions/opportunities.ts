'use server';

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import type { PipelineStage } from '@prisma/client';

// ---------------------------------------------------------------------------
// Placeholder user resolution for server actions
// ---------------------------------------------------------------------------

const PLACEHOLDER_USER_ID = 'system';

async function resolveUserId(): Promise<string> {
  // TODO: Replace with real auth – e.g. getServerSession(authOptions)
  return PLACEHOLDER_USER_ID;
}

// ---------------------------------------------------------------------------
// updatePipelineStage
// ---------------------------------------------------------------------------

const PipelineStageEnum = z.enum([
  'NEW',
  'REVIEWING',
  'DRIVE_BY',
  'UNDERWRITING',
  'BID_READY',
  'PASSED',
  'WON',
  'DISPOSITION',
]);

export async function updatePipelineStage(
  opportunityId: string,
  stage: PipelineStage,
) {
  try {
    const validatedStage = PipelineStageEnum.parse(stage);

    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
    });

    if (!opportunity) {
      return { error: 'Opportunity not found' };
    }

    const updated = await prisma.opportunity.update({
      where: { id: opportunityId },
      data: { pipelineStage: validatedStage as PipelineStage },
    });

    logger.info(
      { opportunityId, from: opportunity.pipelineStage, to: validatedStage },
      'Pipeline stage updated',
    );

    return { data: updated };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'updatePipelineStage failed');
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// addToWatchlist
// ---------------------------------------------------------------------------

export async function addToWatchlist(propertyId: string) {
  try {
    z.string().min(1).parse(propertyId);
    const userId = await resolveUserId();

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) {
      return { error: 'Property not found' };
    }

    const item = await prisma.watchlistItem.upsert({
      where: {
        userId_propertyId: { userId, propertyId },
      },
      update: {},
      create: {
        userId,
        propertyId,
      },
    });

    logger.info({ userId, propertyId }, 'Added to watchlist via server action');

    return { data: item };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'addToWatchlist failed');
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// removeFromWatchlist
// ---------------------------------------------------------------------------

export async function removeFromWatchlist(propertyId: string) {
  try {
    z.string().min(1).parse(propertyId);
    const userId = await resolveUserId();

    const existing = await prisma.watchlistItem.findUnique({
      where: {
        userId_propertyId: { userId, propertyId },
      },
    });

    if (!existing) {
      return { error: 'Watchlist item not found' };
    }

    await prisma.watchlistItem.delete({
      where: {
        userId_propertyId: { userId, propertyId },
      },
    });

    logger.info({ userId, propertyId }, 'Removed from watchlist via server action');

    return { data: { removed: true } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'removeFromWatchlist failed');
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// addNote
// ---------------------------------------------------------------------------

export async function addNote(propertyId: string, content: string) {
  try {
    z.string().min(1).parse(propertyId);
    z.string().min(1).max(10000).parse(content);
    const userId = await resolveUserId();

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) {
      return { error: 'Property not found' };
    }

    const note = await prisma.note.create({
      data: {
        propertyId,
        userId,
        content,
      },
    });

    logger.info({ userId, propertyId, noteId: note.id }, 'Note added via server action');

    return { data: note };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'addNote failed');
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// addTag
// ---------------------------------------------------------------------------

export async function addTag(propertyId: string, tagName: string) {
  try {
    z.string().min(1).parse(propertyId);
    z.string().min(1).max(50).parse(tagName);

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: { tags: true },
    });

    if (!property) {
      return { error: 'Property not found' };
    }

    // Check if tag is already applied
    const alreadyTagged = property.tags.some(
      (t) => t.name.toLowerCase() === tagName.toLowerCase(),
    );

    if (alreadyTagged) {
      return { data: property.tags };
    }

    // Upsert the tag (create if it does not exist)
    const tag = await prisma.tag.upsert({
      where: { name: tagName },
      update: {},
      create: { name: tagName },
    });

    // Connect tag to property
    await prisma.property.update({
      where: { id: propertyId },
      data: {
        tags: { connect: { id: tag.id } },
      },
    });

    logger.info({ propertyId, tagName }, 'Tag added via server action');

    return { data: tag };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'addTag failed');
    return { error: message };
  }
}

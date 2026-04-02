import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Placeholder user resolution
// In production this would come from auth (e.g. NextAuth session).
// ---------------------------------------------------------------------------

const PLACEHOLDER_USER_ID = 'system';

async function resolveUserId(_req: NextRequest): Promise<string> {
  // TODO: Replace with real auth – e.g. getServerSession(authOptions)
  return PLACEHOLDER_USER_ID;
}

// ---------------------------------------------------------------------------
// GET /api/watchlist – List user's watchlist items with property data
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);

    const items = await prisma.watchlistItem.findMany({
      where: { userId },
      include: {
        property: {
          include: {
            opportunity: {
              select: {
                id: true,
                flipScore: true,
                distressStage: true,
                pipelineStage: true,
                auctionDate: true,
              },
            },
          },
        },
      },
      orderBy: { addedAt: 'desc' },
    });

    return NextResponse.json({ data: items });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'GET /api/watchlist failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/watchlist – Add property to watchlist
// ---------------------------------------------------------------------------

const AddToWatchlistSchema = z.object({
  propertyId: z.string().min(1),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    const body = await req.json();
    const parsed = AddToWatchlistSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { propertyId, notes } = parsed.data;

    // Ensure property exists
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) {
      return NextResponse.json(
        { error: 'Property not found' },
        { status: 404 },
      );
    }

    // Upsert to handle duplicate-add gracefully
    const item = await prisma.watchlistItem.upsert({
      where: {
        userId_propertyId: { userId, propertyId },
      },
      update: { notes: notes ?? undefined },
      create: {
        userId,
        propertyId,
        notes,
      },
      include: { property: true },
    });

    logger.info({ userId, propertyId }, 'Property added to watchlist');

    return NextResponse.json({ data: item }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'POST /api/watchlist failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/watchlist – Remove property from watchlist
// ---------------------------------------------------------------------------

const RemoveFromWatchlistSchema = z.object({
  propertyId: z.string().min(1),
});

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    const body = await req.json();
    const parsed = RemoveFromWatchlistSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { propertyId } = parsed.data;

    const existing = await prisma.watchlistItem.findUnique({
      where: {
        userId_propertyId: { userId, propertyId },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Watchlist item not found' },
        { status: 404 },
      );
    }

    await prisma.watchlistItem.delete({
      where: {
        userId_propertyId: { userId, propertyId },
      },
    });

    logger.info({ userId, propertyId }, 'Property removed from watchlist');

    return NextResponse.json({ data: { removed: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'DELETE /api/watchlist failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}

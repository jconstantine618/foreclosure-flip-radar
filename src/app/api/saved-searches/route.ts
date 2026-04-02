import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Placeholder user resolution
// ---------------------------------------------------------------------------

const PLACEHOLDER_USER_ID = 'system';

async function resolveUserId(_req: NextRequest): Promise<string> {
  return PLACEHOLDER_USER_ID;
}

// ---------------------------------------------------------------------------
// GET /api/saved-searches – List user's saved searches
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);

    const searches = await prisma.savedSearch.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ data: searches });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'GET /api/saved-searches failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/saved-searches – Create a new saved search
// ---------------------------------------------------------------------------

const CreateSavedSearchSchema = z.object({
  name: z.string().min(1).max(200),
  filters: z.record(z.unknown()),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    const body = await req.json();
    const parsed = CreateSavedSearchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { name, filters } = parsed.data;

    const search = await prisma.savedSearch.create({
      data: {
        userId,
        name,
        filters: JSON.parse(JSON.stringify(filters)),
      },
    });

    logger.info({ userId, searchId: search.id }, 'Saved search created');

    return NextResponse.json({ data: search }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'POST /api/saved-searches failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PUT /api/saved-searches – Update a saved search
// ---------------------------------------------------------------------------

const UpdateSavedSearchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  filters: z.record(z.unknown()).optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    const body = await req.json();
    const parsed = UpdateSavedSearchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { id, name, filters } = parsed.data;

    // Verify ownership
    const existing = await prisma.savedSearch.findUnique({ where: { id } });

    if (!existing || existing.userId !== userId) {
      return NextResponse.json(
        { error: 'Saved search not found' },
        { status: 404 },
      );
    }

    const updated = await prisma.savedSearch.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(filters !== undefined && { filters: JSON.parse(JSON.stringify(filters)) }),
      },
    });

    logger.info({ userId, searchId: id }, 'Saved search updated');

    return NextResponse.json({ data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'PUT /api/saved-searches failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/saved-searches – Delete a saved search
// ---------------------------------------------------------------------------

const DeleteSavedSearchSchema = z.object({
  id: z.string().min(1),
});

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    const body = await req.json();
    const parsed = DeleteSavedSearchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { id } = parsed.data;

    const existing = await prisma.savedSearch.findUnique({ where: { id } });

    if (!existing || existing.userId !== userId) {
      return NextResponse.json(
        { error: 'Saved search not found' },
        { status: 404 },
      );
    }

    await prisma.savedSearch.delete({ where: { id } });

    logger.info({ userId, searchId: id }, 'Saved search deleted');

    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'DELETE /api/saved-searches failed');
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 },
    );
  }
}

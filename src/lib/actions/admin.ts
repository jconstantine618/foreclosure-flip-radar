'use server';

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { FlipScoreWeightsSchema } from '@/lib/scoring';
import { providerRegistry, initializeProviders } from '@/lib/providers';

// ---------------------------------------------------------------------------
// updateFlipScoreWeights
// ---------------------------------------------------------------------------

export async function updateFlipScoreWeights(
  weights: Record<string, number>,
) {
  try {
    // Validate weights shape using the scoring module's schema
    const validated = FlipScoreWeightsSchema.parse(weights);

    await prisma.adminSetting.upsert({
      where: { key: 'flip_score_weights' },
      update: { value: validated as any },
      create: { key: 'flip_score_weights', value: validated as any },
    });

    logger.info({ weights: validated }, 'Flip score weights updated');
    revalidatePath('/admin');

    return { data: validated };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'updateFlipScoreWeights failed');
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// updateFeatureFlag
// ---------------------------------------------------------------------------

export async function updateFeatureFlag(key: string, value: boolean) {
  try {
    z.string().min(1).max(100).parse(key);
    z.boolean().parse(value);

    const settingKey = `flag:${key}`;

    await prisma.adminSetting.upsert({
      where: { key: settingKey },
      update: { value: value as any },
      create: { key: settingKey, value: value as any },
    });

    logger.info({ key, value }, 'Feature flag updated');
    revalidatePath('/admin');

    return { data: { key, value } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'updateFeatureFlag failed');
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// updateProviderConfig
// ---------------------------------------------------------------------------

const ProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  rateLimit: z.number().int().min(1).optional(),
  enabled: z.boolean().optional(),
});

export async function updateProviderConfig(
  provider: string,
  config: object,
) {
  try {
    z.string().min(1).parse(provider);
    const validated = ProviderConfigSchema.parse(config);

    const settingKey = `provider:${provider.toLowerCase()}`;

    // Merge with existing config
    const existing = await prisma.adminSetting.findUnique({
      where: { key: settingKey },
    });

    const currentConfig = (existing?.value as Record<string, unknown>) ?? {};
    const merged = { ...currentConfig, ...validated };

    await prisma.adminSetting.upsert({
      where: { key: settingKey },
      update: { value: merged as any },
      create: { key: settingKey, value: merged as any },
    });

    logger.info(
      { provider, updatedFields: Object.keys(validated) },
      'Provider config updated',
    );
    revalidatePath('/admin');

    return { data: merged };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'updateProviderConfig failed');
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// triggerSync
// ---------------------------------------------------------------------------

export async function triggerSync(provider: string, counties: string[]) {
  try {
    z.string().min(1).parse(provider);
    z.array(z.string().min(1)).min(1).parse(counties);

    // Ensure providers are initialised
    initializeProviders();

    const providerName = provider === 'BATCHDATA' ? 'BatchData' : 'ATTOM';
    const propertyProvider = providerRegistry.getPropertyProvider(providerName);

    if (!propertyProvider) {
      return { error: `Provider ${provider} is not configured or available` };
    }

    // Create sync job records
    const jobs = await Promise.all(
      counties.map((county) =>
        prisma.providerSyncJob.create({
          data: {
            provider: provider as any,
            county,
            status: 'PENDING',
          },
        }),
      ),
    );

    const jobIds = jobs.map((j) => j.id);

    // Fire-and-forget: run each county sync asynchronously
    for (const job of jobs) {
      (async () => {
        try {
          await prisma.providerSyncJob.update({
            where: { id: job.id },
            data: { status: 'RUNNING', startedAt: new Date() },
          });

          const startMs = Date.now();

          const results = await propertyProvider.searchProperties({
            county: job.county ?? '',
            page: 1,
            limit: 100,
          });

          const durationMs = Date.now() - startMs;

          await prisma.providerSyncJob.update({
            where: { id: job.id },
            data: {
              status: 'COMPLETED',
              recordsFound: results.total,
              recordsProcessed: results.properties.length,
              completedAt: new Date(),
              duration: durationMs,
            },
          });

          logger.info(
            { jobId: job.id, county: job.county, provider, records: results.total },
            'Provider sync completed (server action)',
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error({ jobId: job.id, err: msg }, 'Provider sync failed (server action)');

          await prisma.providerSyncJob
            .update({
              where: { id: job.id },
              data: {
                status: 'FAILED',
                errors: [msg],
                completedAt: new Date(),
              },
            })
            .catch(() => {});
        }
      })();
    }

    logger.info({ provider, counties, jobIds }, 'Sync triggered via server action');

    return { data: { jobIds, status: 'STARTED' } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'triggerSync failed');
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// Helper read functions (preserved from original)
// ---------------------------------------------------------------------------

export async function getFeatureFlag(key: string): Promise<boolean> {
  const setting = await prisma.adminSetting.findUnique({
    where: { key: `flag:${key}` },
  });
  return (setting?.value as boolean) ?? false;
}

export async function getAdminSetting(key: string): Promise<any> {
  const setting = await prisma.adminSetting.findUnique({
    where: { key },
  });
  return setting?.value ?? null;
}

import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Prisma Client singleton (standard Next.js pattern)
//
// In development, Next.js hot-reloads cause modules to re-execute, creating
// multiple PrismaClient instances. Using globalThis ensures a single instance
// persists across reloads.
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;

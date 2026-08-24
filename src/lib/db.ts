// SERVER-ONLY BOUNDARY:
//   `db.ts` instantiates `PrismaClient`. Prisma ships a Node-only runtime
//   and exposes a `.prisma/client/index-browser` stub only when the client
//   is generated in edge/browser mode — which we don't use. Importing this
//   file from a Client Component pulls Prisma into the browser bundle and
//   breaks the Vercel build with:
//     "Module not found: Can't resolve '.prisma/client/index-browser'"
//   The `server-only` import below makes any such leak fail at build time
//   with a clear, actionable error message instead of a cryptic Webpack
//   resolution error.
import "server-only";

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

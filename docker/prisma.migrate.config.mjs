// Config για `prisma migrate deploy` μέσα στο runtime image (βλ. docker/start.sh).
// Ξεχωριστό από το /app/prisma.config.ts, γιατί το standalone image δεν έχει dotenv/tsx.
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: '/app/prisma/schema.prisma',
  datasource: { url: env('DATABASE_URL') },
})

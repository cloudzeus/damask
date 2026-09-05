FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --include=dev: ο builder (Coolify) τρέχει το build με NODE_ENV=production, οπότε
# ένα σκέτο `npm ci` ΠΑΡΑΛΕΙΠΕΙ τα devDependencies — και το `next build` τα χρειάζεται
# στο build stage (@tailwindcss/postcss για το globals.css, tailwindcss, typescript).
# Το --include=dev υπερισχύει του NODE_ENV/omit. Το runtime image (standalone) δεν
# τα κουβαλάει ούτως ή άλλως, άρα δεν φουσκώνει το τελικό image.
RUN npm ci --include=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
# pg_dump/pg_restore για τα daily DB backups (src/lib/backup.ts) — ταιριάζει με τον
# επαληθευμένο live server (PostgreSQL 16.14). Χωρίς αυτό, resolvePgBinary() πέφτει
# στο bare "pg_dump"/"pg_restore" που δεν υπάρχει καθόλου στο image → κάθε backup
# αποτυγχάνει με φιλικό ελληνικό ENOENT μήνυμα (βλ. runBackup) αλλά ποτέ δεν τρέχει.
RUN apk add --no-cache postgresql16-client
# Prisma CLI (+dotenv) global για `migrate deploy` στο startup — ο Dockerfile
# αλλιώς δεν εφαρμόζει ΠΟΤΕ migrations σε prod. NODE_PATH ώστε το prisma.config.ts
# (φορτώνεται από το global prisma) να βρίσκει τα 'dotenv/config' + 'prisma/config'.
RUN npm i -g prisma@7.8.0 dotenv
ENV NODE_PATH=/usr/local/lib/node_modules
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
EXPOSE 3000
# migrate deploy είναι non-fatal: εφαρμόζει pending migrations αλλά ΔΕΝ μπλοκάρει
# το startup αν αποτύχει (σήμερα δεν τρέχει καθόλου, οπότε «attempt + continue»
# δεν χειροτερεύει τίποτα). Δες το πρώτο deploy log για επιβεβαίωση.
CMD ["sh", "-c", "prisma migrate deploy || echo 'WARN: prisma migrate deploy failed — έλεγξε DB/migrations'; node server.js"]

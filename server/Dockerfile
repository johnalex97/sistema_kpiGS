FROM node:20-alpine AS build
WORKDIR /app
ARG DATABASE_URL=postgresql://docker:docker@localhost:5432/geek_solution?schema=public
ENV DATABASE_URL=${DATABASE_URL}
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated
COPY --from=build /app/prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]

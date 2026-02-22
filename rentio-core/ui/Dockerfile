FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:24-bookworm-slim AS builder
WORKDIR /app
ARG NEXT_PUBLIC_CORE_API_URL=http://localhost:18081
ENV NEXT_PUBLIC_CORE_API_URL=$NEXT_PUBLIC_CORE_API_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]

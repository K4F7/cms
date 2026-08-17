FROM node:20-bookworm-slim

WORKDIR /opt/app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV SERVE_ADMIN_PANEL=false
ENV HOST=127.0.0.1
ENV PORT=1337

EXPOSE 1337
CMD ["npm", "run", "start"]

FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm i --only=production

COPY index.js ./

EXPOSE 3000
CMD ["node", "index.js"]
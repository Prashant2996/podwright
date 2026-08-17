FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY client/package*.json ./client/
RUN cd client && npm ci

COPY . .
RUN cd client && npm run build

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server/index.js"]

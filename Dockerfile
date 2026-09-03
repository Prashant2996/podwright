# --- Build stage: build the client ---
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY client/package*.json ./client/
RUN cd client && npm ci

COPY . .
RUN cd client && npm run build

# --- Runtime stage ---
FROM node:20-alpine

WORKDIR /app

# Install kubectl and helm (required by cleanup, apply, exec, port-forward, cronjob trigger)
RUN apk add --no-cache curl bash \
    && KUBECTL_VERSION="$(curl -L -s https://dl.k8s.io/release/stable.txt)" \
    && curl -L -o /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')/kubectl" \
    && chmod +x /usr/local/bin/kubectl \
    && curl -L https://get.helm.sh/helm-v3.16.2-linux-$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz | tar xz \
    && mv linux-*/helm /usr/local/bin/helm \
    && rm -rf linux-* \
    && chmod +x /usr/local/bin/helm

# Install production server dependencies
COPY package*.json ./
RUN npm ci --production

# Copy server code and the built client
COPY server ./server
COPY --from=build /app/client/dist ./client/dist

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server/index.js"]

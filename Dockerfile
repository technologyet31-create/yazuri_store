FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --only=production; else npm install --only=production; fi

# Copy app source
COPY . .

# Prepare writable data directory and permissions for non-root user
RUN addgroup -g 1001 -S nodejs \
 && adduser -S nextjs -u 1001 \
 && mkdir -p /app/data \
 && chown -R 1001:1001 /app
USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
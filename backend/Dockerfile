FROM ghcr.io/puppeteer/puppeteer:latest

# Set environment variables
# 1. Do NOT skip download. Let Puppeteer download the correct Chrome version.
# 2. Set cache dir to a folder inside the app so we can manage permissions.
ENV PUPPETEER_CACHE_DIR=/usr/src/app/.cache \
    NODE_ENV=production

WORKDIR /usr/src/app

# Switch to root to install dependencies
USER root

COPY package.json ./
# Install dependencies AND download Chrome to .cache
RUN npm install

COPY . .

# Ensure pptruser owns the app and the downloaded browser cache
RUN chown -R pptruser:pptruser /usr/src/app

# Switch back to non-privileged user for security
USER pptruser

EXPOSE 3001

CMD [ "node", "server.js" ]
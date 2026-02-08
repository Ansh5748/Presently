FROM ghcr.io/puppeteer/puppeteer:latest

# Set environment variables
# Skip downloading Chrome since we use the installed one
# Set executable path for Puppeteer to find Chrome
# Set NODE_ENV to production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    NODE_ENV=production

WORKDIR /usr/src/app

# Switch to root to install dependencies
USER root

COPY package*.json ./
RUN npm install

COPY . .

# Switch back to non-privileged user for security
USER pptruser

EXPOSE 3001

CMD [ "node", "server.js" ]
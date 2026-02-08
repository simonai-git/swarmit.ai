FROM ghcr.io/simonai-git/swarmit-base:latest

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Testing tools
RUN npm install -g typescript jest vitest playwright \
    @testing-library/jest-dom c8 nyc \
    && npm cache clean --force

# Install Playwright browsers for E2E
RUN npx playwright install --with-deps chromium

ENV NODE_ENV=test

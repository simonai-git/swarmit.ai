FROM ghcr.io/simonai-git/swarmit-base:latest

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Frontend tools
RUN npm install -g typescript prettier eslint \
    next create-next-app tailwindcss postcss autoprefixer \
    && npm cache clean --force

# Install Playwright browsers (chromium only, to save space)
RUN npx playwright install --with-deps chromium

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

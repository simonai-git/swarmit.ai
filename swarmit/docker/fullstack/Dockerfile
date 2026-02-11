FROM ghcr.io/simonai-git/swarmit-base:latest
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 postgresql-client redis-tools \
    libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g typescript ts-node nodemon prettier eslint \
    next create-next-app tailwindcss postcss autoprefixer \
    prisma drizzle-kit
ENV NODE_ENV=development

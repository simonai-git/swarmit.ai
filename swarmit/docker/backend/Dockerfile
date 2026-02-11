FROM ghcr.io/simonai-git/swarmit-base:latest
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 postgresql-client redis-tools \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g typescript ts-node prisma drizzle-kit nodemon
ENV NODE_ENV=development

FROM ghcr.io/simonai-git/swarmit-base:latest

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Global dev tools
RUN npm install -g typescript ts-node nodemon prettier eslint \
    && npm cache clean --force

ENV NODE_ENV=development

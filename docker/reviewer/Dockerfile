FROM ghcr.io/simonai-git/swarmit-base:latest

# Static analysis tools
RUN npm install -g typescript eslint prettier \
    @typescript-eslint/parser @typescript-eslint/eslint-plugin \
    depcheck madge \
    && npm cache clean --force

ENV NODE_ENV=development

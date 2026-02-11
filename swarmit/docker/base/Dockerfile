FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl wget ca-certificates openssh-client jq \
    && rm -rf /var/lib/apt/lists/*
RUN git config --global user.email "agent@swarmit.ai" \
    && git config --global user.name "Swarmit Agent"
WORKDIR /workspace

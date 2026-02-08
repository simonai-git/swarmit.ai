FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    wget \
    ca-certificates \
    openssh-client \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Pre-configure git for agents
RUN git config --system user.email "agent@swarmit.ai" \
    && git config --system user.name "Swarmit Agent"

# Create workspace directory
RUN mkdir -p /workspace && chmod 777 /workspace
WORKDIR /workspace

# Keep container alive
CMD ["tail", "-f", "/dev/null"]

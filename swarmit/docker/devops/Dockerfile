FROM ghcr.io/simonai-git/swarmit-base:latest
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential docker.io unzip && rm -rf /var/lib/apt/lists/*
RUN curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
    && install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
RUN curl -fsSL https://releases.hashicorp.com/terraform/1.7.5/terraform_1.7.5_linux_amd64.zip -o terraform.zip \
    && unzip terraform.zip -d /usr/local/bin && rm terraform.zip
RUN npm install -g typescript
ENV NODE_ENV=production
ENV CI=true

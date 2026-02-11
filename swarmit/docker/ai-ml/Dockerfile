FROM ghcr.io/simonai-git/swarmit-base:latest
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*
RUN python3 -m pip install --break-system-packages \
    numpy pandas scikit-learn torch transformers datasets \
    jupyter notebook langchain openai anthropic
RUN npm install -g typescript ts-node
ENV NODE_ENV=development

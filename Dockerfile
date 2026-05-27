FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV CI=true

# Install base tooling, Tcl runtime, Xvfb, and Electron runtime libraries used by @vscode/test-electron.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        gnupg \
        tcl \
        xvfb \
        libasound2t64 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libglib2.0-0 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libx11-6 \
        libx11-xcb1 \
        libxcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxkbcommon0 \
        libxrandr2 \
        libxrender1 \
        libxshmfence1 \
        libxss1 \
        libxtst6 \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js from NodeSource on top of a fresh Ubuntu base.
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build and execute both unit and integration tests.
CMD ["bash", "-lc", "npm run compile && npm test && xvfb-run -a npm run test:integration"]
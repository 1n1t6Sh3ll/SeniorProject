FROM node:20-slim

# Install build tools for native dependencies
RUN apt-get update && apt-get install -y \
    python3 make g++ curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./
COPY web/package.json web/package-lock.json* ./web/

# Install dependencies
RUN npm ci --ignore-scripts 2>/dev/null || npm install
RUN cd web && npm ci 2>/dev/null || cd web && npm install

# Copy source code
COPY . .

# Compile contracts (artifacts are deterministic)
RUN npx hardhat compile

# Copy entrypoint script and make executable
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose ports: 3000 (frontend + API), 8545 (Hardhat RPC)
EXPOSE 3000 8545

ENTRYPOINT ["/docker-entrypoint.sh"]

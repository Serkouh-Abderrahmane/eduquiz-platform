FROM node:20-slim

WORKDIR /app

# Install dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --production

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p uploads/images uploads/audio database

EXPOSE 3000

CMD ["npm", "start"]

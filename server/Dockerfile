FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --omit=dev

# Copy server code
COPY index.js ./

# Expose port
EXPOSE 4444

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4444
ENV REDIS_URL=redis://redis:6379

# Start server
CMD ["npm", "start"]

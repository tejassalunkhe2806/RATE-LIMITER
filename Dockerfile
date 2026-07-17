# Use lightweight node image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy root dependency configs
COPY package*.json ./

# Install backend dependencies
RUN npm install

# Copy frontend dependency configs
COPY frontend/package*.json ./frontend/

# Install frontend dependencies
RUN npm install --prefix frontend

# Copy all files
COPY . .

# Compile React frontend static files
RUN npm run build --prefix frontend

# Expose port (Hugging Face Spaces expects the container to run on port 7860)
ENV PORT=7860
EXPOSE 7860

# Start Express server in production mode
CMD ["npm", "start"]

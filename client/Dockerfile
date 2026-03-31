# --- Stage 1: Build Stage ---
FROM node:18-alpine AS build

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy project files
COPY . .

# Build-time environment variable for Vite
# This will be replaced at build time
ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}

# Build the application
RUN npm run build

# --- Stage 2: Production Stage ---
FROM nginx:stable-alpine

# Copy the build output to Nginx's HTML directory
COPY --from=build /app/dist /usr/share/nginx/html

# Replace the default Nginx configuration
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Command to run Nginx
CMD ["nginx", "-g", "daemon off;"]

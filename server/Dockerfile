# Use Python 3.11 slim image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV CHATLOOM_SECRET_KEY dev-secret-key-123
ENV FLASK_APP app.py

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

# Initialize database
RUN python init_db.py

# Expose port
EXPOSE 5001

# Command to run the application
# We ensure the database is initialized on every start if needed
CMD python init_db.py && python app.py

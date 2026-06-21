FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libasound2 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies using uv
COPY pyproject.toml .
RUN pip install --no-cache-dir uv && uv pip install --system .

# Copy backend files
COPY agent.py server.py ./

# Expose ports:
# 8000 for FastAPI API/frontend server
# 8080 for Agent Worker CLI
EXPOSE 8000 8080

# Default command starts the FastAPI server
CMD ["python", "server.py"]

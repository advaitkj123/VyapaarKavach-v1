# Use Python base (lightweight)
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for layer caching
COPY Backend/requirements.txt .

# Install Python dependencies (no GPU torch for Cloud deployment)
RUN pip install --no-cache-dir \
    fastapi==0.109.0 \
    uvicorn[standard]==0.27.0 \
    httpx==0.26.0 \
    python-multipart==0.0.7 \
    python-jose[cryptography]==3.3.0 \
    passlib[bcrypt]==1.7.4 \
    pandas==2.1.4 \
    numpy==1.26.3 \
    scikit-learn==1.3.2 \
    xgboost==2.0.3 \
    networkx==3.2.1 \
    aiofiles==23.2.1 \
    python-dotenv==1.0.0

# Copy backend source
COPY Backend/ ./Backend/
COPY AI/ ./AI/

# Set Python path
ENV PYTHONPATH=/app/Backend

# Expose port (IBM Code Engine default)
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
    CMD curl -f http://localhost:8000/health || exit 1

# Run with uvicorn
CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "2", \
     "--log-level", "info"]

FROM pytorch/pytorch:2.0.0-cuda11.7-cudnn8-runtime

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY model_handler.py .
COPY config/ ./config/

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "model_handler:app", "--host", "0.0.0.0", "--port", "8000"]
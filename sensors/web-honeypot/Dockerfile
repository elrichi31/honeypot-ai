FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

# gosu drops privileges after fixing volume mount permissions at runtime
RUN apt-get update && apt-get install -y --no-install-recommends gosu && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chown -R app:app /app && \
    chmod +x /app/entrypoint.sh

EXPOSE 8080

# entrypoint.sh runs as root, chowns the mounted volume dir, then drops to app
ENTRYPOINT ["/app/entrypoint.sh"]

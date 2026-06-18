FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    # Gunicorn stamps its own "Server: gunicorn" header at the WSGI layer, which
    # contradicts the Apache/PHP identity the app advertises (gunicorn never serves
    # PHP — a dead giveaway). Gunicorn reads SERVER_SOFTWARE for that header, so
    # override it to match the facade. The app still sets the full Apache string.
    SERVER_SOFTWARE="Apache/2.4.57 (Ubuntu)"

WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chown -R app:app /app

USER app

EXPOSE 8080

# gunicorn for production-grade concurrency. Honeypot traffic is bursty and highly
# concurrent (scanners like gobuster open many simultaneous keep-alive connections),
# so use threaded workers + a deep listen backlog to avoid the kernel RST-ing
# connections when all sync workers are busy.
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "4", "--worker-class", "gthread", "--threads", "32", "--backlog", "2048", "--timeout", "30", "--worker-tmp-dir", "/tmp", "app:app"]

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chown -R app:app /app && \
    mkdir -p /var/log/web-honeypot && \
    chown app:app /var/log/web-honeypot

USER app

EXPOSE 8080

# gunicorn for production-grade concurrency. Honeypot traffic is bursty and highly
# concurrent (scanners like gobuster open many simultaneous keep-alive connections),
# so use threaded workers + a deep listen backlog to avoid the kernel RST-ing
# connections when all sync workers are busy.
CMD ["gunicorn", "--config", "gunicorn.conf.py", "app:app"]

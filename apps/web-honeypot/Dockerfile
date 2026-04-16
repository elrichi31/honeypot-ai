FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 80

# gunicorn for production-grade concurrency; 4 workers handles burst scans fine
CMD ["gunicorn", "--bind", "0.0.0.0:80", "--workers", "4", "--timeout", "30", "app:app"]

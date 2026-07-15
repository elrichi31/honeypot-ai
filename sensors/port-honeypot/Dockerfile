FROM python:3.12-alpine

RUN pip install --no-cache-dir websockets==13.1

WORKDIR /app
COPY . .

CMD ["python", "-u", "app.py"]

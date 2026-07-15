FROM python:3.12-alpine

RUN apk add --no-cache gcc musl-dev libffi-dev openssl-dev && \
    pip install --no-cache-dir impacket==0.12.0 websockets==13.1 && \
    apk del gcc musl-dev libffi-dev

WORKDIR /app
COPY . .

CMD ["python", "-u", "app.py"]

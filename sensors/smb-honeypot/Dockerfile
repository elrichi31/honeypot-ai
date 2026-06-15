FROM python:3.12-alpine

RUN apk add --no-cache gcc musl-dev libffi-dev openssl-dev && \
    pip install --no-cache-dir impacket==0.12.0 && \
    apk del gcc musl-dev libffi-dev

WORKDIR /app
COPY app.py .

CMD ["python", "-u", "app.py"]

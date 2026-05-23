FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpcap-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir opencanary

RUN mkdir -p /var/log/opencanary /etc/opencanary

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

FROM python:3.12-alpine

# Baked by publish-sensor-images.yml; reported in heartbeats so the dashboard
# can show which image version each fleet sensor is running (SENSOR_FLEET_UPDATES).
ARG GIT_SHA=dev
ENV SENSOR_IMAGE_VERSION=$GIT_SHA

RUN apk add --no-cache gcc musl-dev libffi-dev openssl-dev && \
    pip install --no-cache-dir impacket==0.12.0 websockets==13.1 && \
    apk del gcc musl-dev libffi-dev

WORKDIR /app
COPY . .

CMD ["python", "-u", "app.py"]

FROM python:3.12-alpine

# Baked by publish-sensor-images.yml; reported in heartbeats so the dashboard
# can show which image version each fleet sensor is running (SENSOR_FLEET_UPDATES).
ARG GIT_SHA=dev
ENV SENSOR_IMAGE_VERSION=$GIT_SHA

RUN pip install --no-cache-dir websockets==13.1

WORKDIR /app
COPY . .

CMD ["python", "-u", "app.py"]

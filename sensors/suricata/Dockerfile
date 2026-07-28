FROM jasonish/suricata:latest

# Baked by publish-sensor-images.yml; reported in heartbeats so the dashboard
# can show which image version each fleet sensor is running (SENSOR_FLEET_UPDATES).
ARG GIT_SHA=dev
ENV SENSOR_IMAGE_VERSION=$GIT_SHA

# Pre-fetch ET Open rules at build time so startup is instant
RUN suricata-update update-sources && \
    suricata-update enable-source et/open && \
    suricata-update && \
    test -f /var/lib/suricata/rules/suricata.rules && \
    echo "[suricata] ET Open rules downloaded OK"

COPY suricata.yaml /opt/suricata.yaml
COPY local.rules /var/lib/suricata/rules/local.rules
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER root
ENTRYPOINT ["/entrypoint.sh"]

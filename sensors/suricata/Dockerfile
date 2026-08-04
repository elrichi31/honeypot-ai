# Pinned: :latest moved to 8.0.6 on 2026-08-03 and that build exits 0 silently right
# after thread setup on the Contabo VPS, restart-looping forever. 8.0.4 runs fine.
FROM jasonish/suricata:8.0.4

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
# Staged outside /var/lib/suricata — the base image declares a VOLUME there, so a
# COPY into it is masked at runtime. entrypoint.sh installs it on every start.
COPY local.rules /opt/local.rules
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER root
ENTRYPOINT ["/entrypoint.sh"]

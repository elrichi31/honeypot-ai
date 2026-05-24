FROM jasonish/suricata:latest

# Pre-fetch ET Open rules at build time so startup is instant
RUN suricata-update update-sources && \
    suricata-update enable-source et/open && \
    suricata-update && \
    test -f /var/lib/suricata/rules/suricata.rules && \
    echo "[suricata] ET Open rules downloaded OK"

COPY suricata.yaml /opt/suricata.yaml
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER root
ENTRYPOINT ["/entrypoint.sh"]

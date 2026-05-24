FROM jasonish/suricata:7

# Pre-fetch ET Open rules at build time so startup is instant
RUN suricata-update update-sources --no-reload && \
    suricata-update enable-source et/open && \
    suricata-update --no-reload && \
    # Verify rules were downloaded
    test -f /var/lib/suricata/rules/suricata.rules && \
    echo "[suricata] ET Open rules downloaded OK"

COPY suricata.yaml /etc/suricata/suricata.yaml
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/var/log/suricata"]

ENTRYPOINT ["/entrypoint.sh"]

FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpcap-dev \
    build-essential \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Pin the version so the skin assets we fetch below (same tag) match this build.
RUN pip install --no-cache-dir opencanary==0.9.8

# The pip package ships the HTTP skins incompletely — the bundled basicLogin
# skin is missing redirect.html, so the HTTP module raises FileNotFoundError and
# 500s on every request, leaking that the node is fake. Pull the full http/skin
# tree (basicLogin + nasLogin, including nasLogin's static/ assets) from upstream
# into the installed package so all skins render real pages. Pinned to a tag for
# reproducibility.
RUN set -eux; \
    SKIN_DIR="$(python -c 'import opencanary, os; print(os.path.join(os.path.dirname(opencanary.__file__), "modules", "data", "http", "skin"))')"; \
    curl -fsSL -o /tmp/oc.tar.gz \
      "https://github.com/thinkst/opencanary/archive/refs/tags/v0.9.8.tar.gz"; \
    mkdir -p /tmp/oc && tar -xzf /tmp/oc.tar.gz -C /tmp/oc --strip-components=1; \
    cp -rf /tmp/oc/opencanary/modules/data/http/skin/. "$SKIN_DIR/"; \
    rm -rf /tmp/oc /tmp/oc.tar.gz; \
    test -f "$SKIN_DIR/nasLogin/index.html"

RUN mkdir -p /var/log/opencanary /etc/opencanary

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

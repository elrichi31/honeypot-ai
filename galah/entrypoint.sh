#!/bin/sh
# Read OpenAI API key from the dashboard config file if not already set via env.
# In single-host deployments the dashboard_data volume is mounted at /dashboard_data.
if [ -z "$LLM_API_KEY" ]; then
    cfg="${DASHBOARD_CONFIG_PATH:-/dashboard_data/config.json}"
    if [ -f "$cfg" ]; then
        key=$(jq -r '.openaiApiKey // empty' "$cfg" 2>/dev/null)
        if [ -n "$key" ]; then
            export LLM_API_KEY="$key"
        fi
    fi
fi

if [ -z "$LLM_API_KEY" ]; then
    echo "[galah] No OpenAI API key found. Set it in the dashboard Settings page or add OPENAI_API_KEY to your .env file." >&2
    exit 1
fi

exec ./galah "$@"

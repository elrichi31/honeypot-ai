"""Config persisted across a config.apply-triggered restart. Copy-don't-import
convention, same as control_agent.py."""
import json
import os


def load_override(path: str) -> dict:
    """{} if no config.apply has ever been applied."""
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return {}


def write_override(path: str, config: dict, config_hash: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.tmp{os.getpid()}"
    with open(tmp, "w") as f:
        json.dump({"config": config, "configHash": config_hash}, f)
    os.replace(tmp, path)

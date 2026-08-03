"""Run: python sensors/cowrie/test_userdb.py"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "_shared"))

spec = importlib.util.spec_from_file_location(
    "heartbeat", os.path.join(os.path.dirname(__file__), "heartbeat.py")
)
hb = importlib.util.module_from_spec(spec)
sys.modules["heartbeat"] = hb
spec.loader.exec_module(hb)


def lines(config):
    return [l for l in hb._generate_userdb(config).splitlines() if not l.startswith("#")]


def test_configured_credentials_win():
    out = lines({"usernames": ["root", "deploy"], "passwords": ["Sup3rSecret1", "Other9999"]})
    assert out == ["root:x:Sup3rSecret1", "root:x:Other9999",
                   "deploy:x:Sup3rSecret1", "deploy:x:Other9999"], out


def test_no_wildcard_ever():
    assert "*:x:*" not in hb._generate_userdb({"usernames": [], "passwords": []})


def test_colon_values_dropped():
    out = lines({"usernames": ["ro:ot", "admin"], "passwords": ["Pass:word1", "Good12345"]})
    assert out == ["admin:x:Good12345"], out


def test_missing_config_falls_back_to_defaults():
    out = lines({})
    assert len(out) == len(hb.DEFAULT_USERNAMES) * len(hb.DEFAULT_PASSWORDS), len(out)
    assert out[0] == f"{hb.DEFAULT_USERNAMES[0]}:x:{hb.DEFAULT_PASSWORDS[0]}"


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok  {name}")
    print("all passed")

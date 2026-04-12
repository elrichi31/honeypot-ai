import json

file_path = "cowrie.json"

events = []

with open(file_path, "r", errors="ignore") as f:
    for line in f:
        try:
            log = json.loads(line)

            event = log.get("eventid")
            timestamp = log.get("timestamp")
            src_ip = log.get("src_ip")
            session = log.get("session")

            if event == "cowrie.login.success":
                events.append({
                    "timestamp": timestamp,
                    "src_ip": src_ip,
                    "event_type": "login_success",
                    "username": log.get("username"),
                    "password": log.get("password"),
                    "session": session
                })

            elif event == "cowrie.login.failed":
                events.append({
                    "timestamp": timestamp,
                    "src_ip": src_ip,
                    "event_type": "login_failed",
                    "username": log.get("username"),
                    "password": log.get("password"),
                    "session": session
                })

            elif event == "cowrie.command.input":
                events.append({
                    "timestamp": timestamp,
                    "src_ip": src_ip,
                    "event_type": "command",
                    "command": log.get("input"),
                    "session": session
                })

        except:
            continue

# Mostrar resultados
for e in events:
    print(e)
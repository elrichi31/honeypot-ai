"""SQL dump, SSH key, and binary-artifact decoy handlers."""

from .shared import _payload, _render


def sql_dump(_m, _q, _b) -> tuple[str, str, int]:
    return _payload("dumps/sql_dump.sql", "text/plain")


def ssh_private_key(_m, _q, _b) -> tuple[str, str, int]:
    decoy_key = (
        "-----BEGIN OPENSSH PRIVATE KEY-----\n"
        "b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn\n"
        "NhAAAAAwEAAQAAAYEAwK7mX9vQ2xR7tY4wN8zL6jF1cB5dA0sE3gI9kM2nO4Uq8pH5fZ2x\n"
        "EYyw16qQ0SmWRnhQZNvOj8eNQO5n5lVUWp1oambUZ0665JxPOOHBwq2aYy5H3KUsSeQ18H\n"
        "sBCI2qhX2BnOV2Y2Ln0fKOIXxxCeTVuPs4eN5oVqQcgZEYtCJmrTo7rIQzNI9Q8YKzGlOH\n"
        "cperzvV14VTXV66G0he2VNRhxGo2SqTWVlfy9GzCqxC7svuhj44NoZdUE5roInHcmx3iiJ\n"
        "Gi8G0nhw8XOXWZ7QtBJwZuJoYseWSxiwo90LYb7L4hwF05omkXCBEcBAhRAHmgNJrwclc8\n"
        "AAAFI3kq9xN5KvcTAAAAB3NzaC1yc2EAAAGBAMCu5l/b0NsUe2OPDfMy6kxGMsNdkbIeQk\n"
        "mnTZPFvyMjcT8dsRGMsNeqkNEplkZ4UGTbzo/HjUDuZ+ZVVFqdaGpm1GdOuuScTzjhwcKt\n"
        "-----END OPENSSH PRIVATE KEY-----\n"
    )
    return (decoy_key, "text/plain", 200)

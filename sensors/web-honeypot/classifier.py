"""
Attack classifier — inspired by TANNER's detection logic.
Classifies HTTP requests into attack categories based on path, query, body, and headers.
"""

import re

# Patterns per attack type (ordered by specificity)
PATTERNS: list[tuple[str, list[re.Pattern]]] = [
    ("sqli", [
        re.compile(r"(\bUNION\b.{0,30}\bSELECT\b|\bSELECT\b.{0,30}\bFROM\b)", re.I),
        re.compile(r"('\s*(OR|AND)\s*'?\d|--\s*$|;\s*DROP\s+TABLE)", re.I),
        re.compile(r"(1\s*=\s*1|'\s*=\s*'|or\s+1=1)", re.I),
        re.compile(r"(SLEEP\s*\(|BENCHMARK\s*\(|WAITFOR\s+DELAY)", re.I),
        re.compile(r"(information_schema|sysobjects|xp_cmdshell)", re.I),
    ]),
    ("xss", [
        re.compile(r"<\s*script[^>]*>", re.I),
        re.compile(r"javascript\s*:", re.I),
        re.compile(r"on(load|error|click|mouseover|focus)\s*=", re.I),
        re.compile(r"<\s*(img|svg|iframe|body)[^>]*(src|href)\s*=\s*[\"']?javascript", re.I),
        re.compile(r"(alert|confirm|prompt)\s*\(", re.I),
    ]),
    ("lfi", [
        re.compile(r"\.\./|\.\.\\", re.I),
        re.compile(r"(etc/passwd|etc/shadow|etc/hosts|proc/self)", re.I),
        re.compile(r"(win\.ini|system\.ini|boot\.ini)", re.I),
        re.compile(r"(%2e%2e|%252e|\.\.%2f|%2f\.\.)", re.I),
    ]),
    ("rfi", [
        re.compile(r"(https?://[a-z0-9\.\-]+/[^\s&]*\.(php|txt|html))", re.I),
        re.compile(r"=\s*https?://", re.I),
    ]),
    ("cmdi", [
        re.compile(r"(;|\|{1,2}|&&)\s*(ls|cat|id|whoami|uname|wget|curl|bash|sh|nc)\b", re.I),
        re.compile(r"\$\(.*\)|`[^`]+`"),
        re.compile(r"(ping|nslookup|traceroute)\s+-", re.I),
    ]),
    ("scanner", [
        re.compile(r"/(\.git/config|\.env|\.htaccess|\.htpasswd|web\.config)", re.I),
        re.compile(r"/(wp-login\.php|xmlrpc\.php|wp-config\.php)", re.I),
        re.compile(r"/(phpmyadmin|pma|myadmin|mysql)", re.I),
        re.compile(r"/(manager/html|solr/admin|actuator|api/swagger)", re.I),
        re.compile(r"\.(bak|old|backup|sql|tar|zip|gz)$", re.I),
        re.compile(r"/(admin|administrator|login|panel|dashboard|console|cpanel)", re.I),
    ]),
    ("info_disclosure", [
        re.compile(r"/config\.(php|yml|yaml|json|xml|ini)", re.I),
        re.compile(r"/(server-status|server-info|status|info\.php)", re.I),
        re.compile(r"/\.(DS_Store|svn/entries|idea/workspace)", re.I),
    ]),
]


def classify(path: str, query: str = "", body: str = "", user_agent: str = "") -> str:
    """
    Returns the attack category or 'recon' if nothing specific matched.
    Priority: sqli > xss > lfi > rfi > cmdi > scanner > info_disclosure > recon
    """
    haystack = f"{path} {query} {body}"

    for attack_type, patterns in PATTERNS:
        for pattern in patterns:
            if pattern.search(haystack):
                return attack_type

    # Broad scanner user agents
    scanner_uas = re.compile(
        r"(sqlmap|nikto|nmap|masscan|zgrab|nuclei|dirbuster|gobuster|"
        r"wfuzz|hydra|medusa|burpsuite|metasploit|acunetix|nessus|openvas)",
        re.I,
    )
    if scanner_uas.search(user_agent):
        return "scanner"

    return "recon"

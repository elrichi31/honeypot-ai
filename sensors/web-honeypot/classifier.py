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
        re.compile(r"\\u003c\s*script|%3cscript", re.I),  # Unicode/URL-encoded XSS
    ]),
    ("xxe", [
        # XML external entity declarations. Checked before LFI because an XXE
        # payload that reads /etc/passwd is primarily an XXE (the XML entity is
        # the vector); the structural markers below are far more specific.
        re.compile(r"<!ENTITY\s+\S+\s+SYSTEM", re.I),
        re.compile(r"<!ENTITY\s+%\s+\S+", re.I),          # parameter entities (blind XXE)
        re.compile(r"<!DOCTYPE[^>]*\[", re.I),
        re.compile(r"SYSTEM\s+[\"']file://", re.I),
        re.compile(r"%[a-z]+;", re.I),                    # entity references like %xxe;
    ]),
    ("lfi", [
        re.compile(r"\.\./|\.\.\\", re.I),
        re.compile(r"(etc/passwd|etc/shadow|etc/hosts|proc/self)", re.I),
        re.compile(r"(win\.ini|system\.ini|boot\.ini)", re.I),
        re.compile(r"(%2e%2e|%252e%252e|\.\.%2f|%2f\.\.)", re.I),  # single + double encoding
        re.compile(r"%c0%ae|%c0%2e|%e0%80%ae", re.I),              # UTF-8 overlong encoding
        re.compile(r"\.\.[/\\]{1,2}\.\.[/\\]", re.I),              # deep traversal
        re.compile(r"(/run/secrets|/var/run/secrets)", re.I),       # Docker/k8s secrets
    ]),
    ("rfi", [
        re.compile(r"=\s*https?://", re.I),
        re.compile(r"=\s*//[a-z0-9\.\-]+/", re.I),                 # protocol-less
        re.compile(r"=\s*data:(text|application)/", re.I),          # data URI
        re.compile(r"(https?://[a-z0-9\.\-]+/[^\s&]*\.(php|txt|html|sh))", re.I),
    ]),
    ("ssrf", [
        # Server-side request forgery — internal IPs and cloud metadata endpoints
        re.compile(r"(169\.254\.169\.254|metadata\.google\.internal)", re.I),
        re.compile(r"(192\.168\.|10\.\d+\.\d+\.|172\.(1[6-9]|2\d|3[01])\.)"),
        re.compile(r"(127\.0\.0\.1|localhost|0\.0\.0\.0)"),
        re.compile(r"(fd00:|fc00:)", re.I),                         # IPv6 ULA (private)
        re.compile(r"//[^/]*(internal|intranet|local|corp)[^/]*/", re.I),
        re.compile(r"=\s*http://[^&]*(:\d{2,5})?/(latest|metadata|computeMetadata)", re.I),
    ]),
    ("cmdi", [
        re.compile(r"(;|\|{1,2}|&&)\s*(ls|cat|id|whoami|uname|wget|curl|bash|sh|nc|python|ruby|perl|php)\b", re.I),
        re.compile(r"\$\(.*\)|`[^`]+`"),
        re.compile(r"(ping|nslookup|traceroute|telnet|socat|ncat)\s+-", re.I),
        re.compile(r"\$\{IFS\}|\$\{PATH:0:1\}"),                   # bash whitespace/char evasion
        re.compile(r"(;|\|)\s*(tee|od|xxd|base64|find|grep|sed|awk)\b", re.I),
    ]),
    ("log4shell", [
        # JNDI lookup injection (Log4Shell / CVE-2021-44228) and obfuscated variants
        re.compile(r"\$\{jndi:(ldaps?|rmi|dns|iiop|nis|corba)://", re.I),
        re.compile(r"\$\{(\$\{|lower:|upper:|env:|sys:|::-)", re.I),
        re.compile(r"%24%7Bjndi:", re.I),                           # URL-encoded ${jndi:
    ]),
    ("ssti", [
        # Server-side template injection probes across engines (Jinja2, Twig,
        # Freemarker, Velocity, ERB). Math-in-braces is the classic canary.
        re.compile(r"\{\{\s*\d+\s*[*]\s*\d+\s*\}\}"),
        re.compile(r"\$\{\s*\d+\s*[*]\s*\d+\s*\}"),
        re.compile(r"\{\{.*(self|config|request|__class__|__globals__|cycler|joiner).*\}\}", re.I),
        re.compile(r"(freemarker|<#assign|\.getClass\(\)|T\(java\.lang)", re.I),
        re.compile(r"#\{.*\}|<%=.*%>"),
        # Spring Expression Language (SpEL) and OGNL (Struts)
        re.compile(r"T\s*\(\s*java\.lang\.Runtime\s*\)", re.I),
        re.compile(r"\(#\w+\s*=\s*@[a-z])", re.I),                 # OGNL gadget pattern
    ]),
    ("deserialization", [
        # Java/PHP/.NET/Python insecure deserialization gadget markers
        re.compile(r"(rO0AB|aced0005)", re.I),                       # Java serialized stream
        re.compile(r"O:\d+:\"[^\"]+\":\d+:\{", re.I),                # PHP serialized object
        re.compile(r"(__reduce__|cPickle|pickle\.loads)", re.I),     # Python pickle
        re.compile(r"(TypeObject|__type|\$type)\s*[:=]", re.I),      # .NET / JSON.NET
        re.compile(r"gadgetchain|ysoserial", re.I),                  # known exploit tool markers
    ]),
    ("nosqli", [
        # NoSQL injection — MongoDB operators and JS injection in queries
        re.compile(r'\$\s*(ne|gt|lt|gte|lte|in|nin|regex|where|exists)\b', re.I),
        re.compile(r'\{\s*"\$', re.I),                              # {"$ne": ...} JSON form
        re.compile(r"'\s*\|\|\s*'1'\s*==\s*'1", re.I),             # JS-style tautology
        re.compile(r"db\.(getCollection|find|aggregate)\s*\(", re.I),
    ]),
    ("crlf", [
        # HTTP response splitting / header injection
        re.compile(r"(%0d%0a|%0a%0d|\r\n|\n\r)", re.I),
        re.compile(r"%0[aA]Set-Cookie:|%0[dD]%0[aA]", re.I),
        re.compile(r"\\r\\n|\\n\\r"),
    ]),
    ("ldap", [
        re.compile(r"\*\)\s*\(", re.I),                             # *(uid=*)
        re.compile(r"\(\s*\|\s*\(", re.I),                          # (|(uid=...))
        re.compile(r"admin\s*\*|(\*\)\s*\(objectClass)", re.I),
        re.compile(r"%(28|29|2a|7c)", re.I),                        # URL-encoded parens/pipe/star
    ]),
    ("jwt", [
        # JWT attacks: algorithm=none and well-known base64 prefixes
        re.compile(r"eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.", re.I),  # any JWT
        re.compile(r"eyJhbGciOiJub25lIn0", re.I),                   # alg=none header
        re.compile(r"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJ", re.I),  # common HS256 probe
    ]),
    ("scanner", [
        re.compile(r"/(\.git/config|\.env|\.htaccess|\.htpasswd|web\.config)", re.I),
        re.compile(r"/(wp-login\.php|xmlrpc\.php|wp-config\.php)", re.I),
        re.compile(r"/(phpmyadmin|pma|myadmin|mysql)", re.I),
        re.compile(r"/(manager/html|solr/admin|actuator|api/swagger)", re.I),
        re.compile(r"\.(bak|old|backup|sql|tar|zip|gz)$", re.I),
        re.compile(r"/(admin|administrator|login|panel|dashboard|console|cpanel)", re.I),
        re.compile(r"/(swagger|api-docs|openapi|redoc|graphql)", re.I),
        re.compile(r"/(\.DS_Store|\.svn|CVS/|\.idea/)", re.I),
    ]),
    ("info_disclosure", [
        re.compile(r"/config\.(php|yml|yaml|json|xml|ini)", re.I),
        re.compile(r"/(server-status|server-info|status|info\.php)", re.I),
        re.compile(r"/\.(DS_Store|svn/entries|idea/workspace)", re.I),
        re.compile(r"/(package\.json|yarn\.lock|Dockerfile|docker-compose\.yml)", re.I),
        re.compile(r"/(web\.config|nginx\.conf|apache2?\.conf)", re.I),
        re.compile(r"/config/(database|secrets)\.(yml|rb)", re.I),  # Rails
    ]),
]


def classify(path: str, query: str = "", body: str = "", user_agent: str = "") -> str:
    """
    Returns the attack category or 'recon' if nothing specific matched.
    Priority: sqli > xss > xxe > lfi > rfi > ssrf > cmdi > log4shell > ssti >
              deserialization > nosqli > crlf > ldap > jwt > scanner > info_disclosure > recon
    """
    haystack = f"{path} {query} {body}"

    for attack_type, patterns in PATTERNS:
        for pattern in patterns:
            if pattern.search(haystack):
                return attack_type

    # Broad scanner user agents
    scanner_uas = re.compile(
        r"(sqlmap|nikto|nmap|masscan|zgrab|nuclei|dirbuster|gobuster|"
        r"wfuzz|hydra|medusa|burpsuite|metasploit|acunetix|nessus|openvas|"
        r"zgrab|masscan|zmap|shodan|censys|binaryedge|stretchoid)",
        re.I,
    )
    if scanner_uas.search(user_agent):
        return "scanner"

    return "recon"

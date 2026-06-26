"""SEO, meta, and site-identity handlers."""

from .shared import _render, _payload


def homepage(_m, _q, _b) -> tuple[str, str, int]:
    return (_render("site/homepage.html"), "text/html", 200)


def robots(_m, _q, _b) -> tuple[str, str, int]:
    return _payload("seo/robots.txt", "text/plain")


def sitemap(_m, _q, _b) -> tuple[str, str, int]:
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        "  <url><loc>https://techcorp-solutions.com/</loc><priority>1.0</priority></url>\n"
        "  <url><loc>https://techcorp-solutions.com/about</loc></url>\n"
        "  <url><loc>https://techcorp-solutions.com/contact</loc></url>\n"
        "  <url><loc>https://techcorp-solutions.com/blog</loc></url>\n"
        "</urlset>"
    )
    return (xml, "application/xml", 200)


def security_txt(_m, _q, _b) -> tuple[str, str, int]:
    txt = (
        "Contact: mailto:security@techcorp-solutions.com\n"
        "Expires: 2027-01-01T00:00:00.000Z\n"
        "Preferred-Languages: en\n"
        "Canonical: https://techcorp-solutions.com/.well-known/security.txt\n"
    )
    return (txt, "text/plain", 200)

// Settings — IP enrichment API keys (AbuseIPDB, ipinfo, Spectra Analyze).
// Part of the namespaced dictionary; combined in ../dictionaries.ts.

export const en = {
  "set.enrichment.title": "IP Enrichment",
  "set.enrichment.description": "Enrich attacker IPs with external threat intelligence feeds",
  "set.enrichment.abuseLabel": "AbuseIPDB API Key",
  "set.enrichment.abusePlaceholder": "your-abuseipdb-key",
  "set.enrichment.abuseHint": "Free: 1,000 checks/day · abuseipdb.com/account/api",
  "set.enrichment.ipinfoLabel": "ipinfo.io API Key",
  "set.enrichment.ipinfoPlaceholder": "your-ipinfo-token",
  "set.enrichment.ipinfoHint": "Free: 50,000 requests/month (works without a key, the key only raises the limit) · ipinfo.io/signup",
  "set.enrichment.spectraUrlLabel": "Spectra Analyze URL",
  "set.enrichment.spectraUrlPlaceholder": "https://appliance.example.com",
  "set.enrichment.spectraUrlHint": "Base URL of your Spectra Analyze appliance, for example https://appliance.example.com.",
  "set.enrichment.spectraTokenLabel": "Spectra Analyze Token",
  "set.enrichment.spectraTokenPlaceholder": "your-spectra-token",
  "set.enrichment.spectraTokenHint": "Token obtained from your Spectra Analyze appliance. IP lookups are only queried on demand and cached for 7 days.",
  "set.enrichment.howBody": "When you open a threat or session detail, these APIs are queried on demand. The result is cached for 7 days (AbuseIPDB and Spectra Analyze) and 30 days (ipinfo) to avoid wasting quota. ipinfo works without a key.",
} as const

export const es: Record<keyof typeof en, string> = {
  "set.enrichment.title": "Enriquecimiento de IP",
  "set.enrichment.description": "Enriquece las IPs de atacantes con feeds externos de inteligencia de amenazas",
  "set.enrichment.abuseLabel": "API Key de AbuseIPDB",
  "set.enrichment.abusePlaceholder": "tu-clave-abuseipdb",
  "set.enrichment.abuseHint": "Gratis: 1,000 consultas/día · abuseipdb.com/account/api",
  "set.enrichment.ipinfoLabel": "API Key de ipinfo.io",
  "set.enrichment.ipinfoPlaceholder": "tu-token-ipinfo",
  "set.enrichment.ipinfoHint": "Gratis: 50,000 peticiones/mes (funciona sin clave, la clave solo sube el límite) · ipinfo.io/signup",
  "set.enrichment.spectraUrlLabel": "URL de Spectra Analyze",
  "set.enrichment.spectraUrlPlaceholder": "https://appliance.example.com",
  "set.enrichment.spectraUrlHint": "URL base de tu appliance de Spectra Analyze, por ejemplo https://appliance.example.com.",
  "set.enrichment.spectraTokenLabel": "Token de Spectra Analyze",
  "set.enrichment.spectraTokenPlaceholder": "tu-token-de-spectra",
  "set.enrichment.spectraTokenHint": "Token obtenido desde tu appliance de Spectra Analyze. Las consultas de IP se hacen bajo demanda y se cachean por 7 días.",
  "set.enrichment.howBody": "Cuando abres el detalle de una amenaza o sesión, estas APIs se consultan bajo demanda. El resultado se cachea por 7 días (AbuseIPDB y Spectra Analyze) y 30 días (ipinfo) para no gastar cuota. ipinfo funciona sin clave.",
}

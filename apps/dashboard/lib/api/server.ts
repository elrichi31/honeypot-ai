// Backward-compat re-export. All proxy logic now lives in proxy.ts.
// Routes that import from here continue to work unchanged.
export { getApiUrl, ingestHeaders, proxyRaw as proxyJson, proxyGet, proxyResponse } from "./proxy"
export type { ProxyResult } from "./proxy"

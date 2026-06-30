// Server-only: launches Chromium headless and renders HTML → PDF Buffer.
// The browser instance is kept alive between requests (singleton) to avoid
// the ~2s cold-start cost on every report generation.
import type { Browser } from "playwright"

let browserPromise: Promise<Browser> | null = null

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      // Use playwright-core + custom path when REPORT_CHROMIUM_PATH is set
      // (Docker images); otherwise fall back to playwright's bundled Chromium.
      const executablePath = process.env.REPORT_CHROMIUM_PATH
      const { chromium } = await import("playwright")
      const browser = await chromium.launch({
        headless: true,
        ...(executablePath ? { executablePath } : {}),
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      })
      // Reset singleton if the browser crashes so the next call relaunches.
      browser.on("disconnected", () => {
        browserPromise = null
      })
      return browser
    })()
  }
  return browserPromise
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: "networkidle" })
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", right: "18mm", bottom: "20mm", left: "18mm" },
    })
    return Buffer.from(pdf)
  } finally {
    await page.close()
  }
}

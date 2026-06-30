// Server-only: renders a React-PDF document component to a PDF Buffer.
// No Chromium required - @react-pdf/renderer runs entirely in Node.
import React from "react"
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import type { ReactElement, JSXElementConstructor } from "react"
import { ReportDocument } from "./template"
import type { ClientReportData } from "./types"
import type { T } from "./shared/pdf-ui"

export async function generatePdf(data: ClientReportData, t: T): Promise<Buffer> {
  const element = React.createElement(ReportDocument, { data, t }) as ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>
  const uint8 = await renderToBuffer(element)
  return Buffer.from(uint8)
}

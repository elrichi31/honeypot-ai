import { NextRequest, NextResponse } from "next/server"
import { exec as execCb } from "child_process"
import { promisify } from "util"
import { createWriteStream, existsSync, statSync, linkSync } from "fs"
import { mkdir, unlink, writeFile, rm, stat } from "fs/promises"
import { pipeline } from "stream/promises"
import { createReadStream } from "fs"
import path from "path"

const exec = promisify(execCb)

const INTERNAL_API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
const INGEST_API_URL = process.env.NEXT_PUBLIC_API_URL || ""
const CACHE_DIR = "/tmp/sensor-ova-cache"
const VMDK_CACHE_PATH = path.join(CACHE_DIR, "honeypot-sensor-disk.vmdk")
// 7-day cache — refresh only after a new release is deployed
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
// The base VMDK is always created from a 20G disk image
const DISK_SIZE_GB = 20

function ingestHeaders() {
  return {
    "Content-Type": "application/json",
    ...(process.env.INGEST_SHARED_SECRET
      ? { "X-Ingest-Token": process.env.INGEST_SHARED_SECRET }
      : {}),
  }
}

async function ensureVmdkCached(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true })

  if (existsSync(VMDK_CACHE_PATH)) {
    const s = statSync(VMDK_CACHE_PATH)
    if (Date.now() - s.mtimeMs < CACHE_MAX_AGE_MS) return
  }

  const vmdkUrl = process.env.BASE_VMDK_URL
  if (!vmdkUrl) {
    throw new Error(
      "BASE_VMDK_URL is not set. Point it to the GitHub Releases honeypot-sensor-disk.vmdk asset URL.",
    )
  }

  console.log(`[ova] Downloading base VMDK from ${vmdkUrl} ...`)
  const response = await fetch(vmdkUrl, { redirect: "follow" })
  if (!response.ok) {
    throw new Error(`Failed to download VMDK: ${response.status} ${response.statusText}`)
  }

  const tmpPath = VMDK_CACHE_PATH + ".tmp"
  const fileStream = createWriteStream(tmpPath)
  await pipeline(response.body as unknown as NodeJS.ReadableStream, fileStream)

  // Atomic rename — avoids partial file being used
  await exec(`mv "${tmpPath}" "${VMDK_CACHE_PATH}"`)
  console.log(`[ova] VMDK cached (${(statSync(VMDK_CACHE_PATH).size / 1e6).toFixed(0)} MB)`)
}

function buildOvf(provisionToken: string, apiUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Envelope xmlns="http://schemas.dmtf.org/ovf/envelope/1"
          xmlns:ovf="http://schemas.dmtf.org/ovf/envelope/1"
          xmlns:vmw="http://www.vmware.com/schema/ovf"
          xmlns:vssd="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_VirtualSystemSettingData"
          xmlns:rasd="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_ResourceAllocationSettingData">
  <References>
    <File ovf:id="disk1" ovf:href="honeypot-sensor.vmdk"/>
  </References>
  <DiskSection>
    <Info>Virtual disk</Info>
    <Disk ovf:diskId="disk1" ovf:fileRef="disk1"
          ovf:capacity="${DISK_SIZE_GB}" ovf:capacityAllocationUnits="byte * 2^30"
          ovf:format="http://www.vmware.com/interfaces/specifications/vmdk.html#streamOptimized"/>
  </DiskSection>
  <NetworkSection>
    <Info>Network</Info>
    <Network ovf:name="VM Network"><Description>VM Network</Description></Network>
  </NetworkSection>
  <VirtualSystem ovf:id="honeypot-sensor">
    <Info>Honeypot Sensor — Ubuntu 24.04 LTS</Info>
    <Name>honeypot-sensor</Name>
    <OperatingSystemSection ovf:id="94" vmw:osType="ubuntu64Guest">
      <Info>Ubuntu 24.04 LTS (64-bit)</Info>
    </OperatingSystemSection>
    <ProductSection ovf:transport="com.vmware.guestInfo">
      <Info>Honeypot Sensor provisioning configuration</Info>
      <Product>Honeypot Sensor</Product>
      <Vendor>Honeypot Platform</Vendor>
      <Property ovf:key="PROVISION_TOKEN" ovf:type="string" ovf:userConfigurable="false" ovf:value="${provisionToken}">
        <Label>Provision Token</Label>
        <Description>Token for this client — do not modify</Description>
      </Property>
      <Property ovf:key="INGEST_API_URL" ovf:type="string" ovf:userConfigurable="false" ovf:value="${apiUrl}">
        <Label>Ingest API URL</Label>
        <Description>URL of the Honeypot ingest API</Description>
      </Property>
    </ProductSection>
    <VirtualHardwareSection>
      <Info>Virtual hardware</Info>
      <System>
        <vssd:ElementName>Virtual Hardware Family</vssd:ElementName>
        <vssd:InstanceID>0</vssd:InstanceID>
        <vssd:VirtualSystemType>vmx-19</vssd:VirtualSystemType>
      </System>
      <Item>
        <rasd:ElementName>2 virtual CPU(s)</rasd:ElementName>
        <rasd:InstanceID>1</rasd:InstanceID>
        <rasd:ResourceType>3</rasd:ResourceType>
        <rasd:VirtualQuantity>2</rasd:VirtualQuantity>
      </Item>
      <Item>
        <rasd:AllocationUnits>byte * 2^20</rasd:AllocationUnits>
        <rasd:ElementName>2048 MB of memory</rasd:ElementName>
        <rasd:InstanceID>2</rasd:InstanceID>
        <rasd:ResourceType>4</rasd:ResourceType>
        <rasd:VirtualQuantity>2048</rasd:VirtualQuantity>
      </Item>
      <Item>
        <rasd:AutomaticAllocation>true</rasd:AutomaticAllocation>
        <rasd:Connection>VM Network</rasd:Connection>
        <rasd:ElementName>Network adapter 1</rasd:ElementName>
        <rasd:InstanceID>3</rasd:InstanceID>
        <rasd:ResourceSubType>VmxNet3</rasd:ResourceSubType>
        <rasd:ResourceType>10</rasd:ResourceType>
      </Item>
      <Item>
        <rasd:Address>0</rasd:Address>
        <rasd:ElementName>SCSI controller 0</rasd:ElementName>
        <rasd:InstanceID>4</rasd:InstanceID>
        <rasd:ResourceSubType>VirtualSCSI</rasd:ResourceSubType>
        <rasd:ResourceType>6</rasd:ResourceType>
      </Item>
      <Item>
        <rasd:AddressOnParent>0</rasd:AddressOnParent>
        <rasd:ElementName>Hard disk 1</rasd:ElementName>
        <rasd:HostResource>ovf:/disk/disk1</rasd:HostResource>
        <rasd:InstanceID>5</rasd:InstanceID>
        <rasd:Parent>4</rasd:Parent>
        <rasd:ResourceType>17</rasd:ResourceType>
      </Item>
    </VirtualHardwareSection>
  </VirtualSystem>
</Envelope>`
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params

  try {
    const body = await req.json().catch(() => ({})) as { services?: string[] }
    const services: string[] = body.services ?? ["ssh", "http", "ftp", "mysql", "port"]

    // 1. Generate a provision token for this client
    const tokenRes = await fetch(`${INTERNAL_API}/sensor/tokens`, {
      method: "POST",
      headers: ingestHeaders(),
      body: JSON.stringify({ clientId, services, expiresInHours: 168 }),
    })
    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({ error: "Failed to generate token" }))
      return NextResponse.json(err, { status: tokenRes.status })
    }
    const { token } = await tokenRes.json() as { token: string }

    if (!INGEST_API_URL) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_API_URL is not set on the dashboard server" },
        { status: 500 },
      )
    }

    // 2. Ensure base VMDK is cached locally
    await ensureVmdkCached()

    // 3. Build temp working directory
    const tmpDir = path.join("/tmp", `ova-${clientId}-${Date.now()}`)
    await mkdir(tmpDir, { recursive: true })

    const ovfPath  = path.join(tmpDir, "honeypot-sensor.ovf")
    const vmdkLink = path.join(tmpDir, "honeypot-sensor.vmdk")
    const ovaPath  = path.join(tmpDir, "honeypot-sensor.ova")

    // 4. Write custom OVF with embedded token + URL
    await writeFile(ovfPath, buildOvf(token, INGEST_API_URL), "utf8")

    // 5. Hard-link VMDK into temp dir under the expected name (no data copy)
    linkSync(VMDK_CACHE_PATH, vmdkLink)

    // 6. Package as OVA (tar, OVF must be listed first per spec)
    await exec(`tar -cf "${ovaPath}" -C "${tmpDir}" honeypot-sensor.ovf honeypot-sensor.vmdk`)

    // 7. Clean up hard-link; OVA and OVF deleted after streaming
    await unlink(vmdkLink)
    await unlink(ovfPath)

    // 8. Stream OVA to client
    const ovaStats = await stat(ovaPath)
    const readStream = createReadStream(ovaPath)

    const webStream = new ReadableStream({
      start(controller) {
        readStream.on("data", (chunk) => controller.enqueue(chunk))
        readStream.on("end", () => {
          controller.close()
          rm(tmpDir, { recursive: true, force: true }).catch(() => {})
        })
        readStream.on("error", (err) => controller.error(err))
      },
      cancel() {
        readStream.destroy()
        rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      },
    })

    const slug = clientId.replace(/[^a-z0-9-]/gi, "-").toLowerCase()

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="honeypot-sensor-${slug}.ova"`,
        "Content-Length": String(ovaStats.size),
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    console.error("[ova] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    )
  }
}

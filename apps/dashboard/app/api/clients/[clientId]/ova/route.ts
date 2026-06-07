import { NextRequest, NextResponse } from "next/server"
import { exec as execCb } from "child_process"
import { promisify } from "util"
import { createWriteStream, statSync } from "fs"
import { mkdir, unlink, writeFile, rm, stat } from "fs/promises"
import { pipeline } from "stream/promises"
import { createReadStream } from "fs"
import path from "path"
import { requireRole } from "@/lib/roles"
import { resolveIngestUrl as resolveIngestUrlOrNull } from "@/lib/server-config"

const exec = promisify(execCb)

const INTERNAL_API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

// Resolve the URL the sensor VM will use to reach the ingest-api from outside.
// Priority: Settings UI → SENSOR_INGEST_URL → NEXT_PUBLIC_API_URL → auto-detect public IP.
async function resolveIngestUrl(): Promise<string> {
  const { url } = await resolveIngestUrlOrNull()
  if (url) return url
  throw new Error(
    "Could not determine public ingest URL. Set it in Settings → Infrastructure (Manual) or SENSOR_INGEST_URL=http://<your-public-ip>:3000 in your .env",
  )
}
const DISK_SIZE_GB = 20

function ingestHeaders() {
  return {
    "Content-Type": "application/json",
    ...(process.env.INGEST_SHARED_SECRET
      ? { "X-Ingest-Token": process.env.INGEST_SHARED_SECRET }
      : {}),
  }
}

async function downloadVmdk(destPath: string): Promise<void> {
  const vmdkUrl = process.env.BASE_VMDK_URL
  if (!vmdkUrl) throw new Error("BASE_VMDK_URL is not set. Point it to the GitHub Releases honeypot-sensor-disk.vmdk URL.")

  console.log(`[ova] Downloading base VMDK from ${vmdkUrl} ...`)
  const response = await fetch(vmdkUrl, { redirect: "follow" })
  if (!response.ok) throw new Error(`Failed to download VMDK: ${response.status} ${response.statusText}`)

  const fileStream = createWriteStream(destPath)
  await pipeline(response.body as unknown as NodeJS.ReadableStream, fileStream)
  console.log(`[ova] VMDK downloaded (${(statSync(destPath).size / 1e6).toFixed(0)} MB)`)
}

// Creates a tiny FAT floppy image containing sensor-provision.env,
// then converts it to a streamOptimized VMDK.
// Uses mtools (no loop device / no root needed).
async function createConfigVmdk(tmpDir: string, token: string, apiUrl: string): Promise<string> {
  const envContent = `PROVISION_TOKEN=${token}\nINGEST_API_URL=${apiUrl}\n`
  const envFile   = path.join(tmpDir, "sensor-provision.env")
  const imgPath   = path.join(tmpDir, "config.img")
  const vmdkPath  = path.join(tmpDir, "honeypot-sensor-config.vmdk")

  await writeFile(envFile, envContent, "utf8")

  // 1.44 MB floppy — enough for a tiny env file
  await exec(`dd if=/dev/zero of="${imgPath}" bs=512 count=2880`)
  await exec(`mformat -i "${imgPath}" ::`)
  await exec(`mcopy -i "${imgPath}" "${envFile}" ::`)
  await exec(`qemu-img convert -f raw -O vmdk -o subformat=streamOptimized "${imgPath}" "${vmdkPath}"`)

  return vmdkPath
}

function buildOvf(): string {
  // Config disk is always a 1.44 MB FAT floppy (2880 sectors × 512 bytes = 1,474,560 bytes)
  const CONFIG_DISK_BYTES = 1474560
  return `<?xml version="1.0" encoding="UTF-8"?>
<Envelope xmlns="http://schemas.dmtf.org/ovf/envelope/1"
          xmlns:ovf="http://schemas.dmtf.org/ovf/envelope/1"
          xmlns:vmw="http://www.vmware.com/schema/ovf"
          xmlns:vssd="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_VirtualSystemSettingData"
          xmlns:rasd="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_ResourceAllocationSettingData">
  <References>
    <File ovf:id="disk1" ovf:href="honeypot-sensor.vmdk"/>
    <File ovf:id="disk2" ovf:href="honeypot-sensor-config.vmdk"/>
  </References>
  <DiskSection>
    <Info>Virtual disks</Info>
    <Disk ovf:diskId="disk1" ovf:fileRef="disk1"
          ovf:capacity="${DISK_SIZE_GB}" ovf:capacityAllocationUnits="byte * 2^30"
          ovf:format="http://www.vmware.com/interfaces/specifications/vmdk.html#streamOptimized"/>
    <Disk ovf:diskId="disk2" ovf:fileRef="disk2"
          ovf:capacity="${CONFIG_DISK_BYTES}" ovf:capacityAllocationUnits="byte"
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
        <rasd:ElementName>Hard disk 1 (OS)</rasd:ElementName>
        <rasd:HostResource>ovf:/disk/disk1</rasd:HostResource>
        <rasd:InstanceID>5</rasd:InstanceID>
        <rasd:Parent>4</rasd:Parent>
        <rasd:ResourceType>17</rasd:ResourceType>
      </Item>
      <Item>
        <rasd:AddressOnParent>1</rasd:AddressOnParent>
        <rasd:ElementName>Hard disk 2 (config)</rasd:ElementName>
        <rasd:HostResource>ovf:/disk/disk2</rasd:HostResource>
        <rasd:InstanceID>6</rasd:InstanceID>
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
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const { clientId: rawClientId } = await params

  // Sanitize clientId before using in shell commands
  const clientId = rawClientId.replace(/[^a-zA-Z0-9_-]/g, "")
  if (!clientId) {
    return NextResponse.json({ error: "Invalid client ID" }, { status: 400 })
  }

  try {
    const body = await req.json().catch(() => ({})) as { services?: string[] }
    const services: string[] = body.services ?? ["ssh", "http", "ftp", "mysql", "port"]

    // 1. Generate provision token
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

    // 2. Resolve the public URL the sensor VM will use to reach the ingest-api
    const ingestUrl = await resolveIngestUrl()

    // 3. Build temp directory
    const tmpDir = path.join("/tmp", `ova-${clientId}-${Date.now()}`)
    await mkdir(tmpDir, { recursive: true })

    try {
      // 4. Download base VMDK fresh into tmpDir
      const osVmdkPath = path.join(tmpDir, "honeypot-sensor.vmdk")
      await downloadVmdk(osVmdkPath)

      // 5. Create config disk VMDK with sensor-provision.env inside
      const configVmdkPath = await createConfigVmdk(tmpDir, token, ingestUrl)

      // 6. Write OVF referencing both disks
      const ovfPath = path.join(tmpDir, "honeypot-sensor.ovf")
      await writeFile(ovfPath, buildOvf(), "utf8")

      // 7. Package OVA — OVF must be first per spec
      const ovaPath = path.join(tmpDir, "honeypot-sensor.ova")
      await exec(
        `tar -cf "${ovaPath}" -C "${tmpDir}" honeypot-sensor.ovf honeypot-sensor.vmdk honeypot-sensor-config.vmdk`
      )

      // 8. Clean up intermediate files before streaming
      await Promise.all([unlink(ovfPath), unlink(osVmdkPath), unlink(configVmdkPath)])

      // 9. Stream OVA
      const ovaStats = await stat(ovaPath)
      const readStream = createReadStream(ovaPath)
      const slug = clientId.replace(/[^a-z0-9-]/gi, "-").toLowerCase()

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
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      throw err
    }
  } catch (err) {
    console.error("[ova] Error:", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 })
  }
}

#!/bin/bash
# Post-processor: converts Packer QCOW2 output → VMware-compatible OVA.
# Requires: qemu-img, tar
set -euo pipefail

VM_NAME="${VM_NAME:-honeypot-sensor}"
OUTPUT_DIR="${OUTPUT_DIR:-output}"
QCOW2="$OUTPUT_DIR/$VM_NAME"
VMDK="$OUTPUT_DIR/$VM_NAME.vmdk"
OVF="$OUTPUT_DIR/$VM_NAME.ovf"
OVA="$OUTPUT_DIR/$VM_NAME.ova"

echo "[make-ova] Converting QCOW2 → VMDK..."
qemu-img convert -f qcow2 -O vmdk -o subformat=streamOptimized "$QCOW2" "$VMDK"

DISK_SIZE_BYTES=$(qemu-img info --output=json "$VMDK" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['virtual-size'])")
DISK_SIZE_GB=$(( (DISK_SIZE_BYTES + 1073741823) / 1073741824 ))

echo "[make-ova] Writing OVF descriptor..."
cat > "$OVF" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<Envelope xmlns="http://schemas.dmtf.org/ovf/envelope/1"
          xmlns:cim="http://schemas.dmtf.org/wbem/wscim/1/common"
          xmlns:ovf="http://schemas.dmtf.org/ovf/envelope/1"
          xmlns:vmw="http://www.vmware.com/schema/ovf"
          xmlns:vssd="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_VirtualSystemSettingData"
          xmlns:rasd="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_ResourceAllocationSettingData"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">

  <References>
    <File ovf:id="disk1" ovf:href="${VM_NAME}.vmdk"/>
  </References>

  <DiskSection>
    <Info>Virtual disk information</Info>
    <Disk ovf:diskId="disk1" ovf:fileRef="disk1"
          ovf:capacity="${DISK_SIZE_GB}" ovf:capacityAllocationUnits="byte * 2^30"
          ovf:format="http://www.vmware.com/interfaces/specifications/vmdk.html#streamOptimized"
          ovf:populatedSize="0"/>
  </DiskSection>

  <NetworkSection>
    <Info>Network configuration</Info>
    <Network ovf:name="VM Network">
      <Description>The VM Network network</Description>
    </Network>
  </NetworkSection>

  <VirtualSystem ovf:id="${VM_NAME}">
    <Info>Honeypot Sensor VM</Info>
    <Name>${VM_NAME}</Name>

    <OperatingSystemSection ovf:id="94" vmw:osType="ubuntu64Guest">
      <Info>Ubuntu 24.04 LTS (64-bit)</Info>
    </OperatingSystemSection>

    <VirtualHardwareSection>
      <Info>Virtual hardware requirements</Info>
      <System>
        <vssd:ElementName>Virtual Hardware Family</vssd:ElementName>
        <vssd:InstanceID>0</vssd:InstanceID>
        <vssd:VirtualSystemType>vmx-19</vssd:VirtualSystemType>
      </System>

      <!-- CPUs -->
      <Item>
        <rasd:AllocationUnits>hertz * 10^6</rasd:AllocationUnits>
        <rasd:Description>Number of Virtual CPUs</rasd:Description>
        <rasd:ElementName>2 virtual CPU(s)</rasd:ElementName>
        <rasd:InstanceID>1</rasd:InstanceID>
        <rasd:ResourceType>3</rasd:ResourceType>
        <rasd:VirtualQuantity>2</rasd:VirtualQuantity>
      </Item>

      <!-- RAM -->
      <Item>
        <rasd:AllocationUnits>byte * 2^20</rasd:AllocationUnits>
        <rasd:Description>Memory Size</rasd:Description>
        <rasd:ElementName>2048 MB of memory</rasd:ElementName>
        <rasd:InstanceID>2</rasd:InstanceID>
        <rasd:ResourceType>4</rasd:ResourceType>
        <rasd:VirtualQuantity>2048</rasd:VirtualQuantity>
      </Item>

      <!-- NIC -->
      <Item>
        <rasd:AutomaticAllocation>true</rasd:AutomaticAllocation>
        <rasd:Connection>VM Network</rasd:Connection>
        <rasd:Description>VmxNet3 ethernet adapter</rasd:Description>
        <rasd:ElementName>Network adapter 1</rasd:ElementName>
        <rasd:InstanceID>3</rasd:InstanceID>
        <rasd:ResourceSubType>VmxNet3</rasd:ResourceSubType>
        <rasd:ResourceType>10</rasd:ResourceType>
      </Item>

      <!-- Disk controller -->
      <Item>
        <rasd:Address>0</rasd:Address>
        <rasd:Description>SCSI Controller</rasd:Description>
        <rasd:ElementName>SCSI controller 0</rasd:ElementName>
        <rasd:InstanceID>4</rasd:InstanceID>
        <rasd:ResourceSubType>VirtualSCSI</rasd:ResourceSubType>
        <rasd:ResourceType>6</rasd:ResourceType>
      </Item>

      <!-- Disk -->
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
</Envelope>
EOF

echo "[make-ova] Packaging OVA..."
tar -C "$OUTPUT_DIR" -cvf "$OVA" "$(basename "$OVF")" "$(basename "$VMDK")"

# Clean up intermediate files
rm -f "$VMDK" "$OVF"

echo "[make-ova] OVA ready: $OVA"
du -sh "$OVA"

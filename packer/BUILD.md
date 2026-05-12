# Building the Sensor OVA

## Requirements (build machine — Linux with KVM)

```bash
# Install Packer
curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt-get update && sudo apt-get install -y packer

# Install QEMU + KVM
sudo apt-get install -y qemu-system-x86 qemu-utils ovmf

# Verify KVM is available (speeds up build 10x)
kvm-ok
```

## Build

```bash
cd packer/

# Install the QEMU plugin
packer init sensor.pkr.hcl

# Build (takes ~20–30 min)
packer build sensor.pkr.hcl
```

The OVA will be at `packer/output/honeypot-sensor.ova`.

### Without KVM (slower)

Edit `sensor.pkr.hcl` and change:
```hcl
accelerator = "tcg"   # software emulation — 3–5x slower
```

## Deploy to a client

1. In the dashboard, open the client page
2. Click **Download OVA Package** → Generate Provisioning Token
3. Download `sensor-provision.env`
4. Import `honeypot-sensor.ova` in VMware Workstation / ESXi:
   - VMware: File → Open → select the OVA
   - Power on the VM
5. Wait ~30 seconds for the VM to boot (first boot will show "No provision file" in the console)
6. Get the VM's IP from the VMware console or DHCP lease
7. Copy the provision file:
   ```bash
   scp sensor-provision.env admin@<vm-ip>:/opt/sensor/sensor-provision.env
   ```
8. Reboot the VM:
   ```bash
   ssh admin@<vm-ip> "sudo reboot"
   ```
9. On the second boot, `sensor-provision.service` runs automatically:
   - Fetches credentials from the platform
   - Writes `/opt/sensor/.env`
   - Runs `docker compose up -d`
   - Enables `sensor.service` for future reboots
   - Disables itself

The sensors appear online in the dashboard within ~2 minutes.

## Default credentials

| Item     | Value     |
|----------|-----------|
| User     | `admin`   |
| Password | `honeypot` |
| SSH port | `22`      |

**Change the password after provisioning:**
```bash
ssh admin@<vm-ip>
passwd
```

## Sensor layout inside the VM

```
/opt/sensor/
  docker-compose.yml      — sensor stack
  .env                    — written by provision service
  sensor-provision.env    — your provision file (delete after provisioning)
  sensor-provision.sh     — provision script
  sensors/                — sensor source + configs
  vector/                 — vector log shipper config
```

## Logs

```bash
# Provision log
sudo journalctl -u sensor-provision.service -f

# Sensor stack
cd /opt/sensor && docker compose logs -f
```

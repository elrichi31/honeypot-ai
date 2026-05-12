packer {
  required_plugins {
    qemu = {
      version = ">= 1.1.0"
      source  = "github.com/hashicorp/qemu"
    }
  }
}

# ─── Variables ───────────────────────────────────────────────────────────────

variable "ubuntu_iso_url" {
  type    = string
  default = "https://releases.ubuntu.com/24.04.2/ubuntu-24.04.2-live-server-amd64.iso"
}

variable "ubuntu_iso_checksum" {
  type    = string
  # Get the current checksum from: https://releases.ubuntu.com/24.04.2/SHA256SUMS
  default = "file:https://releases.ubuntu.com/24.04.2/SHA256SUMS"
}

variable "vm_name" {
  type    = string
  default = "honeypot-sensor"
}

variable "disk_size_mb" {
  type    = number
  default = 20480 # 20 GB
}

variable "memory_mb" {
  type    = number
  default = 2048
}

variable "cpus" {
  type    = number
  default = 2
}

variable "ssh_password" {
  type      = string
  default   = "honeypot"
  sensitive = true
}

variable "output_dir" {
  type    = string
  default = "output"
}

# ─── Source ──────────────────────────────────────────────────────────────────

source "qemu" "sensor" {
  vm_name          = var.vm_name
  iso_url          = var.ubuntu_iso_url
  iso_checksum     = var.ubuntu_iso_checksum
  output_directory = var.output_dir

  disk_size    = var.disk_size_mb
  memory       = var.memory_mb
  cpus         = var.cpus
  format       = "qcow2"
  accelerator  = "kvm" # change to "tcg" if KVM/nested virtualization is not available

  # Headless — no display needed on a server
  headless         = true
  vnc_bind_address = "127.0.0.1"

  # Ubuntu autoinstall via cloud-init HTTP server
  http_directory = "http"
  boot_wait      = "5s"
  boot_command = [
    "<wait>",
    "c<wait>",
    "linux /casper/vmlinuz --- autoinstall ds='nocloud-net;s=http://{{ .HTTPIP }}:{{ .HTTPPort }}/' <enter><wait3>",
    "initrd /casper/initrd<enter><wait3>",
    "boot<enter>"
  ]

  ssh_username        = "admin"
  ssh_password        = var.ssh_password
  ssh_timeout         = "90m"
  shutdown_command    = "echo '${var.ssh_password}' | sudo -S shutdown -P now"

  qemuargs = [
    ["-m", "${var.memory_mb}M"],
    ["-smp", "${var.cpus}"],
    ["-serial", "none"],
    ["-parallel", "none"]
  ]
}

# ─── Build ───────────────────────────────────────────────────────────────────

build {
  name    = "sensor-ova"
  sources = ["source.qemu.sensor"]

  # 1. Copy sensor source files
  provisioner "file" {
    sources     = ["../sensors", "../vector"]
    destination = "/tmp/"
  }

  provisioner "file" {
    source      = "../docker-compose.prod.honeypot.yml"
    destination = "/tmp/docker-compose.yml"
  }

  provisioner "file" {
    source      = "first-run/sensor-provision.sh"
    destination = "/tmp/sensor-provision.sh"
  }

  provisioner "file" {
    source      = "first-run/sensor-provision.service"
    destination = "/tmp/sensor-provision.service"
  }

  provisioner "file" {
    source      = "first-run/sensor.service"
    destination = "/tmp/sensor.service"
  }

  # 2. Install Docker + dependencies
  provisioner "shell" {
    execute_command = "echo '${var.ssh_password}' | sudo -S bash {{.Path}}"
    scripts         = ["scripts/00-install.sh"]
  }

  # 3. Stage sensor files and pre-build Docker images
  provisioner "shell" {
    execute_command = "echo '${var.ssh_password}' | sudo -S bash {{.Path}}"
    scripts         = ["scripts/01-stage.sh"]
    timeout         = "30m"
  }

  # 4. Install systemd services and clean up
  provisioner "shell" {
    execute_command = "echo '${var.ssh_password}' | sudo -S bash {{.Path}}"
    scripts         = ["scripts/02-finalize.sh"]
  }

  # 5. Package QCOW2 → OVA
  post-processor "shell-local" {
    environment_vars = ["VM_NAME=${var.vm_name}", "OUTPUT_DIR=${var.output_dir}"]
    scripts          = ["scripts/make-ova.sh"]
  }
}

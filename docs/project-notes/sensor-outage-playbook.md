# Sensor outage playbook

Two real outages on 2026-08-04 that both looked like "the sensor is down" and
were neither. Read this before blaming vector, the ingest API, or the network.

## The trap: `docker ps` says Up, the sensor is dead

Cowrie is a **single-threaded Twisted reactor**. Emulated commands run inside
that reactor with no yielding, so one slow command freezes every SSH session at
once. When that happens:

- the container stays `Up` — the process is alive;
- the port stays bound — the socket belongs to the kernel, not the reactor;
- connections enter the accept queue and time out, so from outside the port
  looks **closed**;
- nothing is written to `cowrie.json`, because logging lives in the same loop.

On 2026-08-04 an attacker ran `find / -name "*.env"` and pinned a core for
5h43m. `find`'s `maxdepth` (default 20) does not bound the work — the honeyfs
has symlink cycles, so a depth-20 walk re-expands the same subtrees
combinatorially. The same attacker's earlier `find / -name ".env" -maxdepth 5`
finished in 3 seconds; that difference is the tell.

Fixed by a node budget injected in
[`sensors/cowrie/patch_auth.py`](../../sensors/cowrie/patch_auth.py) (section 4),
covered by `sensors/cowrie/test_find_budget.py`. **Ceiling:** the walk is still
synchronous — the budget just makes it short. Any other emulated command that
does unbounded work has the same failure mode.

## Diagnostic order (do not restart first — you destroy the evidence)

1. **Is the sensor still producing?**
   `docker exec vector tail -1 /cowrie/cowrie-git/var/log/cowrie/cowrie.json`
   A stale last line names the command that wedged it.
2. **Is a core pinned?** `docker stats --no-stream cowrie` — ~100%+ confirms it.
3. **Clear vector before suspecting it.** Compare `position` in
   `/var/lib/vector/<source>/checkpoints.json` against the real file size
   (`stat -c '%s'`). Within a few KB of a growing file = vector is delivering
   fine and the problem is upstream. Fresh checkpoint *directory* mtimes alone
   already rule out a dead vector.
4. Only then: `docker restart cowrie`, and verify with step 1 again.

Recurring `502 Bad Gateway` retries in vector's log are noisy but not proof of
an outage — vector retries and the checkpoint still advances.

## Never pin diagnosis on a port scan

Contabo filters port sweeps: scanning a range reports 22/2222 closed even when
they are open. Always probe a single isolated port (`nc -vz -w5 <ip> 2222`).

## Suricata: `:latest` broke it

`jasonish/suricata:latest` moved to **8.0.6** on 2026-08-03, and that build
exits 0 silently right after thread setup on the Contabo VPS — restart-looping
~3995 times with no error printed, `eve.json` frozen. 8.0.4 runs fine on the
same host. The base image is now pinned in
[`sensors/suricata/Dockerfile`](../../sensors/suricata/Dockerfile).

Symptom to recognise: container `Up 3 seconds` with a creation time of hours or
days ago. Check `RestartCount`:

```
docker inspect suricata --format '{{.RestartCount}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}}'
```

**Separate bug found on the way:** the base image declares a `VOLUME` on
`/var/lib/suricata`, so the `COPY local.rules` into it was masked at runtime and
the local scan rules had **never** loaded on any host (`1 rule files processed`
in the logs). `local.rules` now ships to `/opt/` and the entrypoint installs it
on every start — the same staging trick cowrie uses with `/cowrie-defaults`.

## Host layout gotcha

The sensor VPS runs its stack from `/opt/honeypot-sensor/docker-compose.yml` —
**not** `docker-compose.prod.honeypot.yml`, which is the repo-side file. The
compose project label points at the directory, not the file:

```
docker inspect suricata --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}'
```

The cowrie image has no shell and no `cat`. To read a file inside it:

```
docker exec cowrie /cowrie/cowrie-env/bin/python3 -c "print(open('<path>').read())"
```

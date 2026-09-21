#!/bin/bash
# Post-deploy boot check for the backend deploy scripts.
#
# `pm2 restart` returns as soon as the process is spawned, so a build that
# throws at startup still reports a green deploy while pm2 crash-loops it
# behind the scenes. On 2026-09-03 an express 5 bump did exactly that: the
# webhook posted "Backend Deploy (prod) 4.9s" and the API served 503 for the
# next ninety minutes until the external watchdog noticed.
#
# Usage: post_deploy_check <pm2-name> <backend-path>
#
# Reads PORT from the backend's .env (default 3000), waits for the server to
# answer HTTP on /health, then re-probes a few seconds later and requires the
# pm2 pid to be unchanged so a crash shortly after listen is caught too. Any
# HTTP status counts as booted: /health legitimately returns 503 when every
# RPC upstream is down, which is a node problem, not a deploy problem. Exits
# non-zero on failure so the webhook reports the deploy as failed.
post_deploy_check() {
  local name="$1" dir="$2"
  local port
  port="$(sed -nE 's/^PORT=([0-9]+).*/\1/p' "$dir/.env" 2>/dev/null | head -n1)"
  port="${port:-3000}"
  local url="http://127.0.0.1:${port}/health"
  local deadline=$((SECONDS + 30))
  local status=""

  echo "Waiting for ${name} to answer on ${url}..."
  while [ "$SECONDS" -lt "$deadline" ]; do
    status="$(curl -s -o /dev/null -w '%{http_code}' -m 3 "$url" || true)"
    if [ -n "$status" ] && [ "$status" != "000" ]; then
      break
    fi
    sleep 1
  done

  if [ -z "$status" ] || [ "$status" = "000" ]; then
    echo "DEPLOY FAILED: ${name} did not answer HTTP on ${url} within 30s"
    pm2 describe "$name" | grep -E 'status|restarts|uptime' || true
    pm2 logs "$name" --lines 30 --nostream --err || true
    return 1
  fi

  local pid_before pid_after
  pid_before="$(pm2 pid "$name" 2>/dev/null || true)"
  sleep 5
  pid_after="$(pm2 pid "$name" 2>/dev/null || true)"
  local status2
  status2="$(curl -s -o /dev/null -w '%{http_code}' -m 3 "$url" || true)"

  if [ "$pid_before" != "$pid_after" ] || [ -z "$status2" ] || [ "$status2" = "000" ]; then
    echo "DEPLOY FAILED: ${name} answered once then died (pid ${pid_before} -> ${pid_after:-none}, health ${status2:-none})"
    pm2 logs "$name" --lines 30 --nostream --err || true
    return 1
  fi

  if [ "$status2" = "200" ]; then
    echo "${name} healthy: /health 200, pid ${pid_after} stable"
  else
    echo "${name} booted but degraded: /health ${status2}, pid ${pid_after} stable (check RPC upstreams)"
  fi
  return 0
}

#!/bin/sh
# Coppergate worker entrypoint.
# As root: optionally start dockerd + gVisor for SANDBOX_MODE=docker
# (START_DOCKERD=1, e.g. on Fly Machines), then drop to the coppergate user.
set -eu

DATA_ROOT="${DOCKER_DATA_ROOT:-/data/docker}"
SANDBOX_DOCKERFILE=/opt/coppergate/sandbox/Dockerfile

log() { echo "[entrypoint] $*" >&2; }

start_dockerd() {
  if ! grep -q " /sys/fs/cgroup cgroup2 " /proc/mounts; then
    mount -t cgroup2 none /sys/fs/cgroup
  fi
  # cgroup v2 "no internal processes": move everything out of the root cgroup
  # so controllers can be delegated to containers (same as docker:dind).
  mkdir -p /sys/fs/cgroup/init
  xargs -rn1 < /sys/fs/cgroup/cgroup.procs > /sys/fs/cgroup/init/cgroup.procs 2>/dev/null || :
  sed -e 's/ / +/g' -e 's/^/+/' < /sys/fs/cgroup/cgroup.controllers \
    > /sys/fs/cgroup/cgroup.subtree_control
  mkdir -p "$DATA_ROOT"
  # --icc=false: sandbox containers cannot reach each other.
  # --dns: fixed public resolvers so the egress firewall below needs no
  # private-range exception.
  dockerd \
    --data-root "$DATA_ROOT" \
    --group docker \
    --icc=false \
    --ip6tables=false \
    --dns 1.1.1.1 --dns 8.8.8.8 \
    >/var/log/dockerd.log 2>&1 &

  i=0
  until docker info >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -ge 60 ]; then
      log "dockerd did not start; last log lines:"
      tail -n 40 /var/log/dockerd.log >&2 || true
      exit 1
    fi
    sleep 1
  done

  if ! docker info --format '{{json .Runtimes}}' | grep -q runsc; then
    log "runsc runtime not registered with dockerd"
    exit 1
  fi

  # Egress firewall for bridge containers (only fetch-only installs get a
  # network): no private, link-local, CGNAT or Fly-internal destinations.
  iptables -I DOCKER-USER -d 10.0.0.0/8 -j REJECT
  iptables -I DOCKER-USER -d 172.16.0.0/12 -j REJECT
  iptables -I DOCKER-USER -d 192.168.0.0/16 -j REJECT
  iptables -I DOCKER-USER -d 100.64.0.0/10 -j REJECT
  iptables -I DOCKER-USER -d 169.254.0.0/16 -j REJECT
  iptables -I DOCKER-USER -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
  # Containers must not reach services on the VM itself (docker0 gateway).
  iptables -I INPUT -i docker0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  iptables -A INPUT -i docker0 -j REJECT

  # Sandbox image tag follows the Dockerfile content; cached on the volume.
  tag="coppergate/sandbox:$(sha256sum "$SANDBOX_DOCKERFILE" | cut -c1-12)"
  if ! docker image inspect "$tag" >/dev/null 2>&1; then
    log "building sandbox image $tag"
    docker build -q -t "$tag" -f "$SANDBOX_DOCKERFILE" /opt/coppergate/sandbox >/dev/null
    docker image prune -f >/dev/null || true
  fi
  export SANDBOX_IMAGE="$tag"
  log "dockerd ready (data-root $DATA_ROOT, runsc, image $tag)"
}

if [ "$(id -u)" = "0" ]; then
  if [ "${START_DOCKERD:-0}" = "1" ]; then
    start_dockerd
  fi
  export HOME=/app USER=coppergate
  exec setpriv --reuid=coppergate --regid=coppergate --init-groups -- "$@"
fi
exec "$@"

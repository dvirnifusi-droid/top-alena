#!/bin/bash
# One-shot: install the Alena agent's public SSH key into root's authorized_keys.
# Idempotent — safe to run multiple times.
set -euo pipefail
mkdir -p /root/.ssh
chmod 700 /root/.ssh
KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAmLCnFiuIVn7fmG/d+Urt42C4SdBdskm3fKUmvvULV1 niv@alina-bot"
if grep -qF "niv@alina-bot" /root/.ssh/authorized_keys 2>/dev/null; then
  echo "==> key already installed (idempotent skip)"
else
  echo "$KEY" >> /root/.ssh/authorized_keys
  echo "==> key appended"
fi
chmod 600 /root/.ssh/authorized_keys
chown -R root:root /root/.ssh
echo "==> done. file now contains:"
grep -c '^' /root/.ssh/authorized_keys
echo "lines total"

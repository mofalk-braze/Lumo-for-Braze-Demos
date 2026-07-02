#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "${1:---help}" in
  --check|--install|--android-avd|-h|--help)
    exec "$ROOT_DIR/bootstrap-solcon.sh" "$@"
    ;;
  *)
    exec "$ROOT_DIR/bootstrap-solcon.sh" "$@"
    ;;
esac

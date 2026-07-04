#!/bin/bash
# Thin shim installed at /usr/local/bin/topalena-autodeploy.sh (the path
# the crontab calls). It just execs the repo copy, so autodeploy logic
# updates land with a regular git push — no more stale /usr/local/bin
# copies silently ignoring months of fixes.
#
# Install (once): cp /opt/top-alena/scripts/autodeploy-shim.sh /usr/local/bin/topalena-autodeploy.sh
exec bash /opt/top-alena/scripts/autodeploy.sh

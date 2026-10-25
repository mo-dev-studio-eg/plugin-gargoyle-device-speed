# Gargoyle Bandwidth Control plugin

The page keeps the router's WAN upload/download capacity at the top. Speed
policies use Kbps and Quota-style `Applies to` choices: the entire network,
specific IP addresses, all remaining hosts individually, or all remaining hosts
combined. Multiple IP addresses in a specific policy share that policy's
aggregate minimum and maximum rates.

The sum of minimum rates is validated separately against upload and download
capacity. Individual remaining-host policies reserve the minimum independently
for each known LAN host. A lightweight cron refresh (every five minutes) notices
DHCP/static-host changes and rebuilds individual QoS classes.

Policies match IPv4 addresses. Maxima may be left blank to use the router WAN
capacity. Remaining class bandwidth is shared by the Gargoyle QoS scheduler.

## Build

This separate repository has a GitHub Actions workflow at
`.github/workflows/build.yml`. Run **Build Device Speed plugin IPK** manually
from the Actions tab and download the `plugin-gargoyle-device-speed-ipk` artifact.
The workflow creates an architecture-independent IPK without compiling a full
firmware image. It includes Gargoyle's package-status metadata so the legacy
`gpkg` package manager can recognize a local IPK.

The Gargoyle `build.sh` in the parent workspace can also stage this plugin into
the OpenWrt package tree. It can be copied to `gargoyle/package/` for a
standalone OpenWrt package build. The underlying `qos-gargoyle` service is
required. The plugin backs up the existing QoS
configuration and hides the legacy upload/download setup pages; uninstalling
restores the saved configuration and menu entries.

The feature controls routed Internet traffic through the WAN QoS engine. It
does not shape traffic exchanged only within the LAN.

# Gargoyle Device Speed plugin

The plugin defines each group's minimum and optional maximum upload/download
rates for Internet traffic. All rates are entered in Mbps and converted to
Kbps for Gargoyle's QoS engine. Multiple devices in a group share the group's
aggregate rates; SFQ shares that group's bandwidth between active client flows.

The router upload/download capacities are configured independently. The sum of
group minimum upload rates must not exceed router upload capacity; the same
validation is applied independently to download. Unspecified group maxima use
the router capacity. Remaining bandwidth is shared evenly among QoS classes.

Devices can be selected from active DHCP leases or entered using an IPv4 and
MAC address. DHCP reservations are added for selected devices that do not
already have a reservation, so the IP-based QoS rules remain attached to the
same device.

## Build

This separate repository has a GitHub Actions workflow at
`.github/workflows/build.yml`. Run **Build Device Speed plugin IPK** manually
from the Actions tab and download the `plugin-gargoyle-device-speed-ipk` artifact.
The workflow creates an architecture-independent IPK without compiling a full
firmware image.

The Gargoyle `build.sh` in the parent workspace can also stage this plugin into
the OpenWrt package tree. It can be copied to `gargoyle/package/` for a
standalone OpenWrt package build. The underlying `qos-gargoyle` service is
required. The plugin backs up the existing QoS
configuration and hides the legacy upload/download setup pages; uninstalling
restores the saved configuration and menu entries.

The feature controls routed Internet traffic through the WAN QoS engine. It
does not shape traffic exchanged only within the LAN.

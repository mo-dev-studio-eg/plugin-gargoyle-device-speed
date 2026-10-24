#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="${1:-$repo_root/dist}"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

read_make_value()
{
	awk -F ':=' -v key="$1" '$1 == key {gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2); print $2; exit}' "$repo_root/Makefile"
}

package_name="$(read_make_value PKG_NAME)"
package_version="$(read_make_value PKG_VERSION)"
package_release="$(read_make_value PKG_RELEASE)"
package_arch="$(awk -F ':=' '/^[[:space:]]*PKGARCH:=/ {gsub(/[[:space:]]/, "", $2); print $2; exit}' "$repo_root/Makefile")"
package_depends="$(sed -n 's/^[[:space:]]*DEPENDS:=[[:space:]]*//p' "$repo_root/Makefile" | head -n 1 | sed 's/+//g; s/[[:space:]]\+/, /g')"

if [[ -z "$package_name" || -z "$package_version" || -z "$package_release" || "$package_arch" != "all" ]]; then
	echo "Could not read package metadata or package is not architecture-independent." >&2
	exit 1
fi

data_root="$work_dir/data"
control_root="$work_dir/control"
mkdir -p "$data_root" "$control_root" "$output_dir"
cp -a "$repo_root/files/." "$data_root/"

chmod 0755 \
	"$data_root/www/device_speed.sh" \
	"$data_root/usr/lib/gargoyle/device_speed_install.sh" \
	"$data_root/usr/lib/gargoyle/device_speed_uninstall.sh" \
	"$data_root/etc/uci-defaults/99-device-speed"

installed_size="$(du -sk "$data_root" | awk '{print $1}')"
cat > "$control_root/control" <<EOF
Package: $package_name
Version: $package_version-$package_release
Status: install user not-installed
Depends: $package_depends
Section: admin
Architecture: $package_arch
Installed-Size: $installed_size
Maintainer: Gargoyle Device Speed contributors
Description: Shared per-device upload and download limits for Gargoyle QoS.
EOF

cat > "$control_root/conffiles" <<'EOF'
/etc/config/device_speed
EOF

cat > "$control_root/postinst" <<'EOF'
#!/bin/sh
if [ -z "${IPKG_INSTROOT}" ]; then
	sh /usr/lib/gargoyle/device_speed_install.sh
fi
exit 0
EOF

cat > "$control_root/prerm" <<'EOF'
#!/bin/sh
if [ "$1" = "remove" ] && [ -z "${IPKG_INSTROOT}" ]; then
	sh /usr/lib/gargoyle/device_speed_uninstall.sh
fi
exit 0
EOF
chmod 0755 "$control_root/postinst" "$control_root/prerm"

printf '2.0\n' > "$work_dir/debian-binary"
tar --numeric-owner --owner=0 --group=0 -czf "$work_dir/control.tar.gz" -C "$control_root" control conffiles postinst prerm
tar --numeric-owner --owner=0 --group=0 -czf "$work_dir/data.tar.gz" -C "$data_root" .

package_file="$output_dir/${package_name}_${package_version}-${package_release}_${package_arch}.ipk"
rm -f "$package_file"
(cd "$work_dir" && ar r "$package_file" debian-binary control.tar.gz data.tar.gz >/dev/null)

ar t "$package_file" | diff -u <(printf 'debian-binary\ncontrol.tar.gz\ndata.tar.gz\n') -
echo "Built $package_file"

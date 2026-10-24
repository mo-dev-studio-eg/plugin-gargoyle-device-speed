#!/bin/sh
. /lib/functions.sh

/etc/init.d/qos_gargoyle stop >/dev/null 2>&1
rm -f /etc/config/qos_gargoyle

if [ -f /etc/config/qos_gargoyle.device_speed_backup ]; then
	mv /etc/config/qos_gargoyle.device_speed_backup /etc/config/qos_gargoyle
	/etc/init.d/qos_gargoyle enable >/dev/null 2>&1
	/etc/init.d/qos_gargoyle start >/dev/null 2>&1
fi

remove_managed_host()
{
	local section="$1"
	config_get managed "$section" device_speed_managed
	[ "$managed" = "1" ] && uci -q delete "dhcp.$section"
}
config_load dhcp
config_foreach remove_managed_host host
uci commit dhcp

if [ -f /etc/crontabs/root ]; then
	grep -Fv '/usr/lib/gargoyle/device_speed_refresh.sh' /etc/crontabs/root > /tmp/device_speed.cron
	mv /tmp/device_speed.cron /etc/crontabs/root
	/etc/init.d/cron restart >/dev/null 2>&1
fi

uci -q delete gargoyle.display.firewall_device_speed
uci -q delete gargoyle.scripts.firewall_device_speed
uci -q delete gargoyle.firewall.device_speed
uci set gargoyle.display.firewall_qosupload='QoS (Upload)'
uci set gargoyle.display.firewall_qosdownload='QoS (Download)'
uci set gargoyle.scripts.firewall_qosupload='qos_upload.sh'
uci set gargoyle.scripts.firewall_qosdownload='qos_download.sh'
uci set gargoyle.firewall.qosupload='200'
uci set gargoyle.firewall.qosdownload='300'
uci commit gargoyle
rm -f /etc/config/device_speed
rm -f /etc/config/device_speed_qos_migrated
exit 0

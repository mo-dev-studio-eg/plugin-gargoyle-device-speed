#!/bin/sh

CONFIG=/etc/config/qos_gargoyle
BACKUP=/etc/config/qos_gargoyle.device_speed_backup
MIGRATED=/etc/config/device_speed_qos_migrated

if [ ! -f "$MIGRATED" ]; then
	if [ -f "$CONFIG" ] && [ ! -f "$BACKUP" ]; then
		cp -p "$CONFIG" "$BACKUP"
	fi
	/etc/init.d/qos_gargoyle stop >/dev/null 2>&1
	/etc/init.d/qos_gargoyle disable >/dev/null 2>&1
	rm -f "$CONFIG"
	touch "$MIGRATED"
fi

uci -q delete gargoyle.display.firewall_qosupload
uci -q delete gargoyle.display.firewall_qosdownload
uci -q delete gargoyle.scripts.firewall_qosupload
uci -q delete gargoyle.scripts.firewall_qosdownload
uci -q delete gargoyle.firewall.qosupload
uci -q delete gargoyle.firewall.qosdownload
uci set gargoyle.display.firewall_device_speed='Bandwidth Control'
uci set gargoyle.scripts.firewall_device_speed='device_speed.sh'
uci set gargoyle.firewall.device_speed='200'
uci commit gargoyle

CRON_FILE=/etc/crontabs/root
CRON_ENTRY='*/5 * * * * /usr/lib/gargoyle/device_speed_refresh.sh'
CRON_TMP="/tmp/device_speed.cron.$$"
mkdir -p /etc/crontabs
if [ -r "$CRON_FILE" ]; then
	grep -Fv '/usr/lib/gargoyle/device_speed_refresh.sh' "$CRON_FILE" > "$CRON_TMP" 2>/dev/null || true
else
	: > "$CRON_TMP"
fi
echo "$CRON_ENTRY" >> "$CRON_TMP"
mv "$CRON_TMP" "$CRON_FILE"
chmod 600 "$CRON_FILE"
/etc/init.d/cron restart >/dev/null 2>&1

exit 0

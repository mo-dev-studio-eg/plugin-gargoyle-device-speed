#!/bin/sh

. /lib/functions.sh

STATE_FILE=/var/run/device_speed_clients
FORCE=0
[ "$1" = "--force" ] && FORCE=1

EXPLICIT_IPS=" "
CLIENT_IPS=" "
INDIVIDUAL_PRESENT=0
INDIVIDUAL_UP_MIN=0
INDIVIDUAL_UP_MAX=""
INDIVIDUAL_DOWN_MIN=0
INDIVIDUAL_DOWN_MAX=""
UPLOAD_CAPACITY=0
DOWNLOAD_CAPACITY=0
TOTAL_UP_MIN=0
TOTAL_DOWN_MIN=0

is_ipv4()
{
	local ip="$1"
	echo "$ip" | awk -F. 'NF==4 { for(i=1;i<=4;i++) if($i !~ /^[0-9]+$/ || $i<0 || $i>255) exit 1; exit 0 } { exit 1 }'
}

add_client_ip()
{
	local ip="$1"
	[ -n "$ip" ] || return
	is_ipv4 "$ip" || return
	case "$EXPLICIT_IPS" in *" $ip "*) return ;; esac
	case "$CLIENT_IPS" in *" $ip "*) return ;; esac
	CLIENT_IPS="$CLIENT_IPS$ip "
}

read_policy()
{
	local section="$1"
	local applies=""
	local ips=""
	local up_min=0
	local up_max=""
	local down_min=0
	local down_max=""
	config_get applies "$section" applies
	config_get ips "$section" ip
	config_get up_min "$section" upload_min 0
	config_get up_max "$section" upload_max
	config_get down_min "$section" download_min 0
	config_get down_max "$section" download_max
	if [ "$applies" = "only" ]; then
		EXPLICIT_IPS="$EXPLICIT_IPS$ips "
	fi
	if [ "$applies" = "others_individual" ]; then
		INDIVIDUAL_PRESENT=1
		INDIVIDUAL_UP_MIN="$up_min"
		INDIVIDUAL_UP_MAX="$up_max"
		INDIVIDUAL_DOWN_MIN="$down_min"
		INDIVIDUAL_DOWN_MAX="$down_max"
	fi
	if [ "$applies" = "others_individual" ]; then
		return
	fi
	if [ "$applies" = "all" ] || [ "$applies" = "only" ] || [ "$applies" = "others_combined" ]; then
		TOTAL_UP_MIN=$((TOTAL_UP_MIN + up_min))
		TOTAL_DOWN_MIN=$((TOTAL_DOWN_MIN + down_min))
	fi
}

read_capacity()
{
	config_get UPLOAD_CAPACITY main upload_capacity 0
	config_get DOWNLOAD_CAPACITY main download_capacity 0
}

config_load device_speed
config_foreach read_capacity settings
config_foreach read_policy policy
if [ "$UPLOAD_CAPACITY" -le 0 ] || [ "$DOWNLOAD_CAPACITY" -le 0 ]; then exit 0; fi

if [ -r /tmp/dhcp.leases ]; then
	while read expiry mac ip hostname; do add_client_ip "$ip"; done < /tmp/dhcp.leases
fi

read_reserved_host()
{
	local section="$1"
	local ip=""
	config_get ip "$section" ip
	add_client_ip "$ip"
}
config_load dhcp
config_foreach read_reserved_host host

LAN_IP="$(uci -q get network.lan.ipaddr)"
if [ -n "$LAN_IP" ]; then
	CLIENT_IPS="$(echo "$CLIENT_IPS" | tr ' ' '\n' | awk -v ip="$LAN_IP" 'NF && $0 != ip' | sort -u | tr '\n' ' ')"
else
	CLIENT_IPS="$(echo "$CLIENT_IPS" | tr ' ' '\n' | awk 'NF' | sort -u | tr '\n' ' ')"
fi
[ "$INDIVIDUAL_PRESENT" -eq 1 ] || CLIENT_IPS=""

CURRENT_STATE="$(printf '%s|%s|%s|%s\n' "$UPLOAD_CAPACITY" "$DOWNLOAD_CAPACITY" "$EXPLICIT_IPS" "$CLIENT_IPS")"
if [ "$FORCE" -eq 0 ] && [ -r "$STATE_FILE" ] && [ "$(cat "$STATE_FILE")" = "$CURRENT_STATE" ]; then exit 0; fi

set -- $CLIENT_IPS
CLIENT_COUNT=$#
if [ "$INDIVIDUAL_PRESENT" -eq 1 ]; then
	TOTAL_UP_MIN=$((TOTAL_UP_MIN + INDIVIDUAL_UP_MIN * CLIENT_COUNT))
	TOTAL_DOWN_MIN=$((TOTAL_DOWN_MIN + INDIVIDUAL_DOWN_MIN * CLIENT_COUNT))
fi
if [ "$TOTAL_UP_MIN" -gt "$UPLOAD_CAPACITY" ] || [ "$TOTAL_DOWN_MIN" -gt "$DOWNLOAD_CAPACITY" ]; then
	logger -t device_speed "Individual bandwidth policy exceeds configured router capacity; retaining previous individual classes"
	exit 1
fi

count_base_upload_class()
{
	local section="$1"
	local managed=""
	local generated=""
	config_get managed "$section" device_speed_managed
	config_get generated "$section" device_speed_generated_individual
	if [ "$managed" = "1" ] && [ "$generated" != "1" ]; then BASE_CLASS_COUNT=$((BASE_CLASS_COUNT + 1)); fi
}
BASE_CLASS_COUNT=0
config_load qos_gargoyle
config_foreach count_base_upload_class upload_class
if [ $((BASE_CLASS_COUNT + CLIENT_COUNT)) -gt 60 ]; then
	logger -t device_speed "More than 60 QoS classes would be required; retaining previous individual classes"
	exit 1
fi

remove_generated_class()
{
	local section="$1"
	local generated=""
	config_get generated "$section" device_speed_generated_individual
	[ "$generated" = "1" ] && uci -q delete "qos_gargoyle.$section"
}
remove_generated_rule()
{
	local section="$1"
	local generated=""
	config_get generated "$section" device_speed_generated_individual
	[ "$generated" = "1" ] && uci -q delete "qos_gargoyle.$section"
}
config_load qos_gargoyle
config_foreach remove_generated_class upload_class
config_foreach remove_generated_class download_class
config_foreach remove_generated_rule upload_rule
config_foreach remove_generated_rule download_rule

index=0
for ip in $CLIENT_IPS; do
	index=$((index + 1))
	upload_class="uclass_speed_ind_$index"
	download_class="dclass_speed_ind_$index"
	upload_rule="upload_rule_speed_ind_$index"
	download_rule="download_rule_speed_ind_$index"
	uci set "qos_gargoyle.$upload_class=upload_class"
	uci set "qos_gargoyle.$upload_class.name=Other_$ip"
	uci set "qos_gargoyle.$upload_class.device_speed_managed=1"
	uci set "qos_gargoyle.$upload_class.device_speed_generated_individual=1"
	uci set "qos_gargoyle.$download_class=download_class"
	uci set "qos_gargoyle.$download_class.name=Other_$ip"
	uci set "qos_gargoyle.$download_class.device_speed_managed=1"
	uci set "qos_gargoyle.$download_class.device_speed_generated_individual=1"
	if [ "$INDIVIDUAL_PRESENT" -eq 1 ]; then
		[ "$INDIVIDUAL_UP_MIN" -gt 0 ] && uci set "qos_gargoyle.$upload_class.min_bandwidth=$INDIVIDUAL_UP_MIN"
		[ -n "$INDIVIDUAL_UP_MAX" ] && uci set "qos_gargoyle.$upload_class.max_bandwidth=$INDIVIDUAL_UP_MAX"
		[ "$INDIVIDUAL_DOWN_MIN" -gt 0 ] && uci set "qos_gargoyle.$download_class.min_bandwidth=$INDIVIDUAL_DOWN_MIN"
		[ -n "$INDIVIDUAL_DOWN_MAX" ] && uci set "qos_gargoyle.$download_class.max_bandwidth=$INDIVIDUAL_DOWN_MAX"
	fi
	uci set "qos_gargoyle.$upload_rule=upload_rule"
	uci set "qos_gargoyle.$upload_rule.class=$upload_class"
	uci set "qos_gargoyle.$upload_rule.test_order=$((100000 + index * 100))"
	uci set "qos_gargoyle.$upload_rule.source=$ip"
	uci set "qos_gargoyle.$upload_rule.device_speed_managed=1"
	uci set "qos_gargoyle.$upload_rule.device_speed_generated_individual=1"
	uci set "qos_gargoyle.$download_rule=download_rule"
	uci set "qos_gargoyle.$download_rule.class=$download_class"
	uci set "qos_gargoyle.$download_rule.test_order=$((100000 + index * 100))"
	uci set "qos_gargoyle.$download_rule.destination=$ip"
	uci set "qos_gargoyle.$download_rule.device_speed_managed=1"
	uci set "qos_gargoyle.$download_rule.device_speed_generated_individual=1"
done

count_managed_upload_class()
{
	local section="$1"
	local managed=""
	config_get managed "$section" device_speed_managed
	[ "$managed" = "1" ] && MANAGED_CLASS_COUNT=$((MANAGED_CLASS_COUNT + 1))
}
MANAGED_CLASS_COUNT=0
config_load qos_gargoyle
config_foreach count_managed_upload_class upload_class
if [ "$MANAGED_CLASS_COUNT" -gt 0 ]; then
	CLASS_SHARE=$((100 / MANAGED_CLASS_COUNT))
	SHARE_REMAINDER=$((100 - CLASS_SHARE * MANAGED_CLASS_COUNT))
	set_class_share()
	{
		local section="$1"
		local managed=""
		config_get managed "$section" device_speed_managed
		if [ "$managed" = "1" ]; then
			share="$CLASS_SHARE"
			if [ "$SHARE_REMAINDER" -gt 0 ]; then share=$((share + 1)); SHARE_REMAINDER=$((SHARE_REMAINDER - 1)); fi
			uci set "qos_gargoyle.$section.percent_bandwidth=$share"
		fi
	}
	config_foreach set_class_share upload_class
	SHARE_REMAINDER=$((100 - CLASS_SHARE * MANAGED_CLASS_COUNT))
	config_foreach set_class_share download_class
fi

uci commit qos_gargoyle
echo "$CURRENT_STATE" > "$STATE_FILE"
/etc/init.d/qos_gargoyle start >/dev/null 2>&1
exit 0

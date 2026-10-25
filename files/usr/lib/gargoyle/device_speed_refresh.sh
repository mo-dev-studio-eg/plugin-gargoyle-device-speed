#!/bin/sh

. /lib/functions.sh

STATE_FILE=/var/run/device_speed_state
FORCE=0
[ "$1" = "--force" ] && FORCE=1

EXPLICIT_IPS=" "
CLIENT_IPS=" "
ONLY_POLICIES=""
ALL_POLICY=""
COMBINED_POLICY=""
INDIVIDUAL_POLICY=""
UPLOAD_CAPACITY=0
DOWNLOAD_CAPACITY=0
TOTAL_UP_MIN=0
TOTAL_DOWN_MIN=0
POLICY_COUNT=0
ONLY_COUNT=0
RULE_COUNT=0

log()
{
	echo "INFO: $*"
	logger -t device_speed "$*"
}

error()
{
	echo "ERROR: $*"
	logger -t device_speed "$*"
	exit 1
}

is_uint()
{
	echo "$1" | grep -Eq '^[0-9]+$'
}

is_ipv4()
{
	echo "$1" | awk -F. 'NF==4 { for(i=1;i<=4;i++) if($i !~ /^[0-9]+$/ || $i<0 || $i>255) exit 1; exit 0 } { exit 1 }'
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

read_capacity()
{
	config_get UPLOAD_CAPACITY main upload_capacity 0
	config_get DOWNLOAD_CAPACITY main download_capacity 0
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

	if ! is_uint "$up_min" || ! is_uint "$down_min"; then error "Invalid minimum rate in $section"; fi
	[ -z "$up_max" ] || is_uint "$up_max" || error "Invalid upload maximum in $section"
	[ -z "$down_max" ] || is_uint "$down_max" || error "Invalid download maximum in $section"
	[ -z "$up_max" ] || [ "$up_max" -ge "$up_min" ] || error "Upload maximum is below minimum in $section"
	[ -z "$down_max" ] || [ "$down_max" -ge "$down_min" ] || error "Download maximum is below minimum in $section"
	[ "$up_min" -le "$UPLOAD_CAPACITY" ] || error "Upload minimum exceeds router capacity"
	[ "$down_min" -le "$DOWNLOAD_CAPACITY" ] || error "Download minimum exceeds router capacity"
	[ -z "$up_max" ] || [ "$up_max" -le "$UPLOAD_CAPACITY" ] || error "Upload maximum exceeds router capacity"
	[ -z "$down_max" ] || [ "$down_max" -le "$DOWNLOAD_CAPACITY" ] || error "Download maximum exceeds router capacity"
	log "Policy $section applies=$applies; upload=${up_min}-${up_max:-$UPLOAD_CAPACITY} Kbps; download=${down_min}-${down_max:-$DOWNLOAD_CAPACITY} Kbps"

	POLICY_COUNT=$((POLICY_COUNT + 1))
	case "$applies" in
		all)
			[ -z "$ALL_POLICY" ] || error "Only one entire-network policy is allowed"
			ALL_POLICY="$section"
			TOTAL_UP_MIN=$((TOTAL_UP_MIN + up_min))
			TOTAL_DOWN_MIN=$((TOTAL_DOWN_MIN + down_min))
		;;
		only)
			[ -n "$ips" ] || error "An explicit policy has no IP addresses"
			for ip in $ips; do
				is_ipv4 "$ip" || error "Invalid IP address in $section: $ip"
				case "$EXPLICIT_IPS" in *" $ip "*) error "An IP appears in more than one explicit policy: $ip" ;; esac
				EXPLICIT_IPS="$EXPLICIT_IPS$ip "
				log "Policy $section includes IP $ip"
			done
			ONLY_POLICIES="$ONLY_POLICIES $section"
			ONLY_COUNT=$((ONLY_COUNT + 1))
			TOTAL_UP_MIN=$((TOTAL_UP_MIN + up_min))
			TOTAL_DOWN_MIN=$((TOTAL_DOWN_MIN + down_min))
		;;
		others_combined)
			[ -z "$COMBINED_POLICY" ] || error "Only one combined remaining-host policy is allowed"
			COMBINED_POLICY="$section"
			TOTAL_UP_MIN=$((TOTAL_UP_MIN + up_min))
			TOTAL_DOWN_MIN=$((TOTAL_DOWN_MIN + down_min))
		;;
		others_individual)
			[ -z "$INDIVIDUAL_POLICY" ] || error "Only one individual remaining-host policy is allowed"
			INDIVIDUAL_POLICY="$section"
		;;
		*) error "Unsupported Applies to value in $section" ;;
	esac
}

config_load device_speed
config_foreach read_capacity settings
if ! is_uint "$UPLOAD_CAPACITY" || ! is_uint "$DOWNLOAD_CAPACITY" || [ "$UPLOAD_CAPACITY" -le 0 ] || [ "$DOWNLOAD_CAPACITY" -le 0 ]; then
	error "Router upload and download capacities must be configured in Kbps"
fi
config_foreach read_policy policy

[ -z "$ALL_POLICY" ] || { [ -z "$COMBINED_POLICY" ] && [ -z "$INDIVIDUAL_POLICY" ]; } || error "An entire-network policy cannot be combined with a remaining-host policy"
[ -z "$COMBINED_POLICY" ] || [ -z "$INDIVIDUAL_POLICY" ] || error "Combined and individual remaining-host policies cannot both be used"
[ "$TOTAL_UP_MIN" -le "$UPLOAD_CAPACITY" ] || error "Sum of upload minimums exceeds router capacity"
[ "$TOTAL_DOWN_MIN" -le "$DOWNLOAD_CAPACITY" ] || error "Sum of download minimums exceeds router capacity"
log "Validated capacities: upload=${UPLOAD_CAPACITY} Kbps, download=${DOWNLOAD_CAPACITY} Kbps; policies=$POLICY_COUNT"

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
[ -n "$INDIVIDUAL_POLICY" ] || CLIENT_IPS=""

set -- $CLIENT_IPS
CLIENT_COUNT=$#
log "Matched LAN clients: $CLIENT_COUNT; explicit IPs: $(echo "$EXPLICIT_IPS" | wc -w)"
if [ -n "$INDIVIDUAL_POLICY" ]; then
	config_load device_speed
	config_get IND_UP_MIN "$INDIVIDUAL_POLICY" upload_min 0
	config_get IND_DOWN_MIN "$INDIVIDUAL_POLICY" download_min 0
	TOTAL_UP_MIN=$((TOTAL_UP_MIN + IND_UP_MIN * CLIENT_COUNT))
	TOTAL_DOWN_MIN=$((TOTAL_DOWN_MIN + IND_DOWN_MIN * CLIENT_COUNT))
fi
[ "$TOTAL_UP_MIN" -le "$UPLOAD_CAPACITY" ] || error "Sum of upload minimums exceeds router capacity"
[ "$TOTAL_DOWN_MIN" -le "$DOWNLOAD_CAPACITY" ] || error "Sum of download minimums exceeds router capacity"

CLASS_COUNT=$((1 + ONLY_COUNT + CLIENT_COUNT))
[ "$CLASS_COUNT" -le 60 ] || error "QoS class limit exceeded (maximum 60)"

CURRENT_STATE="$(uci -q show device_speed; printf '%s\n' "$CLIENT_IPS")"
if [ "$FORCE" -eq 0 ] && [ -r "$STATE_FILE" ] && [ "$(cat "$STATE_FILE")" = "$CURRENT_STATE" ] &&
	[ "$(uci -q get qos_gargoyle.upload.total_bandwidth)" = "$UPLOAD_CAPACITY" ] &&
	[ "$(uci -q get qos_gargoyle.download.total_bandwidth)" = "$DOWNLOAD_CAPACITY" ] &&
	[ "$(uci -q get qos_gargoyle.upload.device_speed_managed)" = "1" ]; then
	exit 0
fi

# Ensure the QoS config file exists; uci cannot create it on older OpenWrt.
[ -f /etc/config/qos_gargoyle ] || touch /etc/config/qos_gargoyle

# This plugin owns the QoS configuration after installation. Rebuild it from
# the validated device_speed model so no stale upload/download classes survive.
old_sections="$(uci -q show qos_gargoyle 2>/dev/null | sed -n 's/^qos_gargoyle\.\([^.=]*\)=.*/\1/p' | sort -u)"
set -- $old_sections
log "Replacing $#: existing QoS sections"
for section in $old_sections; do uci -q delete "qos_gargoyle.$section" 2>/dev/null; done

uci set qos_gargoyle.upload=upload
uci set qos_gargoyle.download=download
uci set "qos_gargoyle.upload.total_bandwidth=$UPLOAD_CAPACITY"
uci set "qos_gargoyle.download.total_bandwidth=$DOWNLOAD_CAPACITY"
uci set qos_gargoyle.upload.default_class=uclass_speed_default
uci set qos_gargoyle.download.default_class=dclass_speed_default
uci set qos_gargoyle.upload.device_speed_managed=1
uci set qos_gargoyle.download.device_speed_managed=1
uci set qos_gargoyle.download.qos_monenabled=false
uci set gargoyle.status.qos=300

CLASS_SHARE=$((100 / CLASS_COUNT))
SHARE_REMAINDER=$((100 - CLASS_SHARE * CLASS_COUNT))
next_share()
{
	NEXT_SHARE="$CLASS_SHARE"
	if [ "$SHARE_REMAINDER" -gt 0 ]; then NEXT_SHARE=$((NEXT_SHARE + 1)); SHARE_REMAINDER=$((SHARE_REMAINDER - 1)); fi
}

create_class_pair()
{
	local id="$1"
	local label="$2"
	local up_min="$3"
	local up_max="$4"
	local down_min="$5"
	local down_max="$6"
	local generated="$7"
	next_share
	local share="$NEXT_SHARE"
	for direction in upload download; do
		if [ "$direction" = "upload" ]; then class="uclass_$id"; type=upload_class; min="$up_min"; max="$up_max"; else class="dclass_$id"; type=download_class; min="$down_min"; max="$down_max"; fi
		uci set "qos_gargoyle.$class=$type"
		uci set "qos_gargoyle.$class.name=$label"
		uci set "qos_gargoyle.$class.percent_bandwidth=$share"
		uci set "qos_gargoyle.$class.device_speed_managed=1"
		[ "$generated" = "1" ] && uci set "qos_gargoyle.$class.device_speed_generated_individual=1"
		[ "$min" -gt 0 ] && uci set "qos_gargoyle.$class.min_bandwidth=$min"
		[ -z "$max" ] || uci set "qos_gargoyle.$class.max_bandwidth=$max"
	done
}

create_rule_pair()
{
	local id="$1"
	local class_id="$2"
	local ip="$3"
	local order="$4"
	local generated="$5"
	log "QoS rule: $ip -> class $class_id ($id)"
	uci set "qos_gargoyle.upload_rule_$id=upload_rule"
	uci set "qos_gargoyle.upload_rule_$id.class=uclass_$class_id"
	uci set "qos_gargoyle.upload_rule_$id.test_order=$order"
	uci set "qos_gargoyle.upload_rule_$id.source=$ip"
	uci set "qos_gargoyle.download_rule_$id=download_rule"
	uci set "qos_gargoyle.download_rule_$id.class=dclass_$class_id"
	uci set "qos_gargoyle.download_rule_$id.test_order=$order"
	uci set "qos_gargoyle.download_rule_$id.destination=$ip"
	if [ "$generated" = "1" ]; then
		uci set "qos_gargoyle.upload_rule_$id.device_speed_managed=1"
		uci set "qos_gargoyle.upload_rule_$id.device_speed_generated_individual=1"
		uci set "qos_gargoyle.download_rule_$id.device_speed_managed=1"
		uci set "qos_gargoyle.download_rule_$id.device_speed_generated_individual=1"
	fi
}

config_load device_speed
default_section="$ALL_POLICY"
[ -n "$default_section" ] || default_section="$COMBINED_POLICY"
if [ -n "$default_section" ]; then
	config_get default_up_min "$default_section" upload_min 0
	config_get default_up_max "$default_section" upload_max
	config_get default_down_min "$default_section" download_min 0
	config_get default_down_max "$default_section" download_max
	default_name="Network policy"
	[ -z "$COMBINED_POLICY" ] || [ "$default_section" != "$COMBINED_POLICY" ] || default_name="Other hosts combined"
else
	default_up_min=0; default_up_max=""; default_down_min=0; default_down_max=""; default_name="Other devices"
fi
create_class_pair speed_default "$default_name" "$default_up_min" "$default_up_max" "$default_down_min" "$default_down_max" 0

policy_index=0
rule_order=100
for section in $ONLY_POLICIES; do
	policy_index=$((policy_index + 1))
	config_get ips "$section" ip
	config_get up_min "$section" upload_min 0
	config_get up_max "$section" upload_max
	config_get down_min "$section" download_min 0
	config_get down_max "$section" download_max
	class_id="speed_policy_$policy_index"
	create_class_pair "$class_id" "Explicit_policy_$policy_index" "$up_min" "$up_max" "$down_min" "$down_max" 0
	ip_index=0
	for ip in $ips; do
		ip_index=$((ip_index + 1))
		create_rule_pair "speed_policy_${policy_index}_${ip_index}" "$class_id" "$ip" "$rule_order" 0
		rule_order=$((rule_order + 100))
		RULE_COUNT=$((RULE_COUNT + 1))
	done
done

if [ -n "$INDIVIDUAL_POLICY" ]; then
	config_get up_min "$INDIVIDUAL_POLICY" upload_min 0
	config_get up_max "$INDIVIDUAL_POLICY" upload_max
	config_get down_min "$INDIVIDUAL_POLICY" download_min 0
	config_get down_max "$INDIVIDUAL_POLICY" download_max
	index=0
	for ip in $CLIENT_IPS; do
		index=$((index + 1))
		class_id="speed_ind_$index"
		create_class_pair "$class_id" "Other_$ip" "$up_min" "$up_max" "$down_min" "$down_max" 1
		create_rule_pair "speed_ind_$index" "$class_id" "$ip" "$rule_order" 1
		rule_order=$((rule_order + 100))
		RULE_COUNT=$((RULE_COUNT + 1))
	done
fi

log "Generated QoS classes=$CLASS_COUNT and IP rules=$RULE_COUNT; committing configuration"
uci commit qos_gargoyle
uci commit gargoyle
if [ "$(uci -q get qos_gargoyle.upload.total_bandwidth)" != "$UPLOAD_CAPACITY" ] || [ "$(uci -q get qos_gargoyle.download.total_bandwidth)" != "$DOWNLOAD_CAPACITY" ]; then
	error "QoS bandwidth settings did not persist"
fi
actual_upload_classes="$(uci -q show qos_gargoyle | grep -c '=upload_class$')"
actual_download_classes="$(uci -q show qos_gargoyle | grep -c '=download_class$')"
actual_upload_rules="$(uci -q show qos_gargoyle | grep -c '=upload_rule$')"
actual_download_rules="$(uci -q show qos_gargoyle | grep -c '=download_rule$')"
if [ "$actual_upload_classes" -ne "$CLASS_COUNT" ] || [ "$actual_download_classes" -ne "$CLASS_COUNT" ] || [ "$actual_upload_rules" -ne "$RULE_COUNT" ] || [ "$actual_download_rules" -ne "$RULE_COUNT" ]; then
	error "QoS objects mismatch: expected classes=$CLASS_COUNT rules=$RULE_COUNT, got upload classes=$actual_upload_classes rules=$actual_upload_rules; download classes=$actual_download_classes rules=$actual_download_rules"
fi
log "Persisted QoS config: upload classes=$actual_upload_classes rules=$actual_upload_rules; download classes=$actual_download_classes rules=$actual_download_rules"
/etc/init.d/qos_gargoyle stop >/dev/null 2>&1
wan_interface="$(uci -q -P /var/state get network.wan.ifname 2>/dev/null)"
[ -n "$wan_interface" ] || wan_interface="$(uci -q -P /var/state get network.wan.device 2>/dev/null)"
[ -n "$wan_interface" ] || error "Cannot determine the active WAN interface"
old_wan_qdisc="$(tc qdisc show dev "$wan_interface" 2>&1 | grep -E 'qdisc (hfsc|tbf|prio)' | tr '\n' ';')"
old_download_qdisc="$(tc qdisc show dev imq0 2>&1 | grep -E 'qdisc (hfsc|tbf|prio)' | tr '\n' ';')"
log "Previous qdiscs: WAN($wan_interface)=${old_wan_qdisc:-none}; imq0=${old_download_qdisc:-none}"
log "Clearing stale root qdiscs before applying HFSC"
tc qdisc del dev "$wan_interface" root >/dev/null 2>&1
tc qdisc del dev imq0 root >/dev/null 2>&1
/etc/init.d/qos_gargoyle enable >/dev/null 2>&1
if /etc/init.d/qos_gargoyle start >/dev/null 2>&1; then
	log "qos_gargoyle start command completed"
else
	error "qos_gargoyle start command failed"
fi

wan_qdisc="$(tc qdisc show dev "$wan_interface" 2>&1 | grep -E 'qdisc (hfsc|tbf|prio)' | tr '\n' ';')"
download_qdisc="$(tc qdisc show dev imq0 2>&1 | grep -E 'qdisc (hfsc|tbf|prio)' | tr '\n' ';')"
if ! echo "$wan_qdisc" | grep -q 'qdisc hfsc'; then
	error "No HFSC upload qdisc on WAN interface '$wan_interface'. Current WAN qdisc: ${wan_qdisc:-none}"
fi
if ! echo "$download_qdisc" | grep -q 'qdisc hfsc'; then
	error "No HFSC download qdisc on imq0. Current download qdisc: ${download_qdisc:-none}"
fi

echo "$CURRENT_STATE" > "$STATE_FILE"
log "QoS verified: WAN interface=$wan_interface; qdisc=$wan_qdisc"
log "QoS verified: download interface=imq0; qdisc=$download_qdisc"
exit 0

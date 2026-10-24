#!/usr/bin/haserl
<%
	eval $( gargoyle_session_validator -c "$COOKIE_hash" -e "$COOKIE_exp" -a "$HTTP_USER_AGENT" -i "$REMOTE_ADDR" -r "login.sh" -t $(uci get gargoyle.global.session_timeout) -b "$COOKIE_browser_time" )
	gargoyle_header_footer -h -s "firewall" -p "device_speed" -c "internal.css" -j "device_speed.js table.js" -n gargoyle dhcp network device_speed
%>

<script>
var dhcpLeaseLines = [];
<%
	if [ -r /tmp/dhcp.leases ]; then
		awk '{gsub(/\\/, "\\\\"); gsub(/\"/, "\\\""); print "dhcpLeaseLines.push(\""$0"\");"}' /tmp/dhcp.leases
	fi
%>
</script>

<fieldset>
	<legend class="sectionheader">Router Internet capacity</legend>
	<div><label class="leftcolumn" for="upload_capacity">Maximum upload:</label><input id="upload_capacity" type="number" min="0.001" step="0.001" /> <em>Mbps</em></div>
	<div><label class="leftcolumn" for="download_capacity">Maximum download:</label><input id="download_capacity" type="number" min="0.001" step="0.001" /> <em>Mbps</em></div>
	<p>Enter the usable WAN speed. Device groups share this capacity.</p>
</fieldset>

<fieldset>
	<legend class="sectionheader">Add a shared speed group</legend>
	<div><label class="leftcolumn" for="group_name">Group name:</label><input id="group_name" maxlength="24" /></div>
	<div><label class="leftcolumn" for="group_upload_min">Upload minimum:</label><input id="group_upload_min" type="number" min="0" step="0.001" value="0" /> <em>Mbps</em></div>
	<div><label class="leftcolumn" for="group_upload_max">Upload maximum:</label><input id="group_upload_max" type="number" min="0.001" step="0.001" /> <em>Mbps (blank = router maximum)</em></div>
	<div><label class="leftcolumn" for="group_download_min">Download minimum:</label><input id="group_download_min" type="number" min="0" step="0.001" value="0" /> <em>Mbps</em></div>
	<div><label class="leftcolumn" for="group_download_max">Download maximum:</label><input id="group_download_max" type="number" min="0.001" step="0.001" /> <em>Mbps (blank = router maximum)</em></div>
	<div class="internal_divider"></div>
	<div><label class="leftcolumn" for="existing_group">Add devices to:</label><select id="existing_group"><option value="">New group</option></select></div>
	<div><label class="leftcolumn" for="dhcp_device">DHCP device:</label><select id="dhcp_device"><option value="">Select a connected DHCP device</option></select>
	<input type="button" id="add_dhcp_device" value="Add device to group" /></div>
	<div><label class="leftcolumn" for="manual_ip">Manual device IP:</label><input id="manual_ip" placeholder="192.168.1.20" /></div>
	<div><label class="leftcolumn" for="manual_mac">Manual device MAC:</label><input id="manual_mac" placeholder="AA:BB:CC:DD:EE:FF" /></div>
	<div><input type="button" id="add_manual_device" value="Add manual device to group" /></div>
	<div id="pending_members"></div>
	<div><input type="button" id="add_group" class="default_button" value="Add group" /></div>
</fieldset>

<fieldset>
	<legend class="sectionheader">Speed groups</legend>
	<div id="groups_container"></div>
</fieldset>

<div id="bottom_button_container">
	<input type="button" id="save_button" class="bottom_button" value="Save changes" onclick="saveChanges()" />
	<input type="button" id="reset_button" class="bottom_button" value="Reset" onclick="resetData()" />
</div>
<div id="update_container"></div>

<script>resetData();</script>
<%
	gargoyle_header_footer -f -s "firewall" -p "device_speed"
%>

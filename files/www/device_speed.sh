#!/usr/bin/haserl
<%
	eval $( gargoyle_session_validator -c "$COOKIE_hash" -e "$COOKIE_exp" -a "$HTTP_USER_AGENT" -i "$REMOTE_ADDR" -r "login.sh" -t $(uci get gargoyle.global.session_timeout) -b "$COOKIE_browser_time" )
	gargoyle_header_footer -h -s "firewall" -p "device_speed" -c "internal.css" -j "device_speed.js table.js" -n gargoyle dhcp network qos_gargoyle device_speed
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
	<div><label class="leftcolumn" for="upload_capacity">Maximum upload:</label><input id="upload_capacity" type="number" min="1" step="1" /> <em>Kbps</em></div>
	<div><label class="leftcolumn" for="download_capacity">Maximum download:</label><input id="download_capacity" type="number" min="1" step="1" /> <em>Kbps</em></div>
	<p>Enter the usable WAN speed. All bandwidth policies share this capacity.</p>
</fieldset>

<fieldset>
	<legend class="sectionheader">Add a bandwidth policy</legend>
	<div>
		<label class="leftcolumn" for="applies_to_type">Applies to:</label>
		<select id="applies_to_type" onchange="setPolicyVisibility()">
			<option value="all">Entire Local Network</option>
			<option value="only">Only the following hosts</option>
			<option value="others_individual">All individual hosts without explicit policies</option>
			<option value="others_combined">All hosts without explicit policies (combined)</option>
		</select>
	</div>
	<div id="policy_ip_container">
		<div id="policy_ip_table_container" class="widerightcolumnonly"></div>
		<div class="widerightcolumnonly">
			<input type="text" id="add_ip" onkeyup="proofreadMultipleIps(this)" style="width:250px;" />
			<input type="button" class="default_button" id="add_ip_button" value="Add" onclick="addPolicyAddresses()" />
		</div>
		<div class="widerightcolumnonly"><em>Enter a LAN IP address, then press Add. Repeat to include more devices at the same rates.</em></div>
	</div>
	<div><label class="leftcolumn" for="policy_upload_min">Upload minimum:</label><input id="policy_upload_min" type="number" min="0" step="1" value="0" /> <em>Kbps</em></div>
	<div><label class="leftcolumn" for="policy_upload_max">Upload maximum:</label><input id="policy_upload_max" type="number" min="1" step="1" /> <em>Kbps (blank = router maximum)</em></div>
	<div><label class="leftcolumn" for="policy_download_min">Download minimum:</label><input id="policy_download_min" type="number" min="0" step="1" value="0" /> <em>Kbps</em></div>
	<div><label class="leftcolumn" for="policy_download_max">Download maximum:</label><input id="policy_download_max" type="number" min="1" step="1" /> <em>Kbps (blank = router maximum)</em></div>
	<div class="internal_divider"></div>
	<div><input type="button" id="add_policy" class="default_button" value="Add policy" /></div>
	<div><input type="button" id="cancel_policy_edit" value="Cancel edit" style="display:none;" /></div>

	<div id='internal_divider1' class='internal_divider'></div>

	<span id="active_policies_label" style="text-decoration:underline">Active bandwidth policies:</span>

	<div id="policies_table_container"></div>
</fieldset>

<div id="bottom_button_container">
	<input type="button" id="save_button" class="bottom_button" value="Save changes" onclick="saveChanges()" />
	<input type="button" id="reset_button" class="bottom_button" value="Reset" onclick="resetData()" />
</div>

<script>resetData();</script>
<%
	gargoyle_header_footer -f -s "firewall" -p "device_speed"
%>

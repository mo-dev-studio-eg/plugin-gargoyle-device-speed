var deviceSpeedGroups = [];
var pendingSpeedMembers = [];
var deviceSpeedSaving = false;

function resetData()
{
	setValue("upload_capacity", uciOriginal.get("device_speed", "main", "upload_capacity"));
	setValue("download_capacity", uciOriginal.get("device_speed", "main", "download_capacity"));
	deviceSpeedGroups = [];
	pendingSpeedMembers = [];
	var sections = uciOriginal.getAllSectionsOfType("device_speed", "group");
	for(var i = 0; i < sections.length; i++)
	{
		var section = sections[i];
		var members = uciOriginal.get("device_speed", section, "member");
		if(!(members instanceof Array)) { members = members == "" ? [] : [members]; }
		deviceSpeedGroups.push({
			name: uciOriginal.get("device_speed", section, "name"),
			uploadMin: kbpsToMbps(uciOriginal.get("device_speed", section, "upload_min")),
			uploadMax: kbpsToMbps(uciOriginal.get("device_speed", section, "upload_max")),
			downloadMin: kbpsToMbps(uciOriginal.get("device_speed", section, "download_min")),
			downloadMax: kbpsToMbps(uciOriginal.get("device_speed", section, "download_max")),
			members: members
		});
	}
	populateDhcpDevices();
	renderPendingMembers();
	renderSpeedGroups();
}

function setValue(id, value)
{
	document.getElementById(id).value = value == null ? "" : value;
}

function kbpsToMbps(value)
{
	return value == null || value === "" ? "" : (parseInt(value, 10) / 1000).toFixed(3).replace(/\.000$/, "");
}

function populateDhcpDevices()
{
	var select = document.getElementById("dhcp_device");
	var seenMacs = [];
	while(select.options.length > 1) { select.remove(1); }
	for(var i = 0; i < dhcpLeaseLines.length; i++)
	{
		var fields = dhcpLeaseLines[i].trim().split(/[\t ]+/);
		if(fields.length < 3 || !isValidMac(fields[1]) || !isValidIPv4(fields[2])) { continue; }
		var mac = fields[1].toUpperCase();
		var ip = staticIpForMac(mac) || fields[2];
		var label = (fields[3] && fields[3] != "*") ? fields[3] + " — " + ip : ip + " — " + mac;
		appendDhcpDeviceOption(select, mac, ip, label);
		seenMacs.push(mac);
	}
	var hosts = uciOriginal.getAllSectionsOfType("dhcp", "host");
	for(i = 0; i < hosts.length; i++)
	{
		var hostMacs = uciOriginal.get("dhcp", hosts[i], "mac");
		if(!(hostMacs instanceof Array)) { hostMacs = hostMacs == "" ? [] : hostMacs.split(/[\t ]+/); }
		var hostIp = uciOriginal.get("dhcp", hosts[i], "ip");
		var hostName = uciOriginal.get("dhcp", hosts[i], "name");
		if(!isValidIPv4(hostIp)) { continue; }
		for(var m = 0; m < hostMacs.length; m++)
		{
			var hostMac = hostMacs[m].toUpperCase();
			if(isValidMac(hostMac) && seenMacs.indexOf(hostMac) < 0)
			{
				appendDhcpDeviceOption(select, hostMac, hostIp, (hostName || hostIp) + " — " + hostMac);
				seenMacs.push(hostMac);
			}
		}
	}
}

function appendDhcpDeviceOption(select, mac, ip, label)
{
	var option = document.createElement("option");
	option.value = mac + "|" + ip;
	option.appendChild(document.createTextNode(label));
	select.appendChild(option);
}

function staticIpForMac(mac)
{
	var hosts = uciOriginal.getAllSectionsOfType("dhcp", "host");
	for(var i = 0; i < hosts.length; i++)
	{
		var configuredMac = uciOriginal.get("dhcp", hosts[i], "mac");
		if(configuredMac instanceof Array) { configuredMac = configuredMac.join(" "); }
		if((" " + configuredMac.toUpperCase() + " ").indexOf(" " + mac.toUpperCase() + " ") >= 0)
		{
			var ip = uciOriginal.get("dhcp", hosts[i], "ip");
			if(isValidIPv4(ip)) { return ip; }
		}
	}
	return "";
}

function isValidMac(mac)
{
	return /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(mac);
}

function isValidIPv4(ip)
{
	var parts = ip.split(".");
	if(parts.length != 4) { return false; }
	for(var i = 0; i < parts.length; i++)
	{
		if(!/^\d{1,3}$/.test(parts[i]) || parseInt(parts[i], 10) > 255) { return false; }
	}
	return true;
}

function ipv4Number(ip)
{
	var parts = ip.split(".");
	var value = 0;
	for(var i = 0; i < 4; i++) { value = (value << 8) | parseInt(parts[i], 10); }
	return value >>> 0;
}

function isLanAddress(ip)
{
	var lanIp = uciOriginal.get("network", "lan", "ipaddr");
	if(!isValidIPv4(lanIp)) { return true; }
	if(ip == lanIp) { return false; }
	var mask = uciOriginal.get("network", "lan", "netmask") || "255.255.255.0";
	if(!isValidIPv4(mask)) { return false; }
	var maskNumber = ipv4Number(mask);
	return (ipv4Number(ip) & maskNumber) == (ipv4Number(lanIp) & maskNumber);
}

function addDhcpDevice()
{
	var value = document.getElementById("dhcp_device").value;
	if(value == "") { alert("Select a DHCP device first."); return; }
	var pair = value.split("|");
	addPendingMember(pair[0].toUpperCase(), pair[1]);
}

function addManualDevice()
{
	var ip = document.getElementById("manual_ip").value.trim();
	var mac = document.getElementById("manual_mac").value.trim().toUpperCase();
	if(!isValidIPv4(ip) || !isValidMac(mac) || !isLanAddress(ip))
	{
		alert("Enter a valid LAN IPv4 address and MAC address.");
		return;
	}
	var reservedIp = staticIpForMac(mac);
	if(reservedIp != "" && reservedIp != ip)
	{
		alert("This MAC address already has DHCP reservation " + reservedIp + ". Use that IP.");
		return;
	}
	for(var leaseIndex = 0; leaseIndex < dhcpLeaseLines.length; leaseIndex++)
	{
		var activeLease = dhcpLeaseLines[leaseIndex].trim().split(/[\t ]+/);
		if(activeLease.length >= 3 && activeLease[1].toUpperCase() == mac && activeLease[2] != ip)
		{
			alert("This device is currently using " + activeLease[2] + ". Use that address.");
			return;
		}
	}
	var hosts = uciOriginal.getAllSectionsOfType("dhcp", "host");
	for(var i = 0; i < hosts.length; i++)
	{
		var existingIp = uciOriginal.get("dhcp", hosts[i], "ip");
		var existingMac = uciOriginal.get("dhcp", hosts[i], "mac");
		if(existingIp == ip && ("" + existingMac).toUpperCase().indexOf(mac) < 0)
		{
			alert("That IP address is already reserved for another device.");
			return;
		}
	}
	for(i = 0; i < dhcpLeaseLines.length; i++)
	{
		var lease = dhcpLeaseLines[i].trim().split(/[\t ]+/);
		if(lease.length >= 3 && lease[2] == ip && lease[1].toUpperCase() != mac)
		{
			alert("That IP address is currently leased to another device.");
			return;
		}
	}
	addPendingMember(mac, ip);
	document.getElementById("manual_ip").value = "";
	document.getElementById("manual_mac").value = "";
}

function addPendingMember(mac, ip)
{
	var member = mac + "|" + ip;
	var targetGroup = document.getElementById("existing_group").value;
	if(targetGroup != "")
	{
		var groupIndex = parseInt(targetGroup, 10);
		for(var g = 0; g < deviceSpeedGroups.length; g++)
		{
			for(var m = 0; m < deviceSpeedGroups[g].members.length; m++)
			{
				var existing = deviceSpeedGroups[g].members[m].split("|");
				if(existing[0].toUpperCase() == mac.toUpperCase() || existing[1] == ip)
				{
					alert("This device is already assigned to a speed group.");
					return;
				}
			}
		}
		deviceSpeedGroups[groupIndex].members.push(member);
		renderSpeedGroups();
		return;
	}
	for(var i = 0; i < pendingSpeedMembers.length; i++)
	{
		if(pendingSpeedMembers[i] == member) { return; }
	}
	pendingSpeedMembers.push(member);
	renderPendingMembers();
}

function renderPendingMembers()
{
	var container = document.getElementById("pending_members");
	while(container.firstChild) { container.removeChild(container.firstChild); }
	var label = document.createElement("p");
	label.appendChild(document.createTextNode("Devices in the group being created: "));
	container.appendChild(label);
	for(var i = 0; i < pendingSpeedMembers.length; i++)
	{
		(function(index)
		{
			var button = document.createElement("button");
			button.type = "button";
			button.appendChild(document.createTextNode(pendingSpeedMembers[index] + " ×"));
			button.onclick = function() { pendingSpeedMembers.splice(index, 1); renderPendingMembers(); };
			container.appendChild(button);
		})(i);
	}
}

function addSpeedGroup()
{
	var name = document.getElementById("group_name").value.trim();
	if(name == "" || name.length > 24 || !/^[a-zA-Z0-9 _-]+$/.test(name))
	{
		alert("Use a group name containing only letters, numbers, spaces, _ or - (maximum 24 characters).");
		return;
	}
	if(pendingSpeedMembers.length == 0) { alert("Add at least one device to the group."); return; }
	var group = {
		name: name,
		uploadMin: document.getElementById("group_upload_min").value.trim(),
		uploadMax: document.getElementById("group_upload_max").value.trim(),
		downloadMin: document.getElementById("group_download_min").value.trim(),
		downloadMax: document.getElementById("group_download_max").value.trim(),
		members: pendingSpeedMembers.slice(0)
	};
	deviceSpeedGroups.push(group);
	pendingSpeedMembers = [];
	document.getElementById("group_name").value = "";
	document.getElementById("group_upload_min").value = "0";
	document.getElementById("group_upload_max").value = "";
	document.getElementById("group_download_min").value = "0";
	document.getElementById("group_download_max").value = "";
	renderPendingMembers();
	renderSpeedGroups();
}

function renderSpeedGroups()
{
	var container = document.getElementById("groups_container");
	while(container.firstChild) { container.removeChild(container.firstChild); }
	for(var i = 0; i < deviceSpeedGroups.length; i++)
	{
		(function(index)
		{
			var group = deviceSpeedGroups[index];
			var fieldset = document.createElement("fieldset");
			var legend = document.createElement("legend");
			legend.appendChild(document.createTextNode("Speed group " + (index + 1)));
			fieldset.appendChild(legend);
			addGroupField(fieldset, "Name", "name", group.name, index);
			addGroupField(fieldset, "Upload min (Mbps)", "uploadMin", group.uploadMin, index);
			addGroupField(fieldset, "Upload max (Mbps, blank = router max)", "uploadMax", group.uploadMax, index);
			addGroupField(fieldset, "Download min (Mbps)", "downloadMin", group.downloadMin, index);
			addGroupField(fieldset, "Download max (Mbps, blank = router max)", "downloadMax", group.downloadMax, index);
			var members = document.createElement("div");
			members.appendChild(document.createTextNode("Shared devices: "));
			for(var m = 0; m < group.members.length; m++)
			{
				(function(memberIndex)
				{
					var memberParts = group.members[memberIndex].split("|");
					var member = document.createElement("span");
					member.appendChild(document.createTextNode((memberIndex ? ", " : "") + memberParts[1] + " (" + memberParts[0] + ") "));
					var removeMember = document.createElement("button");
					removeMember.type = "button";
					removeMember.appendChild(document.createTextNode("×"));
					removeMember.onclick = function() { deviceSpeedGroups[index].members.splice(memberIndex, 1); renderSpeedGroups(); };
					member.appendChild(removeMember);
					members.appendChild(member);
				})(m);
			}
			fieldset.appendChild(members);
			var remove = document.createElement("input");
			remove.type = "button";
			remove.value = "Remove group";
			remove.onclick = function() { deviceSpeedGroups.splice(index, 1); renderSpeedGroups(); };
			fieldset.appendChild(remove);
			container.appendChild(fieldset);
		})(i);
	}
	if(deviceSpeedGroups.length == 0)
	{
		container.appendChild(document.createTextNode("No speed groups have been added."));
	}
	var target = document.getElementById("existing_group");
	if(target)
	{
		var selected = target.value;
		while(target.options.length > 1) { target.remove(1); }
		for(i = 0; i < deviceSpeedGroups.length; i++)
		{
			var option = document.createElement("option");
			option.value = "" + i;
			option.appendChild(document.createTextNode(deviceSpeedGroups[i].name));
			target.appendChild(option);
		}
		if(selected != "" && parseInt(selected, 10) < deviceSpeedGroups.length) { target.value = selected; }
	}
}

function addGroupField(parent, labelText, field, value, groupIndex)
{
	var row = document.createElement("div");
	var label = document.createElement("label");
	label.appendChild(document.createTextNode(labelText + ": "));
	var input = document.createElement("input");
	input.type = field == "name" ? "text" : "number";
	if(field != "name") { input.step = "0.001"; input.min = /Min$/.test(field) ? "0" : "0.001"; }
	input.value = value == null ? "" : value;
	input.setAttribute("data-group", groupIndex);
	input.setAttribute("data-field", field);
	input.onchange = function() { deviceSpeedGroups[groupIndex][field] = input.value.trim(); };
	label.appendChild(input);
	row.appendChild(label);
	parent.appendChild(row);
}

function parseMbps(value, allowBlank)
{
	if(value == "" && allowBlank) { return null; }
	if(!/^\d+(\.\d{1,3})?$/.test(value)) { return NaN; }
	var number = parseFloat(value);
	return isFinite(number) ? Math.round(number * 1000) : NaN;
}

function saveChanges()
{
	if(deviceSpeedSaving) { return; }
	var uploadCapacity = parseMbps(document.getElementById("upload_capacity").value.trim(), false);
	var downloadCapacity = parseMbps(document.getElementById("download_capacity").value.trim(), false);
	if(isNaN(uploadCapacity) || isNaN(downloadCapacity) || uploadCapacity <= 0 || downloadCapacity <= 0)
	{
		alert("Enter positive router upload and download capacities in Mbps (up to 3 decimals).");
		return;
	}
	for(var i = 0; i < deviceSpeedGroups.length; i++)
	{
		var fields = ["name", "uploadMin", "uploadMax", "downloadMin", "downloadMax"];
		for(var f = 0; f < fields.length; f++)
		{
			var input = document.querySelector('[data-group="' + i + '"][data-field="' + fields[f] + '"]');
			if(input) { deviceSpeedGroups[i][fields[f]] = input.value.trim(); }
		}
	}
	if(deviceSpeedGroups.length > 60) { alert("A maximum of 60 speed groups is supported."); return; }
	var uploadMinimumSum = 0;
	var downloadMinimumSum = 0;
	var usedIps = [];
	var usedMacs = [];
	for(i = 0; i < deviceSpeedGroups.length; i++)
	{
		var group = deviceSpeedGroups[i];
		if(group.name == "" || group.name.length > 24 || !/^[a-zA-Z0-9 _-]+$/.test(group.name))
		{ alert("Each group needs a valid name."); return; }
		for(var duplicateIndex = 0; duplicateIndex < i; duplicateIndex++)
		{
			if(deviceSpeedGroups[duplicateIndex].name.toLowerCase() == group.name.toLowerCase())
			{ alert("Group names must be unique."); return; }
		}
		var upMin = parseMbps(group.uploadMin, false);
		var upMax = parseMbps(group.uploadMax, true);
		var downMin = parseMbps(group.downloadMin, false);
		var downMax = parseMbps(group.downloadMax, true);
		if(isNaN(upMin) || isNaN(downMin) || upMin < 0 || downMin < 0 || isNaN(upMax) || isNaN(downMax))
		{ alert("Enter valid non-negative group rates in Mbps."); return; }
		if(upMin > uploadCapacity || downMin > downloadCapacity || (upMax != null && upMax > uploadCapacity) || (downMax != null && downMax > downloadCapacity))
		{ alert("A group rate cannot exceed the router capacity for its direction."); return; }
		if((upMax != null && upMax < upMin) || (downMax != null && downMax < downMin))
		{ alert("A group's maximum cannot be lower than its minimum."); return; }
		if(group.members.length == 0) { alert("Every speed group must contain at least one device."); return; }
		for(var m = 0; m < group.members.length; m++)
		{
			var member = group.members[m].split("|");
			if(member.length != 2 || !isValidMac(member[0]) || !isValidIPv4(member[1]) || !isLanAddress(member[1]))
			{ alert("A device has an invalid IP or MAC address."); return; }
			if(usedIps.indexOf(member[1]) >= 0 || usedMacs.indexOf(member[0].toUpperCase()) >= 0)
			{ alert("Each device can belong to only one speed group."); return; }
			usedIps.push(member[1]);
			usedMacs.push(member[0].toUpperCase());
		}
		uploadMinimumSum += upMin;
		downloadMinimumSum += downMin;
	}
	if(uploadMinimumSum > uploadCapacity || downloadMinimumSum > downloadCapacity)
	{
		alert("The sum of group minimums cannot exceed the router capacity in the same direction.");
		return;
	}
	applyDeviceSpeedConfig(uploadCapacity, downloadCapacity);
}

function addUciOption(config, packageName, section, option, value)
{
	config.set(packageName, section, option, "" + value);
}

function applyDeviceSpeedConfig(uploadCapacity, downloadCapacity)
{
	var config = uciOriginal.clone();
	var sections = config.getAllSections("device_speed");
	for(var i = 0; i < sections.length; i++) { config.removeSection("device_speed", sections[i]); }
	config.set("device_speed", "main", "", "settings");
	addUciOption(config, "device_speed", "main", "upload_capacity", uploadCapacity);
	addUciOption(config, "device_speed", "main", "download_capacity", downloadCapacity);

	var managedHosts = config.getAllSectionsOfType("dhcp", "host");
	for(i = 0; i < managedHosts.length; i++)
	{
		if(config.get("dhcp", managedHosts[i], "device_speed_managed") == "1") { config.removeSection("dhcp", managedHosts[i]); }
	}

	config.removeSection("qos_gargoyle", "upload");
	config.removeSection("qos_gargoyle", "download");
	config.removeAllSectionsOfType("qos_gargoyle", "upload_class");
	config.removeAllSectionsOfType("qos_gargoyle", "download_class");
	config.removeAllSectionsOfType("qos_gargoyle", "upload_rule");
	config.removeAllSectionsOfType("qos_gargoyle", "download_rule");
	config.set("qos_gargoyle", "upload", "", "upload");
	config.set("qos_gargoyle", "download", "", "download");
	addUciOption(config, "qos_gargoyle", "upload", "total_bandwidth", uploadCapacity);
	addUciOption(config, "qos_gargoyle", "download", "total_bandwidth", downloadCapacity);
	addUciOption(config, "qos_gargoyle", "upload", "default_class", "uclass_speed_default");
	addUciOption(config, "qos_gargoyle", "download", "default_class", "dclass_speed_default");
	addUciOption(config, "qos_gargoyle", "download", "qos_monenabled", "false");

	var classCount = deviceSpeedGroups.length + 1;
	var classShare = Math.floor(100 / classCount);
	var shareRemainder = 100 - (classShare * classCount);
	var defaultShare = classShare + (shareRemainder > 0 ? 1 : 0);
	if(shareRemainder > 0) { shareRemainder--; }
	createSpeedClass(config, "uclass_speed_default", "upload_class", "Other devices", 0, null, defaultShare);
	createSpeedClass(config, "dclass_speed_default", "download_class", "Other devices", 0, null, defaultShare);
	var ruleOrder = 100;
	for(i = 0; i < deviceSpeedGroups.length; i++)
	{
		var group = deviceSpeedGroups[i];
		var groupId = "" + (i + 1);
		var upMin = parseMbps(group.uploadMin, false);
		var upMax = parseMbps(group.uploadMax, true);
		var downMin = parseMbps(group.downloadMin, false);
		var downMax = parseMbps(group.downloadMax, true);
		var groupShare = classShare + (shareRemainder > 0 ? 1 : 0);
		if(shareRemainder > 0) { shareRemainder--; }
		var uploadClass = "uclass_speed_" + groupId;
		var downloadClass = "dclass_speed_" + groupId;
		createSpeedClass(config, uploadClass, "upload_class", group.name, upMin, upMax, groupShare);
		createSpeedClass(config, downloadClass, "download_class", group.name, downMin, downMax, groupShare);
		config.set("device_speed", "group_" + groupId, "", "group");
		addUciOption(config, "device_speed", "group_" + groupId, "name", group.name);
		addUciOption(config, "device_speed", "group_" + groupId, "upload_min", upMin);
		addUciOption(config, "device_speed", "group_" + groupId, "download_min", downMin);
		if(upMax != null) { addUciOption(config, "device_speed", "group_" + groupId, "upload_max", upMax); }
		if(downMax != null) { addUciOption(config, "device_speed", "group_" + groupId, "download_max", downMax); }
		config.createListOption("device_speed", "group_" + groupId, "member");
		for(var m = 0; m < group.members.length; m++)
		{
			var parts = group.members[m].split("|");
			var mac = parts[0].toUpperCase();
			var ip = parts[1];
			config.set("device_speed", "group_" + groupId, "member", mac + "|" + ip, true);
			createSpeedRule(config, "upload", "upload_rule_speed_" + ruleOrder, uploadClass, "source", ip, ruleOrder);
			createSpeedRule(config, "download", "download_rule_speed_" + ruleOrder, downloadClass, "destination", ip, ruleOrder);
			addSpeedDhcpReservation(config, mac, ip, groupId, m + 1);
			ruleOrder += 100;
		}
	}
	config.set("gargoyle", "status", "qos", "300");
	var commands = config.getScriptCommands(uciOriginal);
	commands += "\nuci commit device_speed\nuci commit qos_gargoyle\nuci commit dhcp\nuci commit gargoyle\n";
	commands += "/etc/init.d/qos_gargoyle enable\n/etc/init.d/qos_gargoyle start\n/etc/init.d/dnsmasq restart";
	deviceSpeedSaving = true;
	setControlsEnabled(false, true);
	var callback = function(req)
	{
		if(req.readyState == 4)
		{
			deviceSpeedSaving = false;
			setControlsEnabled(true);
			if(req.status == 200 && req.responseText.indexOf("ERROR") < 0)
			{
				window.location.reload(true);
			}
			else
			{
				alert("Could not apply speed settings. Check the device addresses and try again.");
			}
		}
	};
	var param = getParameterDefinition("commands", commands) + "&" + getParameterDefinition("hash", document.cookie.replace(/^.*hash=/, "").replace(/[\t ;]+.*$/, ""));
	runAjax("POST", "utility/run_commands.sh", param, callback);
}

function createSpeedClass(config, section, type, name, minRate, maxRate, percent)
{
	config.set("qos_gargoyle", section, "", type);
	addUciOption(config, "qos_gargoyle", section, "name", name);
	addUciOption(config, "qos_gargoyle", section, "percent_bandwidth", percent);
	if(minRate > 0) { addUciOption(config, "qos_gargoyle", section, "min_bandwidth", minRate); }
	if(maxRate != null) { addUciOption(config, "qos_gargoyle", section, "max_bandwidth", maxRate); }
}

function createSpeedRule(config, direction, section, className, addressOption, ip, order)
{
	config.set("qos_gargoyle", section, "", direction + "_rule");
	addUciOption(config, "qos_gargoyle", section, "class", className);
	addUciOption(config, "qos_gargoyle", section, "test_order", order);
	addUciOption(config, "qos_gargoyle", section, addressOption, ip);
}

function addSpeedDhcpReservation(config, mac, ip, groupId, memberId)
{
	var originalHosts = uciOriginal.getAllSectionsOfType("dhcp", "host");
	for(var i = 0; i < originalHosts.length; i++)
	{
		var existingMac = uciOriginal.get("dhcp", originalHosts[i], "mac");
		if(existingMac instanceof Array) { existingMac = existingMac.join(" "); }
		if(uciOriginal.get("dhcp", originalHosts[i], "device_speed_managed") != "1" &&
			(" " + existingMac.toUpperCase() + " ").indexOf(" " + mac.toUpperCase() + " ") >= 0) { return; }
	}
	var section = "device_speed_" + groupId + "_" + memberId;
	if(config.get("dhcp", section, "") != "") { section += "_new"; }
	config.set("dhcp", section, "", "host");
	addUciOption(config, "dhcp", section, "name", "speed_client_" + groupId + "_" + memberId);
	addUciOption(config, "dhcp", section, "mac", mac);
	addUciOption(config, "dhcp", section, "ip", ip);
	addUciOption(config, "dhcp", section, "device_speed_managed", "1");
}

function setControlsEnabled(enabled)
{
	var controls = document.querySelectorAll("input, select, button");
	for(var i = 0; i < controls.length; i++) { controls[i].disabled = !enabled; }
}

function initDeviceSpeedPage()
{
	document.getElementById("add_dhcp_device").onclick = addDhcpDevice;
	document.getElementById("add_manual_device").onclick = addManualDevice;
	document.getElementById("add_group").onclick = addSpeedGroup;
}

if(document.readyState == "loading")
{
	document.addEventListener("DOMContentLoaded", initDeviceSpeedPage);
}
else
{
	initDeviceSpeedPage();
}

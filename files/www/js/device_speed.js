var deviceSpeedPolicies = [];
var editingPolicyIndex = -1;
var deviceSpeedSaving = false;

function resetData()
{
	setFieldValue("upload_capacity", uciOriginal.get("device_speed", "main", "upload_capacity"));
	setFieldValue("download_capacity", uciOriginal.get("device_speed", "main", "download_capacity"));
	deviceSpeedPolicies = [];

	var sections = uciOriginal.getAllSectionsOfType("device_speed", "policy");
	for(var i = 0; i < sections.length; i++)
	{
		var section = sections[i];
		var ips = uciOriginal.get("device_speed", section, "ip");
		if(!(ips instanceof Array)) { ips = ips == "" ? [] : [ips]; }
		deviceSpeedPolicies.push({
			applies: uciOriginal.get("device_speed", section, "applies") || "only",
			ips: ips,
			uploadMin: uciOriginal.get("device_speed", section, "upload_min") || "0",
			uploadMax: uciOriginal.get("device_speed", section, "upload_max"),
			downloadMin: uciOriginal.get("device_speed", section, "download_min") || "0",
			downloadMax: uciOriginal.get("device_speed", section, "download_max")
		});
	}

	// Migrate settings from the first Device Speed preview, which stored speed groups.
	if(deviceSpeedPolicies.length == 0)
	{
		var oldGroups = uciOriginal.getAllSectionsOfType("device_speed", "group");
		for(i = 0; i < oldGroups.length; i++)
		{
			var members = uciOriginal.get("device_speed", oldGroups[i], "member");
			if(!(members instanceof Array)) { members = members == "" ? [] : [members]; }
			var migratedIps = [];
			for(var m = 0; m < members.length; m++)
			{
				var member = members[m].split("|");
				if(member.length == 2 && isValidIPv4(member[1]) && migratedIps.indexOf(member[1]) < 0)
				{
					migratedIps.push(member[1]);
				}
			}
			if(migratedIps.length > 0)
			{
				deviceSpeedPolicies.push({
					applies: "only",
					ips: migratedIps,
					uploadMin: uciOriginal.get("device_speed", oldGroups[i], "upload_min") || "0",
					uploadMax: uciOriginal.get("device_speed", oldGroups[i], "upload_max"),
					downloadMin: uciOriginal.get("device_speed", oldGroups[i], "download_min") || "0",
					downloadMax: uciOriginal.get("device_speed", oldGroups[i], "download_max")
				});
			}
		}
	}

	resetPolicyForm();
	renderPolicies();
	setPolicyVisibility();
}

function setFieldValue(id, value)
{
	document.getElementById(id).value = value == null ? "" : value;
}

function policyScopeLabel(applies)
{
	if(applies == "all") { return "Entire Local Network"; }
	if(applies == "others_individual") { return "All individual hosts without explicit policies"; }
	if(applies == "others_combined") { return "All hosts without explicit policies (combined)"; }
	return "Only the following hosts";
}

function setPolicyVisibility()
{
	setInvisibleIfIdMatches("applies_to_type", ["all", "others_individual", "others_combined"], "policy_ip_container", "inline");
}

function addPolicyAddresses()
{
	if(document.getElementById("add_ip").value.trim() == "") { return; }
	var valid = addAddressesToTable(document, "add_ip", "policy_ip_table_container", "policy_ip_table", false, 3, false, 250);
	if(!valid) { document.getElementById("add_ip").value = ""; }
}

function getPolicyAddresses()
{
	var table = document.getElementById("policy_ip_table_container").firstChild;
	var rows = table == null ? [] : getTableDataArray(table, true, false);
	var ips = [];
	for(var i = 0; i < rows.length; i++)
	{
		var value = ("" + rows[i][0]).trim();
		if(value != "") { ips.push(value); }
	}
	return ips;
}

function setPolicyAddresses(ips)
{
	var container = document.getElementById("policy_ip_table_container");
	while(container.firstChild) { container.removeChild(container.firstChild); }
	document.getElementById("add_ip").value = (ips || []).join(",");
	if(ips && ips.length > 0)
	{
		addAddressesToTable(document, "add_ip", "policy_ip_table_container", "policy_ip_table", false, 3, false, 250);
	}
}

function readPolicyForm()
{
	var applies = document.getElementById("applies_to_type").value;
	return {
		applies: applies,
		ips: applies == "only" ? getPolicyAddresses() : [],
		uploadMin: document.getElementById("policy_upload_min").value.trim(),
		uploadMax: document.getElementById("policy_upload_max").value.trim(),
		downloadMin: document.getElementById("policy_download_min").value.trim(),
		downloadMax: document.getElementById("policy_download_max").value.trim()
	};
}

function resetPolicyForm()
{
	editingPolicyIndex = -1;
	setFieldValue("applies_to_type", "all");
	setPolicyAddresses([]);
	setFieldValue("policy_upload_min", "0");
	setFieldValue("policy_upload_max", "");
	setFieldValue("policy_download_min", "0");
	setFieldValue("policy_download_max", "");
	document.getElementById("add_policy").value = "Add policy";
	document.getElementById("cancel_policy_edit").style.display = "none";
	setPolicyVisibility();
}

function editPolicy(index)
{
	var policy = deviceSpeedPolicies[index];
	editingPolicyIndex = index;
	setFieldValue("applies_to_type", policy.applies);
	setPolicyAddresses(policy.ips);
	setFieldValue("policy_upload_min", policy.uploadMin);
	setFieldValue("policy_upload_max", policy.uploadMax);
	setFieldValue("policy_download_min", policy.downloadMin);
	setFieldValue("policy_download_max", policy.downloadMax);
	document.getElementById("add_policy").value = "Update policy";
	document.getElementById("cancel_policy_edit").style.display = "inline-block";
	setPolicyVisibility();
}

function commitPolicyForm()
{
	var policy = readPolicyForm();
	if(!validateSinglePolicy(policy, false)) { return; }
	if(editingPolicyIndex >= 0)
	{
		deviceSpeedPolicies[editingPolicyIndex] = policy;
	}
	else
	{
		deviceSpeedPolicies.push(policy);
	}
	resetPolicyForm();
	renderPolicies();
}

function renderPolicies()
{
	var headers = ["Applies to", "IP address(es)", "Upload min (Kbps)", "Upload max (Kbps)", "Download min (Kbps)", "Download max (Kbps)", "Edit", "Delete"];
	var rows = [];
	for(var i = 0; i < deviceSpeedPolicies.length; i++)
	{
		(function(index)
		{
			var policy = deviceSpeedPolicies[index];
			var edit = document.createElement("input");
			edit.type = "button";
			edit.className = "default_button";
			edit.value = "Edit";
			edit.onclick = function() { editPolicy(index); };
			var remove = document.createElement("input");
			remove.type = "button";
			remove.value = "Delete";
			remove.onclick = function() {
				deviceSpeedPolicies.splice(index, 1);
				resetPolicyForm();
				renderPolicies();
			};
			var maxUp = policy.uploadMax == "" ? document.getElementById("upload_capacity").value : policy.uploadMax;
			var maxDown = policy.downloadMax == "" ? document.getElementById("download_capacity").value : policy.downloadMax;
			rows.push([
				policyScopeLabel(policy.applies),
				policy.ips.join(", "),
				policy.uploadMin,
				maxUp,
				policy.downloadMin,
				maxDown,
				edit,
				remove
			]);
		})(i);
	}
	var table = createTable(headers, rows, "device_speed_policy_table", false, false);
	var container = document.getElementById("policies_table_container");
	while(container.firstChild) { container.removeChild(container.firstChild); }
	container.appendChild(table);
}

function parseKbps(value, allowBlank)
{
	if(value == "" && allowBlank) { return null; }
	if(!/^\d+$/.test(value)) { return NaN; }
	var number = parseInt(value, 10);
	return isFinite(number) ? number : NaN;
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

function validateSinglePolicy(policy, checkExisting)
{
	var uploadCapacity = parseKbps(document.getElementById("upload_capacity").value.trim(), false);
	var downloadCapacity = parseKbps(document.getElementById("download_capacity").value.trim(), false);
	if(isNaN(uploadCapacity) || isNaN(downloadCapacity) || uploadCapacity <= 0 || downloadCapacity <= 0)
	{
		alert("Enter positive router upload and download capacities in Kbps.");
		return false;
	}
	var upMin = parseKbps(policy.uploadMin, false);
	var upMax = parseKbps(policy.uploadMax, true);
	var downMin = parseKbps(policy.downloadMin, false);
	var downMax = parseKbps(policy.downloadMax, true);
	if(isNaN(upMin) || isNaN(downMin) || upMin < 0 || downMin < 0 || isNaN(upMax) || isNaN(downMax))
	{
		alert("Enter non-negative whole-number rates in Kbps.");
		return false;
	}
	if(upMin > uploadCapacity || downMin > downloadCapacity || (upMax != null && upMax > uploadCapacity) || (downMax != null && downMax > downloadCapacity))
	{
		alert("A policy rate cannot exceed the router capacity for its direction.");
		return false;
	}
	if((upMax != null && upMax < upMin) || (downMax != null && downMax < downMin))
	{
		alert("A policy maximum cannot be lower than its minimum.");
		return false;
	}
	if(policy.applies == "only")
	{
		if(policy.ips.length == 0) { alert("Add at least one IP address to this policy."); return false; }
		for(var i = 0; i < policy.ips.length; i++)
		{
			if(!isValidIPv4(policy.ips[i]) || !isLanAddress(policy.ips[i]))
			{
				alert("Enter LAN IPv4 addresses only. IP ranges and CIDR notation are not supported for speed rules.");
				return false;
			}
		}
	}
	else if(["all", "others_individual", "others_combined"].indexOf(policy.applies) < 0)
	{
		alert("Select a valid Applies to option.");
		return false;
	}
	return true;
}

function knownNetworkHosts()
{
	var ips = [];
	for(var i = 0; i < dhcpLeaseLines.length; i++)
	{
		var fields = dhcpLeaseLines[i].trim().split(/[\t ]+/);
		if(fields.length >= 3 && isValidIPv4(fields[2]) && isLanAddress(fields[2]) && ips.indexOf(fields[2]) < 0) { ips.push(fields[2]); }
	}
	var hostSections = uciOriginal.getAllSectionsOfType("dhcp", "host");
	for(i = 0; i < hostSections.length; i++)
	{
		var ip = uciOriginal.get("dhcp", hostSections[i], "ip");
		if(isValidIPv4(ip) && isLanAddress(ip) && ips.indexOf(ip) < 0) { ips.push(ip); }
	}
	return ips;
}

function getPolicyTargets(policy, explicitIps)
{
	if(policy.applies != "others_individual") { return []; }
	var hosts = knownNetworkHosts();
	var targets = [];
	for(var i = 0; i < hosts.length; i++)
	{
		if(explicitIps.indexOf(hosts[i]) < 0) { targets.push(hosts[i]); }
	}
	return targets;
}

function validatePolicies(uploadCapacity, downloadCapacity)
{
	var allCount = 0;
	var individualCount = 0;
	var combinedCount = 0;
	var explicitIps = [];
	for(var i = 0; i < deviceSpeedPolicies.length; i++)
	{
		var policy = deviceSpeedPolicies[i];
		if(!validateSinglePolicy(policy, true)) { return null; }
		if(policy.applies == "all") { allCount++; }
		if(policy.applies == "others_individual") { individualCount++; }
		if(policy.applies == "others_combined") { combinedCount++; }
		if(policy.applies == "only")
		{
			for(var ipIndex = 0; ipIndex < policy.ips.length; ipIndex++)
			{
				var ip = policy.ips[ipIndex];
				if(explicitIps.indexOf(ip) >= 0)
				{
					alert("An IP address can appear in only one explicit policy.");
					return null;
				}
				explicitIps.push(ip);
			}
		}
	}
	if(allCount > 1 || individualCount > 1 || combinedCount > 1 || (individualCount > 0 && combinedCount > 0) || (allCount > 0 && (individualCount > 0 || combinedCount > 0)))
	{
		alert("Use no more than one network-wide policy and choose either individual or combined treatment for remaining hosts.");
		return null;
	}

	var uploadMinimumSum = 0;
	var downloadMinimumSum = 0;
	var individualTargets = [];
	for(i = 0; i < deviceSpeedPolicies.length; i++)
	{
		var current = deviceSpeedPolicies[i];
		var multiplier = current.applies == "others_individual" ? getPolicyTargets(current, explicitIps).length : 1;
		if(current.applies == "others_individual") { individualTargets = getPolicyTargets(current, explicitIps); }
		uploadMinimumSum += parseKbps(current.uploadMin, false) * multiplier;
		downloadMinimumSum += parseKbps(current.downloadMin, false) * multiplier;
	}
	if(uploadMinimumSum > uploadCapacity || downloadMinimumSum > downloadCapacity)
	{
		alert("The sum of minimum rates (counting each individual remaining host) cannot exceed router capacity in the same direction.");
		return null;
	}
	return {explicitIps: explicitIps, individualTargets: individualTargets};
}

function saveChanges()
{
	if(deviceSpeedSaving) { return; }
	for(var i = 0; i < deviceSpeedPolicies.length; i++)
	{
		var p = deviceSpeedPolicies[i];
		p.uploadMin = "" + p.uploadMin;
		p.downloadMin = "" + p.downloadMin;
	}
	var uploadCapacity = parseKbps(document.getElementById("upload_capacity").value.trim(), false);
	var downloadCapacity = parseKbps(document.getElementById("download_capacity").value.trim(), false);
	if(isNaN(uploadCapacity) || isNaN(downloadCapacity) || uploadCapacity <= 0 || downloadCapacity <= 0)
	{
		alert("Enter positive router upload and download capacities in Kbps.");
		return;
	}
	var validation = validatePolicies(uploadCapacity, downloadCapacity);
	if(validation == null) { return; }
	if(1 + deviceSpeedPolicies.filter(function(p) { return p.applies == "only"; }).length + validation.individualTargets.length > 60)
	{
		alert("The QoS engine supports up to 60 speed classes. Reduce the number of policies or individual hosts.");
		return;
	}
	applyDeviceSpeedConfig(uploadCapacity, downloadCapacity, validation.individualTargets);
}

function addUciOption(config, packageName, section, option, value)
{
	config.set(packageName, section, option, "" + value);
}

function applyDeviceSpeedConfig(uploadCapacity, downloadCapacity, individualTargets)
{
	var config = uciOriginal.clone();
	var sections = config.getAllSections("device_speed");
	for(var i = 0; i < sections.length; i++) { config.removeSection("device_speed", sections[i]); }
	config.set("device_speed", "main", "", "settings");
	addUciOption(config, "device_speed", "main", "upload_capacity", uploadCapacity);
	addUciOption(config, "device_speed", "main", "download_capacity", downloadCapacity);

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

	var allPolicy = null;
	var combinedPolicy = null;
	var onlyPolicies = [];
	var individualPolicy = null;
	for(i = 0; i < deviceSpeedPolicies.length; i++)
	{
		var policy = deviceSpeedPolicies[i];
		if(policy.applies == "all") { allPolicy = policy; }
		else if(policy.applies == "others_combined") { combinedPolicy = policy; }
		else if(policy.applies == "others_individual") { individualPolicy = policy; }
		else { onlyPolicies.push(policy); }
	}

	var speedClasses = [];
	var defaultPolicy = allPolicy || combinedPolicy;
	speedClasses.push({
		id: "speed_default",
		name: allPolicy ? "Entire network" : (combinedPolicy ? "Other hosts combined" : "Other devices"),
		uploadMin: defaultPolicy ? parseKbps(defaultPolicy.uploadMin, false) : 0,
		uploadMax: defaultPolicy ? parseKbps(defaultPolicy.uploadMax, true) : null,
		downloadMin: defaultPolicy ? parseKbps(defaultPolicy.downloadMin, false) : 0,
		downloadMax: defaultPolicy ? parseKbps(defaultPolicy.downloadMax, true) : null,
		generated: false
	});
	for(i = 0; i < onlyPolicies.length; i++)
	{
		var only = onlyPolicies[i];
		speedClasses.push({
			id: "speed_policy_" + (i + 1),
			name: "Explicit policy " + (i + 1),
			uploadMin: parseKbps(only.uploadMin, false),
			uploadMax: parseKbps(only.uploadMax, true),
			downloadMin: parseKbps(only.downloadMin, false),
			downloadMax: parseKbps(only.downloadMax, true),
			generated: false
		});
	}
	for(i = 0; i < individualTargets.length; i++)
	{
		speedClasses.push({
			id: "speed_ind_" + (i + 1),
			name: "Other host " + individualTargets[i],
			uploadMin: parseKbps(individualPolicy.uploadMin, false),
			uploadMax: parseKbps(individualPolicy.uploadMax, true),
			downloadMin: parseKbps(individualPolicy.downloadMin, false),
			downloadMax: parseKbps(individualPolicy.downloadMax, true),
			generated: true,
			ip: individualTargets[i]
		});
	}
	var shares = getEqualClassShares(speedClasses.length);
	for(i = 0; i < speedClasses.length; i++)
	{
		var speedClass = speedClasses[i];
		var uploadClass = "uclass_" + speedClass.id;
		var downloadClass = "dclass_" + speedClass.id;
		createSpeedClass(config, uploadClass, "upload_class", speedClass.name, speedClass.uploadMin, speedClass.uploadMax, shares[i], speedClass.generated);
		createSpeedClass(config, downloadClass, "download_class", speedClass.name, speedClass.downloadMin, speedClass.downloadMax, shares[i], speedClass.generated);
	}

	var ruleOrder = 100;
	for(i = 0; i < onlyPolicies.length; i++)
	{
		var policyIps = onlyPolicies[i].ips;
		for(var ipIndex = 0; ipIndex < policyIps.length; ipIndex++)
		{
			createSpeedRule(config, "upload", "upload_rule_speed_policy_" + (i + 1) + "_" + (ipIndex + 1), "uclass_speed_policy_" + (i + 1), "source", policyIps[ipIndex], ruleOrder, false);
			createSpeedRule(config, "download", "download_rule_speed_policy_" + (i + 1) + "_" + (ipIndex + 1), "dclass_speed_policy_" + (i + 1), "destination", policyIps[ipIndex], ruleOrder, false);
			ruleOrder += 100;
		}
	}
	for(i = 0; i < individualTargets.length; i++)
	{
		var individualIp = individualTargets[i];
		createSpeedRule(config, "upload", "upload_rule_speed_ind_" + (i + 1), "uclass_speed_ind_" + (i + 1), "source", individualIp, ruleOrder, true);
		createSpeedRule(config, "download", "download_rule_speed_ind_" + (i + 1), "dclass_speed_ind_" + (i + 1), "destination", individualIp, ruleOrder, true);
		ruleOrder += 100;
	}

	for(i = 0; i < deviceSpeedPolicies.length; i++)
	{
		var saved = deviceSpeedPolicies[i];
		var section = "policy_" + (i + 1);
		config.set("device_speed", section, "", "policy");
		addUciOption(config, "device_speed", section, "applies", saved.applies);
		addUciOption(config, "device_speed", section, "upload_min", parseKbps(saved.uploadMin, false));
		addUciOption(config, "device_speed", section, "download_min", parseKbps(saved.downloadMin, false));
		var uploadMax = parseKbps(saved.uploadMax, true);
		var downloadMax = parseKbps(saved.downloadMax, true);
		if(uploadMax != null) { addUciOption(config, "device_speed", section, "upload_max", uploadMax); }
		if(downloadMax != null) { addUciOption(config, "device_speed", section, "download_max", downloadMax); }
		if(saved.applies == "only")
		{
			config.createListOption("device_speed", section, "ip");
			config.set("device_speed", section, "ip", saved.ips, true);
		}
	}

	config.set("gargoyle", "status", "qos", "300");
	var commands = config.getScriptCommands(uciOriginal);
	commands += "\nuci commit device_speed\nuci commit qos_gargoyle\nuci commit gargoyle\n";
	commands += "/etc/init.d/qos_gargoyle enable\n/etc/init.d/qos_gargoyle start\n/usr/lib/gargoyle/device_speed_refresh.sh --force";
	deviceSpeedSaving = true;
	setControlsEnabled(false);
	var callback = function(req)
	{
		if(req.readyState == 4)
		{
			deviceSpeedSaving = false;
			setControlsEnabled(true);
			if(req.status == 200 && req.responseText.indexOf("ERROR") < 0) { window.location.reload(true); }
			else { alert("Could not apply bandwidth policies. Check the addresses and try again."); }
		}
	};
	var param = getParameterDefinition("commands", commands) + "&" + getParameterDefinition("hash", document.cookie.replace(/^.*hash=/, "").replace(/[\t ;]+.*$/, ""));
	runAjax("POST", "utility/run_commands.sh", param, callback);
}

function getEqualClassShares(count)
{
	var base = Math.floor(100 / count);
	var remainder = 100 - base * count;
	var shares = [];
	for(var i = 0; i < count; i++)
	{
		shares.push(base + (remainder > 0 ? 1 : 0));
		if(remainder > 0) { remainder--; }
	}
	return shares;
}

function createSpeedClass(config, section, type, name, minRate, maxRate, percent, generated)
{
	config.set("qos_gargoyle", section, "", type);
	addUciOption(config, "qos_gargoyle", section, "name", name);
	addUciOption(config, "qos_gargoyle", section, "percent_bandwidth", percent);
	addUciOption(config, "qos_gargoyle", section, "device_speed_managed", "1");
	if(generated) { addUciOption(config, "qos_gargoyle", section, "device_speed_generated_individual", "1"); }
	if(minRate > 0) { addUciOption(config, "qos_gargoyle", section, "min_bandwidth", minRate); }
	if(maxRate != null) { addUciOption(config, "qos_gargoyle", section, "max_bandwidth", maxRate); }
}

function createSpeedRule(config, direction, section, className, addressOption, ip, order, generated)
{
	config.set("qos_gargoyle", section, "", direction + "_rule");
	addUciOption(config, "qos_gargoyle", section, "class", className);
	addUciOption(config, "qos_gargoyle", section, "test_order", order);
	addUciOption(config, "qos_gargoyle", section, addressOption, ip);
	addUciOption(config, "qos_gargoyle", section, "device_speed_managed", "1");
	if(generated) { addUciOption(config, "qos_gargoyle", section, "device_speed_generated_individual", "1"); }
}

function setControlsEnabled(enabled)
{
	var controls = document.querySelectorAll("input, select, button");
	for(var i = 0; i < controls.length; i++) { controls[i].disabled = !enabled; }
}

function initDeviceSpeedPage()
{
	document.getElementById("applies_to_type").onchange = setPolicyVisibility;
	document.getElementById("add_policy").onclick = commitPolicyForm;
	document.getElementById("cancel_policy_edit").onclick = resetPolicyForm;
	document.getElementById("add_ip_button").onclick = addPolicyAddresses;
}

if(document.readyState == "loading")
{
	document.addEventListener("DOMContentLoaded", initDeviceSpeedPage);
}
else
{
	initDeviceSpeedPage();
}

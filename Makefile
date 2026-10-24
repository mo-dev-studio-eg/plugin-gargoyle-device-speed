include $(TOPDIR)/rules.mk

PKG_NAME:=plugin-gargoyle-device-speed
PKG_VERSION:=1.0.0
PKG_RELEASE:=2

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk

define Package/plugin-gargoyle-device-speed
	SECTION:=admin
	CATEGORY:=Administration
	SUBMENU:=Gargoyle Web Interface
	TITLE:=Shared per-device Internet speed limits
	DEPENDS:=+gargoyle +qos-gargoyle +dnsmasq
	PKGARCH:=all
endef

define Package/plugin-gargoyle-device-speed/description
Manage router bandwidth and shared minimum/maximum upload and download rates
for DHCP and manually configured device groups using Gargoyle QoS.
endef

define Package/plugin-gargoyle-device-speed/conffiles
/etc/config/device_speed
endef

define Build/Prepare
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/plugin-gargoyle-device-speed/install
	$(INSTALL_DIR) $(1)
	$(CP) ./files/* $(1)/
	$(INSTALL_BIN) ./files/www/device_speed.sh $(1)/www/device_speed.sh
	$(INSTALL_BIN) ./files/usr/lib/gargoyle/device_speed_install.sh $(1)/usr/lib/gargoyle/device_speed_install.sh
	$(INSTALL_BIN) ./files/usr/lib/gargoyle/device_speed_uninstall.sh $(1)/usr/lib/gargoyle/device_speed_uninstall.sh
	$(INSTALL_BIN) ./files/usr/lib/gargoyle/device_speed_refresh.sh $(1)/usr/lib/gargoyle/device_speed_refresh.sh
	$(INSTALL_BIN) ./files/etc/uci-defaults/99-device-speed $(1)/etc/uci-defaults/99-device-speed
endef

define Package/plugin-gargoyle-device-speed/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	sh /usr/lib/gargoyle/device_speed_install.sh
fi
endef

define Package/plugin-gargoyle-device-speed/prerm
#!/bin/sh
if [ "$1" = "remove" ] && [ -z "$${IPKG_INSTROOT}" ]; then
	sh /usr/lib/gargoyle/device_speed_uninstall.sh
fi
endef

$(eval $(call BuildPackage,plugin-gargoyle-device-speed))

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CcuConnection = void 0;
const events_1 = __importDefault(require("events"));
const CcuInterface_js_1 = require("./CcuInterface.js");
const Rega_js_1 = require("./Rega.js");
/**
 * Manages one CCU with a BidCos-RF + Hm-IP interface.
 */
class CcuConnection extends events_1.default {
    constructor(options, log) {
        super();
        this.options = options;
        this.log = log;
        this.channels = [];
        // Setup BidCos-RF Interface
        this.bidCosIface = new CcuInterface_js_1.CcuInterface(log, {
            type: CcuInterface_js_1.INTERFACE_TYPE.BIDCOSRF,
            listenAddress: options.listenAddress,
            listenPort: options.localBidCosRFPort,
            ccuHost: options.ccuHost,
        });
        this.bidCosIface.on("event", this.handleInterfaceEvent.bind(this, CcuInterface_js_1.INTERFACE_TYPE.BIDCOSRF));
        // Setup Hm-IP Interface
        this.hmIPIface = new CcuInterface_js_1.CcuInterface(log, {
            type: CcuInterface_js_1.INTERFACE_TYPE.HMIP,
            listenAddress: options.listenAddress,
            listenPort: options.localHmIPPort,
            ccuHost: options.ccuHost,
        });
        this.hmIPIface.on("event", this.handleInterfaceEvent.bind(this, CcuInterface_js_1.INTERFACE_TYPE.HMIP));
    }
    async start() {
        await this.reloadRega();
        await Promise.all([
            this.bidCosIface.start(),
            this.hmIPIface.start()
        ]);
        const scheduleReload = () => {
            setTimeout(async () => {
                await this.reloadRega();
                scheduleReload();
            }, this.options.regaInterval * 1000);
        };
        scheduleReload();
    }
    async stop() {
        await Promise.all([
            this.bidCosIface.stop(),
            this.hmIPIface.stop()
        ]);
    }
    /**
     * Returns the Address of the Device from the given Channel.
     * That is the part of the Channel before the first colon.
     * @param channel The Channel to get the Device Address from
     * @returns The Address of the Channel's Device
     */
    getDeviceAddressFromChannel(channel) {
        return channel.substring(0, channel.indexOf(":"));
    }
    /**
     * Replace the Device Name in the given Channel with the actual Device Name if available.
     * If the Device Name is not available, undefined is returned.
     * @param channel The Channel to replace the Device Name in
     * @returns The Channel with the Device Name replaced or undefined
     */
    replaceDeviceName(channel) {
        const deviceAddress = this.getDeviceAddressFromChannel(channel);
        const device = this.channels.find((c) => c.address === deviceAddress);
        if (device) {
            return device.name + channel.substring(deviceAddress.length);
        }
        else {
            return undefined;
        }
    }
    /**
     * Resolves a channel string that may use a human-readable device name to its hardware address.
     * For example, "Door Switch:2" is converted to "LEQ123456:2" if a device named "Door Switch"
     * exists. If the name is not found the original value is returned unchanged, which allows
     * hardware addresses to be used directly.
     * @param channel The channel string, either "DeviceName:ChannelNumber" or "HardwareAddress:ChannelNumber"
     * @returns The channel string with the device name replaced by the hardware address, or the original if not found
     */
    getOriginalDeviceName(channel) {
        const lastColon = channel.lastIndexOf(":");
        if (lastColon === -1) {
            return channel;
        }
        const deviceName = channel.substring(0, lastColon);
        const channelId = channel.substring(lastColon + 1);
        // Only match device entries (no colon in address) to avoid accidentally matching
        // a channel entry from a different device that shares the same name.
        const parentDevice = this.channels.find((c) => !c.address.includes(":") && c.name === deviceName);
        if (!parentDevice) {
            return channel;
        }
        return `${parentDevice.address}:${channelId}`;
    }
    handleInterfaceEvent(iface, channel, valueName, value) {
        const namedChannel = this.replaceDeviceName(channel);
        this.emit("event", iface, channel, namedChannel, valueName, value);
    }
    /**
     * Sets a Value on the given Interface, Channel and Value Name.
     * The Device Name in the Channel will be replaced with the actual Device Name if available.
     *
     * @param iface The Interface to set the value on
     * @param channel The Channel to set the value on
     * @param valueName The value name to set
     * @param value The Value to set
     * @returns A Promise that is resolved when the value has been set
     */
    setValue(iface, channel, valueName, value) {
        this.log.trace(`setValue: ${iface}/${channel}/${valueName}/${value}`);
        channel = this.getOriginalDeviceName(channel);
        switch (iface) {
            case CcuInterface_js_1.INTERFACE_TYPE.BIDCOSRF:
                return this.bidCosIface.setValue(channel, valueName, value);
            case CcuInterface_js_1.INTERFACE_TYPE.HMIP:
                return this.hmIPIface.setValue(channel, valueName, value);
        }
    }
    getChannels() {
        return this.channels;
    }
    async reloadRega() {
        try {
            this.log.trace("Reload Channels");
            this.channels = await (0, Rega_js_1.getChannels)(this.options.ccuHost, this.options.authentication);
            for (const channel of this.channels) {
                if (channel.channelNumber !== undefined) {
                    switch (channel.iface) {
                        case CcuInterface_js_1.INTERFACE_TYPE.BIDCOSRF:
                            const values = await this.bidCosIface.loadValues(channel.address);
                            channel.values = Object.keys(values);
                            break;
                        case CcuInterface_js_1.INTERFACE_TYPE.HMIP:
                            const hmIPValues = await this.hmIPIface.loadValues(channel.address);
                            channel.values = Object.keys(hmIPValues);
                            break;
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`Failed to fetch channels from CCU: ${error}`);
        }
    }
}
exports.CcuConnection = CcuConnection;
//# sourceMappingURL=CcuConnection.js.map
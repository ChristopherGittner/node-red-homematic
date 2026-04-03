"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CcuConnection = exports.Channel = void 0;
const events_1 = __importDefault(require("events"));
const CcuInterface_js_1 = require("./CcuInterface.js");
const Rega_js_1 = require("./Rega.js");
const zod_1 = __importDefault(require("zod"));
/**
 * Represents a HomeMatic channel as retrieved from the CCU via Rega.
 * A channel belongs to a physical device and exposes one or more controllable values.
 */
exports.Channel = zod_1.default.object({
    /** Hardware address of the channel, e.g. `"LEQ123456:1"`. */
    address: zod_1.default.string(),
    /** Unique numeric ID assigned by the CCU. */
    id: zod_1.default.number(),
    /** Human-readable name of the channel as configured in the CCU. */
    name: zod_1.default.string(),
    /** The HomeMatic interface this channel belongs to. */
    iface: zod_1.default.enum(CcuInterface_js_1.INTERFACE_TYPE).optional(),
    /** Human-readable name of the parent device as configured in the CCU. */
    deviceName: zod_1.default.string().optional(),
    /** Zero-based channel index within the parent device. */
    channelNumber: zod_1.default.number().optional(),
    /** List of value names (datapoints) available on this channel. */
    values: zod_1.default.array(zod_1.default.string()).optional(),
});
/**
 * Manages one CCU with a BidCos-RF + Hm-IP interface.
 */
class CcuConnection extends events_1.default {
    /**
     * Creates a new CcuConnection but does not start the XML-RPC listeners yet.
     * Call {@link start} to connect to the CCU.
     * @param options Connection configuration.
     * @param log Node-RED logger used for trace and error output.
     */
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
    /**
     * Starts the connection to the CCU.
     * Fetches the initial channel list from Rega, registers both XML-RPC interfaces
     * with the CCU, and schedules periodic Rega reloads.
     */
    async start() {
        await this.reloadRega();
        await Promise.all([
            this.bidCosIface.start(),
            this.hmIPIface.start()
        ]);
        const scheduleReload = () => {
            this.regaReloadTimeout = setTimeout(async () => {
                await this.reloadRega();
                scheduleReload();
            }, this.options.regaInterval * 1000);
        };
        scheduleReload();
    }
    /**
     * Stops both XML-RPC interfaces, unregisters them from the CCU,
     * and cancels the periodic Rega reload.
     */
    async stop() {
        clearTimeout(this.regaReloadTimeout);
        this.regaReloadTimeout = undefined;
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
    /**
     * Handles a raw datapoint event from a {@link CcuInterface} and re-emits it
     * on this connection, enriched with the human-readable channel name.
     * @param iface The interface that produced the event.
     * @param channel Hardware channel address.
     * @param valueName Name of the changed datapoint.
     * @param value The new value.
     */
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
    /**
     * Returns the current list of channels loaded from Rega.
     * The list is refreshed automatically at the interval specified in {@link CcuConnectionOptions.regaInterval}.
     */
    getChannels() {
        return this.channels;
    }
    /**
     * Fetches the full channel list from the CCU via Rega and updates the cached
     * {@link channels} array, including available value names for each channel.
     * Errors are logged but do not propagate so the periodic reload schedule is preserved.
     */
    async reloadRega() {
        try {
            this.log.trace("Reload Channels");
            this.channels = await (0, Rega_js_1.getChannels)(this.options.ccuHost, this.options.authentication);
            for (const channel of this.channels) {
                if (channel.channelNumber !== undefined) {
                    switch (channel.iface) {
                        case CcuInterface_js_1.INTERFACE_TYPE.BIDCOSRF:
                            {
                                const values = await this.bidCosIface.loadValues(channel.address);
                                channel.values = Object.keys(values);
                            }
                            break;
                        case CcuInterface_js_1.INTERFACE_TYPE.HMIP:
                            {
                                const values = await this.hmIPIface.loadValues(channel.address);
                                channel.values = Object.keys(values);
                            }
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
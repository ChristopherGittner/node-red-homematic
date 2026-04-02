import EventEmitter from "events";
import { CcuInterface, INTERFACE_TYPE } from "./CcuInterface.js";
import { NodeAPI } from "node-red";
import { getChannels } from "./Rega.js";
import z from "zod";

/**
 * Represents a HomeMatic channel as retrieved from the CCU via Rega.
 * A channel belongs to a physical device and exposes one or more controllable values.
 */
export const Channel = z.object({
    /** Hardware address of the channel, e.g. `"LEQ123456:1"`. */
    address: z.string(),
    /** Unique numeric ID assigned by the CCU. */
    id: z.number(),
    /** Human-readable name of the channel as configured in the CCU. */
    name: z.string(),
    /** The HomeMatic interface this channel belongs to. */
    iface: z.enum(INTERFACE_TYPE).optional(),
    /** Human-readable name of the parent device as configured in the CCU. */
    deviceName: z.string().optional(),
    /** Zero-based channel index within the parent device. */
    channelNumber: z.number().optional(),
    /** List of value names (datapoints) available on this channel. */
    values: z.array(z.string()).optional(),
});
export type Channel = z.infer<typeof Channel>;

/**
 * Configuration options for a {@link CcuConnection}.
 */
export interface CcuConnectionOptions {
    /** Local IP address that the XML-RPC listener binds to. */
    listenAddress: string;
    /** Local port for the BidCos-RF XML-RPC listener. */
    localBidCosRFPort: number;
    /** Local port for the Hm-IP XML-RPC listener. */
    localHmIPPort: number;
    /** Hostname or IP address of the CCU. */
    ccuHost: string;
    /** Interval in seconds between automatic Rega channel reloads. */
    regaInterval: number;
    /** Optional HTTP Basic Auth credentials for the CCU. */
    authentication?: {
        user: string,
        password: string
    };
}

export declare interface CcuConnection {
    /**
     * Registers a listener for datapoint change events received from any HomeMatic interface.
     * @param event The event name — always `"event"`.
     * @param listener Callback invoked for each received datapoint change.
     *   - `iface` — The interface the event originated from.
     *   - `channel` — Hardware channel address, e.g. `"LEQ123456:1"`.
     *   - `namedChannel` — Same address with the device name substituted, or `undefined` if unknown.
     *   - `valueName` — Name of the changed datapoint, e.g. `"LEVEL"`.
     *   - `value` — The new value.
     */
    on(event: "event", listener: (iface: INTERFACE_TYPE, channel: string, namedChannel: string | undefined, valueName: string, value: any) => void): this;
}

/**
 * Manages one CCU with a BidCos-RF + Hm-IP interface.
 */
export class CcuConnection extends EventEmitter {
    private bidCosIface: CcuInterface;
    private hmIPIface: CcuInterface;

    private channels: Channel[] = [];
    private regaReloadTimeout: ReturnType<typeof setTimeout> | undefined;

    /**
     * Creates a new CcuConnection but does not start the XML-RPC listeners yet.
     * Call {@link start} to connect to the CCU.
     * @param options Connection configuration.
     * @param log Node-RED logger used for trace and error output.
     */
    constructor(private options: CcuConnectionOptions, private log: NodeAPI["log"]) {
        super();

        // Setup BidCos-RF Interface
        this.bidCosIface = new CcuInterface(log, {
            type: INTERFACE_TYPE.BIDCOSRF,
            listenAddress: options.listenAddress,
            listenPort: options.localBidCosRFPort,
            ccuHost: options.ccuHost,
        });
        this.bidCosIface.on("event", this.handleInterfaceEvent.bind(this, INTERFACE_TYPE.BIDCOSRF));

        // Setup Hm-IP Interface
        this.hmIPIface = new CcuInterface(log, {
            type: INTERFACE_TYPE.HMIP,
            listenAddress: options.listenAddress,
            listenPort: options.localHmIPPort,
            ccuHost: options.ccuHost,
        });
        this.hmIPIface.on("event", this.handleInterfaceEvent.bind(this, INTERFACE_TYPE.HMIP));
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
    async stop(): Promise<void> {
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
    private getDeviceAddressFromChannel(channel: string) {
        return channel.substring(0, channel.indexOf(":"));
    }

    /**
     * Replace the Device Name in the given Channel with the actual Device Name if available.
     * If the Device Name is not available, undefined is returned.
     * @param channel The Channel to replace the Device Name in
     * @returns The Channel with the Device Name replaced or undefined
     */
    private replaceDeviceName(channel: string): string | undefined {
        const deviceAddress = this.getDeviceAddressFromChannel(channel);

        const device = this.channels.find((c) => c.address === deviceAddress);
        if (device) {
            return device.name + channel.substring(deviceAddress.length);
        } else {
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
    private getOriginalDeviceName(channel: string) {
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
    private handleInterfaceEvent(iface: INTERFACE_TYPE, channel: string, valueName: string, value: any) {
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
    public setValue(iface: INTERFACE_TYPE, channel: string, valueName: string, value: number | string): Promise<void> {
        this.log.trace(`setValue: ${iface}/${channel}/${valueName}/${value}`);

        channel = this.getOriginalDeviceName(channel);

        switch (iface) {
            case INTERFACE_TYPE.BIDCOSRF:
                return this.bidCosIface.setValue(channel, valueName, value);

            case INTERFACE_TYPE.HMIP:
                return this.hmIPIface.setValue(channel, valueName, value);
        }
    }

    /**
     * Returns the current list of channels loaded from Rega.
     * The list is refreshed automatically at the interval specified in {@link CcuConnectionOptions.regaInterval}.
     */
    public getChannels(): Channel[] {
        return this.channels;
    }

    /**
     * Fetches the full channel list from the CCU via Rega and updates the cached
     * {@link channels} array, including available value names for each channel.
     * Errors are logged but do not propagate so the periodic reload schedule is preserved.
     */
    private async reloadRega() {
        try {
            this.log.trace("Reload Channels");
            this.channels = await getChannels(this.options.ccuHost, this.options.authentication);
            for (const channel of this.channels) {
                if (channel.channelNumber !== undefined) {
                    switch (channel.iface) {
                        case INTERFACE_TYPE.BIDCOSRF:
                            const values = await this.bidCosIface.loadValues(channel.address);
                            channel.values = Object.keys(values);
                            break;

                        case INTERFACE_TYPE.HMIP:
                            const hmIPValues = await this.hmIPIface.loadValues(channel.address);
                            channel.values = Object.keys(hmIPValues);
                            break;
                    }
                }
            }
        } catch (error) {
            this.log.error(`Failed to fetch channels from CCU: ${error}`);
        }
    }
}
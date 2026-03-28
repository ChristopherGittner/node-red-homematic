import EventEmitter from "events";
import { CcuInterface, INTERFACE_TYPE } from "./CcuInterface.js";
import { NodeAPI } from "node-red";
import { Channel, getChannels } from "./Rega.js";

export interface CcuConnectionOptions {
    /**
     * Our own Address, that will be used to create a RPC-XML Server on, that in turn will receive events from the CCU
     */
    listenAddress: string;

    /**
     * The RPC-XML Server for the BidCos-RF Interface will listen on this Port
     */
    localBidCosRFPort: number;

    /**
     * The RPC-XML Server for the Hm-IP Interface will listen on this Port
     */
    localHmIPPort: number;

    /**
     * The Host / IP of the CCU
     */
    ccuHost: string;

    /**
     * The Interval in seconds in which the Rega-Script will be reloaded
     */
    regaInterval: number;

    /**
     * (optional) Authentication to use when connecting to the CCU Rega interface
     */
    authentication?: {
        user: string,
        password: string
    };
}

export declare interface CcuConnection {
    on(event: "event", listener: (iface: INTERFACE_TYPE, channel: string, namedChannel: string | undefined, valueName: string, value: any) => void): this;
}

/**
 * Manages one CCU with a BidCos-RF + Hm-IP interface.
 */
export class CcuConnection extends EventEmitter {
    private bidCosIface: CcuInterface;
    private hmIPIface: CcuInterface;

    private channels: Channel[] = [];

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

    async stop(): Promise<void> {
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

    public getChannels(): Channel[] {
        return this.channels;
    }

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
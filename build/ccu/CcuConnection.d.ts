/// <reference types="node" />
import EventEmitter from "events";
import { INTERFACE_TYPE } from "./CcuInterface.js";
import { NodeAPI } from "node-red";
import { Channel } from "./Rega.js";
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
        user: string;
        password: string;
    };
}
export declare interface CcuConnection {
    on(event: "event", listener: (iface: INTERFACE_TYPE, channel: string, namedChannel: string | undefined, valueName: string, value: any) => void): this;
}
/**
 * Manages one CCU with a BidCos-RF + Hm-IP interface.
 */
export declare class CcuConnection extends EventEmitter {
    private options;
    private log;
    private bidCosIface;
    private hmIPIface;
    private channels;
    constructor(options: CcuConnectionOptions, log: NodeAPI["log"]);
    start(): Promise<void>;
    stop(): Promise<void>;
    /**
     * Returns the Address of the Device from the given Channel.
     * That is the part of the Channel before the first colon.
     * @param channel The Channel to get the Device Address from
     * @returns The Address of the Channel's Device
     */
    private getDeviceAddressFromChannel;
    /**
     * Replace the Device Name in the given Channel with the actual Device Name if available.
     * If the Device Name is not available, undefined is returned.
     * @param channel The Channel to replace the Device Name in
     * @returns The Channel with the Device Name replaced or undefined
     */
    private replaceDeviceName;
    /**
     * Resolves a channel string that may use a human-readable device name to its hardware address.
     * For example, "Door Switch:2" is converted to "LEQ123456:2" if a device named "Door Switch"
     * exists. If the name is not found the original value is returned unchanged, which allows
     * hardware addresses to be used directly.
     * @param channel The channel string, either "DeviceName:ChannelNumber" or "HardwareAddress:ChannelNumber"
     * @returns The channel string with the device name replaced by the hardware address, or the original if not found
     */
    private getOriginalDeviceName;
    private handleInterfaceEvent;
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
    setValue(iface: INTERFACE_TYPE, channel: string, valueName: string, value: number | string): Promise<void>;
    getChannels(): Channel[];
    private reloadRega;
}
//# sourceMappingURL=CcuConnection.d.ts.map
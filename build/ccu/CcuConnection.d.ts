/// <reference types="node" />
import EventEmitter from "events";
import { INTERFACE_TYPE } from "./CcuInterface.js";
import { NodeAPI } from "node-red";
import z from "zod";
/**
 * Represents a HomeMatic channel as retrieved from the CCU via Rega.
 * A channel belongs to a physical device and exposes one or more controllable values.
 */
export declare const Channel: z.ZodObject<{
    address: z.ZodString;
    id: z.ZodNumber;
    name: z.ZodString;
    iface: z.ZodOptional<z.ZodEnum<typeof INTERFACE_TYPE>>;
    deviceName: z.ZodOptional<z.ZodString>;
    channelNumber: z.ZodOptional<z.ZodNumber>;
    values: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
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
        user: string;
        password: string;
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
export declare class CcuConnection extends EventEmitter {
    private options;
    private log;
    private bidCosIface;
    private hmIPIface;
    private channels;
    private regaReloadTimeout;
    /**
     * Creates a new CcuConnection but does not start the XML-RPC listeners yet.
     * Call {@link start} to connect to the CCU.
     * @param options Connection configuration.
     * @param log Node-RED logger used for trace and error output.
     */
    constructor(options: CcuConnectionOptions, log: NodeAPI["log"]);
    /**
     * Starts the connection to the CCU.
     * Fetches the initial channel list from Rega, registers both XML-RPC interfaces
     * with the CCU, and schedules periodic Rega reloads.
     */
    start(): Promise<void>;
    /**
     * Stops both XML-RPC interfaces, unregisters them from the CCU,
     * and cancels the periodic Rega reload.
     */
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
    /**
     * Handles a raw datapoint event from a {@link CcuInterface} and re-emits it
     * on this connection, enriched with the human-readable channel name.
     * @param iface The interface that produced the event.
     * @param channel Hardware channel address.
     * @param valueName Name of the changed datapoint.
     * @param value The new value.
     */
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
    /**
     * Returns the current list of channels loaded from Rega.
     * The list is refreshed automatically at the interval specified in {@link CcuConnectionOptions.regaInterval}.
     */
    getChannels(): Channel[];
    /**
     * Fetches the full channel list from the CCU via Rega and updates the cached
     * {@link channels} array, including available value names for each channel.
     * Errors are logged but do not propagate so the periodic reload schedule is preserved.
     */
    private reloadRega;
}
//# sourceMappingURL=CcuConnection.d.ts.map
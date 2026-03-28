/// <reference types="node" />
import EventEmitter from "events";
import { NodeAPI } from "node-red";
export declare enum INTERFACE_TYPE {
    BIDCOSRF = "BidCos-RF",// Homematic (Non-IP)
    HMIP = "Hm-IP"
}
export interface CcuInterfaceOptions {
    /**
     * The type of the interface
     */
    type: INTERFACE_TYPE;
    /**
     * The address we (our XML-RPC) server will listen on
     */
    listenAddress: string;
    /**
     * The port we (our XML-RPC) server will listen on
     */
    listenPort: number;
    /**
     * The Hostname / IP of the ccu
     */
    ccuHost: string;
}
export declare interface CcuInterface {
    on(event: "event", listener: (device: string, valueName: string, value: any) => void): this;
}
/**
 * Encapsulates an Interface connection to the CCU
 * If you want to use multiple interfaces with one CCU, you instantiate this class multiple times
 */
export declare class CcuInterface extends EventEmitter {
    private log;
    private options;
    private id;
    private server?;
    private client;
    private receiveTimeout;
    private pingInterval;
    constructor(log: NodeAPI["log"], options: CcuInterfaceOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    /**
     * Helper function to call a method asynchronously on the CCU
     *
     * @param client The client to call the method on
     * @param method The method to call
     * @param params The parameters to pass to the method
     * @returns A Promise that is resolved when the method has been called, or rejected when an error occurs
     */
    private asyncMethodCall;
    /**
     * Restart the Receive Timeout timer
     * When the Receive Timeout Timer fires, the connection to the CCU is re-initialized
     */
    private restartReceiveTimeout;
    private restartPingInterval;
    private stopPingInterval;
    /**
     * (Re-) Initialize the connection to the CCU
     */
    private init;
    /**
     * Calls the 'setValue' RPC method on the CCU
     * This in turn will make the CCU send the Value to the Device
     *
     * @param device The Device that receives the value
     * @param valueName The value name to set
     * @param value The value to set
     * @returns A Promise that is resolved when the method has been called, or rejected when an error occurs
     */
    setValue(device: string, valueName: string, value: number | string): Promise<void>;
    ping(): void;
    private rpcNotFound;
    private rpcSystemListMethods;
    private rpcListDevices;
    private rpcNewDevices;
    private rpcSystemMulticall;
    private rpcEvent;
    loadValues(channel: string): Promise<{
        key: string;
    }[]>;
}
//# sourceMappingURL=CcuInterface.d.ts.map
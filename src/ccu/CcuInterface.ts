import EventEmitter from "events";
import { createRequire } from "module";
import { NodeAPI } from "node-red";
import type xmlrpc from "xmlrpc";
import { ca } from "zod/v4/locales";

// It is important to use homematic-xmlrpc and not the normal xmlrpc package, because the homematic-xmlrpc package contains some fixes for compatibility with the CCU
const xmlrpcLib: typeof xmlrpc = createRequire(__filename)("homematic-xmlrpc");

const PING_INTERVAL = 10 * 1000; // Interval at which a Ping is sent while connected
const RECEIVE_TIMEOUT = 60 * 1000; // After this time without data from the CCU, the connection is re-established

export enum INTERFACE_TYPE {
    BIDCOSRF = "BidCos-RF", // Homematic (Non-IP)
    HMIP = "Hm-IP", // Homematic IP
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
export class CcuInterface extends EventEmitter {
    private id: string;

    private server?: xmlrpc.Server;
    private client: xmlrpc.Client;

    private receiveTimeout: NodeJS.Timeout | null = null;
    private pingInterval: NodeJS.Timeout | null = null;

    constructor(private log: NodeAPI["log"], private options: CcuInterfaceOptions) {
        super();

        this.id = `${this.options.listenAddress}:${this.options.listenPort}`;

        // Setup client that will be used to call methods on the CCU
        let port: number;
        switch (this.options.type) {
            case INTERFACE_TYPE.BIDCOSRF:
                port = 2001;
                break;
            case INTERFACE_TYPE.HMIP:
                port = 2010;
                break;
            default:
                throw new Error(`Unknown interface type ${this.options.type}`);
        }
        this.client = xmlrpcLib.createClient({ host: this.options.ccuHost, port });
    }

    public async start() {
        // Setup Server that will listen to calls from the CCU
        await new Promise<void>((resolve) => {
            this.server = xmlrpcLib.createServer({ host: "0.0.0.0", port: this.options.listenPort }, () => resolve());
            this.server.on("NotFound", this.rpcNotFound.bind(this));
            this.server.on("system.listMethods", this.rpcSystemListMethods.bind(this));
            this.server.on("system.multicall", this.rpcSystemMulticall.bind(this));
            this.server.on("event", this.rpcEvent.bind(this));
            this.server.on("listDevices", this.rpcListDevices.bind(this));
            this.server.on("newDevices", this.rpcNewDevices.bind(this));
        });
        this.log.info("Server started")

        return this.init();
    }

    public async stop(): Promise<void> {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        if (this.receiveTimeout) {
            clearTimeout(this.receiveTimeout);
            this.receiveTimeout = null;
        }
        if (this.server) {
            await new Promise<void>((resolve, reject) => {
                this.server?.httpServer.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
                this.server?.httpServer.closeAllConnections();
            });
            this.log.info("Server stopped")
        }
    }

    /**
     * Helper function to call a method asynchronously on the CCU
     * 
     * @param client The client to call the method on
     * @param method The method to call
     * @param params The parameters to pass to the method
     * @returns A Promise that is resolved when the method has been called, or rejected when an error occurs
     */
    private asyncMethodCall(client: xmlrpc.Client, method: string, params: any): Promise<any> {
        return new Promise((resolve, reject) => {
            this.log.trace(`Call RPC Method '${method}' with params ${JSON.stringify(params)}`);

            client.methodCall(method, params, (error: any, value: any) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(value);
                }
            });
        });
    }

    /**
     * Restart the Receive Timeout timer
     * When the Receive Timeout Timer fires, the connection to the CCU is re-initialized
     */
    private restartReceiveTimeout() {
        if (this.receiveTimeout) {
            clearTimeout(this.receiveTimeout);
        }
        this.receiveTimeout = setTimeout(() => {
            this.log.error("Receive Timeout");

            this.init();
        }, RECEIVE_TIMEOUT);
    }

    private restartPingInterval() {
        this.stopPingInterval();
        this.pingInterval = setInterval(() => {
            this.ping();
        }, PING_INTERVAL);
    }

    private stopPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    /**
     * (Re-) Initialize the connection to the CCU
     */
    private async init() {
        this.log.trace("init");

        this.stopPingInterval();

        // Close all active HTTP connections so the CCU must establish fresh ones after re-init
        if (this.server) {
            this.server.httpServer.closeAllConnections();
        }

        try {
            this.restartReceiveTimeout();

            // Unregister at CCU (ID to the ccu is empty)
            await this.asyncMethodCall(this.client, "init", [`${this.options.listenAddress}:${this.options.listenPort}`, ""]);
            this.log.debug("deinit done");

            await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait a second to ensure the CCU has processed the deinitialization

            // Register at CCU
            await this.asyncMethodCall(this.client, "init", [`${this.options.listenAddress}:${this.options.listenPort}`, this.id]);
            this.log.debug("init done");

            this.restartPingInterval();
        }
        catch (err: any) {
            this.log.error(err.message ?? err);
        }
    }

    /**
     * Calls the 'setValue' RPC method on the CCU
     * This in turn will make the CCU send the Value to the Device
     * 
     * @param device The Device that receives the value
     * @param valueName The value name to set
     * @param value The value to set
     * @returns A Promise that is resolved when the method has been called, or rejected when an error occurs
     */
    public async setValue(device: string, valueName: string, value: number | string): Promise<void> {
        this.log.trace(`setValue: ${device}/${valueName}=${value}`);
        await this.asyncMethodCall(this.client, "setValue", [device, valueName, value]);
    }

    // Calls the 'ping' RPC method on the CCU
    public ping() {
        this.log.trace("ping");

        this.client.methodCall("ping", [this.id], (error: any, value: any) => {
            if (error) {
                this.log.error(error.message ?? error);
            }
        });
    }

    // Handle a call to a non-existing RPC method
    private rpcNotFound(method: string, params: any): any {
        this.log.error(`Method ${method} does not exist`);
    }

    // Handle the 'system.listMethods' RPC method
    private rpcSystemListMethods(err: any, params: any, callback: (error: any, value: any) => void) {
        this.log.trace(`system.listMethods: ${JSON.stringify(params)}`);

        // Return an array of supported RPC methods
        callback(null, ["system.multicall", "system.listMethods", "listDevices", "newDevices", "event"]);
    }

    // Handle the 'listDevices' RPC method
    private rpcListDevices(err: any, params: any, callback: (error: any, value: any) => void) {
        this.log.trace(`listDevices: ${JSON.stringify(params)}`);

        // Return an Empty list of devices (This will make the CCU send all known devices to us)
        callback(null, []);
    }

    // Handle the 'newDevices' RPC method
    private rpcNewDevices(err: any, params: any, callback: (error: any, value: any) => void) {
        this.log.trace(`newDevices: ${JSON.stringify(params[1].length)}`);

        // Return type is void
        callback(null, []);
    }

    // Handle the 'system.multicall' RPC method
    private rpcSystemMulticall(err: any, params: any, callback: (error: any, value: any) => void) {
        this.log.trace(`system.multicall: ${JSON.stringify(params[0].length)}`);

        this.restartReceiveTimeout();
        this.restartPingInterval();

        let methodResults = [];
        for (const method of params[0]) {
            switch (method.methodName) {
                // Right now only the 'event' method is supported
                case "event":
                    this.log.trace(`event: ${method.params[1]}/${method.params[2]}=${method.params[3]}`);
                    try {
                        this.emit("event", method.params[1], method.params[2], method.params[3]);
                    } catch (e: any) {
                        this.log.error(`Error handling event: ${e?.message ?? e}`);
                    }
                    methodResults.push([]);
                    break;

                default:
                    this.log.error(`Method ${method.methodName} does not exist`);
                    methodResults.push([]);
                    break;
            }
        }
        callback(null, methodResults);
    }

    // Handle the 'event' RPC method
    private rpcEvent(err: any, params: any, callback: (error: any, value: any) => void): any {
        this.log.trace(`event: ${params[1]}/${params[2]}=${params[3]}`);

        this.restartReceiveTimeout();
        this.restartPingInterval();

        try {
            this.emit("event", params[1], params[2], params[3]);
        } catch (e: any) {
            this.log.error(`Error handling event: ${e?.message ?? e}`);
        }
        callback(null, []);
    }

    public async loadValues(channel: string): Promise<{ key: string }[]> {
        try {
            const vals = await this.asyncMethodCall(this.client, "getParamset", [channel, "VALUES"]);
            return vals;
        } catch (e: any) {
            this.log.error(`Error loading values for channel ${channel}: ${e?.message ?? e}`);
            return [];
        }
    }
}
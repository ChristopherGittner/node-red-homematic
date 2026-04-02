"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CcuInterface = exports.INTERFACE_TYPE = void 0;
const events_1 = __importDefault(require("events"));
const module_1 = require("module");
// It is important to use homematic-xmlrpc and not the normal xmlrpc package, because the homematic-xmlrpc package contains some fixes for compatibility with the CCU
const xmlrpcLib = (0, module_1.createRequire)(__filename)("homematic-xmlrpc");
const PING_INTERVAL = 10 * 1000; // Interval at which a Ping is sent while connected
const RECEIVE_TIMEOUT = 60 * 1000; // After this time without data from the CCU, the connection is re-established
var INTERFACE_TYPE;
(function (INTERFACE_TYPE) {
    INTERFACE_TYPE["BIDCOSRF"] = "BidCos-RF";
    INTERFACE_TYPE["HMIP"] = "Hm-IP";
})(INTERFACE_TYPE || (exports.INTERFACE_TYPE = INTERFACE_TYPE = {}));
/**
 * Encapsulates an Interface connection to the CCU
 * If you want to use multiple interfaces with one CCU, you instantiate this class multiple times
 */
class CcuInterface extends events_1.default {
    constructor(log, options) {
        super();
        this.log = log;
        this.options = options;
        this.receiveTimeout = null;
        this.pingInterval = null;
        this.id = `${this.options.listenAddress}:${this.options.listenPort}`;
        // Setup client that will be used to call methods on the CCU
        let port;
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
    async start() {
        // Setup Server that will listen to calls from the CCU
        await new Promise((resolve) => {
            this.server = xmlrpcLib.createServer({ host: "0.0.0.0", port: this.options.listenPort }, () => resolve());
            this.server.on("NotFound", this.rpcNotFound.bind(this));
            this.server.on("system.listMethods", this.rpcSystemListMethods.bind(this));
            this.server.on("system.multicall", this.rpcSystemMulticall.bind(this));
            this.server.on("event", this.rpcEvent.bind(this));
            this.server.on("listDevices", this.rpcListDevices.bind(this));
            this.server.on("newDevices", this.rpcNewDevices.bind(this));
        });
        this.log.info("Server started");
        return this.init();
    }
    async stop() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        if (this.receiveTimeout) {
            clearTimeout(this.receiveTimeout);
            this.receiveTimeout = null;
        }
        if (this.server) {
            await new Promise((resolve, reject) => {
                this.server?.httpServer.close((err) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
                this.server?.httpServer.closeAllConnections();
            });
            this.log.info("Server stopped");
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
    asyncMethodCall(client, method, params) {
        return new Promise((resolve, reject) => {
            this.log.trace(`Call RPC Method '${method}' with params ${JSON.stringify(params)}`);
            client.methodCall(method, params, (error, value) => {
                if (error) {
                    reject(error);
                }
                else {
                    resolve(value);
                }
            });
        });
    }
    /**
     * Restart the Receive Timeout timer
     * When the Receive Timeout Timer fires, the connection to the CCU is re-initialized
     */
    restartReceiveTimeout() {
        if (this.receiveTimeout) {
            clearTimeout(this.receiveTimeout);
        }
        this.receiveTimeout = setTimeout(() => {
            this.log.error("Receive Timeout");
            this.init();
        }, RECEIVE_TIMEOUT);
    }
    restartPingInterval() {
        this.stopPingInterval();
        this.pingInterval = setInterval(() => {
            this.ping();
        }, PING_INTERVAL);
    }
    stopPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
    /**
     * (Re-) Initialize the connection to the CCU
     */
    async init() {
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
        catch (err) {
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
    async setValue(device, valueName, value) {
        this.log.trace(`setValue: ${device}/${valueName}=${value}`);
        await this.asyncMethodCall(this.client, "setValue", [device, valueName, value]);
    }
    // Calls the 'ping' RPC method on the CCU
    ping() {
        this.log.trace("ping");
        this.client.methodCall("ping", [this.id], (error, value) => {
            if (error) {
                this.log.error(error.message ?? error);
            }
        });
    }
    // Handle a call to a non-existing RPC method
    rpcNotFound(method, params) {
        this.log.error(`Method ${method} does not exist`);
    }
    // Handle the 'system.listMethods' RPC method
    rpcSystemListMethods(err, params, callback) {
        this.log.trace(`system.listMethods: ${JSON.stringify(params)}`);
        // Return an array of supported RPC methods
        callback(null, ["system.multicall", "system.listMethods", "listDevices", "newDevices", "event"]);
    }
    // Handle the 'listDevices' RPC method
    rpcListDevices(err, params, callback) {
        this.log.trace(`listDevices: ${JSON.stringify(params)}`);
        // Return an Empty list of devices (This will make the CCU send all known devices to us)
        callback(null, []);
    }
    // Handle the 'newDevices' RPC method
    rpcNewDevices(err, params, callback) {
        this.log.trace(`newDevices: ${JSON.stringify(params[1].length)}`);
        // Return type is void
        callback(null, []);
    }
    // Handle the 'system.multicall' RPC method
    rpcSystemMulticall(err, params, callback) {
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
                    }
                    catch (e) {
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
    rpcEvent(err, params, callback) {
        this.log.trace(`event: ${params[1]}/${params[2]}=${params[3]}`);
        this.restartReceiveTimeout();
        this.restartPingInterval();
        try {
            this.emit("event", params[1], params[2], params[3]);
        }
        catch (e) {
            this.log.error(`Error handling event: ${e?.message ?? e}`);
        }
        callback(null, []);
    }
    async loadValues(channel) {
        try {
            const vals = await this.asyncMethodCall(this.client, "getParamset", [channel, "VALUES"]);
            return vals;
        }
        catch (e) {
            this.log.error(`Error loading values for channel ${channel}: ${e?.message ?? e}`);
            return [];
        }
    }
}
exports.CcuInterface = CcuInterface;
//# sourceMappingURL=CcuInterface.js.map
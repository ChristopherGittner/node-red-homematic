"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const CcuInterface_1 = require("./ccu/CcuInterface");
const zod_1 = __importDefault(require("zod"));
module.exports = function (RED) {
    function SetValue(config) {
        RED.nodes.createNode(this, config);
        this.ccu = RED.nodes.getNode(config.ccu);
        this.interface = config.interface;
        this.channel = config.channel;
        this.valueName = config.valueName;
        this.on("input", (msg) => {
            const value = zod_1.default.coerce.string().parse(msg.payload);
            const iface = zod_1.default.enum(CcuInterface_1.INTERFACE_TYPE).optional().default(this.interface).parse(msg.iface);
            const channel = zod_1.default.string().optional().default(this.channel).parse(msg.channel);
            const valueName = zod_1.default.string().optional().default(this.valueName).parse(msg.valueName);
            this.ccu.connection.setValue(iface, channel, valueName, value).catch((err) => {
                this.error(`Failed to set value ${channel}/${valueName}=${value}: ${err.message}`, msg);
            });
        });
        this.on("close", (done) => {
            this.ccu = null;
            done();
        });
    }
    RED.nodes.registerType("set-value", SetValue);
};
//# sourceMappingURL=set-value.js.map
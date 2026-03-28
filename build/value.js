"use strict";
module.exports = function (RED) {
    function Value(config) {
        RED.nodes.createNode(this, config);
        this.ccu = RED.nodes.getNode(config.ccu);
        this.interface = config.interface;
        this.channel = config.channel;
        this.valueName = config.valueName;
        this.handleInput = (iface, channel, namedChannel, valueName, value) => {
            RED.log.trace(this.channel);
            if (iface !== this.interface)
                return;
            if (this.channel && channel !== this.channel)
                return;
            if (this.valueName && valueName !== this.valueName)
                return;
            this.send({
                payload: value,
                topic: `${iface}/${channel}/${namedChannel ? namedChannel + "/" : channel}${valueName}`,
                iface,
                channel,
                namedChannel,
                valueName,
            });
        };
        this.ccu.connection.on("event", this.handleInput);
        this.on("close", (done) => {
            RED.log.trace("Value node closing, removing input listener from CCU");
            this.ccu.connection.off("event", this.handleInput);
            this.ccu = null;
            done();
        });
    }
    RED.nodes.registerType("value", Value);
};
//# sourceMappingURL=value.js.map
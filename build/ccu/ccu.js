"use strict";
const CcuConnection_1 = require("./CcuConnection");
module.exports = function (RED) {
    RED.httpAdmin.get('/homematic/ccu/:id/channels', (req, res) => {
        const node = RED.nodes.getNode(req.params.id);
        if (!node) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }
        res.json(node.connection.getChannels());
    });
    function Ccu(config) {
        RED.nodes.createNode(this, config);
        this.config = config;
        this.connection = new CcuConnection_1.CcuConnection({
            listenAddress: this.config.listenAddress,
            localBidCosRFPort: this.config.bidCosListenPort,
            localHmIPPort: this.config.hmIpListenPort,
            ccuHost: this.config.ccuHostname,
            regaInterval: 60,
        }, RED.log);
        this.connection.start();
        this.on("close", (done) => {
            this.connection.stop();
            done();
        });
    }
    RED.nodes.registerType("ccu", Ccu);
};
//# sourceMappingURL=ccu.js.map
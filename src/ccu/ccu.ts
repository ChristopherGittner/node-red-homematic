import { NodeAPI } from "node-red";
import { CcuConnection } from "./CcuConnection";
import { CcuConfig, CcuNode } from "./CcuTypes";

export = function (RED: NodeAPI): void {
    RED.httpAdmin.get('/homematic/ccu/:id/channels', (req, res) => {
        const node = RED.nodes.getNode(req.params.id as string) as CcuNode;
        if (!node) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }
        res.json(node.connection.getChannels());
    });

    function Ccu(this: CcuNode, config: CcuConfig): void {
        RED.nodes.createNode(this, config);

        this.config = config;

        this.connection = new CcuConnection({
            listenAddress: this.config.listenAddress,
            localBidCosRFPort: this.config.bidCosListenPort,
            localHmIPPort: this.config.hmIpListenPort,
            ccuHost: this.config.ccuHostname,
            regaInterval: 60,
        }, RED.log);
        this.connection.start();

        this.on("close", (done: () => void) => {
            this.connection.stop();
            done();
        });
    }

    RED.nodes.registerType("ccu", Ccu);
};


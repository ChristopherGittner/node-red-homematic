import { NodeAPI, NodeDef, Node } from "node-red";
import { CcuNode } from "./ccu/CcuTypes";
import { INTERFACE_TYPE } from "./ccu/CcuInterface";

interface ValueConfig extends NodeDef {
    ccu: string;
    interface: INTERFACE_TYPE;
    channel: string;
    valueName: string;
}

interface ValueNode extends Node {
    ccu: CcuNode;
    interface: INTERFACE_TYPE;
    channel: string;
    valueName: string;

    handleInput: (iface: INTERFACE_TYPE, channel: string, namedChannel: string | undefined, valueName: string, value: any) => void;
}

export = function (RED: NodeAPI): void {
    function Value(this: ValueNode, config: ValueConfig): void {
        RED.nodes.createNode(this, config);

        this.ccu = RED.nodes.getNode(config.ccu) as CcuNode;
        this.interface = config.interface;
        this.channel = config.channel;
        this.valueName = config.valueName;

        // Listen to events from the CCU and send them to the output if they match the configuration
        this.handleInput = (iface: INTERFACE_TYPE, channel: string, namedChannel: string | undefined, valueName: string, value: any) => {
            if (iface !== this.interface) return;
            if (this.channel && channel !== this.channel) return;
            if (this.valueName && valueName !== this.valueName) return;
            this.send({
                payload: value,
                topic: `${iface}/${channel}/${namedChannel ? namedChannel + "/" : channel}${valueName}`,
                iface,
                channel,
                namedChannel,
                valueName,
            });
        }

        this.ccu.connection.on("event", this.handleInput);

        this.on("close", (done: () => void) => {
            RED.log.trace("Value node closing, removing input listener from CCU");
            this.ccu.connection.off("event", this.handleInput);
            this.ccu = null as any;
            done();
        });
    }

    RED.nodes.registerType("value", Value);
};

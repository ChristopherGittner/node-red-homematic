import { NodeAPI, NodeDef, Node } from "node-red";
import { CcuNode } from "./ccu/CcuTypes";
import { INTERFACE_TYPE } from "./ccu/CcuInterface";
import z from "zod";

interface SetValueConfig extends NodeDef {
    ccu: string;
    interface: INTERFACE_TYPE;
    channel: string;
    valueName: string;
}

interface SetValueNode extends Node {
    ccu: CcuNode;
    interface: INTERFACE_TYPE;
    channel: string;
    valueName: string;
}

export = function (RED: NodeAPI): void {
    function SetValue(this: SetValueNode, config: SetValueConfig): void {
        RED.nodes.createNode(this, config);

        this.ccu = RED.nodes.getNode(config.ccu) as CcuNode;
        this.interface = config.interface;
        this.channel = config.channel;
        this.valueName = config.valueName;

        this.on("input", (msg: any) => {
            const value = z.string().or(z.number()).parse(msg.payload);
            const iface = z.enum(INTERFACE_TYPE).optional().default(this.interface).parse(msg.iface);
            const channel = z.string().optional().default(this.channel).parse(msg.channel);
            const valueName = z.string().optional().default(this.valueName).parse(msg.valueName);

            this.ccu.connection.setValue(iface, channel, valueName, value).catch((err: Error) => {
                this.error(`Failed to set value ${channel}/${valueName}=${value}: ${err.message}`, msg);
            });
        });

        this.on("close", (done: () => void) => {
            this.ccu = null as any;
            done();
        });
    }

    RED.nodes.registerType("set-value", SetValue);
};

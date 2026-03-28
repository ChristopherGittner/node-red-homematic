import { NodeDef, Node } from "node-red";
import { CcuConnection } from "./CcuConnection";
export interface CcuConfig extends NodeDef {
    ccuHostname: string;
    listenAddress: string;
    bidCosListenPort: number;
    hmIpListenPort: number;
}
export interface CcuNode extends Node {
    config: CcuConfig;
    connection: CcuConnection;
}
//# sourceMappingURL=CcuTypes.d.ts.map
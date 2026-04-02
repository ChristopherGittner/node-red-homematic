import { Channel } from "./CcuConnection";
/**
 * Returns the Channels available on the CCU
 * @param host The Hostname or IP of the CCU
 * @returns The Channels available on the CCU
 */
export declare function getChannels(host: string, authentication?: {
    user: string;
    password: string;
}): Promise<Channel[]>;
//# sourceMappingURL=Rega.d.ts.map
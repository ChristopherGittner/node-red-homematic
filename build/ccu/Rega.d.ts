import { INTERFACE_TYPE } from "./CcuInterface";
import { z } from "zod";
export declare const Channel: z.ZodObject<{
    address: z.ZodString;
    id: z.ZodNumber;
    name: z.ZodString;
    iface: z.ZodOptional<z.ZodEnum<typeof INTERFACE_TYPE>>;
    deviceName: z.ZodOptional<z.ZodString>;
    channelNumber: z.ZodOptional<z.ZodNumber>;
    values: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type Channel = z.infer<typeof Channel>;
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
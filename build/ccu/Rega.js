"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChannels = exports.Channel = void 0;
const CcuInterface_1 = require("./CcuInterface");
const zod_1 = require("zod");
exports.Channel = zod_1.z.object({
    address: zod_1.z.string(),
    id: zod_1.z.number(),
    name: zod_1.z.string(),
    iface: zod_1.z.enum(CcuInterface_1.INTERFACE_TYPE).optional(),
    deviceName: zod_1.z.string().optional(),
    channelNumber: zod_1.z.number().optional(),
    values: zod_1.z.array(zod_1.z.string()).optional(),
});
const SCRIPT_GET_CHANNELS = `
!# devices.rega
!#
!# Dieses Homematic-Script gibt eine Liste aller Geraete/Kanaele im JSON Format aus
!#
!# 3'2013-9'2017 hobbyquaker https://github.com/hobbyquaker
!#

string sDevId;
string sChnId;

Write('[');

boolean dFirst = true;

foreach (sDevId, root.Devices().EnumUsedIDs()) {

    object oDevice   = dom.GetObject(sDevId);
    boolean bDevReady = oDevice.ReadyConfig();

    if (bDevReady) {

        if (dFirst) {
            dFirst = false;
        } else {
            WriteLine(',');
        }

        Write('{"id": ' # sDevId # ', "address": "' # oDevice.Address() # '", "name": "');
        WriteURL(oDevice.Name());
        Write('", "iface": "' # oDevice.Interface() # '"}');

        foreach(sChnId, oDevice.Channels()) {
            object oChannel = dom.GetObject(sChnId);
            WriteLine(',');
            Write('{"id": ' # sChnId # ', "address": "' # oChannel.Address() # '", "name":"');
            WriteURL(oChannel.Name());
            Write('", "iface": "' # oDevice.Interface() # '", "deviceName": "');
            WriteURL(oDevice.Name());
            Write('"}');
        }

    }
}

Write(']');
';`;
/**
 * Replaces all occurences of %XX with the corresponding character
 */
function decodeString(s) {
    return s.replaceAll(/%(..)/g, (match) => String.fromCharCode(parseInt(match.substring(1), 16)));
}
/**
 * Returns the Channels available on the CCU
 * @param host The Hostname or IP of the CCU
 * @returns The Channels available on the CCU
 */
async function getChannels(host, authentication) {
    // Create the Headers for the Request
    const headers = {
        "Content-Type": "application/x-www-form-urlencoded",
    };
    // Provide Authentication if available
    if (authentication) {
        const auth = Buffer.from(`${authentication.user}:${authentication.password}`).toString("base64");
        Object.assign(headers, { "Authorization": `Basic ${auth}` });
    }
    // Execute the Request
    const response = await fetch(`http://${host}:8181/rega.exe`, {
        body: SCRIPT_GET_CHANNELS,
        method: "POST",
        headers
    });
    if (response.status !== 200) {
        throw `Failed to fetch channels from CCU: ${response.statusText}`;
    }
    let raw = decodeString(await response.text());
    const rawChannels = JSON.parse(raw.substring(0, raw.indexOf("]") + 1));
    for (const channel of rawChannels) {
        const colonIndex = channel.address.indexOf(':');
        if (colonIndex !== -1) {
            channel.channelNumber = parseInt(channel.address.substring(colonIndex + 1), 10);
        }
        if (channel.iface === '1009') {
            channel.iface = CcuInterface_1.INTERFACE_TYPE.BIDCOSRF;
        }
        else if (channel.iface === '1011') {
            channel.iface = CcuInterface_1.INTERFACE_TYPE.HMIP;
        }
        else {
            channel.iface = undefined;
        }
    }
    return zod_1.z.array(exports.Channel).parse(rawChannels);
}
exports.getChannels = getChannels;
//# sourceMappingURL=Rega.js.map
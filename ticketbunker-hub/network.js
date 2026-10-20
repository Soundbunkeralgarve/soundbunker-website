// Network credentials are deliberately not saved in the event database or logs.
export function wifiPayload({ssid,password}) {
 if(typeof ssid!=='string'||!ssid.trim()||Buffer.byteLength(ssid,'utf8')>32||/[\x00-\x1f\x7f]/.test(ssid))throw Error('Enter the Wi-Fi name exactly as shown in network settings (up to 32 bytes).');
 if(typeof password!=='string'||password.length<8||password.length>63||/[^\x20-\x7e]/.test(password))throw Error('Enter the Wi-Fi password (8–63 printable characters).');
 const escape=value=>value.replace(/[\\;,:\"]/g,'\\$&');
 return `WIFI:T:WPA;S:${escape(ssid)};P:${escape(password)};;`;
}
export function connectionStatus(status,addresses,now=Date.now()) {
 const devices=status.devices.map(device=>({...device,connected:!device.revoked&&Number.isFinite(device.last_seen)&&now-device.last_seen>=0&&now-device.last_seen<15000}));
 const active=devices.filter(d=>!d.revoked),connected=active.filter(d=>d.connected).length;
 return {devices,network:{hasAddress:addresses.length>0,connected,total:active.length,allConnected:active.length>0&&connected===active.length,ready:status.ready&&addresses.length>0&&connected>0}};
}

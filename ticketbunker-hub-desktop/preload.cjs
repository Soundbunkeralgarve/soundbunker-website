const {contextBridge,ipcRenderer}=require('electron');
// Fixed operations only; the page never supplies commands, paths or system URLs.
contextBridge.exposeInMainWorld('hubNetwork',{
 status:()=>ipcRenderer.invoke('hub-network','status'),
 start:()=>ipcRenderer.invoke('hub-network','start'),
 stop:()=>ipcRenderer.invoke('hub-network','stop'),
 settings:()=>ipcRenderer.invoke('hub-network','settings')
});

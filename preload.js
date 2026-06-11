const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),

  getLinks: () => ipcRenderer.invoke("get-links"),
  addLink: (data) => ipcRenderer.invoke("add-link", data),
  removeLink: (id) => ipcRenderer.invoke("remove-link", id),
  toggleLink: (id) => ipcRenderer.invoke("toggle-link", id),
  checkLinkNow: (id) => ipcRenderer.invoke("check-link-now", id),

  onLinkUpdated: (callback) => {
    ipcRenderer.on("link-updated", (_e, link) => callback(link));
  },
});

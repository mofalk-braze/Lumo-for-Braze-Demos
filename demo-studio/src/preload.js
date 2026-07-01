const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('demoStudio', {
  getState: () => ipcRenderer.invoke('studio:get-state'),
  listWorkspaces: () => ipcRenderer.invoke('studio:list-workspaces'),
  createWorkspace: (name) => ipcRenderer.invoke('studio:create-workspace', name),
  switchWorkspace: (id) => ipcRenderer.invoke('studio:switch-workspace', id),
  restartLauncher: () => ipcRenderer.invoke('studio:restart-launcher'),
  runDoctor: () => ipcRenderer.invoke('studio:run-doctor'),
  installSystemTools: () => ipcRenderer.invoke('studio:install-system-tools'),
  installDependencies: () => ipcRenderer.invoke('studio:install-dependencies'),
  provisionAvd: () => ipcRenderer.invoke('studio:provision-avd'),
  openHomebrew: () => ipcRenderer.invoke('studio:open-homebrew'),
  openAndroidStudio: () => ipcRenderer.invoke('studio:open-android-studio'),
  openXcode: () => ipcRenderer.invoke('studio:open-xcode'),
  openBraze: () => ipcRenderer.invoke('studio:open-braze'),
  openAppleDeveloper: () => ipcRenderer.invoke('studio:open-apple-developer'),
  openFirebaseConsole: () => ipcRenderer.invoke('studio:open-firebase-console'),
  verifyAndroid: () => ipcRenderer.invoke('studio:verify-android'),
  verifyIos: () => ipcRenderer.invoke('studio:verify-ios'),
  importKit: () => ipcRenderer.invoke('studio:import-kit'),
  exportActiveKit: () => ipcRenderer.invoke('studio:export-active-kit'),
  openLogs: () => ipcRenderer.invoke('studio:open-logs'),
  revealWorkspace: () => ipcRenderer.invoke('studio:reveal-workspace'),
  completeFirstRun: (mode) => ipcRenderer.invoke('studio:complete-first-run', mode),
  onState: (callback) => {
    ipcRenderer.on('studio:state', (_event, state) => callback(state))
  },
  onLog: (callback) => {
    ipcRenderer.on('studio:log', (_event, entry) => callback(entry))
  },
})

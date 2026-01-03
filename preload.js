const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    openFolder: () => ipcRenderer.invoke('open-folder'),
    openFile: () => ipcRenderer.invoke('open-file'),
    openFileLocation: () => ipcRenderer.invoke('open-file-location'),

    navigateImage: (direction) => ipcRenderer.invoke('navigate-image', direction),
    goToImage: (index) => ipcRenderer.invoke('go-to-image', index),
    goToFirstImage: () => ipcRenderer.invoke('go-to-first-image'),
    goToLastImage: () => ipcRenderer.invoke('go-to-last-image'),
    navigateFromBoundary: (type) => ipcRenderer.invoke('navigate-from-boundary', type),
    navigateFolder: (direction) => ipcRenderer.invoke('navigate-folder', direction),
    randomFolder: () => ipcRenderer.invoke('random-folder'),

    toggleFolderNav: () => ipcRenderer.invoke('toggle-folder-nav'),
    toggleImageNav: () => ipcRenderer.invoke('toggle-image-nav'),

    setViewMode: (mode) => ipcRenderer.invoke('set-view-mode', mode),

    toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
    exitFullscreen: () => ipcRenderer.invoke('exit-fullscreen'),
    getFullscreenState: () => ipcRenderer.invoke('get-fullscreen-state'),

    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

    copyImage: () => ipcRenderer.invoke('copy-image'),
    requestDelete: () => ipcRenderer.invoke('request-delete'),
    executeDelete: () => ipcRenderer.invoke('execute-delete'),
    selectCopyDestination: () => ipcRenderer.invoke('select-copy-destination'),

    windowMinimize: () => ipcRenderer.invoke('window-minimize'),
    windowMaximize: () => ipcRenderer.invoke('window-maximize'),
    windowClose: () => ipcRenderer.invoke('window-close'),
    windowMove: (pos) => ipcRenderer.send('window-move', pos),

    dropFiles: (filePaths) => ipcRenderer.invoke('drop-files', filePaths),

    onImageLoaded: (callback) => ipcRenderer.on('image-loaded', (event, data) => callback(data)),
    onFolderChanged: (callback) => ipcRenderer.on('folder-changed', (event, data) => callback(data)),
    onViewModeChanged: (callback) => ipcRenderer.on('view-mode-changed', (event, data) => callback(data)),
    onSettingChanged: (callback) => ipcRenderer.on('setting-changed', (event, data) => callback(data)),
    onSettingsUpdated: (callback) => ipcRenderer.on('settings-updated', (event, settings) => callback(settings)),
    onBoundaryReached: (callback) => ipcRenderer.on('boundary-reached', (event, data) => callback(data)),
    onFullscreenChanged: (callback) => ipcRenderer.on('fullscreen-changed', (event, isFullscreen) => callback(isFullscreen)),
    onOpenSettings: (callback) => ipcRenderer.on('open-settings', () => callback()),
    onError: (callback) => ipcRenderer.on('error', (event, message) => callback(message)),
    onCopySuccess: (callback) => ipcRenderer.on('copy-success', (event, data) => callback(data)),
    onConfirmDelete: (callback) => ipcRenderer.on('confirm-delete', (event, data) => callback(data)),
    onDeleteSuccess: (callback) => ipcRenderer.on('delete-success', (event, data) => callback(data)),
    onNoMoreFolders: (callback) => ipcRenderer.on('no-more-folders', () => callback()),

    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    openFolder: () => ipcRenderer.send('open-folder'),
    openFile: () => ipcRenderer.send('open-file'),
    openFileLocation: () => ipcRenderer.send('open-file-location'),

    navigateImage: (direction) => ipcRenderer.send('navigate-image', direction),
    goToImage: (index) => ipcRenderer.send('go-to-image', index),
    goToFirstImage: () => ipcRenderer.send('go-to-first-image'),
    goToLastImage: () => ipcRenderer.send('go-to-last-image'),
    navigateFromBoundary: (type) => ipcRenderer.send('navigate-from-boundary', type),
    navigateFolder: (direction) => ipcRenderer.send('navigate-folder', direction),
    randomFolder: () => ipcRenderer.send('random-folder'),

    toggleFolderNav: () => ipcRenderer.send('toggle-folder-nav'),
    toggleImageNav: () => ipcRenderer.send('toggle-image-nav'),

    setViewMode: (mode) => ipcRenderer.send('set-view-mode', mode),

    toggleFullscreen: (mode) => ipcRenderer.send('toggle-fullscreen', mode),
    exitFullscreen: () => ipcRenderer.send('exit-fullscreen'),
    getFullscreenState: () => ipcRenderer.invoke('get-fullscreen-state'),

    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

    copyImage: () => ipcRenderer.invoke('copy-image'),
    requestDelete: () => ipcRenderer.send('request-delete'),
    executeDelete: () => ipcRenderer.send('execute-delete'),
    selectCopyDestination: () => ipcRenderer.invoke('select-copy-destination'),
    selectScreenshotDestination: () => ipcRenderer.invoke('select-screenshot-destination'),
    copyCombinedImage: (dataUrl) => ipcRenderer.invoke('copy-combined-image', { dataUrl }),

    windowMinimize: () => ipcRenderer.send('window-minimize'),
    windowMaximize: () => ipcRenderer.send('window-maximize'),
    windowClose: () => ipcRenderer.send('window-close'),
    windowDragStart: () => ipcRenderer.send('window-drag-start'),
    windowDragEnd: () => ipcRenderer.send('window-drag-end'),
    windowMove: () => ipcRenderer.send('window-move'),

    dropFiles: (filePaths) => ipcRenderer.invoke('drop-files', filePaths),

    onImageLoaded: (callback) => ipcRenderer.on('image-loaded', (event, data) => callback(data)),
    onFolderChanged: (callback) => ipcRenderer.on('folder-changed', (event, data) => callback(data)),
    onViewModeChanged: (callback) => ipcRenderer.on('view-mode-changed', (event, data) => callback(data)),
    onSettingChanged: (callback) => ipcRenderer.on('setting-changed', (event, data) => callback(data)),
    onSettingsUpdated: (callback) => ipcRenderer.on('settings-updated', (event, settings) => callback(settings)),
    onBoundaryReached: (callback) => ipcRenderer.on('boundary-reached', (event, data) => callback(data)),
    onFullscreenChanged: (callback) => ipcRenderer.on('fullscreen-changed', (event, isFullscreen, mode) => callback(isFullscreen, mode)),
    onOpenSettings: (callback) => ipcRenderer.on('open-settings', () => callback()),
    onFullscreenKeyF10: (callback) => ipcRenderer.on('fullscreen-key-f10', () => callback()),
    onError: (callback) => ipcRenderer.on('error', (event, message) => callback(message)),
    pingRender: () => ipcRenderer.send('ping-render'),
    onPongRender: (callback) => ipcRenderer.on('pong-render', () => callback()),
    onCopySuccess: (callback) => ipcRenderer.on('copy-success', (event, data) => callback(data)),
    onConfirmDelete: (callback) => ipcRenderer.on('confirm-delete', (event, data) => callback(data)),
    onDeleteSuccess: (callback) => ipcRenderer.on('delete-success', (event, data) => callback(data)),
    onUnloadImage: (callback) => ipcRenderer.on('unload-image', () => callback()),
    onNoMoreFolders: (callback) => ipcRenderer.on('no-more-folders', () => callback()),
    log: (message) => ipcRenderer.send('log-message', message),

    takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
    onMediaKey: (callback) => ipcRenderer.on('media-key', (event, key) => callback(key)),
    onTriggerScreenshot: (callback) => ipcRenderer.on('trigger-screenshot', () => callback()),

    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});

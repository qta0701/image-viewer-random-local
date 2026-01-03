const { app, BrowserWindow, ipcMain, dialog, Menu, globalShortcut, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// 이미지 확장자 목록
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.ico', '.svg', '.tiff', '.tif'];

let mainWindow;
let currentImages = [];
let currentIndex = 0;
let currentFolder = '';
let siblingFolders = [];

// 랜덤 중복 방지용 히스토리
let visitedFolders = new Set();
let visitedImages = new Set();

let settings = {
    folderNavigation: 'next', // 'next' | 'random' | 'loop'
    imageNavigation: 'sequential', // 'sequential' | 'random'
    viewMode: 'fit',
    enableImageDrag: false,
    copyDestination: '',
    deleteMode: 'image',
    preventDuplicateFolder: true, // 랜덤 폴더 중복 방지
    preventDuplicateImage: true,  // 랜덤 이미지 중복 방지
    rememberPosition: true,
    showHiddenFiles: false
};

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
    try {
        if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, 'utf8');
            settings = { ...settings, ...JSON.parse(data) };
        }
        if (!settings.copyDestination) {
            settings.copyDestination = app.getPath('downloads');
        }
    } catch (e) {
        console.error('설정 로드 실패:', e);
        settings.copyDestination = app.getPath('downloads');
    }
}

function saveSettings() {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    } catch (e) {
        console.error('설정 저장 실패:', e);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 600,
        minHeight: 400,
        frame: false,
        backgroundColor: '#0d0d0d',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        show: false
    });

    mainWindow.loadFile('index.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    const menu = Menu.buildFromTemplate(createMenuTemplate());
    Menu.setApplicationMenu(menu);

    const args = process.argv.slice(1);
    if (args.length > 0 && !args[0].startsWith('-')) {
        const filePath = args[0];
        if (fs.existsSync(filePath)) {
            setTimeout(() => openFile(filePath), 500);
        }
    }
}

function createMenuTemplate() {
    return [
        {
            label: '파일',
            submenu: [
                { label: '폴더 열기', accelerator: 'CmdOrCtrl+O', click: () => openFolderDialog() },
                { label: '파일 열기', accelerator: 'CmdOrCtrl+Shift+O', click: () => openFileDialog() },
                { type: 'separator' },
                { label: '파일 위치 열기', accelerator: 'CmdOrCtrl+E', click: () => { if (currentImages[currentIndex]) shell.showItemInFolder(currentImages[currentIndex]); } },
                { type: 'separator' },
                { label: '이미지 복사', accelerator: 'Insert', click: () => copyCurrentImage() },
                { label: '삭제', accelerator: 'Delete', click: () => requestDelete() },
                { type: 'separator' },
                { label: '종료', accelerator: 'Alt+F4', click: () => app.quit() }
            ]
        },
        {
            label: '보기',
            submenu: [
                { label: '작은 그림도 꽉차게 보기', accelerator: 'Z', type: 'radio', checked: settings.viewMode === 'fitSmall', click: () => setViewMode('fitSmall') },
                { label: '원본 크기(100%)로 보기', accelerator: '0', type: 'radio', checked: settings.viewMode === 'original', click: () => setViewMode('original') },
                { label: '꽉차게 보기', accelerator: '9', type: 'radio', checked: settings.viewMode === 'fit', click: () => setViewMode('fit') },
                { label: '꽉차게 보기(폭맞춤)', accelerator: '8', type: 'radio', checked: settings.viewMode === 'fitWidth', click: () => setViewMode('fitWidth') },
                { label: '스마트 두장 보기(왼쪽→오른쪽)', accelerator: '7', type: 'radio', checked: settings.viewMode === 'dualLR', click: () => setViewMode('dualLR') },
                { label: '스마트 두장 보기(왼쪽←오른쪽)', accelerator: '6', type: 'radio', checked: settings.viewMode === 'dualRL', click: () => setViewMode('dualRL') },
                { type: 'separator' },
                { label: '전체 화면', accelerator: 'F11', click: () => toggleFullscreen() }
            ]
        },
        {
            label: '이동',
            submenu: [
                { label: '이전 이미지', accelerator: 'Left', click: () => navigateImage(-1) },
                { label: '다음 이미지', accelerator: 'Right', click: () => navigateImage(1) },
                { type: 'separator' },
                { label: '첫 이미지', accelerator: 'Home', click: () => goToFirstImage() },
                { label: '마지막 이미지', accelerator: 'End', click: () => goToLastImage() },
                { type: 'separator' },
                { label: '이전 폴더', accelerator: 'PageUp', click: () => navigateFolder(-1) },
                { label: '다음 폴더', accelerator: 'PageDown', click: () => navigateFolder(1) }
            ]
        },
        {
            label: '설정',
            submenu: [
                { label: '폴더 이동 옵션 전환', accelerator: 'CmdOrCtrl+R', click: () => toggleFolderNavigation() },
                { label: '이미지 이동 옵션 전환', accelerator: 'CmdOrCtrl+T', click: () => toggleImageNavigation() },
                { type: 'separator' },
                { label: '설정 열기', accelerator: 'F5', click: () => mainWindow.webContents.send('open-settings') }
            ]
        }
    ];
}

function toggleFolderNavigation() {
    const modes = ['next', 'random', 'loop'];
    const currentIdx = modes.indexOf(settings.folderNavigation);
    settings.folderNavigation = modes[(currentIdx + 1) % modes.length];
    saveSettings();

    // 모드 변경 시 히스토리 초기화
    if (settings.folderNavigation === 'random') {
        visitedFolders.clear();
        if (currentFolder) visitedFolders.add(currentFolder);
    }

    const modeNames = { 'next': '순차 폴더 이동', 'random': '랜덤 폴더 이동', 'loop': '폴더 이동 없음 (순환)' };
    mainWindow.webContents.send('setting-changed', { type: 'folderNavigation', value: settings.folderNavigation, name: modeNames[settings.folderNavigation] });
    sendSettingsToRenderer();
}

function toggleImageNavigation() {
    settings.imageNavigation = settings.imageNavigation === 'sequential' ? 'random' : 'sequential';
    saveSettings();

    // 모드 변경 시 히스토리 초기화
    if (settings.imageNavigation === 'random') {
        visitedImages.clear();
        if (currentImages[currentIndex]) visitedImages.add(currentIndex);
    }

    const modeName = settings.imageNavigation === 'sequential' ? '순차 이미지 이동' : '랜덤 이미지 이동';
    mainWindow.webContents.send('setting-changed', { type: 'imageNavigation', value: settings.imageNavigation, name: modeName });
    sendSettingsToRenderer();
}

function sendSettingsToRenderer() {
    mainWindow.webContents.send('settings-updated', settings);
}

function setViewMode(mode) {
    settings.viewMode = mode;
    saveSettings();

    const modeNames = { 'fit': '꽉차게 보기', 'fitSmall': '작은 그림도 꽉차게', 'original': '원본 크기 (100%)', 'fitWidth': '폭맞춤', 'dualLR': '두장 보기 (왼→오)', 'dualRL': '두장 보기 (오→왼)' };
    mainWindow.webContents.send('view-mode-changed', { mode: mode, name: modeNames[mode] || mode });

    const menu = Menu.buildFromTemplate(createMenuTemplate());
    Menu.setApplicationMenu(menu);

    if (currentImages.length > 0) sendImageData();
}

function toggleFullscreen() {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
    mainWindow.webContents.send('fullscreen-changed', mainWindow.isFullScreen());
}

function exitFullscreen() {
    if (mainWindow.isFullScreen()) {
        mainWindow.setFullScreen(false);
        mainWindow.webContents.send('fullscreen-changed', false);
    }
}

async function openFolderDialog() {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (!result.canceled && result.filePaths.length > 0) loadFolder(result.filePaths[0]);
}

async function openFileDialog() {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: '이미지', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'ico', 'svg', 'tiff', 'tif'] }]
    });
    if (!result.canceled && result.filePaths.length > 0) openFile(result.filePaths[0]);
}

async function selectCopyDestination() {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], title: '이미지 복사 대상 폴더 선택' });
    if (!result.canceled && result.filePaths.length > 0) {
        settings.copyDestination = result.filePaths[0];
        saveSettings();
        sendSettingsToRenderer();
        return settings.copyDestination;
    }
    return null;
}

function copyCurrentImage() {
    if (currentImages.length === 0 || !currentImages[currentIndex]) {
        mainWindow.webContents.send('error', '복사할 이미지가 없습니다.');
        return;
    }

    const sourcePath = currentImages[currentIndex];
    const fileName = path.basename(sourcePath);
    let finalPath = path.join(settings.copyDestination, fileName);
    let counter = 1;
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);

    while (fs.existsSync(finalPath)) {
        finalPath = path.join(settings.copyDestination, `${baseName} (${counter})${ext}`);
        counter++;
    }

    try {
        fs.copyFileSync(sourcePath, finalPath);
        mainWindow.webContents.send('copy-success', { fileName: path.basename(finalPath), destination: settings.copyDestination });
    } catch (e) {
        console.error('이미지 복사 실패:', e);
        mainWindow.webContents.send('error', '이미지 복사에 실패했습니다.');
    }
}

function requestDelete() {
    if (currentImages.length === 0) {
        mainWindow.webContents.send('error', '삭제할 대상이 없습니다.');
        return;
    }
    const targetName = settings.deleteMode === 'folder' ? path.basename(currentFolder) : path.basename(currentImages[currentIndex]);
    const targetType = settings.deleteMode === 'folder' ? '폴더' : '이미지';
    mainWindow.webContents.send('confirm-delete', { mode: settings.deleteMode, targetName, targetType });
}

function executeDelete() {
    if (settings.deleteMode === 'folder') deleteCurrentFolder();
    else deleteCurrentImage();
}

function deleteCurrentImage() {
    if (currentImages.length === 0 || !currentImages[currentIndex]) return;
    const imagePath = currentImages[currentIndex];

    try {
        shell.trashItem(imagePath);
        visitedImages.delete(currentIndex);
        currentImages.splice(currentIndex, 1);

        // 인덱스 재조정
        const newVisited = new Set();
        visitedImages.forEach(idx => {
            if (idx < currentIndex) newVisited.add(idx);
            else if (idx > currentIndex) newVisited.add(idx - 1);
        });
        visitedImages = newVisited;

        if (currentImages.length === 0) {
            navigateFolder(1);
        } else {
            if (currentIndex >= currentImages.length) currentIndex = currentImages.length - 1;
            sendImageData();
        }

        mainWindow.webContents.send('delete-success', { type: 'image', name: path.basename(imagePath) });
    } catch (e) {
        console.error('이미지 삭제 실패:', e);
        mainWindow.webContents.send('error', '이미지 삭제에 실패했습니다.');
    }
}

function deleteCurrentFolder() {
    if (!currentFolder) return;
    const folderPath = currentFolder;
    const folderName = path.basename(folderPath);

    try {
        shell.trashItem(folderPath);
        visitedFolders.delete(folderPath);
        const folderIdx = siblingFolders.indexOf(folderPath);
        if (folderIdx !== -1) siblingFolders.splice(folderIdx, 1);

        mainWindow.webContents.send('delete-success', { type: 'folder', name: folderName });

        if (siblingFolders.length > 0) {
            const nextIdx = Math.min(folderIdx, siblingFolders.length - 1);
            loadFolder(siblingFolders[nextIdx]);
            mainWindow.webContents.send('folder-changed', {
                folderName: path.basename(siblingFolders[nextIdx]),
                direction: 'next',
                folderNavigation: settings.folderNavigation,
                currentFolderIndex: nextIdx + 1,
                totalFolders: siblingFolders.length
            });
        } else {
            currentImages = [];
            currentFolder = '';
            currentIndex = 0;
            mainWindow.webContents.send('no-more-folders');
        }
    } catch (e) {
        console.error('폴더 삭제 실패:', e);
        mainWindow.webContents.send('error', '폴더 삭제에 실패했습니다.');
    }
}

function openFile(filePath) {
    const folder = path.dirname(filePath);
    const fileName = path.basename(filePath);
    loadFolder(folder, fileName);
}

function loadFolder(folderPath, targetFile = null) {
    try {
        const files = fs.readdirSync(folderPath);
        const imageFiles = files
            .filter(file => IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase()))
            .sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }))
            .map(file => path.join(folderPath, file));

        if (imageFiles.length === 0) {
            mainWindow.webContents.send('error', '이 폴더에 이미지가 없습니다.');
            return;
        }

        currentImages = imageFiles;
        currentFolder = folderPath;

        // 방문 기록 추가
        visitedFolders.add(folderPath);
        visitedImages.clear();

        loadSiblingFolders();

        if (targetFile) {
            const targetPath = path.join(folderPath, targetFile);
            currentIndex = imageFiles.indexOf(targetPath);
            if (currentIndex === -1) currentIndex = 0;
        } else {
            currentIndex = 0;
        }

        visitedImages.add(currentIndex);

        sendImageData();
        sendSettingsToRenderer();
    } catch (e) {
        console.error('폴더 로드 실패:', e);
        mainWindow.webContents.send('error', '폴더를 열 수 없습니다.');
    }
}

function loadSiblingFolders() {
    try {
        const parentFolder = path.dirname(currentFolder);
        const items = fs.readdirSync(parentFolder);

        siblingFolders = items
            .map(item => path.join(parentFolder, item))
            .filter(itemPath => {
                try {
                    const stat = fs.statSync(itemPath);
                    if (!stat.isDirectory()) return false;
                    const files = fs.readdirSync(itemPath);
                    return files.some(file => IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase()));
                } catch { return false; }
            })
            .sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
    } catch (e) {
        console.error('형제 폴더 로드 실패:', e);
        siblingFolders = [currentFolder];
    }
}

function sendImageData() {
    if (currentImages.length === 0) return;

    const isDualMode = settings.viewMode === 'dualLR' || settings.viewMode === 'dualRL';
    let displayIndex = currentIndex;

    if (isDualMode) {
        displayIndex = Math.floor(currentIndex / 2) * 2;
        if (displayIndex >= currentImages.length - 1 && currentImages.length > 1) {
            displayIndex = currentImages.length - 2;
        }
        currentIndex = displayIndex;
    }

    const imagePath = currentImages[currentIndex];
    const stats = fs.statSync(imagePath);

    let secondImagePath = null;
    let secondFileName = null;
    if (isDualMode && currentIndex < currentImages.length - 1) {
        secondImagePath = currentImages[currentIndex + 1];
        secondFileName = path.basename(secondImagePath);
    }

    mainWindow.webContents.send('image-loaded', {
        path: imagePath,
        secondPath: secondImagePath,
        folder: currentFolder,
        folderName: path.basename(currentFolder),
        fileName: path.basename(imagePath),
        secondFileName,
        index: currentIndex,
        total: currentImages.length,
        size: formatFileSize(stats.size),
        viewMode: settings.viewMode,
        settings
    });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function navigateImage(direction) {
    if (currentImages.length === 0) return;

    const isDualMode = settings.viewMode === 'dualLR' || settings.viewMode === 'dualRL';
    const step = isDualMode ? 2 : 1;

    if (settings.imageNavigation === 'random') {
        // 랜덤 이미지 이동 (중복 방지 옵션 적용)
        const availableIndices = [];
        for (let i = 0; i < currentImages.length; i++) {
            if (!settings.preventDuplicateImage || !visitedImages.has(i)) {
                availableIndices.push(i);
            }
        }

        if (availableIndices.length === 0) {
            // 모든 이미지를 봤을 때
            if (settings.folderNavigation === 'loop') {
                // 폴더 이동 없음이면 다시 섞기
                visitedImages.clear();
                visitedImages.add(currentIndex);
                for (let i = 0; i < currentImages.length; i++) {
                    if (i !== currentIndex) availableIndices.push(i);
                }
            } else {
                // 폴더 옵션에 따라 이동
                handleBoundary('end', direction);
                return;
            }
        }

        if (availableIndices.length > 0) {
            const randomIdx = availableIndices[Math.floor(Math.random() * availableIndices.length)];
            currentIndex = randomIdx;
            visitedImages.add(currentIndex);
            sendImageData();
        }
        return;
    }

    const newIndex = currentIndex + (direction * step);

    if (newIndex < 0) {
        handleBoundary('start', direction);
    } else if (newIndex >= currentImages.length) {
        handleBoundary('end', direction);
    } else {
        currentIndex = newIndex;
        visitedImages.add(currentIndex);
        sendImageData();
    }
}

function handleBoundary(boundary, direction) {
    switch (settings.folderNavigation) {
        case 'loop':
            currentIndex = boundary === 'start' ? currentImages.length - 1 : 0;
            visitedImages.add(currentIndex);
            sendImageData();
            break;
        case 'random':
            goToRandomFolder(direction);
            break;
        case 'next':
        default:
            navigateFolder(boundary === 'start' ? -1 : 1);
            break;
    }
}

function goToFirstImage() {
    if (currentImages.length === 0) return;

    const isAlreadyFirst = currentIndex === 0;

    if (isAlreadyFirst) {
        if (settings.folderNavigation !== 'loop') {
            mainWindow.webContents.send('boundary-reached', {
                type: 'first',
                message: '첫 번째 이미지입니다',
                hint: '한번 더 입력시 이전 폴더 이동',
                canNavigate: true
            });
        } else {
            mainWindow.webContents.send('boundary-reached', {
                type: 'first',
                message: '첫 번째 이미지입니다',
                hint: null,
                canNavigate: false
            });
        }
    } else {
        currentIndex = 0;
        visitedImages.add(currentIndex);
        sendImageData();
        mainWindow.webContents.send('boundary-reached', {
            type: 'first',
            message: '첫 번째 이미지입니다',
            hint: null,
            canNavigate: false
        });
    }
}

function goToLastImage() {
    if (currentImages.length === 0) return;

    const lastIndex = currentImages.length - 1;
    const isDualMode = settings.viewMode === 'dualLR' || settings.viewMode === 'dualRL';
    const isAlreadyLast = currentIndex === lastIndex || (isDualMode && currentIndex >= lastIndex - 1);

    if (isAlreadyLast) {
        if (settings.folderNavigation !== 'loop') {
            mainWindow.webContents.send('boundary-reached', {
                type: 'last',
                message: '마지막 이미지입니다',
                hint: '한번 더 입력시 다음 폴더 이동',
                canNavigate: true
            });
        } else {
            mainWindow.webContents.send('boundary-reached', {
                type: 'last',
                message: '마지막 이미지입니다',
                hint: null,
                canNavigate: false
            });
        }
    } else {
        currentIndex = lastIndex;
        visitedImages.add(currentIndex);
        sendImageData();
        mainWindow.webContents.send('boundary-reached', {
            type: 'last',
            message: '마지막 이미지입니다',
            hint: null,
            canNavigate: false
        });
    }
}

// 경계에서 한번 더 입력시 폴더 이동
function navigateFromBoundary(type) {
    if (type === 'first') {
        navigateFolder(-1);
    } else {
        navigateFolder(1);
    }
}

function goToImage(index) {
    if (currentImages.length === 0) return;
    if (index < 0) currentIndex = currentImages.length - 1;
    else if (index >= currentImages.length) currentIndex = 0;
    else currentIndex = index;
    visitedImages.add(currentIndex);
    sendImageData();
}

function navigateFolder(direction) {
    // 랜덤 폴더 옵션이면 랜덤 이동
    if (settings.folderNavigation === 'random') {
        goToRandomFolder(direction);
        return;
    }

    if (siblingFolders.length <= 1) return;

    const currentFolderIndex = siblingFolders.indexOf(currentFolder);
    if (currentFolderIndex === -1) return;

    let newFolderIndex = currentFolderIndex + direction;
    if (newFolderIndex < 0) newFolderIndex = siblingFolders.length - 1;
    else if (newFolderIndex >= siblingFolders.length) newFolderIndex = 0;

    const newFolder = siblingFolders[newFolderIndex];
    loadFolder(newFolder); // loadFolder에서 항상 첫 번째 이미지(0)로 초기화됨

    mainWindow.webContents.send('folder-changed', {
        folderName: path.basename(newFolder),
        direction: direction > 0 ? 'next' : 'prev',
        folderNavigation: settings.folderNavigation,
        currentFolderIndex: newFolderIndex + 1,
        totalFolders: siblingFolders.length
    });
}

function goToRandomFolder(direction = 1) {
    if (siblingFolders.length <= 1) return;

    // 중복 방지 옵션 적용
    const availableFolders = siblingFolders.filter(folder =>
        !settings.preventDuplicateFolder || !visitedFolders.has(folder)
    );

    if (availableFolders.length === 0) {
        // 모든 폴더를 방문했으면 히스토리 초기화
        visitedFolders.clear();
        visitedFolders.add(currentFolder);

        // 현재 폴더 제외하고 다시 선택
        const otherFolders = siblingFolders.filter(f => f !== currentFolder);
        if (otherFolders.length === 0) return;

        const randomIndex = Math.floor(Math.random() * otherFolders.length);
        const newFolder = otherFolders[randomIndex];
        visitedFolders.add(newFolder);
        loadFolder(newFolder);

        mainWindow.webContents.send('folder-changed', {
            folderName: path.basename(newFolder),
            direction: direction > 0 ? 'next' : 'prev',
            folderNavigation: 'random',
            currentFolderIndex: siblingFolders.indexOf(newFolder) + 1,
            totalFolders: siblingFolders.length
        });
        return;
    }

    const randomIndex = Math.floor(Math.random() * availableFolders.length);
    const newFolder = availableFolders[randomIndex];
    visitedFolders.add(newFolder);
    loadFolder(newFolder);

    mainWindow.webContents.send('folder-changed', {
        folderName: path.basename(newFolder),
        direction: direction > 0 ? 'next' : 'prev',
        folderNavigation: 'random',
        currentFolderIndex: siblingFolders.indexOf(newFolder) + 1,
        totalFolders: siblingFolders.length
    });
}

// IPC 핸들러
ipcMain.handle('open-folder', openFolderDialog);
ipcMain.handle('open-file', openFileDialog);
ipcMain.handle('get-settings', () => settings);
ipcMain.handle('save-settings', (event, newSettings) => {
    settings = { ...settings, ...newSettings };
    saveSettings();
    const menu = Menu.buildFromTemplate(createMenuTemplate());
    Menu.setApplicationMenu(menu);
    sendSettingsToRenderer();
    return settings;
});
ipcMain.handle('navigate-image', (event, direction) => navigateImage(direction));
ipcMain.handle('go-to-image', (event, index) => goToImage(index));
ipcMain.handle('go-to-first-image', () => goToFirstImage());
ipcMain.handle('go-to-last-image', () => goToLastImage());
ipcMain.handle('navigate-from-boundary', (event, type) => navigateFromBoundary(type));
ipcMain.handle('navigate-folder', (event, direction) => navigateFolder(direction));
ipcMain.handle('random-folder', () => goToRandomFolder());
ipcMain.handle('toggle-folder-nav', () => toggleFolderNavigation());
ipcMain.handle('toggle-image-nav', () => toggleImageNavigation());
ipcMain.handle('set-view-mode', (event, mode) => setViewMode(mode));
ipcMain.handle('toggle-fullscreen', () => toggleFullscreen());
ipcMain.handle('exit-fullscreen', () => exitFullscreen());
ipcMain.handle('get-fullscreen-state', () => mainWindow.isFullScreen());
ipcMain.handle('open-file-location', () => { if (currentImages[currentIndex]) shell.showItemInFolder(currentImages[currentIndex]); });

ipcMain.handle('copy-image', () => copyCurrentImage());
ipcMain.handle('request-delete', () => requestDelete());
ipcMain.handle('execute-delete', () => executeDelete());
ipcMain.handle('select-copy-destination', () => selectCopyDestination());

ipcMain.handle('window-minimize', () => mainWindow.minimize());
ipcMain.handle('window-maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
});
ipcMain.handle('window-close', () => mainWindow.close());

ipcMain.on('window-move', (event, { mouseX, mouseY }) => {
    try {
        const { x, y } = screen.getCursorScreenPoint();
        mainWindow.setPosition(x - mouseX, y - mouseY);
    } catch (e) {
        // 창이 닫혔거나 에러 발생 시 무시
    }
});

ipcMain.handle('drop-files', (event, filePaths) => {
    if (filePaths.length > 0) {
        const firstPath = filePaths[0];
        const stat = fs.statSync(firstPath);
        if (stat.isDirectory()) loadFolder(firstPath);
        else openFile(firstPath);
    }
});

app.whenReady().then(() => {
    loadSettings();
    createWindow();
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('before-quit', () => saveSettings());

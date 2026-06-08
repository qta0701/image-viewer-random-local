const { app, BrowserWindow, ipcMain, dialog, screen, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
let settings = {};
const savedPath = path.join(app.getPath('userData'), 'settings.json');
let previousBounds = null; // 이전 창 크기/위치 저장용

// 이미지/폴더 관리 전역 변수
let currentFolder = '';
let currentImages = [];
let currentIndex = 0;
let siblingFolders = [];
let visitedImages = new Set();
let visitedFolders = new Set();
let historyStack = []; // 방문 기록 스택

// 디버그 로그 파일 경로
const logPath = path.join(app.getPath('userData'), 'debug.log');

// 로그 파일 초기화 (앱 시작 시 마다)
try {
    fs.writeFileSync(logPath, ''); // 빈 문자열로 덮어쓰기
} catch (err) {
    console.error('Failed to initialize log file:', err);
}

function log(message) {
    const time = new Date().toISOString();
    const logMsg = `[${time}] ${message}\n`;
    console.log(logMsg.trim());
    fs.appendFile(logPath, logMsg, (err) => {
        if (err) console.error('Log append failed:', err);
    });
}
ipcMain.on('log-message', (event, message) => log(message));

function loadSettings() {
    try {
        if (fs.existsSync(savedPath)) {
            settings = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
            if (settings.screenshotDestination === undefined) {
                settings.screenshotDestination = '';
            }
            log('Settings loaded successfully');
        } else {
            // 기본 설정
            settings = {
                folderNavigation: 'random', // 'random', 'sequential'
                imageNavigation: 'random', // 'random', 'sequential'
                viewMode: 'fit', // 'original', 'fit', 'fitWidth', 'dualLR', 'dualRL'
                fitSmall: true,
                enableImageDrag: true,
                deleteMode: 'folder', // 'folder', 'image'
                preventDuplicateFolder: true,
                preventDuplicateImage: true,
                copyDestination: '',
                screenshotDestination: '',
                wheelAction: 'prevNext', // 'prevNext', 'firstLast'
                keyboardAction: 'prevNext', // 'prevNext', 'firstLast'
            };
            log('Default settings loaded');
        }
    } catch (err) {
        console.error('Error loading settings:', err);
        settings = {};
    }
}

function saveSettings(newSettings) {
    settings = { ...settings, ...newSettings };
    fs.writeFileSync(savedPath, JSON.stringify(settings, null, 2));
    log('Settings saved');
    // 설정 변경 시 반영
    if (mainWindow) {
        mainWindow.webContents.send('settings-updated', settings);
        // 이동 모드 변경 시 방문 기록 초기화 (선택 사항)
        // visitedImages.clear();
        // visitedFolders.clear();
    }
}

// 하드웨어 가속 관련 설정은 제거 (기본값 사용) 또는 필요한 경우에만 추가
// app.disableHardwareAcceleration();

function createWindow() {
    log('Creating main window...');
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#1a1a1a', // 배경색 미리 지정 (깜빡임 방지)
        show: false, // 준비되면 보여주기
        frame: false, // 커스텀 타이틀바 사용
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false, // 로컬 파일 접근 허용 (보안 주의)
            backgroundThrottling: false // 백그라운드 스로틀링 방지 (렌더링 멈춤 방지)
        }
    });

    if (settings.bounds) {
        mainWindow.setBounds(settings.bounds);
    }
    // else: 기본 창 크기 유지 (1200x800), maximize 하지 않음

    // 창이 준비되면 보여주기 (깜빡임 최소화)
    mainWindow.once('ready-to-show', () => {
        log('Main window ready to show');
        mainWindow.show();
        // [Startup Hack] 시작 시 OS 리페인트 강제
        setTimeout(() => {
            const bounds = mainWindow.getBounds();
            mainWindow.setBounds({ ...bounds, width: bounds.width + 1 });
            setTimeout(() => mainWindow.setBounds(bounds), 10);
        }, 100);
    });

    // 웹 콘텐츠 로딩 상태 로깅
    mainWindow.webContents.on('did-start-loading', () => log('webContents: did-start-loading'));
    mainWindow.webContents.on('did-finish-load', () => log('webContents: did-finish-load'));
    mainWindow.webContents.on('dom-ready', () => log('webContents: dom-ready'));
    mainWindow.webContents.on('crashed', (e) => log('webContents: CRASHED ' + e));
    mainWindow.webContents.on('unresponsive', () => log('webContents: UNRESPONSIVE'));

    mainWindow.loadFile('index.html');

    // 키보드 이벤트 우회 가로채기 (타 프로그램 핫키 우선권 대응)
    mainWindow.webContents.on('before-input-event', (event, input) => {
        const key = input.key;
        
        // PrintScreen/Snapshot 키는 keyDown이 차단될 수 있으므로, keyUp 또는 keyDown 시점에 모두 낚아채서 1회만 스크린샷 트리거
        if (key === 'PrintScreen' || key === 'Snapshot') {
            event.preventDefault();
            if (input.type === 'keyUp') {
                log('PrintScreen / Snapshot pressed (before-input-event keyUp)');
                mainWindow.webContents.send('trigger-screenshot');
            }
            return;
        }

        if (input.type === 'keyDown') {
            if (key === 'F10') {
                event.preventDefault();
                log('F10 pressed (before-input-event)');
                mainWindow.webContents.send('fullscreen-key-f10');
            } else if (key === 'MediaNextTrack') {
                event.preventDefault();
                log('MediaNextTrack pressed (before-input-event)');
                mainWindow.webContents.send('media-key', 'next');
            } else if (key === 'MediaPreviousTrack') {
                event.preventDefault();
                log('MediaPreviousTrack pressed (before-input-event)');
                mainWindow.webContents.send('media-key', 'prev');
            }
        }
    });

    // 개발자 도구 (필요시 주석 해제)
    // mainWindow.webContents.openDevTools();

    mainWindow.on('close', () => {
        if (!mainWindow.isMaximized()) {
            settings.bounds = mainWindow.getBounds();
            saveSettings(settings);
        }
    });

    mainWindow.on('focus', () => {
        registerMediaShortcuts();
    });
    mainWindow.on('blur', () => {
        unregisterMediaShortcuts();
    });
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        log('================ Application Started ================');
        log(`App Path: ${app.getAppPath()}`);
        log(`UserData Path: ${app.getPath('userData')}`);
        log(`Temp Path: ${app.getPath('temp')}`);
        log(`Node Version: ${process.version}`);
        log(`Electron Version: ${process.versions.electron}`);

        loadSettings();
        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });

        // F5 단축키 등록 (새로고침 방지 -> 설정창 열기)
        globalShortcut.register('F5', () => {
            log('F5 pressed. Opening settings.');
            if (mainWindow) mainWindow.webContents.send('open-settings');
        });
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

// ---------------- IPC 통신 ----------------

ipcMain.handle('get-settings', () => settings);
ipcMain.handle('save-settings', (event, newSettings) => {
    saveSettings(newSettings);
    return settings;
});

ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
});
ipcMain.on('window-close', () => {
    app.quit();
});
ipcMain.on('toggle-fullscreen', (event, mode) => {
    const isFullScreen = mainWindow.isFullScreen();
    mainWindow.setFullScreen(!isFullScreen);
    mainWindow.webContents.send('fullscreen-changed', !isFullScreen, mode);
});

ipcMain.on('exit-fullscreen', () => {
    if (mainWindow.isFullScreen()) {
        mainWindow.setFullScreen(false);
        mainWindow.webContents.send('fullscreen-changed', false, null);
    }
});

// 창 드래그 이동
let dragOffset = null;
let dragWindowSize = null;
ipcMain.on('window-drag-start', () => {
    const pos = screen.getCursorScreenPoint();
    const bounds = mainWindow.getBounds();
    dragOffset = { x: pos.x - bounds.x, y: pos.y - bounds.y };
    dragWindowSize = { width: bounds.width, height: bounds.height };
});
ipcMain.on('window-move', () => {
    if (dragOffset && dragWindowSize) {
        const pos = screen.getCursorScreenPoint();
        mainWindow.setBounds({
            x: pos.x - dragOffset.x,
            y: pos.y - dragOffset.y,
            width: dragWindowSize.width,
            height: dragWindowSize.height
        });
    }
});
ipcMain.on('window-drag-end', () => {
    dragOffset = null;
    dragWindowSize = null;
});

// 경계에서 폴더 이동
ipcMain.on('navigate-from-boundary', (event, type) => {
    if (type === 'first') {
        navigateFolder(-1);
    } else {
        navigateFolder(1);
    }
});

// 폴더 열기 (파일 탐색기)
ipcMain.on('open-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        loadFolder(selectedPath);

        // 형제 폴더 목록 구성 (상위 폴더 기준)
        const parentDir = path.dirname(selectedPath);
        updateSiblingFolders(parentDir);
    }
});

// 파일 위치 열기 (탐색기에서 보기)
ipcMain.on('open-file-location', () => {
    if (currentFolder) {
        shell.openPath(currentFolder);
    }
});

// 파일 열기 (단일 파일) - 기존 기능 유지
ipcMain.on('open-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }]
    });
    if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const dir = path.dirname(filePath);
        loadFolder(dir);
        // 해당 파일로 이동
        const basename = path.basename(filePath);
        const index = currentImages.indexOf(basename);
        if (index !== -1) {
            goToImage(index);
        }
    }
});

// 드래그 앤 드롭 파일 처리
ipcMain.handle('drop-files', (event, filePaths) => {
    if (!filePaths || filePaths.length === 0) return;

    const firstFile = filePaths[0];
    const stat = fs.statSync(firstFile);

    if (stat.isDirectory()) {
        loadFolder(firstFile);
        updateSiblingFolders(path.dirname(firstFile));
    } else {
        const dir = path.dirname(firstFile);
        loadFolder(dir);
        updateSiblingFolders(path.dirname(dir));
        const basename = path.basename(firstFile);
        const index = currentImages.indexOf(basename);
        if (index !== -1) goToImage(index);
    }
});

// 이미지 탐색
ipcMain.on('navigate-image', (event, direction) => {
    if (currentImages.length === 0) return;

    if (settings.imageNavigation === 'random') {
        goToRandomImage();
    } else {
        // 순차 탐색
        let step = 1;
        if (settings.viewMode === 'dualLR' || settings.viewMode === 'dualRL') {
            step = 2;
        }

        let nextIndex = currentIndex + (direction * step);

        // 경계 처리
        if (nextIndex < 0) {
            // 첫 이미지에서 이전으로 -> 이전 폴더의 마지막 이미지? 또는 경계 알림
            mainWindow.webContents.send('boundary-reached', {
                type: 'first',
                message: '첫 번째 이미지입니다',
                hint: '이전 폴더로 이동하려면 ▲/◀ 키를 한번 더 누르세요',
                canNavigate: true
            });
            return;
        } else if (nextIndex >= currentImages.length) {
            // 마지막 이미지에서 다음으로 -> 다음 폴더의 첫 이미지? 또는 경계 알림
            mainWindow.webContents.send('boundary-reached', {
                type: 'last',
                message: '마지막 이미지입니다',
                hint: '다음 폴더로 이동하려면 ▼/▶ 키를 한번 더 누르세요',
                canNavigate: true
            });
            return;
        }

        // 만약 index가 0보다 작으면 경계 알림 로직으로 가는데,
        // 위에서 boundary-reached 보내고 리턴해버림.
        // 하지만 -1 정도가 아니라 -2가 될 수도 있음 (step=2 일때)
        // 로직 보강:

        goToImage(nextIndex);
    }
});

ipcMain.on('go-to-image', (event, index) => goToImage(index));
ipcMain.on('go-to-first-image', () => goToImage(0));
ipcMain.on('go-to-last-image', () => goToImage(currentImages.length - 1));

// 폴더 탐색 (이미지 경계에서 넘어올 때)
ipcMain.on('navigate-folder', (event, direction) => {
    navigateFolder(direction);
});

// 설정 토글 (배지 클릭)
ipcMain.on('toggle-folder-nav', () => {
    const modes = ['random', 'sequential', 'none'];
    const currentIdx = modes.indexOf(settings.folderNavigation);
    const nextIdx = (currentIdx + 1) % modes.length;
    settings.folderNavigation = modes[nextIdx];
    saveSettings(settings); // 저장 및 UI 업데이트 전송됨
});

ipcMain.on('toggle-image-nav', () => {
    const modes = ['random', 'sequential'];
    const currentIdx = modes.indexOf(settings.imageNavigation);
    const nextIdx = (currentIdx + 1) % modes.length;
    settings.imageNavigation = modes[nextIdx];
    saveSettings(settings);
});

// 이미지 복사
ipcMain.on('copy-image', () => {
    copyCurrentImage();
});

// 복사 경로 선택
ipcMain.handle('select-copy-destination', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
        settings.copyDestination = result.filePaths[0];
        saveSettings(settings);
        return settings.copyDestination;
    }
    return null;
});

ipcMain.handle('select-screenshot-destination', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
        settings.screenshotDestination = result.filePaths[0];
        saveSettings(settings);
        return settings.screenshotDestination;
    }
    return null;
});

ipcMain.handle('copy-combined-image', async (event, { dataUrl }) => {
    if (!settings.copyDestination) {
        mainWindow.webContents.send('error', '복사 대상 저장 경로가 설정되지 않았습니다.');
        return false;
    }
    
    if (!fs.existsSync(settings.copyDestination)) {
        try {
            fs.mkdirSync(settings.copyDestination, { recursive: true });
        } catch (err) {
            mainWindow.webContents.send('error', '저장 경로를 생성할 수 없습니다.');
            return false;
        }
    }
    
    try {
        const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const date = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const combinedFileName = `${year}-${month}-${date} ${hours} ${minutes} ${seconds}.png`;
        const destPath = path.join(settings.copyDestination, combinedFileName);
        
        fs.writeFileSync(destPath, buffer);
        log(`Combined image copied successfully to: ${destPath}`);
        mainWindow.webContents.send('copy-success', { fileName: combinedFileName });
        return true;
    } catch (err) {
        log(`Failed to copy combined image: ${err.message}`);
        mainWindow.webContents.send('error', '합성 이미지 복사 실패: ' + err.message);
        return false;
    }
});

// 뷰 모드 변경
ipcMain.on('set-view-mode', (event, mode) => {
    settings.viewMode = mode;
    saveSettings(settings);
    // 뷰 모드 변경 시 이미지 다시 로드 (레이아웃 갱신)
    sendImageData();
});

// 삭제 요청 (팝업)
ipcMain.on('request-delete', () => requestDelete());

// 삭제 실행
ipcMain.on('execute-delete', (event) => executeDelete());

// 이미지 언로드 완료 신호 수신
ipcMain.on('image-unloaded', () => {
    if (deleteResolve) {
        deleteResolve();
        deleteResolve = null;
    }
});

// 엑스트라: 이미지/폴더 탐색 함수들

function loadFolder(folderPath, pushHistory = true) {
    if (!fs.existsSync(folderPath)) {
        mainWindow.webContents.send('error', '폴더를 찾을 수 없습니다.');
        return;
    }

    log(`[loadFolder] Loading: ${folderPath}`);

    // 중복 폴더 방문 방지 (설정에 따름)
    if (settings.preventDuplicateFolder) {
        visitedFolders.add(folderPath);
    }

    currentFolder = folderPath;
    if (pushHistory) {
        historyStack.push(folderPath); // 히스토리 추가
    }

    try {
        const files = fs.readdirSync(folderPath);
        currentImages = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
        }).sort((a, b) => {
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        });

        if (currentImages.length === 0) {
            mainWindow.webContents.send('error', '이미지가 없는 폴더입니다.');
            // 이미지가 없으면 다음 폴더로 자동 이동? (옵션)
        } else {
            currentIndex = 0;
            // 중복 이미지 방지 리셋 (새 폴더니까)
            if (settings.preventDuplicateImage) {
                visitedImages.clear();
            }
            goToImage(0);
        }
    } catch (err) {
        console.error('Error reading folder:', err);
        mainWindow.webContents.send('error', '폴더 읽기 오류');
    }
}

function updateSiblingFolders(parentDir) {
    try {
        const items = fs.readdirSync(parentDir);
        siblingFolders = items.map(item => path.join(parentDir, item))
            .filter(itemPath => {
                try {
                    return fs.statSync(itemPath).isDirectory();
                } catch { return false; }
            })
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        // 현재 폴더가 목록에 없으면(예: 드래그 드롭으로 바로 들어옴) 추가
        if (currentFolder && !siblingFolders.includes(currentFolder)) {
            // 상위 디렉토리 스캔을 했으니 포함되어야 정상이나, 예외 처리
        }
    } catch (err) {
        console.error('Error scanning parent dir:', err);
    }
}

function sendImageData() {
    if (!currentImages[currentIndex]) return;

    const imagePath = path.join(currentFolder, currentImages[currentIndex]);
    let secondImagePath = null;

    // 듀얼 뷰 모드일 때 (만화책 보기)
    if (settings.viewMode === 'dualLR' || settings.viewMode === 'dualRL') {
        let secondIndex = currentIndex + 1;
        if (secondIndex < currentImages.length) {
            secondImagePath = path.join(currentFolder, currentImages[secondIndex]);
        }
    }

    mainWindow.webContents.send('image-loaded', {
        path: imagePath,
        secondPath: secondImagePath,
        name: currentImages[currentIndex],
        secondName: secondImagePath ? path.basename(secondImagePath) : null,
        index: currentIndex,
        total: currentImages.length,
        folderName: path.basename(currentFolder),
        viewMode: settings.viewMode,
        folderNavigation: settings.folderNavigation,
        imageNavigation: settings.imageNavigation,
        currentFolderIndex: siblingFolders.indexOf(currentFolder) + 1,
        totalFolders: siblingFolders.length
    });
}

function goToRandomImage() {
    if (currentImages.length === 0) return;

    let candidates = currentImages.map((_, i) => i);

    if (settings.preventDuplicateImage) {
        candidates = candidates.filter(i => !visitedImages.has(i));
        if (candidates.length === 0) {
            // 모든 이미지 방문 -> 리셋 하거나 알림?
            visitedImages.clear();
            candidates = currentImages.map((_, i) => i);
            mainWindow.webContents.send('error', '모든 이미지를 보았습니다. 다시 시작합니다.');
        }
    }

    const randIdx = Math.floor(Math.random() * candidates.length);
    goToImage(candidates[randIdx]);
}

function goToRandomFolder(direction = 1) { // direction은 랜덤에선 의미 없지만 시그니처 맞춤
    if (siblingFolders.length === 0) return;

    let candidates = siblingFolders;

    if (settings.preventDuplicateFolder) {
        candidates = candidates.filter(f => !visitedFolders.has(f));
        if (candidates.length === 0) {
            // 모든 폴더 방문 -> 리셋?
            visitedFolders.clear();
            candidates = siblingFolders;
            mainWindow.webContents.send('no-more-folders');
            return;
        }
    }

    const randIdx = Math.floor(Math.random() * candidates.length);
    loadFolder(candidates[randIdx]);
    mainWindow.webContents.send('folder-changed', {
        folderName: path.basename(candidates[randIdx]), // 메타데이터 업데이트
        direction: 'random',
        folderNavigation: 'random',
        currentFolderIndex: siblingFolders.indexOf(candidates[randIdx]) + 1,
        totalFolders: siblingFolders.length
    });
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
    if (settings.folderNavigation === 'random') {
        if (direction < 0) {
            // 이전 폴더 (랜덤 모드여도 이전은 히스토리 따라가야 함)
            if (historyStack.length > 1) {
                // 현재 폴더(스택 맨 위) 제거
                historyStack.pop();
                // 그 전 폴더 가져오기
                const prevFolder = historyStack[historyStack.length - 1];
                // 히스토리 추가 없이 로드 (이미 스택에 있으므로) - 단, loadFolder 내부 로직에 주의
                // 여기서 이미 pop을 했으므로, loadFolder에서 push를 안 하도록 해야 함.
                // 하지만 loadFolder는 pushHistory=true가 기본.
                // 문제는, loadFolder를 그냥 부르면 push가 됨. prevFolder가 다시 push 되어 중복됨.
                // 따라서 loadFolder(path, false) 형태로 호출 필요.
                // 또한, 스택의 맨 위가 현재 보고 있는 폴더여야 논리가 맞음.

                // 로직 정교화:
                // 1. 현재 historyStack = [A, B, C] (C가 현재)
                // 2. Back 누름 -> C pop -> [A, B]. B를 로드. 
                // 3. loadFolder(B, false) -> 스택 유지 [A, B]. Current=B. 성공.

                loadFolder(prevFolder, false);

                mainWindow.webContents.send('folder-changed', {
                    folderName: path.basename(prevFolder),
                    direction: 'prev',
                    folderNavigation: 'random', // UI 표시는 랜덤 모드 유지
                    currentFolderIndex: siblingFolders.indexOf(prevFolder) + 1,
                    totalFolders: siblingFolders.length
                });
            } else {
                // 히스토리 없음
                mainWindow.webContents.send('no-more-folders');
            }
        } else {
            // 다음 폴더 (랜덤)
            goToRandomFolder(direction);
        }
        return;
    }

    // 순차 탐색
    const currentFolderIdx = siblingFolders.indexOf(currentFolder);
    let nextIdx = currentFolderIdx + direction;

    if (nextIdx < 0 || nextIdx >= siblingFolders.length) {
        mainWindow.webContents.send('no-more-folders');
        return;
    }

    const nextFolder = siblingFolders[nextIdx];
    loadFolder(nextFolder);
    mainWindow.webContents.send('folder-changed', {
        folderName: path.basename(nextFolder),
        direction: direction > 0 ? 'next' : 'prev',
        folderNavigation: 'sequential',
        currentFolderIndex: nextIdx + 1,
        totalFolders: siblingFolders.length
    });
}

function copyCurrentImage() {
    if (!currentImages[currentIndex] || !settings.copyDestination) {
        mainWindow.webContents.send('error', '복사할 이미지가 없거나 저장 경로가 설정되지 않았습니다.');
        return;
    }

    if (!fs.existsSync(settings.copyDestination)) {
        try {
            fs.mkdirSync(settings.copyDestination, { recursive: true });
        } catch (err) {
            mainWindow.webContents.send('error', '저장 경로를 생성할 수 없습니다.');
            return;
        }
    }

    const srcPath = path.join(currentFolder, currentImages[currentIndex]);
    const destPath = path.join(settings.copyDestination, currentImages[currentIndex]);

    // 파일명 중복 처리...는 간단하게 덮어쓰기 or 이름변경 (여기선 일단 복사만)
    try {
        fs.copyFileSync(srcPath, destPath);
        mainWindow.webContents.send('copy-success', { fileName: currentImages[currentIndex] });
    } catch (err) {
        mainWindow.webContents.send('error', '이미지 복사 실패: ' + err.message);
    }
}

// ---- 삭제 로직 ----
let deleteResolve = null;

function requestDelete() {
    log('[requestDelete] Called. Mode: ' + settings.deleteMode + ', Images: ' + currentImages.length + ', Folder: ' + currentFolder);

    let targetName = '';
    let targetType = '';

    if (settings.deleteMode === 'folder') {
        if (!currentFolder) return;
        targetName = path.basename(currentFolder);
        targetType = '폴더';
    } else {
        if (!currentImages[currentIndex]) return;
        targetName = currentImages[currentIndex];
        targetType = '이미지';
    }

    log(`[requestDelete] Requesting confirmation for ${targetType}: ${targetName}`);

    // 윈도우 포커스 및 흔들기 (렌더링 깨우기 최후의 수단)
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();

        // [Hack] 창을 살짝 움직임 (OS 리페인트 강제)
        const bounds = mainWindow.getBounds();
        mainWindow.setBounds({ ...bounds, width: bounds.width + 1 });
        setTimeout(() => {
            mainWindow.setBounds(bounds);
        }, 10);
    }

    // [Hack] 설정 팝업 호출 명령도 같이 보냄 (사용자 요청: 팝업 띄우기 트리거용)
    // 렌더러 로직에서 처리하므로 여기선 confirm-delete만 보내도 되지만, 
    // 혹시 모르니 명시적으로 보낼 수도 있음. 하지만 렌더러에서 처리하는 것이 더 타이밍상 정확.
    mainWindow.webContents.send('confirm-delete', { mode: settings.deleteMode, targetName, targetType });
}

ipcMain.on('ping-render', () => {
    // 렌더러가 팝업 띄웠다고 신호 보내면, 메인이 다시 응답해서 IPC 파이프 뚫음
    if (mainWindow) mainWindow.webContents.send('pong-render');
});


function executeDelete() {
    log('[executeDelete] User confirmed deletion.');
    if (settings.deleteMode === 'folder') {
        deleteCurrentFolder();
    } else {
        deleteCurrentImage();
    }
}

async function deleteCurrentFolder() {
    if (!currentFolder) {
        log('[deleteCurrentFolder] No current folder.');
        return;
    }
    const targetFolder = currentFolder; // 삭제할 폴더 저장
    const folderName = path.basename(targetFolder);
    log(`[deleteCurrentFolder] Starting deletion for: ${targetFolder}`);

    // [New Logic] 폴더 삭제 전 다음 폴더로 미리 이동 (파일 잠금 해제 및 UX 개선)
    log('[deleteCurrentFolder] Navigating to next folder first...');
    const currentFolderIndex = siblingFolders.indexOf(targetFolder);

    let nextFolder = null;
    if (siblingFolders.length > 0) {
        // 현재 폴더가 목록에 있다면
        if (settings.folderNavigation === 'random') {
            // 랜덤은 아니고 그냥 다음꺼? 아니면 랜덤 로직? 
            // 삭제 후 사용 경험상 그냥 다음 순서로 가는 게 자연스러움.
            // 하지만 random 모드니까 랜덤 폴더를 뽑는 게 맞을 수도 있음.
            // 여기선 단순히 '다음' 또는 '랜덤' 폴더를 로드.
            const candidates = siblingFolders.filter(f => f !== targetFolder);
            if (candidates.length > 0) {
                const randIdx = Math.floor(Math.random() * candidates.length);
                nextFolder = candidates[randIdx];
            }
        } else {
            // 순차
            let nextIdx = currentFolderIndex + 1;
            if (nextIdx >= siblingFolders.length) nextIdx = 0; // 루프
            nextFolder = siblingFolders[nextIdx];
        }
    }

    if (nextFolder && nextFolder !== targetFolder) {
        log(`[deleteCurrentFolder] Moving view to: ${nextFolder}`);
        loadFolder(nextFolder);
        // UI 업데이트
        mainWindow.webContents.send('folder-changed', {
            folderName: path.basename(nextFolder),
            direction: 'next',
            folderNavigation: settings.folderNavigation,
            currentFolderIndex: siblingFolders.indexOf(nextFolder) + 1,
            totalFolders: siblingFolders.length
        });
    } else {
        // 더 이상 폴더가 없음
        log('[deleteCurrentFolder] No more folders to move to.');
        currentImages = [];
        currentFolder = '';
        currentIndex = 0;
        mainWindow.webContents.send('no-more-folders');
    }

    // 렌더러가 이전 폴더 이미지를 언로드할 시간을 줌 + 뷰 이동 안정화
    await new Promise(resolve => setTimeout(resolve, 500));

    // 혹시 모를 이미지 언로드 (이미 뷰는 이동했지만 확실히 하기 위해)
    // 렌더러에 언로드 신호 보내기 (사실 이미 loadFolder 호출로 인해 렌더러가 새 이미지를 로딩하고 있을 거라서 불필요할 수 있지만, 
    // 삭제할 폴더의 핸들을 놓게 하려면 필요할 수 있음. 하지만 loadFolder가 먼저 호출되면 렌더러는 이미 새 이미지 파일 핸들을 잡음.
    // 따라서 삭제할 폴더의 파일 핸들은 자연스럽게 놓아짐.)

    // CWD 변경
    try {
        const tempPath = app.getPath('temp');
        process.chdir(tempPath);
    } catch (err) { }

    // 실제 삭제 시작
    try {
        await shell.trashItem(targetFolder);
        log('[deleteCurrentFolder] shell.trashItem success.');
        onFolderDeleteSuccess(targetFolder, folderName, true);
    } catch (e) {
        log(`[deleteCurrentFolder] shell.trashItem failed: ${e.message}. Trying fs.rm...`);
        try {
            fs.rmSync(targetFolder, { recursive: true, force: true });
            log('[deleteCurrentFolder] fs.rm success.');
            onFolderDeleteSuccess(targetFolder, folderName, true);
        } catch (err2) {
            log(`[deleteCurrentFolder] fs.rm failed: ${err2.message}`);
            // 이미 다른 폴더로 이동했으므로 복구 로직 불필요. 에러만 사용자에게 알리지만, 사용자는 이미 다른 폴더를 보고 있음.
            // 방해하지 않기 위해 로그만 남기거나 토스트 메시지
            mainWindow.webContents.send('error', `폴더 삭제 실패 (백그라운드)\n${err2.message}`);
        }
    }
}

function deleteCurrentImage() {
    if (!currentImages[currentIndex]) return;
    const imagePath = path.join(currentFolder, currentImages[currentIndex]);
    log(`[deleteCurrentImage] Deleting: ${imagePath}`);

    // 이미지 삭제는 굳이 선이동 안 해도 됨 (파일 하나라 빠름)
    // 하지만 EBUSY 방지를 위해 로직 유지

    const unloadPromise = new Promise(resolve => {
        deleteResolve = resolve;
        setTimeout(() => { if (deleteResolve) deleteResolve(); }, 5000);
    });
    mainWindow.webContents.send('unload-image');
    // 메인 데이터에서 임시 제거
    const targetImageName = currentImages[currentIndex];
    const targetIndex = currentIndex;

    unloadPromise.then(async () => {
        try {
            await shell.trashItem(imagePath);
            log('[deleteCurrentImage] shell.trashItem success.');
            onImageDeleteSuccess(targetImageName, targetIndex);
        } catch (e) {
            log(`[deleteCurrentImage] shell.trashItem failed: ${e.message}. Trying fs.rm...`);
            try {
                fs.rmSync(imagePath, { force: true });
                onImageDeleteSuccess(targetImageName, targetIndex);
            } catch (err2) {
                mainWindow.webContents.send('error', '이미지 삭제 실패: ' + err2.message);
                sendImageData(); // 복구
            }
        }
    });
}

function onFolderDeleteSuccess(folderPath, folderName, alreadyNavigated = false) {
    // 이미 목록에서 제거하고 이동했으므로 리스트 관리만 하면 됨
    visitedFolders.delete(folderPath);
    const folderIdx = siblingFolders.indexOf(folderPath);
    if (folderIdx !== -1) siblingFolders.splice(folderIdx, 1);

    // 알림은 띄워줌
    mainWindow.webContents.send('delete-success', { type: 'folder', name: folderName });

    if (!alreadyNavigated) {
        // 기존 로직 (사용 안 함)
        if (siblingFolders.length > 0) {
            const nextIdx = Math.min(folderIdx, siblingFolders.length - 1);
            loadFolder(siblingFolders[nextIdx]);
            //...
        } else {
            mainWindow.webContents.send('no-more-folders');
        }
    }
}

function onImageDeleteSuccess(imageName, index) {
    currentImages.splice(index, 1);

    if (currentImages.length === 0) {
        // 폴더 내 이미지 모두 삭제됨 -> 다음 폴더 자동 이동?
        mainWindow.webContents.send('delete-success', { type: '이미지', name: imageName });
        setTimeout(() => {
            navigateFolder(1);
        }, 1000);
    } else {
        if (currentIndex >= currentImages.length) currentIndex = currentImages.length - 1;
        mainWindow.webContents.send('delete-success', { type: '이미지', name: imageName });
        sendImageData();
    }
}

function registerMediaShortcuts() {
    try {
        globalShortcut.register('MediaNextTrack', () => {
            log('Global MediaNextTrack pressed');
            if (mainWindow) mainWindow.webContents.send('media-key', 'next');
        });
        globalShortcut.register('MediaPreviousTrack', () => {
            log('Global MediaPreviousTrack pressed');
            if (mainWindow) mainWindow.webContents.send('media-key', 'prev');
        });
        globalShortcut.register('PrintScreen', () => {
            log('Global PrintScreen pressed');
            if (mainWindow) mainWindow.webContents.send('trigger-screenshot');
        });
    } catch (err) {
        log('Failed to register global shortcuts: ' + err.message);
    }
}

function unregisterMediaShortcuts() {
    try {
        globalShortcut.unregister('MediaNextTrack');
        globalShortcut.unregister('MediaPreviousTrack');
        globalShortcut.unregister('PrintScreen');
    } catch (err) {
        log('Failed to unregister global shortcuts: ' + err.message);
    }
}

ipcMain.handle('take-screenshot', async () => {
    const image = await mainWindow.webContents.capturePage();
    const jpegBuffer = image.toJPEG(95); // 화질은 육안상 100% 동일하게 유지하면서 용량 극감
    
    let saveDir = settings.screenshotDestination;
    if (!saveDir || !fs.existsSync(saveDir)) {
        saveDir = app.getPath('downloads');
    }
    
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const date = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const fileName = `${year}-${month}-${date} ${hours} ${minutes} ${seconds}.png`;
    const savePath = path.join(saveDir, fileName);
    
    fs.writeFileSync(savePath, jpegBuffer);
    log(`Screenshot saved to: ${savePath}`);
    return { savePath, fileName };
});

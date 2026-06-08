// 렌더러 프로세스 - UI 로직
document.addEventListener('DOMContentLoaded', async () => {
    const app = document.getElementById('app');
    const startScreen = document.getElementById('start-screen');
    const viewer = document.getElementById('viewer');
    const imageContainer = document.getElementById('image-container');
    const mainImage = document.getElementById('main-image');
    const secondImage = document.getElementById('second-image');
    const infoPanel = document.getElementById('info-panel');
    const contextMenu = document.getElementById('context-menu');
    const settingsModal = document.getElementById('settings-modal');
    const deleteModal = document.getElementById('delete-modal');
    const folderNotification = document.getElementById('folder-notification');
    const toolbar = document.getElementById('toolbar');
    const progressBar = document.getElementById('progress-bar');

    let settings = await window.api.getSettings();
    let currentImageData = null;
    let infoPanelVisible = false;
    let notificationTimeout = null;
    let modeNotificationTimeout = null;
    let boundaryNotificationTimeout = null;
    let isFullscreen = false;
    let deleteConfirmData = null;
    let lastBoundaryType = null; // 경계 상태 저장
    let lastBoundaryTime = 0;
    let zoomScale = 1.0;

    // 이미지 드래그 이동 관련
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let imageOffsetX = 0;
    let imageOffsetY = 0;

    // 창 드래그 이동 관련
    let isWindowDragging = false;
    let windowDragStartX = 0;
    let windowDragStartY = 0;

    window.api.log('[Renderer] Script started.');

    // 초기화 로직을 약간 지연시켜 렌더링 스레드 안정화 확보
    setTimeout(() => {
        window.api.log('[Renderer] Initializing event listeners...');
        initEventListeners();
        updateSettingsUI();
        updateStatusBadges();
        window.api.log('[Renderer] Initialization done.');

        // [Startup Hack] 시작 시 렌더링 먹통 방지 (설정 모달 Flash)
        setTimeout(() => {
            const settingsModal = document.getElementById('settings-modal');
            if (settingsModal) {
                settingsModal.style.opacity = '0.01';
                settingsModal.classList.remove('hidden');
                setTimeout(() => {
                    settingsModal.classList.add('hidden');
                    settingsModal.style.opacity = '';
                    // 포커스 강제
                    const openBtn = document.getElementById('open-folder-btn');
                    if (openBtn) openBtn.focus();
                }, 50);
            }
        }, 200);
    }, 100);

    function initEventListeners() {
        document.getElementById('open-folder-btn').addEventListener('click', () => window.api.openFolder());
        document.getElementById('open-file-btn').addEventListener('click', () => window.api.openFile());

        document.getElementById('toolbar-folder').addEventListener('click', () => window.api.openFolder());
        document.getElementById('toolbar-location').addEventListener('click', () => window.api.openFileLocation());
        document.getElementById('toolbar-settings').addEventListener('click', openSettings);
        document.getElementById('toolbar-fullscreen').addEventListener('click', () => window.api.toggleFullscreen());

        document.getElementById('btn-minimize').addEventListener('click', () => window.api.windowMinimize());
        document.getElementById('btn-maximize').addEventListener('click', () => window.api.windowMaximize());
        document.getElementById('btn-close').addEventListener('click', () => window.api.windowClose());

        document.getElementById('start-btn-minimize').addEventListener('click', () => window.api.windowMinimize());
        document.getElementById('start-btn-maximize').addEventListener('click', () => window.api.windowMaximize());
        document.getElementById('start-btn-close').addEventListener('click', () => window.api.windowClose());

        document.getElementById('badge-folder-nav').addEventListener('click', () => window.api.toggleFolderNav());
        document.getElementById('badge-image-nav').addEventListener('click', () => window.api.toggleImageNav());

        document.getElementById('close-settings').addEventListener('click', closeSettings);
        document.getElementById('cancel-settings').addEventListener('click', closeSettings);
        document.getElementById('save-settings').addEventListener('click', saveSettings);
        document.querySelector('.modal-backdrop').addEventListener('click', closeSettings);

        document.getElementById('select-copy-dest').addEventListener('click', async () => {
            const newPath = await window.api.selectCopyDestination();
            if (newPath) document.getElementById('copy-dest-path').textContent = newPath;
        });


        document.getElementById('cancel-delete').addEventListener('click', () => {
            closeDeleteModal();
            closeSettings(); // 설정창도 같이 닫음
        });
        document.getElementById('confirm-delete-btn').addEventListener('click', () => {
            window.api.executeDelete();
            closeDeleteModal();
            closeSettings(); // 설정창도 같이 닫음
        });

        document.addEventListener('keydown', handleKeydown);
        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('click', () => hideContextMenu());

        contextMenu.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', handleMenuItemClick);
        });

        // 통합 드래그 핸들러 (창 이동 & 이미지 이동)
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        // 드래그 앤 드롭 - 전체 문서에서 가능하도록
        document.addEventListener('dragover', handleDragOver);
        document.addEventListener('dragleave', handleDragLeave);
        document.addEventListener('drop', handleDrop);

        mainImage.addEventListener('load', handleImageLoad);

        window.api.onImageLoaded(handleImageLoaded);
        window.api.onFolderChanged(handleFolderChanged);
        window.api.onViewModeChanged(handleViewModeChanged);
        window.api.onSettingChanged(handleSettingChanged);
        window.api.onSettingsUpdated(handleSettingsUpdated);
        window.api.onBoundaryReached(handleBoundaryReached);
        window.api.onFullscreenChanged(handleFullscreenChanged);
        window.api.onOpenSettings(openSettings);
        window.api.onError(showError);
        window.api.onCopySuccess(handleCopySuccess);
        window.api.onConfirmDelete(handleConfirmDelete);
        window.api.onDeleteSuccess(handleDeleteSuccess);
        window.api.onMediaKey((key) => {
            window.api.log(`[Renderer] Media key received: ${key}`);
            if (key === 'next') {
                if (isAtLastImage()) {
                    showBoundaryNotification('마지막 이미지입니다', '');
                    if (settings.folderNavigation !== 'none') window.api.navigateFromBoundary('last');
                } else {
                    window.api.navigateImage(1);
                }
            } else if (key === 'prev') {
                if (currentImageData && currentImageData.index === 0) {
                    showBoundaryNotification('첫 번째 이미지입니다', '');
                    if (settings.folderNavigation !== 'none') window.api.navigateFromBoundary('first');
                } else {
                    window.api.navigateImage(-1);
                }
            }
        });

        window.api.onTriggerCopy(() => {
            executeCopyImage();
        });

        window.api.onFullscreenKeyF10(() => {
            if (isFullscreen) {
                if (fullscreenMode === 'complete') {
                    window.api.toggleFullscreen('complete');
                } else {
                    handleFullscreenChanged(true, 'complete');
                }
            } else {
                window.api.toggleFullscreen('complete');
            }
        });

        window.api.onUnloadImage(() => {
            window.api.log('[Renderer] processing unload-image... (Start)');

            // 이미지 소스를 빈 데이터 URI로 확실하게 교체하여 파일 핸들 해제 유도
            const emptyImage = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            mainImage.src = emptyImage;
            secondImage.src = emptyImage;
            currentImageData = null;

            window.api.log('[Renderer] image src reset done. Waiting 100ms...');

            // 약간의 지연을 주어 브라우저가 이미지 핸들을 놓게 함
            setTimeout(() => {
                window.api.log('[Renderer] 100ms timeout passed. Sending signal (Batch 1).');
                window.api.imageUnloaded();
                setTimeout(() => {
                    window.api.log('[Renderer] Sending signal (Batch 2).');
                    window.api.imageUnloaded();
                }, 200);
            }, 100);
        });
        window.api.onNoMoreFolders(handleNoMoreFolders);

        document.addEventListener('wheel', handleWheel, { passive: false });
        const progressContainer = document.querySelector('.progress-container');
        if (progressContainer) {
            progressContainer.addEventListener('mousedown', (e) => e.stopPropagation()); // 드래그 방지
            progressContainer.addEventListener('click', handleProgressBarClick);
        }
    }

    // 마우스 다운 핸들러 (창 이동 또는 이미지 이동 시작)
    function handleMouseDown(e) {
        // 인터랙티브 요소는 무시
        if (e.target.closest('button, input, .window-ctrl-btn, .window-btn, .no-drag, .modal, .menu-item, .status-badge, .progress-container')) return;
        if (e.target.closest('#settings-modal') || e.target.closest('#delete-modal')) return; // 모달 내부 클릭 무시

        // 우클릭은 무시
        if (e.button !== 0) return;

        const isImageClick = e.target === mainImage || e.target === secondImage || e.target === imageContainer;

        if (settings.enableImageDrag && isImageClick && currentImageData) {
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
        } else {
            isWindowDragging = true;
            window.api.windowDragStart();
        }
    }

    function handleMouseMove(e) {
        if (isWindowDragging) {
            window.api.windowMove();
        } else if (isDragging) {
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            imageOffsetX += dx;
            imageOffsetY += dy;
            applyImageTransform();
        }
    }

    function handleMouseUp() {
        if (isWindowDragging) {
            isWindowDragging = false;
            window.api.windowDragEnd();
        }
        isDragging = false;
    }

    function handleKeydown(e) {
        if (!deleteModal.classList.contains('hidden')) {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.api.executeDelete();
                closeDeleteModal();
                closeSettings(); // 설정창도 같이 닫음
            } else if (e.key === 'Escape') {
                closeDeleteModal();
            }
            return;
        }

        if (!settingsModal.classList.contains('hidden')) {
            if (e.key === 'Escape') closeSettings();
            return;
        }

        switch (e.key) {
            case 'Escape':
                if (isFullscreen) window.api.exitFullscreen();
                else window.api.windowClose();
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (currentImageData && currentImageData.index === 0) {
                    showBoundaryNotification('첫 번째 이미지입니다', '');
                    if (settings.folderNavigation !== 'none') window.api.navigateFromBoundary('first');
                } else {
                    if (settings.keyboardAction === 'firstLast') window.api.goToFirstImage();
                    else window.api.navigateImage(-1);
                }
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (isAtLastImage()) {
                    showBoundaryNotification('마지막 이미지입니다', '');
                    if (settings.folderNavigation !== 'none') window.api.navigateFromBoundary('last');
                } else {
                    if (settings.keyboardAction === 'firstLast') window.api.goToLastImage();
                    else window.api.navigateImage(1);
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (currentImageData && currentImageData.index === 0) {
                    showBoundaryNotification('첫 번째 이미지입니다', '');
                    if (settings.folderNavigation !== 'none') window.api.navigateFromBoundary('first');
                } else {
                    clearBoundaryState();
                    window.api.navigateImage(-1);
                }
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (isAtLastImage()) {
                    showBoundaryNotification('마지막 이미지입니다', '');
                    if (settings.folderNavigation !== 'none') window.api.navigateFromBoundary('last');
                } else {
                    clearBoundaryState();
                    window.api.navigateImage(1);
                }
                break;
            case 'Home':
                e.preventDefault();
                handleHomeEnd('first');
                break;
            case 'End':
                e.preventDefault();
                handleHomeEnd('last');
                break;
            case 'PageUp':
                e.preventDefault();
                window.api.navigateFolder(-1);
                break;
            case 'PageDown':
                e.preventDefault();
                window.api.navigateFolder(1);
                break;
            case 'Tab':
                e.preventDefault();
                toggleInfoPanel();
                break;
            case 'F5':
                e.preventDefault();
                openSettings();
                break;
            case 'F10':
                e.preventDefault();
                if (isFullscreen) {
                    if (fullscreenMode === 'complete') {
                        window.api.toggleFullscreen('complete');
                    } else {
                        handleFullscreenChanged(true, 'complete');
                    }
                } else {
                    window.api.toggleFullscreen('complete');
                }
                break;
            case 'F11':
                e.preventDefault();
                if (e.ctrlKey) {
                    if (isFullscreen) {
                        if (fullscreenMode === 'complete') {
                            window.api.toggleFullscreen('complete');
                        } else {
                            handleFullscreenChanged(true, 'complete');
                        }
                    } else {
                        window.api.toggleFullscreen('complete');
                    }
                } else {
                    if (isFullscreen) {
                        if (fullscreenMode === 'normal') {
                            window.api.toggleFullscreen('normal');
                        } else {
                            handleFullscreenChanged(true, 'normal');
                        }
                    } else {
                        window.api.toggleFullscreen('normal');
                    }
                }
                break;
            case 'PrintScreen':
            case 'Snapshot':
            case 'Insert':
                e.preventDefault();
                executeCopyImage();
                break;
            case 'Delete':
                e.preventDefault();
                window.api.log('[Renderer] Delete key pressed');
                window.api.requestDelete();
                break;
            case 'z':
            case 'Z':
                if (!e.ctrlKey) {
                    e.preventDefault();
                    settings.fitSmall = !settings.fitSmall;
                    const fitSmallCheckbox = document.getElementById('enable-fit-small');
                    if (fitSmallCheckbox) fitSmallCheckbox.checked = settings.fitSmall;
                    window.api.saveSettings(settings);
                    updateViewMode(settings.viewMode);
                    showModeNotification(settings.fitSmall ? '작은 그림 꽉차게: 켜짐' : '작은 그림 꽉차게: 꺼짐', '🔍');
                }
                break;
            case 'x':
            case 'X':
                if (!e.ctrlKey) {
                    e.preventDefault();
                    settings.firstImageSingle = !settings.firstImageSingle;
                    const firstImageSingleCheckbox = document.getElementById('enable-first-image-single');
                    if (firstImageSingleCheckbox) firstImageSingleCheckbox.checked = settings.firstImageSingle;
                    window.api.saveSettings(settings);
                    showModeNotification(settings.firstImageSingle ? '첫 장 한 장으로 보기: 켜짐' : '첫 장 한 장으로 보기: 꺼짐', '📖');
                }
                break;
            case '0':
                if (!e.ctrlKey) { e.preventDefault(); setViewMode('original'); }
                break;
            case '9': e.preventDefault(); setViewMode('fit'); break;
            case '8': e.preventDefault(); setViewMode('fitWidth'); break;
            case '7': e.preventDefault(); setViewMode('dualLR'); break;
            case '6': e.preventDefault(); setViewMode('dualRL'); break;
        }

        if (e.ctrlKey) {
            switch (e.key.toLowerCase()) {
                case 'o':
                    e.preventDefault();
                    if (e.shiftKey) window.api.openFile();
                    else window.api.openFolder();
                    break;
                case 'e': e.preventDefault(); window.api.openFileLocation(); break;
                case 'r': e.preventDefault(); window.api.toggleFolderNav(); break;
                case 't': e.preventDefault(); window.api.toggleImageNav(); break;
                case '=':
                case '+':
                    e.preventDefault();
                    zoomImage(1);
                    break;
                case '-':
                    e.preventDefault();
                    zoomImage(-1);
                    break;
            }
        }
    }

    // Home/End 처리 (두번 누르면 폴더 이동)
    // Home/End 처리 (즉시 이동)
    function handleHomeEnd(type) {
        clearBoundaryState();
        if (type === 'first') {
            if (currentImageData && currentImageData.index === 0) {
                window.api.navigateFromBoundary('first');
            } else {
                window.api.goToFirstImage();
            }
        } else {
            if (isAtLastImage()) {
                window.api.navigateFromBoundary('last');
            } else {
                window.api.goToLastImage();
            }
        }
    }

    // 마지막 이미지인지 확인 (듀얼 모드 고려)
    function isAtLastImage() {
        if (!currentImageData) return false;
        const total = currentImageData.total || 0;
        if (total === 0) return false;

        const index = currentImageData.index;
        const isDualMode = settings.viewMode === 'dualLR' || settings.viewMode === 'dualRL';

        // 듀얼모드에서는 마지막 인덱스-1 (짝수 장수일 때 등)도 마지막 화면에 포함될 수 있음
        // main.js의 로직과 일치시킴: (isDualMode && currentIndex >= lastIndex - 1)
        if (isDualMode) {
            return index >= total - 2;
        } else {
            return index >= total - 1;
        }
    }

    function clearBoundaryState() {
        lastBoundaryType = null;
        lastBoundaryTime = 0;
    }

    let fullscreenMode = null;

    function handleFullscreenChanged(fullscreen, mode) {
        isFullscreen = fullscreen;
        if (!fullscreen) {
            document.body.classList.remove('fullscreen', 'fullscreen-normal', 'fullscreen-complete');
            fullscreenMode = null;
        } else {
            document.body.classList.add('fullscreen');
            fullscreenMode = mode || 'normal';
            if (fullscreenMode === 'complete') {
                document.body.classList.add('fullscreen-complete');
                document.body.classList.remove('fullscreen-normal');
            } else {
                document.body.classList.add('fullscreen-normal');
                document.body.classList.remove('fullscreen-complete');
            }
        }
    }

    // 창 드래그 이동

    function applyImageTransform() {
        const transformStr = `translate(${imageOffsetX}px, ${imageOffsetY}px) scale(${zoomScale})`;
        mainImage.style.transform = transformStr;
        if (!secondImage.classList.contains('hidden')) {
            secondImage.style.transform = transformStr;
        }
    }

    function resetImagePosition() {
        imageOffsetX = 0;
        imageOffsetY = 0;
        zoomScale = 1.0;
        mainImage.style.transform = '';
        secondImage.style.transform = '';
    }

    function zoomImage(direction) {
        if (!currentImageData) return;
        if (direction > 0) {
            zoomScale = Math.min(5.0, zoomScale + 0.1);
        } else {
            zoomScale = Math.max(0.1, zoomScale - 0.1);
        }
        applyImageTransform();
        showModeNotification(`배율: ${Math.round(zoomScale * 100)}%`, '🔍');
    }

    async function playFallbackSynthSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
            }
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1000, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.12);
            
            gain.gain.setValueAtTime(0.125, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + 0.15);
            
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.15);
        } catch (err) {
            window.api.log('Failed to play fallback synth sound: ' + err.message);
        }
    }

    function playAlertSound() {
        const paths = [
            'file:///C:/Windows/Media/Windows 배터리 부족 경보.wav',
            'file:///C:/Windows/Media/Windows Battery Low.wav',
            'file:///C:/Windows/Media/Windows Background.wav',
            'file:///C:/Windows/Media/Windows Ding.wav'
        ];
        
        let attempt = 0;
        
        const tryPlay = () => {
            if (attempt >= paths.length) {
                window.api.log('[Renderer] All system wave sounds failed. Playing fallback synth sound.');
                playFallbackSynthSound();
                return;
            }
            
            const currentPath = paths[attempt];
            const audio = new Audio(currentPath);
            audio.volume = 0.5; // 음량을 50%로 설정
            
            audio.play()
                .then(() => {
                    window.api.log(`[Renderer] Successfully played system sound with 50% volume: ${currentPath}`);
                })
                .catch((err) => {
                    window.api.log(`[Renderer] Failed to play system sound: ${currentPath} (${err.message}). Trying next.`);
                    attempt++;
                    tryPlay();
                });
        };
        
        tryPlay();
    }


    function handleImageLoaded(data) {
        currentImageData = data;
        settings = data.settings || settings;

        startScreen.classList.add('hidden');
        viewer.classList.remove('hidden');

        resetImagePosition();
        clearBoundaryState();

        mainImage.src = `file://${data.path.replace(/\\/g, '/')}`;

        const isDualMode = data.viewMode === 'dualLR' || data.viewMode === 'dualRL';
        if (isDualMode && data.secondPath) {
            secondImage.classList.remove('hidden');
            secondImage.src = `file://${data.secondPath.replace(/\\/g, '/')}`;
            imageContainer.classList.add('dual-view');
        } else {
            secondImage.classList.add('hidden');
            imageContainer.classList.remove('dual-view');
        }

        updateViewMode(data.viewMode);

        let displayInfo = '';
        if (isDualMode && data.secondName) {
            displayInfo = `[${data.folderName}] ${data.name}, ${data.secondName} — ${data.index + 1}-${data.index + 2} / ${data.total}`;
        } else {
            displayInfo = `[${data.folderName}] ${data.name} — ${data.index + 1} / ${data.total}`;
        }
        document.getElementById('toolbar-info').textContent = displayInfo;
        document.title = displayInfo;

        const progress = ((data.index + 1) / data.total) * 100;
        progressBar.style.width = `${progress}%`;

        updateInfoPanel(data);
        updateContextMenuChecks(data.viewMode);
        updateStatusBadges();
    }

    function handleImageLoad() {
        if (currentImageData) {
            document.getElementById('info-resolution').textContent = `${mainImage.naturalWidth} × ${mainImage.naturalHeight}`;
        }
    }

    function updateInfoPanel(data) {
        document.getElementById('info-folder').textContent = data.folderName;
        document.getElementById('info-filename').textContent = data.fileName;
        document.getElementById('info-index').textContent = `${data.index + 1} / ${data.total}`;
        document.getElementById('info-size').textContent = data.size;
    }

    function toggleInfoPanel() {
        infoPanelVisible = !infoPanelVisible;
        infoPanel.classList.toggle('hidden', !infoPanelVisible);
    }

    function updateStatusBadges() {
        const folderBadge = document.getElementById('badge-folder-nav');
        const imageBadge = document.getElementById('badge-image-nav');

        const folderNavActive = settings.folderNavigation !== 'next';
        folderBadge.classList.toggle('active', folderNavActive);

        const folderNavTexts = { 'next': '순차폴더', 'random': '랜덤폴더', 'loop': '폴더순환' };
        folderBadge.querySelector('.badge-text').textContent = folderNavTexts[settings.folderNavigation] || '순차폴더';

        imageBadge.classList.toggle('active', settings.imageNavigation === 'random');
        imageBadge.querySelector('.badge-text').textContent = settings.imageNavigation === 'random' ? '랜덤이미지' : '순차이미지';
    }

    function handleFolderChanged(data) {
        if (notificationTimeout) clearTimeout(notificationTimeout);

        folderNotification.querySelector('.notification-folder').textContent = data.folderName;

        const directionText = data.direction === 'next' ? '다음 폴더' : '이전 폴더';
        const navModeTexts = { 'next': '순차', 'random': '랜덤', 'loop': '순환' };
        const navModeText = navModeTexts[data.folderNavigation] || '순차';
        const folderCountText = `${data.currentFolderIndex} / ${data.totalFolders}`;

        document.getElementById('notification-direction').textContent = directionText;
        document.getElementById('notification-mode').textContent = navModeText;
        document.getElementById('notification-count').textContent = folderCountText;

        folderNotification.classList.remove('hidden', 'fade-out');

        notificationTimeout = setTimeout(() => {
            folderNotification.classList.add('fade-out');
            setTimeout(() => folderNotification.classList.add('hidden'), 300);
        }, 3000);
    }

    // 경계 도달 알림 (상단 중앙)
    function handleBoundaryReached(data) {
        showBoundaryNotification(data.message, data.hint);
    }

    // 경계 알림 표시 (상단 중앙)
    function showBoundaryNotification(message, hint) {
        const existingNotif = document.querySelector('.boundary-notification');
        if (existingNotif) existingNotif.remove();
        if (boundaryNotificationTimeout) clearTimeout(boundaryNotificationTimeout);

        const notif = document.createElement('div');
        notif.className = 'boundary-notification';
        notif.innerHTML = `
            <div class="boundary-message">${message}</div>
            ${hint ? `<div class="boundary-hint">(${hint})</div>` : ''}
        `;
        document.body.appendChild(notif);

        boundaryNotificationTimeout = setTimeout(() => {
            notif.classList.add('fade-out');
            setTimeout(() => notif.remove(), 200);
        }, 1000);
    }

    function handleSettingChanged(data) {
        showModeNotification(data.name, data.type === 'folderNavigation' ? '📁' : '🖼️');
        updateStatusBadges();
    }

    function handleSettingsUpdated(newSettings) {
        settings = newSettings;
        updateStatusBadges();
        updateSettingsUI();
    }

    function handleViewModeChanged(data) {
        settings.viewMode = data.mode;
        updateViewMode(data.mode);
        updateContextMenuChecks(data.mode);
        showModeNotification(data.name, '👁️');
    }

    function handleCopySuccess(data) {
        playAlertSound();
    }

    function handleConfirmDelete(data) {
        window.api.log(`[Renderer] handleConfirmDelete called. Type: ${data.targetType}, Name: ${data.targetName}`);
        deleteConfirmData = data;
        document.getElementById('delete-target-type').textContent = data.targetType;
        document.getElementById('delete-target-name').textContent = data.targetName;

        // 화면 갱신 강제 (setTimeout으로 이벤트 루프 양보)
        setTimeout(() => {
            // [IPC Hack] 메인 프로세스와 핑퐁하여 파이프 뚫기
            window.api.pingRender();

            // [사용자 요청] 삭제 팝업 호출 시 설정 팝업도 같이 띄움 (화면 갱신용)
            settingsModal.style.opacity = '1';
            settingsModal.classList.remove('hidden');

            deleteModal.style.zIndex = '7000'; // 설정보다 위
            deleteModal.style.display = 'flex';
            deleteModal.classList.remove('hidden');
            window.api.log('[Renderer] Delete modal displayed with Settings.');

            // 포커스 강제 이동으로 렌더링 유도
            document.getElementById('cancel-delete').focus();

            // 강제 리페인트 루프 체크 로그
            let count = 0;
            const interval = setInterval(() => {
                deleteModal.style.transform = count % 2 === 0 ? 'translateZ(0) scale(1)' : 'translateZ(0) scale(1.0001)';
                count++;
                if (count > 5) clearInterval(interval);
            }, 50);
        }, 10);
    }

    function handleDeleteSuccess(data) {
        const typeText = data.type === 'folder' ? '폴더' : '이미지';
        showModeNotification(`${data.name}\n${typeText} 삭제됨`, '🗑️');
    }

    function handleNoMoreFolders() {
        viewer.classList.add('hidden');
        startScreen.classList.remove('hidden');
        showModeNotification('모든 폴더가 삭제되었습니다', '📁');
    }

    function closeDeleteModal() {
        deleteModal.classList.add('hidden');
        setTimeout(() => deleteModal.style.display = '', 300); // 애니메이션 후 초기화
        deleteConfirmData = null;
    }

    function showModeNotification(text, icon) {
        const existingNotif = document.querySelector('.mode-notification');
        if (existingNotif) existingNotif.remove();
        if (modeNotificationTimeout) clearTimeout(modeNotificationTimeout);

        const notif = document.createElement('div');
        notif.className = 'mode-notification';
        notif.innerHTML = `
            <div class="mode-icon">${icon}</div>
            <div class="mode-text">${text.replace(/\n/g, '<br>')}</div>
        `;
        document.body.appendChild(notif);

        modeNotificationTimeout = setTimeout(() => {
            notif.classList.add('fade-out');
            setTimeout(() => notif.remove(), 200);
        }, 1500);
    }

    function updateViewMode(mode) {
        imageContainer.className = '';
        imageContainer.classList.add(`view-${mode}`);
        imageContainer.classList.toggle('fit-small', settings.fitSmall);

        if (mode === 'dualLR' || mode === 'dualRL') {
            imageContainer.classList.add('dual-view');
            if (currentImageData?.secondPath) secondImage.classList.remove('hidden');
        }
    }

    async function setViewMode(mode) {
        await window.api.setViewMode(mode);
    }

    async function executeCopyImage() {
        const isDualMode = settings.viewMode === 'dualLR' || settings.viewMode === 'dualRL';
        if (isDualMode && currentImageData && currentImageData.secondPath) {
            try {
                if (!mainImage.complete || mainImage.naturalWidth === 0 || 
                    !secondImage.complete || secondImage.naturalWidth === 0) {
                    showError('이미지가 아직 완전히 로딩되지 않았습니다. 잠시 후 다시 시도해 주세요.');
                    return;
                }
                

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                const width1 = mainImage.naturalWidth;
                const height1 = mainImage.naturalHeight;
                const width2 = secondImage.naturalWidth;
                const height2 = secondImage.naturalHeight;
                
                canvas.width = width1 + width2;
                canvas.height = Math.max(height1, height2);
                
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                if (settings.viewMode === 'dualLR') {
                    const y1 = (canvas.height - height1) / 2;
                    ctx.drawImage(mainImage, 0, y1, width1, height1);
                    
                    const y2 = (canvas.height - height2) / 2;
                    ctx.drawImage(secondImage, width1, y2, width2, height2);
                } else {
                    const y2 = (canvas.height - height2) / 2;
                    ctx.drawImage(secondImage, 0, y2, width2, height2);
                    
                    const y1 = (canvas.height - height1) / 2;
                    ctx.drawImage(mainImage, width2, y1, width1, height1);
                }
                
                const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
                await window.api.copyCombinedImage(dataUrl);
            } catch (err) {
                window.api.log(`[Renderer] Failed to combine images: ${err.message}`);
                showError('이미지 병합 복사 실패: ' + err.message);
            }
        } else {
            window.api.copyImage();
        }
    }

    function handleContextMenu(e) {
        e.preventDefault();
        const x = Math.min(e.clientX, window.innerWidth - 320);
        const y = Math.min(e.clientY, window.innerHeight - contextMenu.offsetHeight - 20);
        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
        contextMenu.classList.remove('hidden');
    }

    function hideContextMenu() {
        contextMenu.classList.add('hidden');
    }

    function updateContextMenuChecks(viewMode) {
        contextMenu.querySelectorAll('.menu-item').forEach(item => {
            const action = item.dataset.action;
            if (action === 'fitSmall') {
                item.classList.toggle('active', settings.fitSmall);
            } else if (action === 'firstImageSingle') {
                item.classList.toggle('active', settings.firstImageSingle);
            } else if (['original', 'fit', 'fitWidth', 'dualLR', 'dualRL'].includes(action)) {
                item.classList.toggle('active', action === viewMode);
            }
        });
    }

    function handleMenuItemClick(e) {
        const action = e.currentTarget.dataset.action;

        switch (action) {
            case 'fitSmall':
                settings.fitSmall = !settings.fitSmall;
                const fitSmallCheckbox = document.getElementById('enable-fit-small');
                if (fitSmallCheckbox) fitSmallCheckbox.checked = settings.fitSmall;
                window.api.saveSettings(settings);
                updateViewMode(settings.viewMode);
                showModeNotification(settings.fitSmall ? '작은 그림 꽉차게: 켜짐' : '작은 그림 꽉차게: 꺼짐', '🔍');
                break;
            case 'firstImageSingle':
                settings.firstImageSingle = !settings.firstImageSingle;
                const firstImageSingleCheckbox = document.getElementById('enable-first-image-single');
                if (firstImageSingleCheckbox) firstImageSingleCheckbox.checked = settings.firstImageSingle;
                window.api.saveSettings(settings);
                showModeNotification(settings.firstImageSingle ? '첫 장 한 장으로 보기: 켜짐' : '첫 장 한 장으로 보기: 꺼짐', '📖');
                break;
            case 'original': case 'fit': case 'fitWidth': case 'dualLR': case 'dualRL':
                setViewMode(action); break;
            case 'openFolder': window.api.openFolder(); break;
            case 'openLocation': window.api.openFileLocation(); break;
            case 'toggleFolderNav': window.api.toggleFolderNav(); break;
            case 'toggleImageNav': window.api.toggleImageNav(); break;
            case 'copyImage': executeCopyImage(); break;
            case 'deleteItem': window.api.requestDelete(); break;
            case 'settings': openSettings(); break;
        }
        hideContextMenu();
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        document.body.classList.add('drag-over');
    }

    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        // 완전히 문서를 벗어났을 때만 제거
        if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
            document.body.classList.remove('drag-over');
        }
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        document.body.classList.remove('drag-over');

        const files = [];
        for (const file of e.dataTransfer.files) files.push(file.path);
        if (files.length > 0) window.api.dropFiles(files);
    }

    function openSettings() {
        window.api.log('[Renderer] openSettings called (F5).');
        updateSettingsUI();
        settingsModal.classList.remove('hidden');
    }

    function closeSettings() {
        settingsModal.classList.add('hidden');
    }

    function updateSettingsUI() {
        const folderNavRadio = document.querySelector(`input[name="folderNav"][value="${settings.folderNavigation}"]`);
        if (folderNavRadio) folderNavRadio.checked = true;

        const imageNavRadio = document.querySelector(`input[name="imageNav"][value="${settings.imageNavigation}"]`);
        if (imageNavRadio) imageNavRadio.checked = true;

        const viewModeRadio = document.querySelector(`input[name="viewMode"][value="${settings.viewMode}"]`);
        if (viewModeRadio) viewModeRadio.checked = true;

        const imageDragCheckbox = document.getElementById('enable-image-drag');
        if (imageDragCheckbox) imageDragCheckbox.checked = settings.enableImageDrag;

        const fitSmallCheckbox = document.getElementById('enable-fit-small');
        if (fitSmallCheckbox) fitSmallCheckbox.checked = settings.fitSmall !== false;

        const deleteModeRadio = document.querySelector(`input[name="deleteMode"][value="${settings.deleteMode}"]`);
        if (deleteModeRadio) deleteModeRadio.checked = true;

        const preventDupFolder = document.getElementById('prevent-duplicate-folder');
        if (preventDupFolder) preventDupFolder.checked = settings.preventDuplicateFolder !== false;

        const preventDupImage = document.getElementById('prevent-duplicate-image');
        if (preventDupImage) preventDupImage.checked = settings.preventDuplicateImage !== false;

        const copyDestPath = document.getElementById('copy-dest-path');
        if (copyDestPath && settings.copyDestination) copyDestPath.textContent = settings.copyDestination;

        const firstImageSingleCheckbox = document.getElementById('enable-first-image-single');
        if (firstImageSingleCheckbox) firstImageSingleCheckbox.checked = settings.firstImageSingle === true;

        const wheelNavRadio = document.querySelector(`input[name="wheelAction"][value="${settings.wheelAction || 'prevNext'}"]`);
        if (wheelNavRadio) wheelNavRadio.checked = true;

        const keyboardNavRadio = document.querySelector(`input[name="keyboardAction"][value="${settings.keyboardAction || 'prevNext'}"]`);
        if (keyboardNavRadio) keyboardNavRadio.checked = true;
    }

    async function saveSettings() {
        try {
            const folderNavEl = document.querySelector('input[name="folderNav"]:checked');
            const imageNavEl = document.querySelector('input[name="imageNav"]:checked');
            const viewModeEl = document.querySelector('input[name="viewMode"]:checked');
            const deleteModeEl = document.querySelector('input[name="deleteMode"]:checked');
            const imageDragEl = document.getElementById('enable-image-drag');
            const fitSmallEl = document.getElementById('enable-fit-small');
            const firstImageSingleEl = document.getElementById('enable-first-image-single');
            const preventDupFolderEl = document.getElementById('prevent-duplicate-folder');
            const preventDupImageEl = document.getElementById('prevent-duplicate-image');
            const wheelActionEl = document.querySelector('input[name="wheelAction"]:checked');
            const keyboardActionEl = document.querySelector('input[name="keyboardAction"]:checked');

            const newSettings = {
                folderNavigation: folderNavEl ? folderNavEl.value : settings.folderNavigation,
                imageNavigation: imageNavEl ? imageNavEl.value : settings.imageNavigation,
                viewMode: viewModeEl ? viewModeEl.value : settings.viewMode,
                enableImageDrag: imageDragEl ? imageDragEl.checked : settings.enableImageDrag,
                fitSmall: fitSmallEl ? fitSmallEl.checked : true,
                firstImageSingle: firstImageSingleEl ? firstImageSingleEl.checked : false,
                deleteMode: deleteModeEl ? deleteModeEl.value : settings.deleteMode,
                preventDuplicateFolder: preventDupFolderEl ? preventDupFolderEl.checked : true,
                preventDuplicateImage: preventDupImageEl ? preventDupImageEl.checked : true,
                wheelAction: wheelActionEl ? wheelActionEl.value : 'prevNext',
                keyboardAction: keyboardActionEl ? keyboardActionEl.value : 'prevNext',
                copyDestination: settings.copyDestination || ''
            };

            settings = await window.api.saveSettings(newSettings);

            if (settings.viewMode === 'dualLR' || settings.viewMode === 'dualRL') {
                setViewMode(settings.viewMode);
            }

            updateStatusBadges();
            closeSettings();
            showModeNotification('설정이 저장되었습니다', '✅');
        } catch (error) {
            console.error('설정 저장 오류:', error);
            showError('설정 저장에 실패했습니다.');
        }
    }

    function handleWheel(e) {
        if (e.ctrlKey) return;

        // 뷰어 영역이나 body에서 발생한 휠만 처리 (설정 모달 등 제외)
        if (e.target.closest('.modal')) return;

        e.preventDefault();

        if (e.deltaY < 0) {
            // 위로 굴림
            if (settings.wheelAction === 'firstLast') window.api.goToFirstImage();
            else window.api.navigateImage(-1);
        } else if (e.deltaY > 0) {
            // 아래로 굴림
            if (settings.wheelAction === 'firstLast') window.api.goToLastImage();
            else window.api.navigateImage(1);
        }
    }

    function handleProgressBarClick(e) {
        if (!currentImageData || !currentImageData.total) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, x / rect.width));
        const index = Math.floor(ratio * currentImageData.total);
        window.api.goToImage(index);
    }

    function showError(message) {
        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
});

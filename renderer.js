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

    initEventListeners();
    updateSettingsUI();
    updateStatusBadges();

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

        document.getElementById('cancel-delete').addEventListener('click', closeDeleteModal);
        document.getElementById('confirm-delete-btn').addEventListener('click', () => {
            window.api.executeDelete();
            closeDeleteModal();
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
        window.api.onNoMoreFolders(handleNoMoreFolders);
    }

    // 마우스 다운 핸들러 (창 이동 또는 이미지 이동 시작)
    function handleMouseDown(e) {
        // 인터랙티브 요소는 무시
        if (e.target.closest('button, input, .no-drag, .modal, .menu-item, .status-badge')) return;
        if (e.target.closest('#settings-modal') || e.target.closest('#delete-modal')) return; // 모달 내부 클릭 무시

        // 우클릭은 무시
        if (e.button !== 0) return;

        // 이미지 드래그 조건 체크 (설정 켜짐 + 이미지 있음 + 원본 모드 등)
        // 여기서는 간단히 'enableImageDrag' 설정이 켜져있고 이미지 컨테이너 내부 클릭이면 이미지 드래그 시도
        const isImageClick = e.target === mainImage || e.target === secondImage || e.target === imageContainer;

        if (settings.enableImageDrag && isImageClick && currentImageData) {
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            // 현재 이미지 transform 값 파싱 필요하지만, 여기서는 간단히 오프셋만
            // 실제 이미지 이동 구현은 복잡하므로, 사용자가 '드래그로 뷰어 이동'을 원했으니 창 이동 우선?
            // "이미지가 열린화면에서는, 드래그로 뷰어 이동이 가능하게 해주고" -> 이미지 이동? 뷰어(창) 이동?
            // 문맥상 "뷰어 이동"은 "다음 이미지로 이동"이 아니라 "패닝(Panning)"일 수도 있고 "창 이동"일 수도 있음.
            // "시작화면에서는 창 이동이 아예 안돼" -> 창 이동을 원함.
            // "앱 전체 화면에서 드래그 앤 드롭과 마우스 드래그로 창이동이 가능하게 해줘" -> 창 이동이 핵심.
            // 따라서 이미지 드래그(패닝)보다 창 이동을 우선하거나, 패닝이 필요 없는 상황엔 창 이동을 해야 함.

            // 지금은 '이미지 드래그 이동' 옵션이 켜져있으면 이미지 패닝을 우선하고, 아니면 창 이동을 하는 것으로.
            // 단, fit 모드라서 이미지가 화면에 꽉 차있으면 패닝이 필요 없음 -> 창 이동.
            // 일단 창 이동을 기본으로 하고, 특정 요소(확대된 이미지) 위에서만 패닝하도록 구현하는 것이 좋음.
            // 사용자의 "드래그로 뷰어 이동"은 "창 이동"을 의미할 확률이 90%.

            // 따라서 isWindowDragging을 우선.
        }

        isWindowDragging = true;
        windowDragStartX = e.clientX;
        windowDragStartY = e.clientY;
    }

    function handleMouseMove(e) {
        if (isWindowDragging) {
            window.api.windowMove({ mouseX: windowDragStartX, mouseY: windowDragStartY });
        }
    }

    function handleMouseUp() {
        isWindowDragging = false;
        isDragging = false;
    }

    function handleKeydown(e) {
        if (!deleteModal.classList.contains('hidden')) {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.api.executeDelete();
                closeDeleteModal();
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
            case 'ArrowLeft':
                e.preventDefault();
                if (currentImageData && currentImageData.index === 0) {
                    handleHomeEnd('first');
                } else {
                    clearBoundaryState();
                    window.api.navigateImage(-1);
                }
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (currentImageData && currentImageData.index >= (currentImageData.total || 0) - 1) {
                    handleHomeEnd('last');
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
            case 'F11':
                e.preventDefault();
                window.api.toggleFullscreen();
                break;
            case 'Insert':
                e.preventDefault();
                window.api.copyImage();
                break;
            case 'Delete':
                e.preventDefault();
                window.api.requestDelete();
                break;
            case 'z':
            case 'Z':
                if (!e.ctrlKey) { e.preventDefault(); setViewMode('fitSmall'); }
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
            }
        }
    }

    // Home/End 처리 (두번 누르면 폴더 이동)
    function handleHomeEnd(type) {
        const now = Date.now();
        if (lastBoundaryType === type && now - lastBoundaryTime < 2000) {
            // 2초 이내에 같은 키 두번 누름 -> 폴더 이동
            window.api.navigateFromBoundary(type);
            clearBoundaryState();
        } else {
            lastBoundaryType = type;
            lastBoundaryTime = now;
            if (type === 'first') window.api.goToFirstImage();
            else window.api.goToLastImage();
        }
    }

    function clearBoundaryState() {
        lastBoundaryType = null;
        lastBoundaryTime = 0;
    }

    function handleFullscreenChanged(fullscreen) {
        isFullscreen = fullscreen;
        document.body.classList.toggle('fullscreen', fullscreen);
    }

    // 창 드래그 이동
    function handleWindowDragStart(e) {
        // 버튼이나 입력 요소 클릭은 무시
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('.toolbar-status')) return;
        if (e.button !== 0) return;

        isWindowDragging = true;
        windowDragStartX = e.screenX;
        windowDragStartY = e.screenY;
        e.preventDefault();
    }

    function handleWindowDragMove(e) {
        if (!isWindowDragging) return;

        const deltaX = e.screenX - windowDragStartX;
        const deltaY = e.screenY - windowDragStartY;

        // Electron은 창 이동을 직접 처리할 수 없어서 CSS로 시각적 피드백
        // 실제 창 이동은 -webkit-app-region: drag 사용
    }

    function handleWindowDragEnd() {
        isWindowDragging = false;
    }

    function resetImagePosition() {
        imageOffsetX = 0;
        imageOffsetY = 0;
        mainImage.style.transform = '';
        secondImage.style.transform = '';
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
        if (isDualMode && data.secondFileName) {
            displayInfo = `${data.fileName}, ${data.secondFileName} — ${data.index + 1}-${data.index + 2} / ${data.total}`;
        } else {
            displayInfo = `${data.fileName} — ${data.index + 1} / ${data.total}`;
        }
        document.getElementById('toolbar-info').textContent = displayInfo;

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
        showModeNotification(`${data.fileName}\n복사 완료`, '📋');
    }

    function handleConfirmDelete(data) {
        deleteConfirmData = data;
        document.getElementById('delete-target-type').textContent = data.targetType;
        document.getElementById('delete-target-name').textContent = data.targetName;
        deleteModal.classList.remove('hidden');
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

        if (mode === 'dualLR' || mode === 'dualRL') {
            imageContainer.classList.add('dual-view');
            if (currentImageData?.secondPath) secondImage.classList.remove('hidden');
        }
    }

    async function setViewMode(mode) {
        await window.api.setViewMode(mode);
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
            if (['fitSmall', 'original', 'fit', 'fitWidth', 'dualLR', 'dualRL'].includes(action)) {
                item.classList.toggle('active', action === viewMode);
            }
        });
    }

    function handleMenuItemClick(e) {
        const action = e.currentTarget.dataset.action;

        switch (action) {
            case 'fitSmall': case 'original': case 'fit': case 'fitWidth': case 'dualLR': case 'dualRL':
                setViewMode(action); break;
            case 'openFolder': window.api.openFolder(); break;
            case 'openLocation': window.api.openFileLocation(); break;
            case 'toggleFolderNav': window.api.toggleFolderNav(); break;
            case 'toggleImageNav': window.api.toggleImageNav(); break;
            case 'copyImage': window.api.copyImage(); break;
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

        const deleteModeRadio = document.querySelector(`input[name="deleteMode"][value="${settings.deleteMode}"]`);
        if (deleteModeRadio) deleteModeRadio.checked = true;

        const preventDupFolder = document.getElementById('prevent-duplicate-folder');
        if (preventDupFolder) preventDupFolder.checked = settings.preventDuplicateFolder !== false;

        const preventDupImage = document.getElementById('prevent-duplicate-image');
        if (preventDupImage) preventDupImage.checked = settings.preventDuplicateImage !== false;

        const copyDestPath = document.getElementById('copy-dest-path');
        if (copyDestPath && settings.copyDestination) copyDestPath.textContent = settings.copyDestination;
    }

    async function saveSettings() {
        try {
            const folderNavEl = document.querySelector('input[name="folderNav"]:checked');
            const imageNavEl = document.querySelector('input[name="imageNav"]:checked');
            const viewModeEl = document.querySelector('input[name="viewMode"]:checked');
            const deleteModeEl = document.querySelector('input[name="deleteMode"]:checked');
            const imageDragEl = document.getElementById('enable-image-drag');
            const preventDupFolderEl = document.getElementById('prevent-duplicate-folder');
            const preventDupImageEl = document.getElementById('prevent-duplicate-image');

            const newSettings = {
                folderNavigation: folderNavEl ? folderNavEl.value : settings.folderNavigation,
                imageNavigation: imageNavEl ? imageNavEl.value : settings.imageNavigation,
                viewMode: viewModeEl ? viewModeEl.value : settings.viewMode,
                enableImageDrag: imageDragEl ? imageDragEl.checked : settings.enableImageDrag,
                deleteMode: deleteModeEl ? deleteModeEl.value : settings.deleteMode,
                preventDuplicateFolder: preventDupFolderEl ? preventDupFolderEl.checked : true,
                preventDuplicateImage: preventDupImageEl ? preventDupImageEl.checked : true
            };

            settings = await window.api.saveSettings(newSettings);
            updateStatusBadges();
            closeSettings();
            showModeNotification('설정이 저장되었습니다', '✅');
        } catch (error) {
            console.error('설정 저장 오류:', error);
            showError('설정 저장에 실패했습니다.');
        }
    }

    function showError(message) {
        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
});

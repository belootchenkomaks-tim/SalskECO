// ==UserScript==
// @name         USERSIDE UP - Data Display
// @namespace    http://tampermonkey.net/
// @version      10.3
// @description  Отображает SN/MAC/IP/Interface/Сигнал + кнопка DIAG + управление LTE вкладками + корона главного окна
// @author       Max
// @match        http://5.59.141.59:8080/oper/?core_section=customer*
// @match        http://5.59.141.59:8080/oper/?core_section=customer_info*
// @match        http://192.168.1.146:8080/oper/?core_section=customer*
// @match        http://192.168.1.146:8080/oper/?core_section=customer_info*
// @updateURL    https://raw.githubusercontent.com/belootchenkomaks-tim/SalskECO/refs/heads/main/userside-up.user.js
// @downloadURL  https://raw.githubusercontent.com/belootchenkomaks-tim/SalskECO/refs/heads/main/userside-up.user.js
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @noframes
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    console.log('📊 USERSIDE UP - Data Display: Скрипт загружен');

    // ==================== КОНФИГУРАЦИЯ ====================
    const CDATA_IPS = [
        '172.18.0.200', '172.18.0.201', '172.18.0.202',
        '172.18.0.203', '172.18.0.204', '172.18.0.205'
    ];

    const LTE_IPS = [
        '172.18.0.100', '172.18.0.101', '172.18.0.102',
        '172.18.0.103', '172.18.0.104', '172.18.0.105',
        '172.18.0.106', '172.18.0.107', '172.18.0.108',
        '172.18.0.109', '172.18.0.110'
    ];

    const BILLING_URL = 'https://billing.timernet.ru/';

    // ==================== СОСТОЯНИЕ ====================
    let dataWindow = null;
    let isCollapsed = false;
    let currentData = { ip: null, interface: null, sn: null, mac: null, signal: null };
    let currentContract = null;

    // Хранилище состояния LTE вкладок
    let lteTabsState = {};

    // Уникальный ID этого окна
    const windowId = Math.random().toString(36).substring(2, 9) + '-' + Date.now();
    const currentHost = window.location.hostname;

    console.log(`🆔 ID этого окна: ${windowId} на ${currentHost}`);

    // Флаги для предотвращения множественных запросов
    let hasRequestedState = false;
    let lastStateRequest = 0;

    // Флаг для напоминалки
    let reminderShownToday = false;

    // Флаг принудительного главного окна
    let forceMaster = false;

    // ==================== НАПОМИНАЛКА ====================

    function showReminder() {
        const hasLteTabs = Object.keys(lteTabsState).length > 0;

        const reminder = document.createElement('div');
        reminder.id = 'lte-reminder';
        reminder.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 15px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 24px;">⏰</span>
                    <span style="font-size: 18px; font-weight: bold;">16:50 - Время закрывать LTE!</span>
                </div>
                <div style="background: rgba(255,255,255,0.2); padding: 10px; border-radius: 8px;">
                    ${hasLteTabs
                        ? `📡 Открыто LTE вкладок: ${Object.keys(lteTabsState).length}`
                        : '✅ Все LTE вкладки закрыты'
                    }
                </div>
                <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 10px;">
                    <button id="reminder-close-btn" style="
                        background: #9e9e9e;
                        border: none;
                        border-radius: 6px;
                        padding: 8px 16px;
                        color: white;
                        font-family: 'Orbitron', sans-serif;
                        font-size: 12px;
                        font-weight: 600;
                        cursor: pointer;
                    ">Закрыть</button>
                    <button id="reminder-close-lte-btn" style="
                        background: #f44336;
                        border: none;
                        border-radius: 6px;
                        padding: 8px 16px;
                        color: white;
                        font-family: 'Orbitron', sans-serif;
                        font-size: 12px;
                        font-weight: 600;
                        cursor: pointer;
                    ">🚪 ЗАКРЫТЬ ВСЕ LTE</button>
                </div>
            </div>
        `;

        reminder.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #FF9800, #F57C00);
            color: white;
            padding: 25px;
            border-radius: 16px;
            font-family: 'Orbitron', Arial, sans-serif;
            font-size: 14px;
            z-index: 1000000;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            border: 2px solid rgba(255,255,255,0.3);
            min-width: 350px;
            animation: reminderAppear 0.3s ease;
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes reminderAppear {
                from {
                    opacity: 0;
                    transform: translate(-50%, -40%);
                }
                to {
                    opacity: 1;
                    transform: translate(-50%, -50%);
                }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(reminder);

        document.getElementById('reminder-close-btn')?.addEventListener('click', () => {
            reminder.remove();
            style.remove();
        });

        document.getElementById('reminder-close-lte-btn')?.addEventListener('click', () => {
            reminder.remove();
            style.remove();
            closeAllLteTabs();
        });
    }

    function checkReminderTime() {
        const now = new Date();
        const mskTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));

        const hours = mskTime.getHours();
        const minutes = mskTime.getMinutes();

        if ((hours > 16 || (hours === 16 && minutes >= 50)) && !reminderShownToday) {
            console.log('⏰ Время 16:50, показываем напоминание');
            showReminder();
            reminderShownToday = true;
        }

        if (hours === 0 && minutes === 1) {
            reminderShownToday = false;
        }
    }

    function testReminder() {
        console.log('🧪 Тестовый показ напоминалки');
        showReminder();
    }

    setInterval(checkReminderTime, 60000);
    setTimeout(checkReminderTime, 5000);

    // ==================== ВЫБОР ГЛАВНОГО ОКНА ====================

    let isMasterWindow = false;

    function checkMasterWindow() {
        // Если принудительно назначено главным, игнорируем проверку
        if (forceMaster) {
            isMasterWindow = true;
            localStorage.setItem('userside_master_window', JSON.stringify({
                id: windowId,
                host: currentHost,
                timestamp: Date.now(),
                forced: true
            }));
            console.log(`👑 ЭТО окно ПРИНУДИТЕЛЬНО ГЛАВНОЕ (короновано)`);
            return;
        }

        const masterData = localStorage.getItem('userside_master_window');
        const now = Date.now();

        if (masterData) {
            try {
                const master = JSON.parse(masterData);

                // Проверяем, не принудительное ли главное окно
                if (master.forced) {
                    console.log(`👑 Принудительное главное окно: ${master.id} (не может быть заменено)`);
                    isMasterWindow = false;
                    return;
                }

                if (master.host === currentHost && now - master.timestamp < 30000) {
                    console.log(`👑 Главное окно: ${master.id} (активно)`);
                    isMasterWindow = false;
                    return;
                } else {
                    console.log(`♻️ Старое главное окно (${master.id}), занимаем место`);
                    localStorage.removeItem('userside_master_window');
                }
            } catch (e) {}
        }

        isMasterWindow = true;
        localStorage.setItem('userside_master_window', JSON.stringify({
            id: windowId,
            host: currentHost,
            timestamp: now,
            forced: false
        }));
        console.log(`👑 ЭТО окно становится ГЛАВНЫМ`);
    }

    // Функция принудительного назначения главным окном
    function forceMasterWindow() {
        forceMaster = true;
        isMasterWindow = true;

        // Очищаем все записи о других главных окнах
        localStorage.removeItem('userside_master_window');

        // Устанавливаем себя как принудительное главное
        localStorage.setItem('userside_master_window', JSON.stringify({
            id: windowId,
            host: currentHost,
            timestamp: Date.now(),
            forced: true
        }));

        console.log(`👑 Окно ${windowId} принудительно стало ГЛАВНЫМ`);
        showLteNotification('👑 Это окно теперь ГЛАВНОЕ (принудительно)', 'info');

        // Обновляем отображение короны
        updateCrownIcon();
    }

    // Обновление иконки короны
    function updateCrownIcon() {
        const crownIcon = document.getElementById('crown-master-icon');
        if (crownIcon) {
            if (isMasterWindow) {
                crownIcon.style.display = 'block';
                crownIcon.style.opacity = '1';
            } else {
                crownIcon.style.display = 'none';
            }
        }
    }

    setInterval(() => {
        if (isMasterWindow && !forceMaster) {
            localStorage.setItem('userside_master_window', JSON.stringify({
                id: windowId,
                host: currentHost,
                timestamp: Date.now(),
                forced: false
            }));
        }
    }, 10000);

    checkMasterWindow();

    // ==================== BROADCAST CHANNEL ====================

    const syncChannel = new BroadcastChannel('userside-lte-sync');

    syncChannel.onmessage = (event) => {
        const { type, payload, fromWindow } = event.data;

        if (fromWindow === windowId) return;

        console.log(`📨 ${type} от ${fromWindow?.substring(0,8)}...`);

        switch (type) {
            case 'lte-opened':
                lteTabsState[payload.ip] = {
                    name: payload.name,
                    lastSeen: Date.now(),
                    active: true,
                    url: payload.url
                };
                saveLteState();
                console.log(`➕ Добавлена вкладка ${payload.name}`);
                break;

            case 'lte-closed':
                if (lteTabsState[payload.ip]) {
                    delete lteTabsState[payload.ip];
                    saveLteState();
                    console.log(`➖ Удалена вкладка ${payload.name}`);
                }
                break;

            case 'lte-closed-all':
                lteTabsState = {};
                saveLteState();
                console.log(`🚫 Все вкладки закрыты`);
                break;

            case 'lte-focused':
                if (lteTabsState[payload.ip]) {
                    lteTabsState[payload.ip].lastSeen = Date.now();
                    saveLteState();
                }
                break;

            case 'state-request':
                if (isMasterWindow && Object.keys(lteTabsState).length > 0) {
                    if (Date.now() - lastStateRequest > 2000 || payload?.forClose) {
                        lastStateRequest = Date.now();
                        syncChannel.postMessage({
                            type: 'state-response',
                            payload: lteTabsState,
                            fromWindow: windowId
                        });
                        console.log(`📤 Отправлено состояние (${Object.keys(lteTabsState).length} вкладок)`);
                    }
                }
                break;

            case 'state-response':
                if (Object.keys(lteTabsState).length === 0) {
                    lteTabsState = payload;
                    saveLteState();
                    console.log(`📦 Загружено состояние (${Object.keys(payload).length} вкладок)`);

                    if (dataWindow) {
                        updateWindowData(document.getElementById('data-content'), currentData, document.getElementById('lte-nav-icon'));
                    }
                }
                break;

            case 'open-all-request':
                console.log(`🚀 Получен запрос на открытие всех LTE от ${fromWindow}`);
                if (isMasterWindow) {
                    performOpenAllLte();
                } else {
                    syncChannel.postMessage({
                        type: 'open-all-request',
                        fromWindow: windowId
                    });
                }
                break;

            case 'master-changed':
                // Другое окно сообщило, что стало главным
                if (payload.id !== windowId && !forceMaster) {
                    console.log(`👑 Другое окно ${payload.id} стало главным`);
                    isMasterWindow = false;
                    updateCrownIcon();
                }
                break;
        }
    };

    // ==================== ЗАГРУЗКА/СОХРАНЕНИЕ СОСТОЯНИЯ ====================

    function loadLteState() {
        try {
            const saved = localStorage.getItem('lte_tabs_state');
            if (saved) {
                lteTabsState = JSON.parse(saved);
                console.log(`📋 Загружено ${Object.keys(lteTabsState).length} вкладок из localStorage`);
            }

            if (!isMasterWindow && Object.keys(lteTabsState).length === 0 && !hasRequestedState) {
                hasRequestedState = true;
                setTimeout(() => {
                    console.log('🔄 Запрашиваем состояние...');
                    syncChannel.postMessage({
                        type: 'state-request',
                        fromWindow: windowId
                    });
                }, 1000);
            }
        } catch (e) {
            console.error('Ошибка загрузки состояния:', e);
        }
    }

    function saveLteState() {
        try {
            localStorage.setItem('lte_tabs_state', JSON.stringify(lteTabsState));
        } catch (e) {
            console.error('Ошибка сохранения состояния:', e);
        }
    }

    // ==================== ФУНКЦИИ ДЛЯ ПРОВЕРКИ СТРАНИЦЫ ====================
    function isCustomerProfile() {
        const url = window.location.href;
        return url.includes('core_section=customer') || url.includes('core_section=customer_info');
    }

    // ==================== ФУНКЦИЯ: ИЗВЛЕЧЕНИЕ СИГНАЛА ====================

    function extractSignalLevel() {
        try {
            const allDivs = document.querySelectorAll('div');

            for (let div of allDivs) {
                const text = div.textContent;

                const rxMatch = text.match(/Rx.*?\(dBm\):\s*(-?\d+\.?\d*)/i);
                if (rxMatch && rxMatch[1]) {
                    return rxMatch[1];
                }

                const altMatch = text.match(/[РR]x[^:]*:?\s*(-?\d+\.?\d*)/i);
                if (altMatch && altMatch[1]) {
                    return altMatch[1];
                }
            }

            const tables = document.querySelectorAll('table');
            for (let table of tables) {
                const cells = table.querySelectorAll('td');
                for (let i = 0; i < cells.length; i++) {
                    const cellText = cells[i].textContent;
                    if (cellText.includes('Rx') || cellText.includes('dBm')) {
                        const nextCell = cells[i + 1];
                        if (nextCell) {
                            const valueMatch = nextCell.textContent.match(/(-?\d+\.?\d*)/);
                            if (valueMatch) {
                                return valueMatch[1];
                            }
                        }
                    }
                }
            }

        } catch (e) {}
        return null;
    }

    // ==================== ФУНКЦИЯ: ИЗВЛЕЧЕНИЕ ID (СТВОЛА) ИЗ INTERFACE ====================

    function extractStvolId(interface_, ip) {
        if (!interface_ || !ip) return { stvol: null, id: null };

        const ipType = getIPType(ip);

        if (ipType === 'cdata') {
            const parts = interface_.split(':');
            if (parts.length === 2) {
                const portNumber = parseInt(parts[0], 10);
                return {
                    stvol: portNumber.toString(),
                    id: parts[1]
                };
            }
        }

        return { stvol: null, id: null };
    }

    // ==================== ФУНКЦИИ ДЛЯ ИЗВЛЕЧЕНИЯ ДАННЫХ ====================

    function extractContractNumber() {
        try {
            const items = document.querySelectorAll('.item');
            for (let item of items) {
                const leftData = item.querySelector('.left_data');
                if (leftData && leftData.textContent.includes('Договор:')) {
                    const contractText = item.querySelector('div:not(.left_data)')?.textContent || '';
                    const match = contractText.match(/(\d+)/);
                    if (match) {
                        return match[1];
                    }
                }
            }

            const allDivs = document.querySelectorAll('div');
            for (let div of allDivs) {
                if (div.textContent.includes('Договор:')) {
                    const text = div.textContent;
                    const match = text.match(/\b(\d{5,})\b/);
                    if (match) {
                        return match[1];
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    function getIPType(ip) {
        if (CDATA_IPS.includes(ip)) return 'cdata';
        if (LTE_IPS.includes(ip)) return 'lte';
        return 'other';
    }

    function extractInterfaceNumber(interface_) {
        if (!interface_) return null;
        const hashMatch = interface_.match(/#:(\d+)/);
        if (hashMatch) return hashMatch[1];
        const colonMatch = interface_.match(/(\d+):(\d+)/);
        if (colonMatch) return interface_;
        if (/^\d+$/.test(interface_)) return interface_;
        return interface_;
    }

    function processInterface(interface_, ip) {
        if (!interface_ || !ip) return interface_;
        const ipType = getIPType(ip);

        if (ipType === 'cdata') {
            const parts = interface_.split(':');
            if (parts.length === 2) {
                const portNumber = parseInt(parts[0], 10);
                const subPort = parts[1];
                const newPortNumber = portNumber - 6;
                return `${newPortNumber}:${subPort}`;
            }
        }

        if (ipType === 'lte') {
            const number = extractInterfaceNumber(interface_);
            if (number && !number.includes(':')) return number;
        }

        return interface_;
    }

    function extractData() {
        try {
            const tdElements = document.querySelectorAll('td');
            let ip = null;
            let interface_ = null;
            let sn = null;
            let mac = null;

            tdElements.forEach(td => {
                const html = td.innerHTML;

                const ipMatch = html.match(/IP:\s*([0-9.]+)/);
                if (ipMatch) ip = ipMatch[1];

                const interfaceMatch = html.match(/Interface:\s*([#0-9:]+)/);
                if (interfaceMatch) interface_ = interfaceMatch[1].trim();

                const snMatch = html.match(/s\/n:\s*([A-Z0-9]+)/i);
                if (snMatch) sn = snMatch[1];

                const macMatch = html.match(/MAC:\s*([0-9A-F:]{17})/i);
                if (macMatch) mac = macMatch[1];

                if (!mac) {
                    const altMacMatch = html.match(/([0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2})/i);
                    if (altMacMatch) mac = altMacMatch[1];
                }
            });

            const contract = extractContractNumber();
            currentContract = contract;

            const signal = extractSignalLevel();

            currentData = { ip, interface: interface_, sn, mac, signal };
            return currentData;
        } catch (e) {
            return { ip: null, interface: null, sn: null, mac: null, signal: null };
        }
    }

    // ==================== ФУНКЦИЯ: КОПИРОВАНИЕ ДЛЯ DIAG ====================

    function copyDiagData() {
        const ipType = getIPType(currentData.ip);

        if (ipType !== 'cdata') {
            alert('DIAG доступен только для CDATA');
            return;
        }

        const processedInterface = processInterface(currentData.interface, currentData.ip);
        const { stvol, id } = extractStvolId(processedInterface, currentData.ip);

        if (!currentData.ip || !stvol || !id) {
            alert('Недостаточно данных для DIAG (нужны IP, STVOL и ID)');
            return;
        }

        const diagString = `IP=${currentData.ip} STVOL=${stvol} ID=${id}`;

        if (typeof GM_setClipboard !== 'undefined') {
            GM_setClipboard(diagString);
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(diagString);
        }
        showDiagNotification(diagString);
    }

    function showDiagNotification(diagString) {
        const notification = document.createElement('div');
        notification.textContent = `✅ DIAG: ${diagString}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #9C27B0;
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 1000000;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2000);
    }

    // ==================== ФУНКЦИИ ДЛЯ РАБОТЫ С БУФЕРОМ ====================

    function copyToClipboard(text, button) {
        if (typeof GM_setClipboard !== 'undefined') {
            GM_setClipboard(text);
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
        }

        button.textContent = '✓';
        button.style.backgroundColor = '#4CAF50';
        setTimeout(() => {
            button.textContent = '📋';
            button.style.backgroundColor = '';
        }, 1000);
    }

    // ==================== ФУНКЦИИ ДЛЯ КОПИРОВАНИЯ MAC ====================

    function copyMacToClipboard(mac) {
        if (typeof GM_setClipboard !== 'undefined') {
            GM_setClipboard(mac);
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(mac);
        }

        const notification = document.createElement('div');
        notification.textContent = `✅ MAC ${mac} скопирован`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 1000000;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2000);
    }

    // ==================== ФУНКЦИИ ДЛЯ БИЛЛИНГА ====================

    function openBilling() {
        const baseUrl = 'https://billing.timernet.ru/#accounts';

        if (currentContract) {
            localStorage.setItem('billing_search_contract', currentContract);
            window.open(`${baseUrl}?contract=${currentContract}`, '_blank');
        } else {
            window.open(baseUrl, '_blank');
        }
    }

    // ==================== ФУНКЦИИ ДЛЯ LTE ====================

    function openLteDevice() {
        if (currentData.ip && LTE_IPS.includes(currentData.ip)) {
            const lteUrl = `http://${currentData.ip}/`;
            const lastOctet = currentData.ip.split('.')[3];
            const tabName = `LTE-${lastOctet}`;

            if (currentData.mac) {
                copyMacToClipboard(currentData.mac);
            }

            console.log(`🔍 Открываем LTE ${currentData.ip}, ищем вкладку ${tabName}`);

            const savedTab = lteTabsState[currentData.ip];
            if (savedTab) {
                console.log(`📌 В реестре есть запись для ${tabName} от ${new Date(savedTab.lastSeen).toLocaleTimeString()}`);
            }

            let existingWindow = null;
            try {
                existingWindow = window.open('', tabName);
                console.log(`📌 Поиск по имени ${tabName}: ${existingWindow ? 'НАЙДЕНО' : 'НЕ НАЙДЕНО'}`);
            } catch (e) {}

            if (existingWindow && !existingWindow.closed) {
                console.log(`✅ Найдена существующая вкладка ${tabName}`);

                try {
                    existingWindow.focus();
                } catch (e) {}

                lteTabsState[currentData.ip] = {
                    name: tabName,
                    lastSeen: Date.now(),
                    active: true,
                    url: lteUrl
                };
                saveLteState();

                syncChannel.postMessage({
                    type: 'lte-focused',
                    payload: { ip: currentData.ip, name: tabName },
                    fromWindow: windowId
                });

                showLteNotification(`🔄 Переключились на LTE ${currentData.ip}`, 'info');

            } else {
                console.log(`🆕 Создаем новую вкладку ${tabName}`);
                const newWindow = window.open(lteUrl, tabName);

                if (newWindow) {
                    lteTabsState[currentData.ip] = {
                        name: tabName,
                        lastSeen: Date.now(),
                        active: true,
                        url: lteUrl
                    };
                    saveLteState();

                    syncChannel.postMessage({
                        type: 'lte-opened',
                        payload: { ip: currentData.ip, name: tabName, url: lteUrl },
                        fromWindow: windowId
                    });

                    showLteNotification(`✅ Открыта LTE ${currentData.ip}`, 'success');
                }
            }
        }
    }

    // ==================== ФУНКЦИИ УПРАВЛЕНИЯ LTE ====================
function performOpenAllLte() {
    console.log('🚀 ===== ОТКРЫТИЕ ВСЕХ LTE =====');

    let opened = 0;
    let currentIndex = 0;

    // Создаем массив с задержками
    const delays = [100, 300, 500, 700, 900, 1100, 1300, 1500, 1700, 1900, 2100];

    function openNextTab() {
        if (currentIndex >= LTE_IPS.length) {
            showLteNotification(`🚀 Открыто ${opened} LTE вкладок`, 'success');
            return;
        }

        const ip = LTE_IPS[currentIndex];
        const lteUrl = `http://${ip}/`;
        const lastOctet = ip.split('.')[3];
        const tabName = `LTE-${lastOctet}`;

        console.log(`🔄 Открываем ${tabName} с задержкой ${delays[currentIndex]}мс`);

        // Используем setTimeout с увеличивающейся задержкой
        setTimeout(() => {
            const newWindow = window.open(lteUrl, tabName);

            if (newWindow) {
                opened++;

                lteTabsState[ip] = {
                    name: tabName,
                    lastSeen: Date.now(),
                    active: true,
                    url: lteUrl
                };

                syncChannel.postMessage({
                    type: 'lte-opened',
                    payload: { ip, name: tabName, url: lteUrl },
                    fromWindow: windowId
                });

                console.log(`✅ Открыта ${tabName} (${opened}/${LTE_IPS.length})`);
            } else {
                console.log(`❌ Не удалось открыть ${tabName}`);
            }

            currentIndex++;
            openNextTab(); // Рекурсивно вызываем следующую
        }, delays[currentIndex]);
    }

    saveLteState();
    openNextTab(); // Запускаем без начальной задержки
}
  function openAllLteTabs() {
    console.log('🚀 Запрос на открытие всех LTE вкладок');

    if (isMasterWindow) {
        performOpenAllLte();
    } else {
        syncChannel.postMessage({
            type: 'open-all-request',
            fromWindow: windowId
        });
        showLteNotification('🔄 Запрос на открытие всех LTE отправлен', 'info');
    }
}

    function closeAllLteTabs() {
        console.log('🚪 ===== ЗАКРЫТИЕ ВСЕХ LTE =====');
        console.log(`   Текущий реестр ДО:`, {...lteTabsState});

        if (Object.keys(lteTabsState).length === 0 && !isMasterWindow) {
            console.log('🔄 Реестр пуст, запрашиваем состояние у главного окна...');

            syncChannel.postMessage({
                type: 'state-request',
                fromWindow: windowId,
                forClose: true
            });

            setTimeout(() => {
                if (Object.keys(lteTabsState).length > 0) {
                    console.log(`📦 Получено состояние, пробуем закрыть`);
                    performClose();
                } else {
                    console.log('❌ Не удалось получить состояние, пробуем закрыть по списку IP');
                    closeByIpList();
                }
            }, 1000);

            return;
        }

        performClose();
    }

    function performClose() {
        let closed = 0;
        const tabsToClose = {...lteTabsState};

        console.log(`🔍 Пытаемся закрыть ${Object.keys(tabsToClose).length} вкладок:`);

        Object.keys(tabsToClose).forEach(ip => {
            const tabInfo = tabsToClose[ip];
            console.log(`   - ${tabInfo.name} (${ip})`);

            try {
                const win = window.open('', tabInfo.name);
                if (win && !win.closed) {
                    win.close();
                    closed++;
                    console.log(`   ✅ Закрыта ${tabInfo.name}`);

                    syncChannel.postMessage({
                        type: 'lte-closed',
                        payload: { ip, name: tabInfo.name },
                        fromWindow: windowId
                    });
                } else {
                    console.log(`   ❌ Вкладка ${tabInfo.name} не найдена`);
                }
            } catch (e) {
                console.log(`   ⚠️ Ошибка при закрытии ${tabInfo.name}:`, e);
            }
        });

        lteTabsState = {};
        saveLteState();

        syncChannel.postMessage({
            type: 'lte-closed-all',
            payload: { closedCount: closed },
            fromWindow: windowId
        });

        console.log(`🚪 ИТОГ: закрыто ${closed} вкладок`);
        showLteNotification(`🚪 Закрыто ${closed} LTE вкладок`, closed > 0 ? 'info' : 'warning');
    }

    function closeByIpList() {
        console.log('🔍 Закрываем по списку IP...');
        let closed = 0;

        LTE_IPS.forEach(ip => {
            const lastOctet = ip.split('.')[3];
            const tabName = `LTE-${lastOctet}`;

            try {
                const win = window.open('', tabName);
                if (win && !win.closed) {
                    win.close();
                    closed++;
                    console.log(`   ✅ Закрыта ${tabName}`);
                }
            } catch (e) {}
        });

        if (closed > 0) {
            lteTabsState = {};
            saveLteState();

            syncChannel.postMessage({
                type: 'lte-closed-all',
                payload: { closedCount: closed },
                fromWindow: windowId
            });
        }

        console.log(`🚪 ИТОГ (по списку): закрыто ${closed} вкладок`);
        showLteNotification(`🚪 Закрыто ${closed} LTE вкладок`, closed > 0 ? 'info' : 'warning');
    }

    function showLteNotification(message, type = 'success') {
        const colors = {
            success: '#4CAF50',
            info: '#2196F3',
            warning: '#FF9800',
            error: '#f44336'
        };

        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${colors[type]};
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 1000000;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2000);
    }

    // ==================== ДОБАВЛЕНИЕ КНОПОК УПРАВЛЕНИЯ ====================

    function addLteControls(content) {
        const controlsDiv = document.createElement('div');
        controlsDiv.style.cssText = `
            display: flex;
            gap: 8px;
            margin-top: 10px;
            border-top: 1px solid #e0e0e0;
            padding-top: 10px;
        `;

        controlsDiv.innerHTML = `
            <button id="open-all-lte-btn" style="
                flex: 1;
                background: #FF9800;
                border: none;
                border-radius: 6px;
                padding: 8px;
                color: white;
                font-family: 'Orbitron', sans-serif;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
            ">🚀 ОТКРЫТЬ ВСЕ LTE</button>
            <button id="close-all-lte-btn" style="
                flex: 1;
                background: #f44336;
                border: none;
                border-radius: 6px;
                padding: 8px;
                color: white;
                font-family: 'Orbitron', sans-serif;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
            ">🚪 ЗАКРЫТЬ ВСЕ</button>
            <button id="test-reminder-btn" style="
                flex: 0.5;
                background: #9C27B0;
                border: none;
                border-radius: 6px;
                padding: 8px;
                color: white;
                font-family: 'Orbitron', sans-serif;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
            ">⏰ ТЕСТ</button>
        `;

        content.appendChild(controlsDiv);

        document.getElementById('open-all-lte-btn')?.addEventListener('click', openAllLteTabs);
        document.getElementById('close-all-lte-btn')?.addEventListener('click', closeAllLteTabs);
        document.getElementById('test-reminder-btn')?.addEventListener('click', testReminder);
    }

    // ==================== СОЗДАНИЕ ОКНА ====================

    function createFloatingWindow() {
        if (document.getElementById('userside-up-window')) {
            return document.getElementById('userside-up-window');
        }

        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);

        const container = document.createElement('div');
        container.id = 'userside-container';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 999998;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
        `;

        const iconsWrapper = document.createElement('div');
        iconsWrapper.style.cssText = `
            position: relative;
            width: 142px; /* Увеличено для короны */
            height: 32px;
            margin-bottom: -2px;
            align-self: flex-start;
            margin-left: 20px;
        `;

        // Иконка для перехода в биллинг
        const billingIcon = document.createElement('div');
        billingIcon.id = 'billing-nav-icon';
        billingIcon.style.cssText = `
            position: absolute;
            left: 0;
            bottom: 0;
            width: 42px;
            height: 12px;
            background: linear-gradient(135deg, #1E88E5, #1565C0);
            border: none;
            border-radius: 12px 12px 0px 0px;
            box-shadow: 0 -2px 8px rgba(30, 136, 229, 0.3);
            cursor: pointer;
            overflow: hidden;
            transition: height 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
            pointer-events: auto;
            z-index: 999999;
        `;

        const billingLogo = document.createElement('img');
        billingLogo.src = 'https://play-lh.googleusercontent.com/9Udpe1829g66-5-b19xOkTlbcMhA_zo9ak3k-MU48GjwDeibwrdEMshIFZVfvMxmd1Ju';
        billingLogo.style.cssText = `
            width: 26px;
            height: 26px;
            object-fit: contain;
            pointer-events: none;
            position: absolute;
            bottom: -14px;
            left: 50%;
            transform: translateX(-50%);
            transition: bottom 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
            z-index: 2;
        `;

        billingIcon.appendChild(billingLogo);

        const billingTooltip = document.createElement('div');
        billingTooltip.textContent = 'Переход в BILLING с поиском по договору';
        billingTooltip.style.cssText = `
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            white-space: nowrap;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
            font-family: 'Orbitron', Arial, sans-serif;
            z-index: 1000000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
            margin-bottom: 8px;
        `;

        billingIcon.appendChild(billingTooltip);

        billingIcon.onmouseover = () => {
            billingIcon.style.height = '32px';
            billingIcon.style.background = 'linear-gradient(135deg, #1565C0, #0D47A1)';
            billingLogo.style.bottom = '3px';
            billingTooltip.style.opacity = '1';
        };

        billingIcon.onmouseout = () => {
            billingIcon.style.height = '12px';
            billingIcon.style.background = 'linear-gradient(135deg, #1E88E5, #1565C0)';
            billingLogo.style.bottom = '-14px';
            billingTooltip.style.opacity = '0';
        };

        billingIcon.onclick = openBilling;

        // Иконка для LTE
        const lteIcon = document.createElement('div');
        lteIcon.id = 'lte-nav-icon';
        lteIcon.style.cssText = `
            position: absolute;
            left: 50px; /* Сдвинуто для места под корону */
            bottom: 0;
            width: 42px;
            height: 12px;
            background: linear-gradient(135deg, #64B5F6, #42A5F5);
            border: none;
            border-radius: 12px 12px 0px 0px;
            box-shadow: 0 -2px 8px rgba(100, 181, 246, 0.3);
            cursor: pointer;
            overflow: hidden;
            transition: height 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
            pointer-events: auto;
            z-index: 999999;
            display: none;
        `;

        const lteText = document.createElement('span');
        lteText.textContent = 'LTE';
        lteText.style.cssText = `
            color: white;
            font-family: 'Orbitron', Arial, sans-serif;
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.5px;
            position: absolute;
            bottom: -3px;
            left: 50%;
            transform: translateX(-50%);
            pointer-events: none;
            text-shadow: 0 1px 2px rgba(0,0,0,0.2);
            transition: bottom 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
            z-index: 2;
            white-space: nowrap;
        `;

        lteIcon.appendChild(lteText);

        const lteTooltip = document.createElement('div');
        lteTooltip.textContent = 'Переход на LTE (MAC скопирован)';
        lteTooltip.style.cssText = `
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            white-space: nowrap;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
            font-family: 'Orbitron', Arial, sans-serif;
            z-index: 1000000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
            margin-bottom: 8px;
        `;

        lteIcon.appendChild(lteTooltip);

        lteIcon.onmouseover = () => {
            lteIcon.style.height = '32px';
            lteIcon.style.background = 'linear-gradient(135deg, #42A5F5, #2196F3)';
            lteText.style.bottom = '12px';
            lteTooltip.style.opacity = '1';
        };

        lteIcon.onmouseout = () => {
            lteIcon.style.height = '12px';
            lteIcon.style.background = 'linear-gradient(135deg, #64B5F6, #42A5F5)';
            lteText.style.bottom = '-3px';
            lteTooltip.style.opacity = '0';
        };

        lteIcon.onclick = openLteDevice;

        // Иконка короны для принудительного назначения главным
        const crownIcon = document.createElement('div');
        crownIcon.id = 'crown-master-icon';
        crownIcon.style.cssText = `
            position: absolute;
            right: 0;
            bottom: 0;
            width: 42px;
            height: ${isMasterWindow ? '32px' : '12px'};
            background: ${isMasterWindow ? 'linear-gradient(135deg, #FFD700, #FFA500)' : 'linear-gradient(135deg, #FFD700, #FFA500)'};
            border: none;
            border-radius: 12px 12px 0px 0px;
            box-shadow: 0 -2px 8px rgba(255, 215, 0, 0.3);
            cursor: pointer;
            overflow: hidden;
            transition: height 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
            pointer-events: auto;
            z-index: 999999;
            opacity: ${isMasterWindow ? '1' : '0.5'};
        `;

        const crownSymbol = document.createElement('span');
        crownSymbol.textContent = '👑';
        crownSymbol.style.cssText = `
            color: white;
            font-size: 16px;
            font-weight: bold;
            position: absolute;
            bottom: ${isMasterWindow ? '8px' : '-3px'};
            left: 50%;
            transform: translateX(-50%);
            transition: bottom 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
            z-index: 2;
            text-shadow: 0 1px 2px rgba(0,0,0,0.2);
        `;

        crownIcon.appendChild(crownSymbol);

        const crownTooltip = document.createElement('div');
        crownTooltip.textContent = isMasterWindow ? 'Главное окно (нажмите чтобы снять корону)' : 'Сделать это окно главным';
        crownTooltip.style.cssText = `
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            white-space: nowrap;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
            font-family: 'Orbitron', Arial, sans-serif;
            z-index: 1000000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
            margin-bottom: 8px;
        `;

        crownIcon.appendChild(crownTooltip);

        crownIcon.onmouseover = () => {
            crownIcon.style.height = '32px';
            crownSymbol.style.bottom = '8px';
            crownTooltip.style.opacity = '1';
        };

        crownIcon.onmouseout = () => {
            crownIcon.style.height = isMasterWindow ? '32px' : '12px';
            crownSymbol.style.bottom = isMasterWindow ? '8px' : '-3px';
            crownTooltip.style.opacity = '0';
        };

        crownIcon.onclick = () => {
            if (isMasterWindow) {
                // Если уже главное - снимаем корону
                forceMaster = false;
                isMasterWindow = false;
                localStorage.removeItem('userside_master_window');
                crownIcon.style.height = '12px';
                crownSymbol.style.bottom = '-3px';
                crownIcon.style.opacity = '0.5';
                crownTooltip.textContent = 'Сделать это окно главным';
                showLteNotification('👑 Корона снята', 'info');

                // Запускаем обычный выбор главного окна
                checkMasterWindow();
            } else {
                // Делаем это окно главным
                forceMasterWindow();
                crownIcon.style.height = '32px';
                crownSymbol.style.bottom = '8px';
                crownIcon.style.opacity = '1';
                crownTooltip.textContent = 'Главное окно (нажмите чтобы снять корону)';
            }
        };

        iconsWrapper.appendChild(billingIcon);
        iconsWrapper.appendChild(lteIcon);
        iconsWrapper.appendChild(crownIcon);

        // Создаем окно
        const window = document.createElement('div');
        window.id = 'userside-up-window';
        window.style.cssText = `
            width: 320px;
            background: white;
            border-radius: 12px;
            padding: 0;
            box-shadow: 0 8px 32px rgba(33, 150, 243, 0.2);
            font-family: 'Orbitron', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 12px;
            color: #2c3e50;
            border: 1px solid rgba(33, 150, 243, 0.2);
        `;

        // Заголовок с градиентом
        const header = document.createElement('div');
        header.style.cssText = `
            background: linear-gradient(135deg, #2196F3, #1976D2);
            padding: 14px 18px;
            border-radius: 11px 11px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
            border-bottom: 1px solid rgba(255, 255, 255, 0.15);
        `;

        const titleSpan = document.createElement('span');
        titleSpan.innerHTML = 'USERSIDE UP';
        titleSpan.style.cssText = `
            font-family: 'Orbitron', sans-serif;
            font-size: 16px;
            font-weight: 700;
            letter-spacing: 1.5px;
            color: white;
            text-shadow: 0 2px 10px rgba(255, 255, 255, 0.3);
        `;

        const headerButtons = document.createElement('div');
        headerButtons.style.cssText = `
            display: flex;
            gap: 8px;
            align-items: center;
        `;

        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'toggle-btn';
        toggleBtn.innerHTML = '−';
        toggleBtn.style.cssText = `
            background: rgba(255,255,255,0.2);
            border: none;
            font-size: 20px;
            font-weight: 500;
            cursor: pointer;
            color: white;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            transition: all 0.2s ease;
            padding: 0;
            line-height: 1;
        `;
        toggleBtn.onmouseover = () => {
            toggleBtn.style.transform = 'scale(1.1)';
            toggleBtn.style.background = 'rgba(255,255,255,0.3)';
        };
        toggleBtn.onmouseout = () => {
            toggleBtn.style.transform = 'scale(1)';
            toggleBtn.style.background = 'rgba(255,255,255,0.2)';
        };
        toggleBtn.title = 'Свернуть';

        const closeBtn = document.createElement('button');
        closeBtn.id = 'close-btn';
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            background: rgba(255,255,255,0.2);
            border: none;
            font-size: 22px;
            font-weight: 500;
            cursor: pointer;
            color: white;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            transition: all 0.2s ease;
            padding: 0;
            line-height: 1;
        `;
        closeBtn.onmouseover = () => {
            closeBtn.style.transform = 'scale(1.1)';
            closeBtn.style.background = 'rgba(244, 67, 54, 0.3)';
        };
        closeBtn.onmouseout = () => {
            closeBtn.style.transform = 'scale(1)';
            closeBtn.style.background = 'rgba(255,255,255,0.2)';
        };

        headerButtons.appendChild(toggleBtn);
        headerButtons.appendChild(closeBtn);
        header.appendChild(titleSpan);
        header.appendChild(headerButtons);

        const content = document.createElement('div');
        content.id = 'data-content';
        content.style.cssText = `
            padding: 18px;
            transition: all 0.3s ease;
            display: block;
            background: white;
        `;

        window.appendChild(header);
        window.appendChild(content);

        container.appendChild(iconsWrapper);
        container.appendChild(window);
        document.body.appendChild(container);

        return { container, window, content, toggleBtn, closeBtn, header, lteIcon, crownIcon };
    }

    // ==================== СТИЛИ ====================

    GM_addStyle(`
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }

        .data-row {
            display: flex;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #f0f0f0;
            gap: 8px;
        }
        .data-label {
            font-weight: 600;
            color: #546e7a;
            min-width: 70px;
            font-size: 12px;
            text-transform: uppercase;
        }
        .data-value {
            flex: 1;
            font-family: monospace;
            color: #1a237e;
            background: #f8f9fa;
            padding: 4px 8px;
            border-radius: 6px;
        }
        .copy-btn {
            background: none;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            cursor: pointer;
            padding: 4px 8px;
            font-size: 14px;
            min-width: 32px;
        }
        .diag-btn {
            background: #9C27B0;
            border: none;
            border-radius: 6px;
            padding: 4px 12px;
            font-size: 12px;
            font-weight: 600;
            color: white;
            cursor: pointer;
            height: 28px;
        }
        .signal-good { background: #c8e6c9 !important; color: #2e7d32 !important; }
        .signal-medium { background: #fff9c4 !important; color: #f57f17 !important; }
        .signal-bad { background: #ffcdd2 !important; color: #c62828 !important; }
    `);

    // ==================== ОБНОВЛЕНИЕ ДАННЫХ ====================

    function updateWindowData(content, data, lteIcon) {
        if (!content) return;

        const ipType = getIPType(data.ip);
        const processedInterface = processInterface(data.interface, data.ip);

        if (lteIcon) {
            lteIcon.style.display = ipType === 'lte' ? 'block' : 'none';
        }

        let signalClass = '';
        if (data.signal) {
            const signalValue = parseFloat(data.signal);
            if (signalValue >= -25) signalClass = 'signal-good';
            else if (signalValue >= -30) signalClass = 'signal-medium';
            else signalClass = 'signal-bad';
        }

        let signalHtml = '';
        if (data.signal) {
            signalHtml = `
                <div class="data-row">
                    <span class="data-label">Сигнал:</span>
                    <span class="data-value ${signalClass}">${data.signal} dBm</span>
                </div>
            `;
        }

        let diagButtonHtml = '';
        if (ipType === 'cdata') {
            diagButtonHtml = `
                <div class="data-row" style="justify-content: flex-end;">
                    <button class="diag-btn" id="diag-copy-btn">🔧 DIAG</button>
                </div>
            `;
        }

        content.innerHTML = `
            ${signalHtml}
            <div class="data-row">
                <span class="data-label">IP:</span>
                <span class="data-value">${data.ip || '-'}</span>
                <button class="copy-btn" id="copy-ip" data-copy-text="${data.ip || ''}">📋</button>
            </div>
            <div class="data-row">
                <span class="data-label">Interface:</span>
                <span class="data-value">${processedInterface || '-'}</span>
                <button class="copy-btn" id="copy-interface" data-copy-text="${processedInterface || ''}">📋</button>
            </div>
            <div id="sn-row" class="data-row" style="display: ${ipType === 'cdata' ? 'flex' : 'none'};">
                <span class="data-label">SN:</span>
                <span class="data-value">${data.sn || '-'}</span>
                <button class="copy-btn" id="copy-sn" data-copy-text="${data.sn || ''}">📋</button>
            </div>
            <div id="mac-row" class="data-row" style="display: ${ipType === 'lte' ? 'flex' : 'none'};">
                <span class="data-label">MAC:</span>
                <span class="data-value">${data.mac || '-'}</span>
                <button class="copy-btn" id="copy-mac" data-copy-text="${data.mac || ''}">📋</button>
            </div>
            ${diagButtonHtml}
        `;

        ['sn', 'mac', 'ip', 'interface'].forEach(id => {
            const btn = document.getElementById(`copy-${id}`);
            if (btn) {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const text = btn.getAttribute('data-copy-text');
                    if (text) copyToClipboard(text, e.target);
                };
            }
        });

        const diagBtn = document.getElementById('diag-copy-btn');
        if (diagBtn) {
            diagBtn.onclick = (e) => {
                e.stopPropagation();
                copyDiagData();
            };
        }

        addLteControls(content);
    }

    // ==================== ИНИЦИАЛИЗАЦИЯ ====================

    function init() {
        console.log(`📊 Инициализация (главное: ${isMasterWindow ? 'ДА' : 'НЕТ'})`);
        console.log(`🔗 URL: ${window.location.href}`);

        loadLteState();

        if (!isCustomerProfile()) {
            return;
        }

        setTimeout(() => {
            const data = extractData();
            if (data.ip && data.interface) {
                const elements = createFloatingWindow();
                dataWindow = elements.window;

                const header = elements.header;
                const content = elements.content;
                const toggleBtn = elements.toggleBtn;
                const closeBtn = elements.closeBtn;
                const container = elements.container;
                const lteIcon = elements.lteIcon;

                let isDragging = false;
                let offsetX, offsetY;

                header.onmousedown = (e) => {
                    if (e.target === toggleBtn || e.target === closeBtn || e.target.tagName === 'BUTTON') return;
                    isDragging = true;
                    offsetX = e.clientX - container.offsetLeft;
                    offsetY = e.clientY - container.offsetTop;
                };

                document.onmousemove = (e) => {
                    if (isDragging) {
                        container.style.left = (e.clientX - offsetX) + 'px';
                        container.style.top = (e.clientY - offsetY) + 'px';
                        container.style.right = 'auto';
                        container.style.bottom = 'auto';
                    }
                };

                document.onmouseup = () => {
                    isDragging = false;
                };

                updateWindowData(content, data, lteIcon);
            }
        }, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 500);
    }

})();

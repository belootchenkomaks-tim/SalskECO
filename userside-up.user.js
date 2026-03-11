// ==UserScript==
// @name         USERSIDE UP - Data Display
// @namespace    http://tampermonkey.net/
// @version      12.2
// @description  Отображает SN/MAC/IP/Interface/Сигнал + кнопки диагностики + управление LTE вкладками через BroadcastChannel
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

    // Реестр LTE вкладок
    let lteTabsState = {};

    // Уникальный ID этого окна
    const windowId = Math.random().toString(36).substring(2, 9) + '-' + Date.now();
    const windowShortId = windowId.split('-')[0];
    const currentHost = window.location.hostname;

    // Флаги
    let hasRequestedState = false;
    let reminderShown = false;
    let isMasterWindow = false;
    let forceMaster = false;

    // ==================== BROADCAST CHANNEL ====================

    const syncChannel = new BroadcastChannel('userside-lte-sync');

    // ==================== ЛОГИРОВАНИЕ ====================

    function log(emoji, message, data = null) {
        const time = new Date().toLocaleTimeString();
        const prefix = `[${time}] ${emoji} ${windowShortId}`;

        if (data) {
            console.log(`${prefix} ${message}`, data);
        } else {
            console.log(`${prefix} ${message}`);
        }
    }

    // ==================== ПРОВЕРКА СТРАНИЦЫ ====================

    function isCustomerProfile() {
        const url = window.location.href;
        return url.includes('core_section=customer') || url.includes('core_section=customer_info');
    }

    // ==================== ФУНКЦИИ ДЛЯ LTE ====================

    function openLteDevice() {
        if (!currentData.ip || !LTE_IPS.includes(currentData.ip)) return;

        const lteIp = currentData.ip;
        const lastOctet = lteIp.split('.')[3];
        const lteName = `LTE-${lastOctet}`;

        if (currentData.mac) copyMacToClipboard(currentData.mac);

        log('🔍', `=== ОТКРЫТИЕ LTE ${lteIp} ===`);

        // Пытаемся найти существующее окно по имени
        let existingWindow = null;
        try {
            existingWindow = window.open('', lteName);
            log('🔎', `Поиск ${lteName}: ${existingWindow ? 'НАЙДЕНО' : 'НЕ НАЙДЕНО'}`);
        } catch (e) {}

        if (existingWindow && !existingWindow.closed) {
            // Окно существует - просто фокусируемся
            try {
                existingWindow.focus();
                log('👆', `Фокус на ${lteName}`);
                showLteNotification(`🔄 Переключились на ${lteName}`, 'info');
                return true;
            } catch (e) {
                log('⚠️', `Не удалось сфокусироваться на ${lteName}`);
            }
        }

        // Окна нет - создаем новое
        log('🆕', `Создаем ${lteName}`);
        const newWindow = window.open(`http://${lteIp}/`, lteName);

        if (newWindow) {
            log('✅', `${lteName} создано`);
            showLteNotification(`✅ Открыта ${lteName}`, 'success');
            return true;
        }

        log('❌', `Не удалось создать ${lteName}`);
        return false;
    }

    // ==================== ОТКРЫТИЕ ВСЕХ LTE ====================

    function openAllLteTabs() {
        log('🚀', '=== ОТКРЫТИЕ ВСЕХ LTE ===');

        if (!isMasterWindow) {
            log('⚠️', 'Только главное окно может открывать все LTE');
            showLteNotification('❌ Только главное окно с короной', 'error');
            return;
        }

        let opened = 0;
        let existing = 0;

        LTE_IPS.forEach((ip, index) => {
            setTimeout(() => {
                const lastOctet = ip.split('.')[3];
                const lteName = `LTE-${lastOctet}`;

                // Проверяем, существует ли уже
                let windowExists = false;
                try {
                    const existingWindow = window.open('', lteName);
                    if (existingWindow && !existingWindow.closed) {
                        windowExists = true;
                        existing++;
                        log('⏩', `${lteName} уже существует`);
                    }
                } catch (e) {}

                if (!windowExists) {
                    log('🆕', `Создаем ${lteName}`);
                    const newWindow = window.open(`http://${ip}/`, lteName);
                    if (newWindow) opened++;
                }

                if (index === LTE_IPS.length - 1) {
                    log('✅', `Открыто ${opened} новых, пропущено ${existing}`);
                    showLteNotification(`🚀 Открыто ${opened} LTE вкладок`, 'success');
                }
            }, index * 500);
        });
    }

    // ==================== ЗАКРЫТИЕ ВСЕХ LTE ====================

    function closeAllLteTabs() {
        log('🚪', '=== ЗАКРЫТИЕ ВСЕХ LTE ===');

        if (!isMasterWindow) {
            log('⚠️', 'Только главное окно может закрывать все LTE');
            showLteNotification('❌ Только главное окно с короной', 'error');
            return;
        }

        let closed = 0;

        LTE_IPS.forEach(ip => {
            const lastOctet = ip.split('.')[3];
            const lteName = `LTE-${lastOctet}`;

            try {
                const win = window.open('', lteName);
                if (win && !win.closed) {
                    win.close();
                    closed++;
                    log('✅', `Закрыта ${lteName}`);
                }
            } catch (e) {}
        });

        log('🚪', `Закрыто ${closed} вкладок`);
        showLteNotification(`🚪 Закрыто ${closed} LTE вкладок`, 'info');
    }

    // ==================== ВЫБОР ГЛАВНОГО ОКНА ====================

    function makeThisWindowMaster() {
        isMasterWindow = true;
        window.name = 'USERSIDE_MASTER';
        log('👑', '🚀🚀🚀 ЭТО ОКНО СТАЛО ГЛАВНЫМ (ручное назначение) 🚀🚀🚀');
        updateCrownIcon();
        showLteNotification('👑 Это окно теперь ГЛАВНОЕ', 'success');
    }

    function removeMasterFromThisWindow() {
        isMasterWindow = false;
        window.name = '';
        log('👑', 'Корона снята с этого окна');
        updateCrownIcon();
        showLteNotification('👑 Корона снята', 'info');
    }

    // ==================== ИЗВЛЕЧЕНИЕ ДАННЫХ ====================

    function extractSignalLevel() {
        try {
            const allDivs = document.querySelectorAll('div');
            for (let div of allDivs) {
                const text = div.textContent;
                const rxMatch = text.match(/Rx.*?\(dBm\):\s*(-?\d+\.?\d*)/i);
                if (rxMatch && rxMatch[1]) return rxMatch[1];
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    function extractContractNumber() {
        try {
            const items = document.querySelectorAll('.item');
            for (let item of items) {
                const leftData = item.querySelector('.left_data');
                if (leftData && leftData.textContent.includes('Договор:')) {
                    const contractText = item.querySelector('div:not(.left_data)')?.textContent || '';
                    const match = contractText.match(/(\d+)/);
                    if (match) return match[1];
                }
            }
            return null;
        } catch (e) {
            return null;
        }
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

    // ==================== КОПИРОВАНИЕ ====================

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

    function copyMacToClipboard(mac) {
        if (typeof GM_setClipboard !== 'undefined') {
            GM_setClipboard(mac);
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(mac);
        }
        showLteNotification(`✅ MAC ${mac} скопирован`, 'success');
    }

    function extractStvolId(interface_, ip) {
        if (!interface_ || !ip) return { stvol: null, id: null };
        const ipType = getIPType(ip);
        if (ipType === 'cdata') {
            const parts = interface_.split(':');
            if (parts.length === 2) {
                const portNumber = parseInt(parts[0], 10);
                return { stvol: portNumber.toString(), id: parts[1] };
            }
        }
        return { stvol: null, id: null };
    }

    // ==================== НОВЫЕ ФУНКЦИИ ДИАГНОСТИКИ ====================

    function copyDiagnosticAbonent() {
        const ipType = getIPType(currentData.ip);
        if (ipType !== 'cdata') {
            alert('Диагностика доступна только для CDATA');
            return;
        }

        const processedInterface = processInterface(currentData.interface, currentData.ip);
        const parts = processedInterface.split(':');

        if (parts.length !== 2) {
            alert('Недостаточно данных для диагностики');
            return;
        }

        const diagString = `IP=${currentData.ip} STVOL=${parts[0]} ID=${parts[1]}`;

        if (typeof GM_setClipboard !== 'undefined') {
            GM_setClipboard(diagString);
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(diagString);
        }
        showLteNotification(`✅ Диагностика абонента: ${diagString}`, 'info');
    }

    function copyDiagnosticStvol() {
        const ipType = getIPType(currentData.ip);
        if (ipType !== 'cdata') {
            alert('Диагностика доступна только для CDATA');
            return;
        }

        const processedInterface = processInterface(currentData.interface, currentData.ip);
        const parts = processedInterface.split(':');

        if (parts.length !== 2) {
            alert('Недостаточно данных для диагностики');
            return;
        }

        const diagString = `IP=${currentData.ip} STVOL=${parts[0]}`;

        if (typeof GM_setClipboard !== 'undefined') {
            GM_setClipboard(diagString);
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(diagString);
        }
        showLteNotification(`✅ Диагностика ствола: ${diagString}`, 'info');
    }

    // ==================== БИЛЛИНГ ====================

    function openBilling() {
        const baseUrl = 'https://billing.timernet.ru/#accounts';
        if (currentContract) {
            window.open(`${baseUrl}?contract=${currentContract}`, '_blank');
        } else {
            window.open(baseUrl, '_blank');
        }
    }

    // ==================== НАПОМИНАЛКА ====================

    function showReminder() {
        const reminder = document.createElement('div');
        reminder.id = 'lte-reminder';
        reminder.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 15px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 24px;">⏰</span>
                    <span style="font-size: 18px; font-weight: bold;">16:50 - Время закрывать LTE!</span>
                </div>
                <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 10px;">
                    <button id="reminder-close-btn" style="background: #9e9e9e; border: none; border-radius: 6px; padding: 8px 16px; color: white; font-family: 'Orbitron', sans-serif; font-size: 12px; font-weight: 600; cursor: pointer;">Закрыть</button>
                    <button id="reminder-close-lte-btn" style="background: #f44336; border: none; border-radius: 6px; padding: 8px 16px; color: white; font-family: 'Orbitron', sans-serif; font-size: 12px; font-weight: 600; cursor: pointer;">🚪 ЗАКРЫТЬ ВСЕ LTE</button>
                </div>
            </div>
        `;

        reminder.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: linear-gradient(135deg, #FF9800, #F57C00); color: white; padding: 25px; border-radius: 16px; font-family: 'Orbitron', Arial, sans-serif; font-size: 14px; z-index: 1000000; box-shadow: 0 10px 40px rgba(0,0,0,0.3); border: 2px solid rgba(255,255,255,0.3); min-width: 350px; animation: reminderAppear 0.3s ease;`;

        document.body.appendChild(reminder);

        document.getElementById('reminder-close-btn')?.addEventListener('click', () => reminder.remove());
        document.getElementById('reminder-close-lte-btn')?.addEventListener('click', () => {
            reminder.remove();
            closeAllLteTabs();
        });
    }

    function checkReminderTime() {
        const now = new Date();
        const mskTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
        const hours = mskTime.getHours();
        const minutes = mskTime.getMinutes();

        if (hours === 0 && minutes === 0) reminderShown = false;
        if (hours === 16 && minutes === 50 && !reminderShown) {
            log('⏰', 'Время 16:50 - показываем напоминание');
            showReminder();
            reminderShown = true;
        }
    }

    setInterval(checkReminderTime, 30000);
    checkReminderTime();

    // ==================== УВЕДОМЛЕНИЯ ====================

    function showLteNotification(message, type = 'success') {
        const colors = { success: '#4CAF50', info: '#2196F3', warning: '#FF9800', error: '#f44336' };
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

    // ==================== КНОПКИ УПРАВЛЕНИЯ ====================

    function addLteControls(content) {
        const controlsDiv = document.createElement('div');
        controlsDiv.style.cssText = `display: flex; gap: 8px; margin-top: 10px; border-top: 1px solid #e0e0e0; padding-top: 10px;`;

        controlsDiv.innerHTML = `
            <button id="open-all-lte-btn" style="flex: 1; background: #FF9800; border: none; border-radius: 6px; padding: 8px; color: white; font-family: 'Orbitron', sans-serif; font-size: 11px; font-weight: 600; cursor: pointer;">🚀 ОТКРЫТЬ ВСЕ LTE</button>
            <button id="close-all-lte-btn" style="flex: 1; background: #f44336; border: none; border-radius: 6px; padding: 8px; color: white; font-family: 'Orbitron', sans-serif; font-size: 11px; font-weight: 600; cursor: pointer;">🚪 ЗАКРЫТЬ ВСЕ</button>
            <button id="test-reminder-btn" style="flex: 0.5; background: #9C27B0; border: none; border-radius: 6px; padding: 8px; color: white; font-family: 'Orbitron', sans-serif; font-size: 11px; font-weight: 600; cursor: pointer;">⏰ ТЕСТ</button>
        `;

        content.appendChild(controlsDiv);

        document.getElementById('open-all-lte-btn')?.addEventListener('click', openAllLteTabs);
        document.getElementById('close-all-lte-btn')?.addEventListener('click', closeAllLteTabs);
        document.getElementById('test-reminder-btn')?.addEventListener('click', () => {
            log('🧪', 'Тестовый показ напоминалки');
            showReminder();
        });
    }

    // ==================== ОБНОВЛЕНИЕ КОРОНЫ ====================

    function updateCrownIcon() {
        const crownIcon = document.getElementById('crown-master-icon');
        if (!crownIcon) return;

        const crownSymbol = crownIcon.querySelector('span');
        const crownTooltip = crownIcon.querySelector('div:last-child');

        if (crownSymbol && crownTooltip) {
            if (isMasterWindow) {
                crownIcon.style.height = '32px';
                crownSymbol.style.bottom = '8px';
                crownIcon.style.opacity = '1';
                crownTooltip.textContent = 'Главное окно (нажмите чтобы снять корону)';
            } else {
                crownIcon.style.height = '12px';
                crownSymbol.style.bottom = '-3px';
                crownIcon.style.opacity = '0.5';
                crownTooltip.textContent = 'Сделать это окно главным';
            }
        }
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
        container.style.cssText = `position: fixed; bottom: 20px; right: 20px; z-index: 999998; display: flex; flex-direction: column; align-items: flex-end;`;

        const iconsWrapper = document.createElement('div');
        iconsWrapper.style.cssText = `position: relative; width: 142px; height: 32px; margin-bottom: -2px; align-self: flex-start; margin-left: 20px;`;

        // Иконка биллинга
        const billingIcon = document.createElement('div');
        billingIcon.id = 'billing-nav-icon';
        billingIcon.style.cssText = `position: absolute; left: 0; bottom: 0; width: 42px; height: 12px; background: linear-gradient(135deg, #1E88E5, #1565C0); border: none; border-radius: 12px 12px 0px 0px; box-shadow: 0 -2px 8px rgba(30, 136, 229, 0.3); cursor: pointer; overflow: hidden; transition: height 0.22s cubic-bezier(0.34, 1.56, 0.64, 1); pointer-events: auto; z-index: 999999;`;

        const billingLogo = document.createElement('img');
        billingLogo.src = 'https://play-lh.googleusercontent.com/9Udpe1829g66-5-b19xOkTlbcMhA_zo9ak3k-MU48GjwDeibwrdEMshIFZVfvMxmd1Ju';
        billingLogo.style.cssText = `width: 26px; height: 26px; object-fit: contain; pointer-events: none; position: absolute; bottom: -14px; left: 50%; transform: translateX(-50%); transition: bottom 0.22s; z-index: 2;`;

        billingIcon.appendChild(billingLogo);

        const billingTooltip = document.createElement('div');
        billingTooltip.textContent = 'Переход в BILLING';
        billingTooltip.style.cssText = `position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: rgba(0, 0, 0, 0.85); color: white; padding: 6px 12px; border-radius: 6px; font-size: 12px; white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity 0.2s ease; font-family: 'Orbitron', Arial, sans-serif; z-index: 1000000; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); margin-bottom: 8px;`;

        billingIcon.appendChild(billingTooltip);

        billingIcon.onmouseover = () => {
            billingIcon.style.height = '32px';
            billingLogo.style.bottom = '3px';
            billingTooltip.style.opacity = '1';
        };

        billingIcon.onmouseout = () => {
            billingIcon.style.height = '12px';
            billingLogo.style.bottom = '-14px';
            billingTooltip.style.opacity = '0';
        };

        billingIcon.onclick = openBilling;

        // Иконка LTE
        const lteIcon = document.createElement('div');
        lteIcon.id = 'lte-nav-icon';
        lteIcon.style.cssText = `position: absolute; left: 50px; bottom: 0; width: 42px; height: 12px; background: linear-gradient(135deg, #64B5F6, #42A5F5); border: none; border-radius: 12px 12px 0px 0px; box-shadow: 0 -2px 8px rgba(100, 181, 246, 0.3); cursor: pointer; overflow: hidden; transition: height 0.22s; pointer-events: auto; z-index: 999999; display: none;`;

        const lteText = document.createElement('span');
        lteText.textContent = 'LTE';
        lteText.style.cssText = `color: white; font-family: 'Orbitron', Arial, sans-serif; font-size: 12px; font-weight: 600; position: absolute; bottom: -3px; left: 50%; transform: translateX(-50%); pointer-events: none; text-shadow: 0 1px 2px rgba(0,0,0,0.2); transition: bottom 0.22s; white-space: nowrap;`;

        lteIcon.appendChild(lteText);

        const lteTooltip = document.createElement('div');
        lteTooltip.textContent = 'Переход на LTE (MAC скопирован)';
        lteTooltip.style.cssText = `position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: rgba(0, 0, 0, 0.85); color: white; padding: 6px 12px; border-radius: 6px; font-size: 12px; white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity 0.2s ease; font-family: 'Orbitron', Arial, sans-serif; z-index: 1000000; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); margin-bottom: 8px;`;

        lteIcon.appendChild(lteTooltip);

        lteIcon.onmouseover = () => {
            lteIcon.style.height = '32px';
            lteText.style.bottom = '12px';
            lteTooltip.style.opacity = '1';
        };

        lteIcon.onmouseout = () => {
            lteIcon.style.height = '12px';
            lteText.style.bottom = '-3px';
            lteTooltip.style.opacity = '0';
        };

        lteIcon.onclick = openLteDevice;

        // Иконка короны
        const crownIcon = document.createElement('div');
        crownIcon.id = 'crown-master-icon';
        crownIcon.style.cssText = `position: absolute; right: 0; bottom: 0; width: 42px; height: ${isMasterWindow ? '32px' : '12px'}; background: linear-gradient(135deg, #FFD700, #FFA500); border: none; border-radius: 12px 12px 0px 0px; box-shadow: 0 -2px 8px rgba(255, 215, 0, 0.3); cursor: pointer; overflow: hidden; transition: height 0.22s; pointer-events: auto; z-index: 999999; opacity: ${isMasterWindow ? '1' : '0.5'};`;

        const crownSymbol = document.createElement('span');
        crownSymbol.textContent = '👑';
        crownSymbol.style.cssText = `color: white; font-size: 16px; font-weight: bold; position: absolute; bottom: ${isMasterWindow ? '8px' : '-3px'}; left: 50%; transform: translateX(-50%); transition: bottom 0.22s; z-index: 2; text-shadow: 0 1px 2px rgba(0,0,0,0.2);`;

        crownIcon.appendChild(crownSymbol);

        const crownTooltip = document.createElement('div');
        crownTooltip.textContent = isMasterWindow ? 'Главное окно (нажмите чтобы снять корону)' : 'Сделать это окно главным';
        crownTooltip.style.cssText = `position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: rgba(0, 0, 0, 0.85); color: white; padding: 6px 12px; border-radius: 6px; font-size: 12px; white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity 0.2s ease; font-family: 'Orbitron', Arial, sans-serif; z-index: 1000000; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); margin-bottom: 8px;`;

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
                removeMasterFromThisWindow();
            } else {
                makeThisWindowMaster();
            }
        };

        iconsWrapper.appendChild(billingIcon);
        iconsWrapper.appendChild(lteIcon);
        iconsWrapper.appendChild(crownIcon);

        // Заголовок окна
        const header = document.createElement('div');
        header.style.cssText = `background: linear-gradient(135deg, #2196F3, #1976D2); padding: 14px 18px; border-radius: 11px 11px 0 0; display: flex; justify-content: space-between; align-items: center; cursor: move; border-bottom: 1px solid rgba(255, 255, 255, 0.15);`;

        const titleSpan = document.createElement('span');
        titleSpan.innerHTML = 'USERSIDE UP';
        titleSpan.style.cssText = `font-family: 'Orbitron', sans-serif; font-size: 16px; font-weight: 700; letter-spacing: 1.5px; color: white; text-shadow: 0 2px 10px rgba(255, 255, 255, 0.3);`;

        const headerButtons = document.createElement('div');
        headerButtons.style.cssText = `display: flex; gap: 8px; align-items: center;`;

        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'toggle-btn';
        toggleBtn.innerHTML = '−';
        toggleBtn.style.cssText = `background: rgba(255,255,255,0.2); border: none; font-size: 20px; font-weight: 500; cursor: pointer; color: white; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 6px; transition: all 0.2s ease; padding: 0; line-height: 1;`;

        const closeBtn = document.createElement('button');
        closeBtn.id = 'close-btn';
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `background: rgba(255,255,255,0.2); border: none; font-size: 22px; font-weight: 500; cursor: pointer; color: white; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 6px; transition: all 0.2s ease; padding: 0; line-height: 1;`;

        headerButtons.appendChild(toggleBtn);
        headerButtons.appendChild(closeBtn);
        header.appendChild(titleSpan);
        header.appendChild(headerButtons);

        // Контент окна
        const content = document.createElement('div');
        content.id = 'data-content';
        content.style.cssText = `padding: 18px; transition: all 0.3s ease; display: block; background: white;`;

        // Плавающее окно
        const floatingWindow = document.createElement('div');
        floatingWindow.id = 'userside-up-window';
        floatingWindow.style.cssText = `width: 320px; background: white; border-radius: 12px; padding: 0; box-shadow: 0 8px 32px rgba(33, 150, 243, 0.2); font-family: 'Orbitron', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #2c3e50; border: 1px solid rgba(33, 150, 243, 0.2);`;

        floatingWindow.appendChild(header);
        floatingWindow.appendChild(content);

        container.appendChild(iconsWrapper);
        container.appendChild(floatingWindow);
        document.body.appendChild(container);

        return { container, window: floatingWindow, content, toggleBtn, closeBtn, header, lteIcon, crownIcon };
    }

    // ==================== СТИЛИ ====================

    GM_addStyle(`
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes reminderAppear { from { opacity: 0; transform: translate(-50%, -40%); } to { opacity: 1; transform: translate(-50%, -50%); } }
        .data-row { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0; gap: 8px; }
        .data-label { font-weight: 600; color: #546e7a; min-width: 70px; font-size: 12px; text-transform: uppercase; }
        .data-value { flex: 1; font-family: monospace; color: #1a237e; background: #f8f9fa; padding: 4px 8px; border-radius: 6px; }
        .copy-btn { background: none; border: 1px solid #dee2e6; border-radius: 6px; cursor: pointer; padding: 4px 8px; font-size: 14px; min-width: 32px; }
        .copy-btn:hover { background: rgba(33, 150, 243, 0.1); border-color: #2196F3; }
        .diag-btn { background: #9C27B0; border: none; border-radius: 6px; padding: 8px 12px; font-size: 12px; font-weight: 600; color: white; cursor: pointer; height: 36px; flex: 1; }
        .diag-btn.abonent { background: #2196F3; }
        .diag-btn.abonent:hover { background: #1976D2; }
        .diag-btn.stvol { background: #FF9800; }
        .diag-btn.stvol:hover { background: #F57C00; }
        .signal-good { background: #c8e6c9 !important; color: #2e7d32 !important; }
        .signal-medium { background: #fff9c4 !important; color: #f57f17 !important; }
        .signal-bad { background: #ffcdd2 !important; color: #c62828 !important; }
        .diag-row { display: flex; gap: 8px; margin-top: 12px; }
    `);

    // ==================== ОБНОВЛЕНИЕ ДАННЫХ ====================

    function updateWindowData(content, data, lteIcon) {
        if (!content) return;

        const ipType = getIPType(data.ip);
        const processedInterface = processInterface(data.interface, data.ip);

        if (lteIcon) lteIcon.style.display = ipType === 'lte' ? 'block' : 'none';

        let signalClass = '';
        if (data.signal) {
            const signalValue = parseFloat(data.signal);
            if (signalValue >= -25) signalClass = 'signal-good';
            else if (signalValue >= -30) signalClass = 'signal-medium';
            else signalClass = 'signal-bad';
        }

        const signalHtml = data.signal ? `<div class="data-row"><span class="data-label">Сигнал:</span><span class="data-value ${signalClass}">${data.signal} dBm</span></div>` : '';

        // Новая секция с двумя кнопками диагностики для CDATA
        const diagButtonsHtml = ipType === 'cdata' ? `
            <div class="diag-row">
                <button class="diag-btn abonent" id="diag-abonent-btn">🔍 Абонент</button>
                <button class="diag-btn stvol" id="diag-stvol-btn">📡 Ствол</button>
            </div>
        ` : '';

        content.innerHTML = `
            ${signalHtml}
            <div class="data-row"><span class="data-label">IP:</span><span class="data-value">${data.ip || '-'}</span><button class="copy-btn" id="copy-ip" data-copy-text="${data.ip || ''}">📋</button></div>
            <div class="data-row"><span class="data-label">Interface:</span><span class="data-value">${processedInterface || '-'}</span><button class="copy-btn" id="copy-interface" data-copy-text="${processedInterface || ''}">📋</button></div>
            <div id="sn-row" class="data-row" style="display: ${ipType === 'cdata' ? 'flex' : 'none'};"><span class="data-label">SN:</span><span class="data-value">${data.sn || '-'}</span><button class="copy-btn" id="copy-sn" data-copy-text="${data.sn || ''}">📋</button></div>
            <div id="mac-row" class="data-row" style="display: ${ipType === 'lte' ? 'flex' : 'none'};"><span class="data-label">MAC:</span><span class="data-value">${data.mac || '-'}</span><button class="copy-btn" id="copy-mac" data-copy-text="${data.mac || ''}">📋</button></div>
            ${diagButtonsHtml}
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

        // Новые обработчики для кнопок диагностики
        const diagAbonentBtn = document.getElementById('diag-abonent-btn');
        if (diagAbonentBtn) {
            diagAbonentBtn.onclick = (e) => {
                e.stopPropagation();
                copyDiagnosticAbonent();
            };
        }

        const diagStvolBtn = document.getElementById('diag-stvol-btn');
        if (diagStvolBtn) {
            diagStvolBtn.onclick = (e) => {
                e.stopPropagation();
                copyDiagnosticStvol();
            };
        }

        addLteControls(content);
    }

    // ==================== ИНИЦИАЛИЗАЦИЯ ====================

    function init() {
        log('📊', 'Инициализация...');
        log('🔗', window.location.href);

        if (!isCustomerProfile()) {
            log('⏭️', 'Не профиль абонента, выход');
            return;
        }

        setTimeout(() => {
            const data = extractData();
            if (!data.ip || !data.interface) {
                log('⚠️', 'Нет данных IP/Interface');
                return;
            }

            log('📊', 'Данные извлечены', data);

            const elements = createFloatingWindow();
            if (!elements) return;

            dataWindow = elements.window;
            const header = elements.header;
            const content = elements.content;
            const toggleBtn = elements.toggleBtn;
            const closeBtn = elements.closeBtn;
            const container = elements.container;
            const lteIcon = elements.lteIcon;
            const crownIcon = elements.crownIcon;

            let isDragging = false;
            let offsetX, offsetY;

            if (header) {
                header.onmousedown = (e) => {
                    if (e.target === toggleBtn || e.target === closeBtn || e.target.tagName === 'BUTTON') return;
                    isDragging = true;
                    offsetX = e.clientX - container.offsetLeft;
                    offsetY = e.clientY - container.offsetTop;
                };
            }

            document.onmousemove = (e) => {
                if (isDragging) {
                    container.style.left = (e.clientX - offsetX) + 'px';
                    container.style.top = (e.clientY - offsetY) + 'px';
                    container.style.right = 'auto';
                    container.style.bottom = 'auto';
                }
            };

            document.onmouseup = () => { isDragging = false; };

            if (toggleBtn) {
                toggleBtn.onclick = (e) => {
                    e.stopPropagation();
                    isCollapsed = !isCollapsed;
                    content.style.display = isCollapsed ? 'none' : 'block';
                    toggleBtn.innerHTML = isCollapsed ? '□' : '−';
                    toggleBtn.title = isCollapsed ? 'Развернуть' : 'Свернуть';
                };
            }

            if (closeBtn) {
                closeBtn.onclick = (e) => {
                    e.stopPropagation();
                    container.remove();
                };
            }

            updateWindowData(content, data, lteIcon);
            updateCrownIcon();

            log('✅', 'Инициализация завершена');

        }, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 500);
    }

})();

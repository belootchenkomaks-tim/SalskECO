// ==UserScript==
// @name         USERSIDE UP - Data Display
// @namespace    http://tampermonkey.net/
// @version      5.5
// @description  Отображает SN/MAC/IP/Interface в профиле абонента + иконки перехода
// @author       You
// @match        http://5.59.141.59:8080/oper/*
// @updateURL    https://raw.githubusercontent.com/belootchenkomaks-tim/SalskECO/refs/heads/main/userside-up.user.js
// @downloadURL  https://raw.githubusercontent.com/belootchenkomaks-tim/SalskECO/refs/heads/main/userside-up.user.js
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @run-at       document-idle
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

    // URL биллинга для обратного перехода
    const BILLING_URL = 'https://billing.timernet.ru/';

    // ==================== СОСТОЯНИЕ ====================
    let dataWindow = null;
    let isCollapsed = false;
    let currentData = { ip: null, interface: null, sn: null, mac: null };

    // ==================== ФУНКЦИИ ДЛЯ ПРОВЕРКИ СТРАНИЦЫ ====================
    function isCustomerProfile() {
        const url = window.location.href;
        return url.includes('core_section=customer') || url.includes('core_section=customer_info');
    }

    // ==================== ФУНКЦИИ ДЛЯ ОБРАБОТКИ ДАННЫХ ====================

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

            currentData = { ip, interface: interface_, sn, mac };
            return currentData;
        } catch (e) {
            console.error('Ошибка при извлечении данных:', e);
            return { ip: null, interface: null, sn: null, mac: null };
        }
    }

    // ==================== ФУНКЦИИ ДЛЯ РАБОТЫ С БУФЕРОМ ====================

    function copyToClipboard(text, button) {
        if (typeof GM_setClipboard !== 'undefined') {
            try {
                GM_setClipboard(text);
                showCopySuccess(button);
                return;
            } catch (e) {}
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                showCopySuccess(button);
            }).catch(() => fallbackCopy(text, button));
        } else {
            fallbackCopy(text, button);
        }
    }

    function fallbackCopy(text, button) {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textarea);

            if (successful) {
                showCopySuccess(button);
            } else {
                showCopyError(button, text);
            }
        } catch (err) {
            showCopyError(button, text);
        }
    }

    function showCopySuccess(button) {
        button.textContent = '✓';
        button.style.backgroundColor = '#4CAF50';
        button.style.color = 'white';
        setTimeout(() => {
            button.textContent = '📋';
            button.style.backgroundColor = '';
            button.style.color = '';
        }, 1000);
    }

    function showCopyError(button, text) {
        button.textContent = '✗';
        button.style.backgroundColor = '#f44336';
        button.style.color = 'white';
        setTimeout(() => {
            button.textContent = '📋';
            button.style.backgroundColor = '';
            button.style.color = '';
        }, 1000);
        alert('Не удалось скопировать. Текст:\n\n' + text);
    }

    // Функция для открытия биллинга
    function openBilling() {
        console.log('🌐 Открываем биллинг');
        window.open(BILLING_URL, '_blank');
    }

    // Функция для открытия LTE устройства
    function openLteDevice() {
        if (currentData.ip && LTE_IPS.includes(currentData.ip)) {
            const lteUrl = `http://${currentData.ip}/`;
            console.log('📡 Открываем LTE устройство:', lteUrl);
            window.open(lteUrl, '_blank');
        }
    }

    // ==================== СОЗДАНИЕ ОКНА ====================

    function createFloatingWindow() {
        if (document.getElementById('userside-up-window')) {
            return document.getElementById('userside-up-window');
        }

        // Добавляем шрифт Orbitron
        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);

        // Создаем контейнер
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

        // Контейнер для иконок с фиксированной высотой
        const iconsWrapper = document.createElement('div');
        iconsWrapper.style.cssText = `
            position: relative;
            width: 94px; /* 42px + 42px + 10px gap */
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

        // Тултип для биллинга
        const billingTooltip = document.createElement('div');
        billingTooltip.textContent = 'Переход в BILLING';
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
            right: 0;
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
        lteTooltip.textContent = 'Переход на LTE';
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

        iconsWrapper.appendChild(billingIcon);
        iconsWrapper.appendChild(lteIcon);

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

        // Собираем контейнер
        container.appendChild(iconsWrapper);
        container.appendChild(window);
        document.body.appendChild(container);

        return { container, window, content, toggleBtn, closeBtn, header, lteIcon };
    }

    // ==================== СТИЛИ ====================

    GM_addStyle(`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&display=swap');

        #userside-up-window {
            transition: all 0.3s ease;
        }

        #userside-up-window.collapsed #data-content {
            display: none;
        }

        .data-row {
            display: flex;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #f0f0f0;
            gap: 8px;
        }

        .data-row:last-child {
            border-bottom: none;
        }

        .data-label {
            font-weight: 600;
            color: #546e7a;
            min-width: 70px;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .data-value {
            flex: 1;
            font-family: 'Monaco', 'Menlo', monospace;
            color: #1a237e;
            word-break: break-all;
            font-size: 12px;
            background: #f8f9fa;
            padding: 4px 8px;
            border-radius: 6px;
            border: 1px solid #e9ecef;
            font-weight: 500;
        }

        .copy-btn {
            background: none;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            cursor: pointer;
            padding: 4px 8px;
            font-size: 14px;
            color: #78909c;
            transition: all 0.2s;
            min-width: 32px;
            height: 28px;
        }

        .copy-btn:hover {
            background: rgba(33, 150, 243, 0.1);
            border-color: #2196F3;
            color: #2196F3;
            transform: translateY(-1px);
        }

        #sn-value {
            background: #e8f0fe;
            color: #0d47a1;
        }

        #mac-value {
            background: #fce4ec;
            color: #c2185b;
        }
    `);

    // ==================== ОБНОВЛЕНИЕ ДАННЫХ ====================

    function updateWindowData(content, data, lteIcon) {
        if (!content) return;

        const ipType = getIPType(data.ip);
        const processedInterface = processInterface(data.interface, data.ip);

        // Показываем или скрываем иконку LTE
        if (lteIcon) {
            lteIcon.style.display = ipType === 'lte' ? 'block' : 'none';
        }

        content.innerHTML = `
            <!-- IP строка -->
            <div class="data-row">
                <span class="data-label">IP:</span>
                <span id="ip-value" class="data-value">${data.ip || '-'}</span>
                <button class="copy-btn" id="copy-ip" data-copy-text="${data.ip || ''}">📋</button>
            </div>

            <!-- Interface строка -->
            <div class="data-row">
                <span class="data-label">Interface:</span>
                <span id="interface-value" class="data-value">${processedInterface || '-'}</span>
                <button class="copy-btn" id="copy-interface" data-copy-text="${processedInterface || ''}">📋</button>
            </div>

            <!-- SN строка (для Cdata) -->
            <div id="sn-row" class="data-row" style="display: ${ipType === 'cdata' ? 'flex' : 'none'};">
                <span class="data-label">SN:</span>
                <span id="sn-value" class="data-value">${data.sn || '-'}</span>
                <button class="copy-btn" id="copy-sn" data-copy-text="${data.sn || ''}">📋</button>
            </div>

            <!-- MAC строка (для LTE) -->
            <div id="mac-row" class="data-row" style="display: ${ipType === 'lte' ? 'flex' : 'none'};">
                <span class="data-label">MAC:</span>
                <span id="mac-value" class="data-value">${data.mac || '-'}</span>
                <button class="copy-btn" id="copy-mac" data-copy-text="${data.mac || ''}">📋</button>
            </div>
        `;

        // Добавляем обработчики копирования
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
    }

    // ==================== ИНИЦИАЛИЗАЦИЯ ====================

    function init() {
        console.log('📊 USERSIDE UP инициализация...');

        if (!isCustomerProfile()) {
            console.log('⏭️ Это не профиль абонента');
            return;
        }

        console.log('✅ Это профиль абонента!');

        setTimeout(() => {
            const data = extractData();
            console.log('📊 Данные:', data);

            if (data.ip && data.interface) {
                console.log('📊 Создаем окно');

                const elements = createFloatingWindow();
                dataWindow = elements.window;

                const header = elements.header;
                const content = elements.content;
                const toggleBtn = elements.toggleBtn;
                const closeBtn = elements.closeBtn;
                const container = elements.container;
                const lteIcon = elements.lteIcon;

                // Перетаскивание
                let isDragging = false;
                let offsetX, offsetY;

                header.onmousedown = (e) => {
                    if (e.target === toggleBtn || e.target === closeBtn || e.target.tagName === 'BUTTON') return;
                    isDragging = true;
                    offsetX = e.clientX - container.offsetLeft;
                    offsetY = e.clientY - container.offsetTop;
                    header.style.cursor = 'grabbing';
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
                    header.style.cursor = 'move';
                };

                // Кнопка свернуть/развернуть
                toggleBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (isCollapsed) {
                        content.style.display = 'block';
                        toggleBtn.innerHTML = '−';
                        toggleBtn.title = 'Свернуть';
                    } else {
                        content.style.display = 'none';
                        toggleBtn.innerHTML = '□';
                        toggleBtn.title = 'Развернуть';
                    }
                    isCollapsed = !isCollapsed;
                };

                // Кнопка закрыть
                closeBtn.onclick = (e) => {
                    e.stopPropagation();
                    container.remove();
                };

                updateWindowData(content, data, lteIcon);
            }
        }, 1500);
    }

    // Запуск
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 500);
    }

})();

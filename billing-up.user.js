// ==UserScript==
// @name         BILLING UP
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  Собирает данные с billing.timernet.ru и ищет по номеру договора в USERSIDE
// @author       You
// @match        https://billing.timernet.ru/*
// @updateURL    https://raw.githubusercontent.com/belootchenkomaks-tim/SalskECO/refs/heads/main/billing-up.user.js
// @downloadURL  https://raw.githubusercontent.com/belootchenkomaks-tim/SalskECO/refs/heads/main/billing-up.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Хранилище для данных
    let collectedData = {
        contract: '',
        address: '',
        phone: '',
        vlan: '',
        combined: '',
        originalAddress: ''
    };

    // Добавляем переменную для хранения последнего DESC
    let lastDesc = '';
    // Флаг, что телефон уже был найден для текущего DESC
    let phoneFoundForCurrentDesc = false;

    const USERSIDE_URL = 'http://5.59.141.59:8080/oper/';

    // Функция для транслитерации
    function transliterate(text) {
        text = text.replace(/[ьЪ]/g, '');
        const translitMap = {
            'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
            'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
            'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
            'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
            'ъ': '', 'ы': 'y', 'э': 'e', 'ю': 'yu', 'я': 'ya',
            'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'E',
            'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
            'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
            'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
            'Ъ': '', 'Ы': 'Y', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
        };
        return text.split('').map(char => translitMap[char] || char).join('');
    }

    function cleanSoftSign(text) {
        return text.replace(/[ьЪ]/g, '');
    }

    function getContractNumber() {
        const contractInput = document.querySelector('input[name="agrm_id"]');
        if (contractInput && contractInput.value) {
            let contract = contractInput.value;
            contract = contract.replace(/юлс[-]?/i, 'ULS-');
            if (contract.match(/^ULS\d/)) {
                contract = contract.replace(/^ULS/, 'ULS-');
            }
            return contract;
        }
        return '';
    }

    function getAddress() {
        const allDisplayFields = document.querySelectorAll('.x-form-display-field');
        for (let element of allDisplayFields) {
            const text = element.textContent.trim();
            if (text.includes('Россия') && text.length > 20) {
                return text;
            }
        }
        return '';
    }

    function getPhoneNumber() {
        const currentContract = collectedData.contract;

        // 1. Пробуем найти поле mobile
        const phoneInput = document.querySelector('input[name="mobile"]');
        if (phoneInput && phoneInput.value && phoneInput.value.trim() !== '') {
            if (phoneInput.offsetParent !== null) {
                return phoneInput.value;
            }
        }

        // 2. Ищем все поля ввода
        const allInputs = document.querySelectorAll('input[type="text"], input[type="tel"]');
        for (let input of allInputs) {
            if (input.offsetParent !== null) {
                const value = input.value.trim();
                if (value && (value.startsWith('+7') || value.startsWith('8') || value.startsWith('7')) && value.length >= 10) {
                    const parentForm = input.closest('form, div.x-panel, div.x-tab-panel');
                    if (parentForm) {
                        const contractInForm = parentForm.querySelector('input[name="agrm_id"]');
                        if (contractInForm && contractInForm.value === currentContract) {
                            return value;
                        }
                    }
                }
            }
        }

        // 3. Ищем в текстовых полях
        const displayFields = document.querySelectorAll('.x-form-display-field');
        for (let field of displayFields) {
            if (field.offsetParent !== null) {
                const text = field.textContent.trim();
                if (text && (text.includes('+7') || text.includes('8(') || text.match(/\d{10,}/))) {
                    const parentPanel = field.closest('div.x-panel, div.x-form-item');
                    if (parentPanel) {
                        const contractInPanel = parentPanel.querySelector('input[name="agrm_id"]');
                        if (contractInPanel && contractInPanel.value === currentContract) {
                            const phoneMatch = text.match(/(\+7|8)[0-9\s\-\(\)]{10,}/);
                            if (phoneMatch) {
                                return phoneMatch[0];
                            }
                        }
                    }
                }
            }
        }

        return '';
    }

    function getVlan() {
        const allDisplayFields = document.querySelectorAll('.x-form-display-field');
        for (let element of allDisplayFields) {
            const text = element.textContent.trim();
            if (/^\d+:\d+$/.test(text)) {
                return text.split(':')[1];
            }
        }
        return '';
    }

    function extractAddressParts(address) {
        if (!address) return { street: '', house: '', apartment: '' };

        let street = '', house = '', apartment = '';

        const plMatch = address.match(/пл\s+([^,]+)/i);
        if (plMatch) {
            street = plMatch[1].trim();
            street = street.replace(/["']/g, '').trim();
        }

        if (!street) {
            const perMatch = address.match(/пер\s+([^,]+)/i);
            if (perMatch) {
                street = perMatch[1].trim();
                street = street.replace(/["']/g, '').trim();
            }
        }

        if (!street) {
            const ulMatch = address.match(/ул\s+([^,]+)/i);
            if (ulMatch) {
                street = ulMatch[1].trim();
                street = street.replace(/["']/g, '').trim();
            }
        }

        if (!street) {
            const prMatch = address.match(/пр-кт\s+([^,]+)/i);
            if (prMatch) {
                street = prMatch[1].trim();
                street = street.replace(/["']/g, '').trim();
            }
        }

        if (!street) {
            const prospectMatch = address.match(/проспект\s+([^,]+)/i);
            if (prospectMatch) {
                street = prospectMatch[1].trim();
                street = street.replace(/["']/g, '').trim();
            }
        }

        const houseMatch = address.match(/дом\s+([^,]+)/i);
        if (houseMatch) {
            house = houseMatch[1].trim();
            house = house.replace(/[,"']/g, '').trim();
        }

        const apartmentMatch = address.match(/кв\s+([^,]+)/i);
        if (apartmentMatch) {
            apartment = apartmentMatch[1].trim();
            apartment = apartment.replace(/[,"']/g, '').trim();
        }

        return { street, house, apartment };
    }

    function createCombinedParam(contract, address, parts) {
        if (!contract || !address) return '';

        const { street, house, apartment } = parts;
        let combined = contract;

        if (street) {
            let cleanStreet = transliterate(street);
            cleanStreet = cleanSoftSign(cleanStreet);
            cleanStreet = cleanStreet.replace(/\s+/g, '_');
            cleanStreet = cleanStreet.charAt(0).toUpperCase() + cleanStreet.slice(1).toLowerCase();
            combined += '_' + cleanStreet;
        }

        if (house) {
            let cleanHouse = transliterate(house);
            cleanHouse = cleanSoftSign(cleanHouse);
            cleanHouse = cleanHouse.replace(/\s+/g, '');
            combined += '_' + cleanHouse;
        }

        if (apartment) {
            let cleanApartment = transliterate(apartment);
            cleanApartment = cleanSoftSign(cleanApartment);
            cleanApartment = cleanApartment.replace(/\s+/g, '');
            combined += '_kv' + cleanApartment;
        }

        return cleanSoftSign(combined);
    }

    // Основная функция обновления данных
    function updateCollectedData() {
        const newContract = getContractNumber();
        const newAddress = getAddress();
        const newVlan = getVlan();

        // Полностью обновляем данные, не полагаясь на старые значения
        collectedData.contract = newContract;

        // Обновляем address если есть
        if (newAddress) {
            collectedData.originalAddress = newAddress;
            collectedData.address = newAddress;

            // ВСЕГДА формируем новый combined заново для нового адреса
            const parts = extractAddressParts(newAddress);
            const newCombined = createCombinedParam(newContract, newAddress, parts);

            // Проверяем, изменился ли DESC
            if (newCombined !== lastDesc) {
                console.log('📢 DESC изменился:', lastDesc, '->', newCombined);
                // Полный сброс всех данных
                collectedData.phone = '';
                collectedData.vlan = '';
                collectedData.combined = newCombined;
                lastDesc = newCombined;
                phoneFoundForCurrentDesc = false;
            } else {
                collectedData.combined = newCombined;
            }
        } else {
            collectedData.combined = '';
        }

        // Обновляем VLAN (он всегда берется заново)
        if (newVlan) {
            collectedData.vlan = newVlan;
        } else {
            collectedData.vlan = '';
        }

        // Для телефона - ищем только если еще не найден для этого DESC
        if (!phoneFoundForCurrentDesc) {
            const newPhone = getPhoneNumber();
            if (newPhone) {
                console.log('📞 Найден телефон для текущего абонента:', newPhone);
                collectedData.phone = newPhone;
                phoneFoundForCurrentDesc = true;
            } else {
                collectedData.phone = '';
            }
        }

        console.log('📊 Текущие данные:', {
            contract: collectedData.contract,
            desc: collectedData.combined,
            phone: collectedData.phone,
            vlan: collectedData.vlan,
            phoneFound: phoneFoundForCurrentDesc
        });
    }

    function openUserside() {
        const contractNumber = collectedData.contract;

        if (contractNumber) {
            const searchQuery = contractNumber;
            const encodedQuery = encodeURIComponent(searchQuery);
            const usersideUrl = `http://5.59.141.59:8080/oper/?core_section=dashboard&search=${encodedQuery}`;
            window.open(usersideUrl, '_blank');
        } else {
            window.open('http://5.59.141.59:8080/oper/', '_blank');
        }
    }

    function createWindow() {
        if (document.getElementById('timernet-container')) return;

        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);

        const container = document.createElement('div');
        container.id = 'timernet-container';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 999998;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            opacity: 0.7;
            transition: opacity 0.3s ease;
        `;

        container.onmouseenter = () => {
            container.style.opacity = '1';
        };
        container.onmouseleave = () => {
            container.style.opacity = '0.7';
        };

        // Контейнер для иконок
        const iconsWrapper = document.createElement('div');
        iconsWrapper.style.cssText = `
            position: relative;
            width: 42px;
            height: 32px;
            margin-bottom: -2px;
            align-self: flex-start;
            margin-left: 20px;
        `;

        // Иконка для перехода в USERSIDE
        const usersideIcon = document.createElement('div');
        usersideIcon.id = 'userside-nav-icon';
        usersideIcon.style.cssText = `
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

        const logo = document.createElement('img');
        logo.src = 'https://avatars.githubusercontent.com/u/32836293?s=200&v=4';
        logo.style.cssText = `
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

        usersideIcon.appendChild(logo);

        const tooltip = document.createElement('div');
        tooltip.textContent = 'Переход в USERSIDE';
        tooltip.style.cssText = `
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

        usersideIcon.appendChild(tooltip);

        usersideIcon.onmouseover = () => {
            usersideIcon.style.height = '32px';
            usersideIcon.style.background = 'linear-gradient(135deg, #1565C0, #0D47A1)';
            logo.style.bottom = '3px';
            tooltip.style.opacity = '1';
        };

        usersideIcon.onmouseout = () => {
            usersideIcon.style.height = '12px';
            usersideIcon.style.background = 'linear-gradient(135deg, #1E88E5, #1565C0)';
            logo.style.bottom = '-14px';
            tooltip.style.opacity = '0';
        };

        usersideIcon.onclick = openUserside;

        iconsWrapper.appendChild(usersideIcon);

        const window = document.createElement('div');
        window.id = 'timernet-window';
        window.style.cssText = `
            width: 300px;
            background: white;
            border-radius: 12px;
            padding: 0;
            box-shadow: 0 8px 32px rgba(33, 150, 243, 0.2);
            font-family: 'Orbitron', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 12px;
            color: #2c3e50;
            border: 1px solid rgba(33, 150, 243, 0.2);
        `;

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
        titleSpan.innerHTML = 'BILLING UP';
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
        toggleBtn.innerHTML = '□';
        toggleBtn.style.cssText = `
            background: rgba(255,255,255,0.2);
            border: none;
            font-size: 18px;
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
        toggleBtn.title = 'Развернуть';

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
            display: none;
            background: white;
        `;

        window.appendChild(header);
        window.appendChild(content);

        container.appendChild(iconsWrapper);
        container.appendChild(window);
        document.body.appendChild(container);

        let isCollapsed = true;

        function updateContent() {
            updateCollectedData();

            content.innerHTML = `
                <div style="margin-bottom: 14px; background: #e8f0fe; border-radius: 8px; padding: 10px 14px; border: 1px solid rgba(0, 0, 0, 0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="color: #1976D2; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">DESC</span>
                        <button class="copy-btn" data-copy="${collectedData.combined || ''}" style="background:none; border:none; font-size:15px; cursor:pointer; color:#78909c; width:28px; height:28px; display:flex; align-items:center; justify-content:center; border-radius:6px;">📋</button>
                    </div>
                    <div style="word-break: break-all; font-size: 13px; font-family: 'SF Mono', 'Menlo', monospace; color: #1a237e; line-height: 1.5; font-weight: 500;">${collectedData.combined || '—'}</div>
                </div>

                <div style="margin-bottom: 14px; background: #fce4ec; border-radius: 8px; padding: 10px 14px; border: 1px solid rgba(0, 0, 0, 0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="color: #c2185b; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">ТЕЛЕФОН</span>
                        <button class="copy-btn" data-copy="${collectedData.phone || ''}" style="background:none; border:none; font-size:15px; cursor:pointer; color:#78909c; width:28px; height:28px; display:flex; align-items:center; justify-content:center; border-radius:6px;">📋</button>
                    </div>
                    <div style="word-break: break-all; font-size: 13px; font-family: 'SF Mono', 'Menlo', monospace; color: #880e4f; line-height: 1.5; font-weight: 500;">${collectedData.phone || '—'}</div>
                </div>

                <div style="margin-bottom: 14px; background: #f5f5f5; border-radius: 8px; padding: 10px 14px; border: 1px solid rgba(0, 0, 0, 0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="color: #616161; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">VLAN</span>
                        <button class="copy-btn" data-copy="${collectedData.vlan || ''}" style="background:none; border:none; font-size:15px; cursor:pointer; color:#78909c; width:28px; height:28px; display:flex; align-items:center; justify-content:center; border-radius:6px;">📋</button>
                    </div>
                    <div style="word-break: break-all; font-size: 13px; font-family: 'SF Mono', 'Menlo', monospace; color: #424242; line-height: 1.5; font-weight: 500;">${collectedData.vlan || '—'}</div>
                </div>
            `;

            document.querySelectorAll('.copy-btn').forEach(btn => {
                btn.onmouseover = () => {
                    btn.style.background = 'rgba(33, 150, 243, 0.1)';
                    btn.style.color = '#2196F3';
                };
                btn.onmouseout = () => {
                    btn.style.background = 'none';
                    btn.style.color = '#78909c';
                };
                btn.onclick = function(e) {
                    e.stopPropagation();
                    const text = this.getAttribute('data-copy');
                    if (text && text !== '—') {
                        navigator.clipboard.writeText(text).then(() => {
                            const originalIcon = this.innerHTML;
                            this.innerHTML = '✓';
                            this.style.color = '#4caf50';
                            setTimeout(() => {
                                this.innerHTML = originalIcon;
                                this.style.color = '#78909c';
                            }, 1000);
                        });
                    }
                };
            });
        }

        toggleBtn.onclick = function(e) {
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

        closeBtn.onclick = function(e) {
            e.stopPropagation();
            container.remove();
        };

        let isDragging = false;
        let offsetX, offsetY;

        header.onmousedown = function(e) {
            if (e.target === toggleBtn || e.target === closeBtn || e.target.tagName === 'BUTTON') return;
            isDragging = true;
            offsetX = e.clientX - container.offsetLeft;
            offsetY = e.clientY - container.offsetTop;
            header.style.cursor = 'grabbing';
        };

        document.onmousemove = function(e) {
            if (isDragging) {
                container.style.left = (e.clientX - offsetX) + 'px';
                container.style.top = (e.clientY - offsetY) + 'px';
                container.style.right = 'auto';
                container.style.bottom = 'auto';
            }
        };

        document.onmouseup = function() {
            isDragging = false;
            header.style.cursor = 'move';
        };

        // Запускаем первое обновление
        updateContent();

        // Устанавливаем интервал проверки (каждые 2 секунды)
        setInterval(updateContent, 2000);
    }

    function init() {
        createWindow();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

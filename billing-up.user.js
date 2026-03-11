// ==UserScript==
// @name         BILLING UP
// @namespace    http://tampermonkey.net/
// @version      8.1
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
        ip: '',
        cdataNumber: '',
        vlan: '',
        combined: '',
        originalAddress: ''
    };

    // Добавляем переменную для хранения последнего договора и адреса
    let lastContract = '';
    let lastAddress = '';
    let lastDesc = '';
    let ipFoundForCurrentDesc = false;

    const USERSIDE_URL = 'http://5.59.141.59:8080/oper/';

    const LTE_IPS = [
        '172.18.0.100', '172.18.0.101', '172.18.0.102',
        '172.18.0.103', '172.18.0.104', '172.18.0.105',
        '172.18.0.106', '172.18.0.107', '172.18.0.108',
        '172.18.0.109', '172.18.0.110'
    ];

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
        // Заменяем "юлс" на "ULS_" (с подчеркиванием) для внутреннего использования
        contract = contract.replace(/юлс[-]?/i, 'ULS_');
        if (contract.match(/^ULS\d/)) {
            contract = contract.replace(/^ULS/, 'ULS_');
        }
        return contract;
    }
    return '';
}

function openUserside() {
    saveDataForUserside();

    const contractNumber = collectedData.contract;

    if (contractNumber) {
        // Преобразуем ULS_0065 обратно в ЮЛС-0065 для поиска в USERSIDE
        let searchContract = contractNumber
            .replace(/^ULS_/i, 'ЮЛС-') // ULS_ -> ЮЛС-
            .replace(/^ULS-/i, 'ЮЛС-'); // На всякий случай, если где-то остался дефис

        let address = collectedData.originalAddress || collectedData.address || '';
        const encodedAddress = encodeURIComponent(address);
        const usersideUrl = `http://5.59.141.59:8080/oper/?core_section=customer_list&action=search_page&search=${encodeURIComponent(searchContract)}&address_data=${encodedAddress}from=billing`;

        console.log('🔗 URL для USERSIDE:', usersideUrl);
        window.open(usersideUrl, '_blank');
    }
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

    function getIpAndCdataNumber() {
        const ipPattern = /^(\d+\.\d+\.\d+\.\d+)-/;
        const cdataPattern = /CDATA-(\d+)/i;

        const allDisplayFields = document.querySelectorAll('.x-form-display-field');
        for (let element of allDisplayFields) {
            const text = element.textContent.trim();

            if (text.match(/^\d+\.\d+\.\d+\.\d+-СКАТ-/)) {
                const ipMatch = text.match(ipPattern);
                const cdataMatch = text.match(cdataPattern);

                const ip = ipMatch ? ipMatch[1] : '';
                const cdataNumber = cdataMatch ? cdataMatch[1] : '';

                return { ip, cdataNumber };
            }
        }

        return { ip: '', cdataNumber: '' };
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
    let combined = contract; // Здесь уже будет ULS_0065

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

    // Функция сохранения данных
    function saveDataForUserside() {
        if (collectedData.contract) {
            const addressParts = extractAddressParts(collectedData.originalAddress || '');

            const dataToSave = {
                contract: collectedData.contract,
                address: collectedData.address,
                originalAddress: collectedData.originalAddress,
                street: addressParts.street,
                house: addressParts.house,
                apartment: addressParts.apartment,
                ip: collectedData.ip,
                cdataNumber: collectedData.cdataNumber,
                vlan: collectedData.vlan,
                combined: collectedData.combined,
                timestamp: Date.now()
            };

            localStorage.setItem('timernet_to_userside', JSON.stringify(dataToSave));
            localStorage.setItem('billing_search_contract', collectedData.contract);

            console.log('💾 Данные сохранены для USERSIDE:', dataToSave);
        }
    }

    function openLteDevice() {
        const ip = collectedData.ip;

        if (!ip) {
            console.log('❌ Нет IP для открытия');
            return;
        }

        if (!LTE_IPS.includes(ip)) {
            console.log('❌ IP не входит в диапазон LTE:', ip);
            return;
        }

        const lteUrl = `http://${ip}/home`;
        console.log('📡 Открываем LTE устройство:', lteUrl);

        const tabName = `lte_${ip.replace(/\./g, '_')}`;
        const newTab = window.open(lteUrl, tabName);

        if (newTab) {
            newTab.focus();
        }
    }

  
    // ==================== ЗАПУСК РАСШИРЕНИЯ ====================
    function launchExtension() {
        // ID вашего расширения (замените на реальный ID из chrome://extensions/)
        const extensionId = 'lcbpmlpbkgbojgpolfcblomlhhmoonle';

        // Сохраняем текущие данные
        saveDataForUserside();

        // Сохраняем данные в localStorage для расширения
        localStorage.setItem('billing_tools_data', JSON.stringify(collectedData));

        // Запускаем расширение
        const extensionUrl = `chrome-extension://${extensionId}/floating-panel.html`;
        const popup = window.open(extensionUrl, 'BillingTools', 'width=350,height=500,popup=yes');

        // Даем расширению время на загрузку
        setTimeout(() => {
            if (popup) {
                popup.focus();
            }
        }, 500);
    }

    // Основная функция обновления данных
    function updateCollectedData() {
        const newContract = getContractNumber();
        const newAddress = getAddress();
        const { ip: newIp, cdataNumber: newCdataNumber } = getIpAndCdataNumber();
        const newVlan = getVlan();

        console.log('🔍 Проверка данных:', {
            contract: newContract,
            address: newAddress ? newAddress.substring(0, 50) + '...' : 'нет',
            ip: newIp,
            cdata: newCdataNumber,
            vlan: newVlan
        });

        const contractChanged = newContract !== lastContract;
        const addressChanged = newAddress !== lastAddress;

        if (contractChanged || addressChanged) {
            console.log('📢 Обнаружены изменения');

            collectedData.contract = newContract;
            collectedData.address = newAddress;
            collectedData.originalAddress = newAddress;
            collectedData.ip = newIp;
            collectedData.cdataNumber = newCdataNumber;
            collectedData.vlan = newVlan;

            if (newContract && newAddress) {
                const parts = extractAddressParts(newAddress);
                collectedData.combined = createCombinedParam(newContract, newAddress, parts);
            } else {
                collectedData.combined = '';
            }

            lastContract = newContract;
            lastAddress = newAddress;
            lastDesc = collectedData.combined;
            ipFoundForCurrentDesc = !!newIp;

        } else {
            collectedData.ip = newIp || collectedData.ip;
            collectedData.cdataNumber = newCdataNumber || collectedData.cdataNumber;
            collectedData.vlan = newVlan || collectedData.vlan;

            if (newIp && !ipFoundForCurrentDesc) {
                ipFoundForCurrentDesc = true;
            }
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
            bottom: 60px;
            left: 10px;
            z-index: 999998;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            opacity: 0.7;
            transition: opacity 0.3s ease;
        `;

        container.onmouseenter = () => {
            container.style.opacity = '1';
        };
        container.onmouseleave = () => {
            container.style.opacity = '0.7';
        };

        const iconsWrapper = document.createElement('div');
        iconsWrapper.style.cssText = `
            position: relative;
            width: 156px;
            height: 32px;
            margin-bottom: -2px;
            align-self: flex-start;
            margin-left: 10px;
        `;

        // ========== ИКОНКА USERSIDE (ПЕРВАЯ - слева) ==========
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

        const usersideLogo = document.createElement('img');
        usersideLogo.src = 'https://avatars.githubusercontent.com/u/32836293?s=200&v=4';
        usersideLogo.style.cssText = `
            width: 26px;
            height: 26px;
            object-fit: contain;
            pointer-events: none;
            position: absolute;
            bottom: -14px;
            left: 50%;
            transform: translateX(-50%);
            transition: bottom 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
            z-index: 999999;
        `;

        usersideIcon.appendChild(usersideLogo);

        const usersideTooltip = document.createElement('div');
        usersideTooltip.textContent = 'Переход в USERSIDE';
        usersideTooltip.style.cssText = `
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

        usersideIcon.appendChild(usersideTooltip);

        usersideIcon.onmouseover = () => {
            usersideIcon.style.height = '32px';
            usersideIcon.style.background = 'linear-gradient(135deg, #1565C0, #0D47A1)';
            usersideLogo.style.bottom = '3px';
            usersideTooltip.style.opacity = '1';
        };

        usersideIcon.onmouseout = () => {
            usersideIcon.style.height = '12px';
            usersideIcon.style.background = 'linear-gradient(135deg, #1E88E5, #1565C0)';
            usersideLogo.style.bottom = '-14px';
            usersideTooltip.style.opacity = '0';
        };

        usersideIcon.onclick = openUserside;

        // ========== ИКОНКА РАКЕТА (ВТОРАЯ) ==========
        const extensionIcon = document.createElement('div');
        extensionIcon.id = 'extension-nav-icon';
        extensionIcon.style.cssText = `
            position: absolute;
            left: 52px;
            bottom: 0;
            width: 42px;
            height: 12px;
            background: linear-gradient(135deg, #9C27B0, #7B1FA2);
            border: none;
            border-radius: 12px 12px 0px 0px;
            box-shadow: 0 -2px 8px rgba(156, 39, 176, 0.3);
            cursor: pointer;
            overflow: hidden;
            transition: height 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
            pointer-events: auto;
            z-index: 999999;
        `;

        const extensionText = document.createElement('span');
        extensionText.textContent = '🚀';
        extensionText.style.cssText = `
            color: white;
            font-family: 'Orbitron', Arial, sans-serif;
            font-size: 16px;
            font-weight: 600;
            position: absolute;
            bottom: -5px;
            left: 50%;
            transform: translateX(-50%);
            pointer-events: none;
            text-shadow: 0 1px 2px rgba(0,0,0,0.2);
            transition: bottom 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
            z-index: 2;
        `;

        extensionIcon.appendChild(extensionText);

        const extensionTooltip = document.createElement('div');
        extensionTooltip.textContent = 'Запустить расширение';
        extensionTooltip.style.cssText = `
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

        extensionIcon.appendChild(extensionTooltip);

        extensionIcon.onmouseover = () => {
            extensionIcon.style.height = '32px';
            extensionIcon.style.background = 'linear-gradient(135deg, #7B1FA2, #6A1B9A)';
            extensionText.style.bottom = '8px';
            extensionText.style.fontSize = '20px';
            extensionTooltip.style.opacity = '1';
        };

        extensionIcon.onmouseout = () => {
            extensionIcon.style.height = '12px';
            extensionIcon.style.background = 'linear-gradient(135deg, #9C27B0, #7B1FA2)';
            extensionText.style.bottom = '-5px';
            extensionText.style.fontSize = '16px';
            extensionTooltip.style.opacity = '0';
        };

        extensionIcon.onclick = launchExtension;

        // ========== ИКОНКА LTE (ТРЕТЬЯ) ==========
        const lteIcon = document.createElement('div');
        lteIcon.id = 'lte-nav-icon';
        lteIcon.style.cssText = `
            position: absolute;
            left: 104px;
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

        // Добавляем иконки в правильном порядке:
        // 1. USERSIDE (слева)
        // 2. Ракета (посередине)
        // 3. LTE (справа)
        iconsWrapper.appendChild(usersideIcon);  // 🔍 - ПЕРВАЯ
        iconsWrapper.appendChild(extensionIcon); // 🚀 - ВТОРАЯ
        iconsWrapper.appendChild(lteIcon);       // 📡 - ТРЕТЬЯ

        const window = document.createElement('div');
        window.id = 'timernet-window';
        window.style.cssText = `
            width: 250px;
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
            padding: 12px 14px;
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
            font-size: 14px;
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
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            color: white;
            width: 24px;
            height: 24px;
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
            font-size: 20px;
            font-weight: 500;
            cursor: pointer;
            color: white;
            width: 24px;
            height: 24px;
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
            padding: 14px;
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

            if (collectedData.ip && LTE_IPS.includes(collectedData.ip)) {
                lteIcon.style.display = 'block';
            } else {
                lteIcon.style.display = 'none';
            }

            content.innerHTML = `
                <div style="margin-bottom: 12px; background: #e8f0fe; border-radius: 8px; padding: 8px 10px; border: 1px solid rgba(0, 0, 0, 0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="color: #1976D2; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">DESC</span>
                        <button class="copy-btn" data-copy="${collectedData.combined || ''}" style="background:none; border:none; font-size:14px; cursor:pointer; color:#78909c; width:24px; height:24px; display:flex; align-items:center; justify-content:center; border-radius:6px;">📋</button>
                    </div>
                    <div style="word-break: break-all; font-size: 12px; font-family: 'SF Mono', 'Menlo', monospace; color: #1a237e; line-height: 1.4; font-weight: 500;">${collectedData.combined || '—'}</div>
                </div>

                <div style="margin-bottom: 12px; background: #fce4ec; border-radius: 8px; padding: 8px 10px; border: 1px solid rgba(0, 0, 0, 0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="color: #c2185b; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">IP АДРЕС</span>
                        <button class="copy-btn" data-copy="${collectedData.ip || ''}" style="background:none; border:none; font-size:14px; cursor:pointer; color:#78909c; width:24px; height:24px; display:flex; align-items:center; justify-content:center; border-radius:6px;">📋</button>
                    </div>
                    <div style="word-break: break-all; font-size: 12px; font-family: 'SF Mono', 'Menlo', monospace; color: #880e4f; line-height: 1.4; font-weight: 500;">
                        ${collectedData.ip || '—'}
                        ${collectedData.cdataNumber ? `<span style="color: #666; font-size: 11px; margin-left: 5px;">(CDATA-${collectedData.cdataNumber})</span>` : ''}
                    </div>
                </div>

                <div style="margin-bottom: 0; background: #f5f5f5; border-radius: 8px; padding: 8px 10px; border: 1px solid rgba(0, 0, 0, 0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="color: #616161; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">VLAN</span>
                        <button class="copy-btn" data-copy="${collectedData.vlan || ''}" style="background:none; border:none; font-size:14px; cursor:pointer; color:#78909c; width:24px; height:24px; display:flex; align-items:center; justify-content:center; border-radius:6px;">📋</button>
                    </div>
                    <div style="word-break: break-all; font-size: 12px; font-family: 'SF Mono', 'Menlo', monospace; color: #424242; line-height: 1.4; font-weight: 500;">${collectedData.vlan || '—'}</div>
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

        updateContent();
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

// ==UserScript==
// @name         BILLING UP NTE
// @namespace    http://tampermonkey.net/
// @version      10.0
// @description  Панель настройки NTE/ONU для billing.timernet.ru
// @author       BelootchenkoMX
// @match        https://billing.timernet.ru/*
// @updateURL    https://raw.githubusercontent.com/belootchenkomaks-tim/SalskECO/refs/heads/main/billing-up.user.js
// @downloadURL  https://raw.githubusercontent.com/belootchenkomaks-tim/SalskECO/refs/heads/main/billing-up.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ==================== КОНФИГУРАЦИЯ ====================

    let collectedData = {
        contract: '',
        address: '',
        ip: '',
        cdataNumber: '',
        vlan: '',
        combined: '',
        originalAddress: '',
        descWithoutContract: '',
        olt: ''
    };

    let lastContract = '';
    let lastAddress = '';
    let lastDesc = '';
    let ipFoundForCurrentDesc = false;

    const NTE_PROFILES = [
        'Vlan-Pass',
        'NTE-2-VPU',
        'NTE-RG-VPU',
        'NTE-RG-Rev-B-VPU',
        'NTE-RG-1402-VPU Multi',
        'NTE-RG-PPPoE',
        'NTE-2-PPPoE',
        'BG',
        'NTE-RG-1402-PPPoE Multi',
        'NTE-2-2inet',
        'SKAT-NTE-2-PPPoE',
        'SKAT-NTE-RG-PPPoE',
        'SKAT-NTE-RG-Rev-B-PPPoE',
        'SKAT-NTE-RG-1421G-PPPoE'
    ];

    let currentView = 'nte-wizard';
    let nteFormState = {
        status: 'not_connected',
        mac: '',
        profile: NTE_PROFILES[0],
        profileAutoDetected: false
    };

    // Добавить новое состояние для ONU
    let onuFormState = {
        sn: '',
        profile: NTE_PROFILES[0],
        status: 'not_connected',
    };

    // Текущий режим в NTE Wizard: 'nte' или 'onu'
    let nteMode = 'nte';

    // Массив CDATA IP адресов
    const CDATA_IPS_MAP = {
        '200': '172.18.0.200',
        '201': '172.18.0.201',
        '202': '172.18.0.202',
        '203': '172.18.0.203',
        '204': '172.18.0.204',
        '205': '172.18.0.205',
        '206': '172.18.0.206'
    };

    // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

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
            contract = contract.replace(/юлс[-]?/i, 'ULS_');
            if (contract.match(/^ULS\d/)) {
                contract = contract.replace(/^ULS/, 'ULS_');
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

    function getOlt() {
        const allDisplayFields = document.querySelectorAll('.x-form-display-field');
        for (let element of allDisplayFields) {
            const text = element.textContent.trim();
            if (text.includes('OLT-') && text.match(/\d+\.\d+\.\d+\.\d+/)) {
                const ipMatch = text.match(/\d+\.\d+\.\d+\.\d+/);
                if (ipMatch) {
                    console.log('✅ OLT найден в поле с OLT-:', ipMatch[0]);
                    return ipMatch[0];
                }
            }
            if (text.startsWith('OLT-')) {
                const oltValue = text.replace('OLT-', '').trim();
                console.log('✅ OLT найден (текст):', oltValue);
                return oltValue;
            }
        }

        if (collectedData.ip) {
            console.log('✅ Используем IP адрес как OLT:', collectedData.ip);
            return collectedData.ip;
        }

        console.log('⚠️ OLT не найден');
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

    function getDescWithoutContract() {
        if (!collectedData.combined || !collectedData.contract) {
            // Пробуем получить fresh данные
            const contract = getContractNumber();
            const address = getAddress();
            if (contract && address) {
                const parts = extractAddressParts(address);
                const combined = createCombinedParam(contract, address, parts);
                if (combined) {
                    let desc = combined;
                    const contractBase = contract.replace(/^ULS_?/i, '');
                    desc = desc.replace(new RegExp(`^${contract}`), '');
                    desc = desc.replace(new RegExp(`^ULS_?${contractBase}`), '');
                    desc = desc.replace(new RegExp(`^ULS[-_]?`, 'i'), '');
                    desc = desc.replace(/^_/, '');
                    console.log('🔄 Fresh desc calculated:', desc);
                    return desc;
                }
            }
            return '';
        }

        let desc = collectedData.combined;
        const contractBase = collectedData.contract.replace(/^ULS_?/i, '');
        desc = desc.replace(new RegExp(`^${collectedData.contract}`), '');
        desc = desc.replace(new RegExp(`^ULS_?${contractBase}`), '');
        desc = desc.replace(new RegExp(`^ULS[-_]?`, 'i'), '');
        desc = desc.replace(/^_/, '');

        console.log('📝 Calculated desc:', desc, 'from combined:', collectedData.combined);
        return desc;
    }

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

// Ваша функция в userscript
function findAndLaunchExtension() {
    saveDataForUserside();
    localStorage.setItem('billing_tools_data', JSON.stringify(collectedData));

    // Способ 1: Получить ID из localStorage (туда его сохранило расширение)
    const extensionId = localStorage.getItem('billing_extension_id');

    if (extensionId) {
        console.log('✅ ID расширения из localStorage:', extensionId);
        const extensionUrl = `chrome-extension://${extensionId}/floating-panel.html`;
        const popup = window.open(extensionUrl, 'BillingTools', 'width=350,height=500,popup=yes');
        if (popup) {
            setTimeout(() => popup.focus(), 500);
            showNotification('✅ Расширение запущено', 'success');
        }
        return;
    }

    // Способ 2: Получить ID из meta-тега
    const metaTag = document.querySelector('meta[name="billing-extension-id"]');
    if (metaTag && metaTag.content) {
        const id = metaTag.content;
        console.log('✅ ID расширения из meta:', id);
        localStorage.setItem('billing_extension_id', id);
        window.open(`chrome-extension://${id}/floating-panel.html`, 'BillingTools', 'width=350,height=500');
        return;
    }

    // Способ 3: Ждем событие от расширения
    let eventFired = false;
    const eventHandler = function(e) {
        if (!eventFired && e.detail && e.detail.extensionId) {
            eventFired = true;
            const id = e.detail.extensionId;
            console.log('✅ ID расширения из события:', id);
            localStorage.setItem('billing_extension_id', id);
            window.open(`chrome-extension://${id}/floating-panel.html`, 'BillingTools', 'width=350,height=500');
            window.removeEventListener('billingExtensionLoaded', eventHandler);
        }
    };
    window.addEventListener('billingExtensionLoaded', eventHandler);

    // Способ 4: Запросить через postMessage (на случай если расширение уже загружено)
    window.postMessage({
        type: 'GET_EXTENSION_ID',
        source: 'tampermonkey-billing'
    }, '*');

    const messageHandler = function(event) {
        if (event.data && event.data.type === 'EXTENSION_ID_RESPONSE' && event.data.extensionId) {
            const id = event.data.extensionId;
            console.log('✅ ID расширения через postMessage:', id);
            localStorage.setItem('billing_extension_id', id);
            window.open(`chrome-extension://${id}/floating-panel.html`, 'BillingTools', 'width=350,height=500');
            window.removeEventListener('message', messageHandler);
        }
    };
    window.addEventListener('message', messageHandler);

    // Таймаут если ничего не сработало
    setTimeout(() => {
        if (!localStorage.getItem('billing_extension_id')) {
            showNotification('❌ Расширение не найдено. Обновите страницу', 'error');
        }
    }, 3000);
}

function openExtensionById(extensionId) {
    const extensionUrl = `chrome-extension://${extensionId}/floating-panel.html`;
    const popup = window.open(extensionUrl, 'BillingTools', 'width=350,height=500,popup=yes');

    if (popup) {
        setTimeout(() => {
            if (popup && !popup.closed) {
                popup.focus();
            }
        }, 500);
        showNotification('✅ Расширение запущено', 'success');
    } else {
        showNotification('❌ Не удалось открыть расширение', 'error');
    }
}
                function copyNTEConfig(nteStatus, macAddress, selectedProfile) {
                    const desc = collectedData.descWithoutContract || getDescWithoutContract();
                    const vlan = collectedData.vlan;
                    const olt = collectedData.olt;

                    let formattedMac = macAddress;
                    if (macAddress && !macAddress.includes(':')) {
                        formattedMac = formatMAC(macAddress);
                    }

                    const statusText = nteStatus === 'not_connected' ? 'Не подключена' : 'Подключена';

                    let output;
                    if (nteStatus === 'not_connected') {
                        output = `Status: ${statusText}
MAC: ${formattedMac || '—'}
Profile: ${selectedProfile}
OLT: ${olt || '—'}
Vlan: ${vlan || '—'}
Desc: ${desc || '—'}`;
                    } else {
                        output = `Status: ${statusText}
OLT: ${olt || '—'}
Vlan: ${vlan || '—'}
Desc: ${desc || '—'}`;
                    }

                    navigator.clipboard.writeText(output).then(() => {
                        showNotification('✅ Данные скопированы в буфер обмена', 'success');
                    }).catch(err => {
                        console.error('Ошибка копирования:', err);
                        showNotification('❌ Ошибка копирования', 'error');
                    });
                }

    function showNotification(message, type) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'info' ? '#2196F3' : '#F44336'};
            color: white;
            border-radius: 8px;
            font-family: 'Orbitron', sans-serif;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    function updateCollectedData() {
        const newContract = getContractNumber();
        const newAddress = getAddress();
        const { ip: newIp, cdataNumber: newCdataNumber } = getIpAndCdataNumber();
        const newVlan = getVlan();
        let newOlt = getOlt();

        if (!newOlt && newIp) {
            newOlt = newIp;
        }

        const contractChanged = newContract !== lastContract;
        const addressChanged = newAddress !== lastAddress;
        let descChanged = false;
        let dataUpdated = false;

        if (contractChanged || addressChanged) {
            // ... существующий код обработки изменений ...
            collectedData.contract = newContract;
            collectedData.address = newAddress;
            collectedData.originalAddress = newAddress;
            collectedData.ip = newIp;
            collectedData.cdataNumber = newCdataNumber;
            collectedData.vlan = newVlan;
            collectedData.olt = newOlt;

            if (newContract && newAddress) {
                const parts = extractAddressParts(newAddress);
                const newCombined = createCombinedParam(newContract, newAddress, parts);

                if (newCombined !== collectedData.combined && collectedData.combined !== '') {
                    descChanged = true;
                }

                collectedData.combined = newCombined;
                collectedData.descWithoutContract = getDescWithoutContract();
            } else {
                if (collectedData.combined !== '') {
                    descChanged = true;
                }
                collectedData.combined = '';
                collectedData.descWithoutContract = '';
                collectedData.vlan = '';
                collectedData.olt = '';
            }

            lastContract = newContract;
            lastAddress = newAddress;
            lastDesc = collectedData.combined;
            ipFoundForCurrentDesc = !!newIp;

            if (descChanged) {
                resetNTEMacIfNeeded();
            }

            dataUpdated = true;
        } else {
            const oltUpdated = (newOlt && newOlt !== collectedData.olt);
            const vlanUpdated = (newVlan && newVlan !== collectedData.vlan);
            const ipUpdated = (newIp && newIp !== collectedData.ip);

            if (newIp) collectedData.ip = newIp;
            if (newCdataNumber) collectedData.cdataNumber = newCdataNumber;
            if (newVlan) collectedData.vlan = newVlan;
            if (newOlt) collectedData.olt = newOlt;

            if (newAddress && newAddress !== collectedData.originalAddress) {
                collectedData.originalAddress = newAddress;
                collectedData.address = newAddress;

                if (newContract && newAddress) {
                    const parts = extractAddressParts(newAddress);
                    const newCombined = createCombinedParam(newContract, newAddress, parts);

                    if (newCombined !== collectedData.combined && collectedData.combined !== '') {
                        descChanged = true;
                        collectedData.combined = newCombined;
                        collectedData.descWithoutContract = getDescWithoutContract();
                        lastDesc = newCombined;

                        resetNTEMacIfNeeded();
                    }
                }
            }

            if (!collectedData.olt && collectedData.ip) {
                collectedData.olt = collectedData.ip;
            }

            collectedData.descWithoutContract = getDescWithoutContract();

            if (newIp && !ipFoundForCurrentDesc) {
                ipFoundForCurrentDesc = true;
                dataUpdated = true;
            }

            if ((oltUpdated || vlanUpdated || ipUpdated) && currentView === 'nte-wizard') {
                dataUpdated = true;
                console.log('🔄 Данные OLT/VLAN обновились, проверяем фокус');
            }
        }

        // Проверяем, не фокусируется ли пользователь на поле ввода
        // Проверяем, не фокусируется ли пользователь на поле ввода
        const isInputFocused = window.nteInputFocused ? window.nteInputFocused() : false;
        const activeElement = document.activeElement;
        const isSNFocused = window.isSNInputFocused ? window.isSNInputFocused() : false;
        const isAnyInputFocused = isInputFocused || isSNFocused ||
             (activeElement && (activeElement.id === 'onu-sn-input' || activeElement.id === 'nte-mac-input'));

        // Если данные изменились и открыт NTE Wizard - обновляем его
        // НО не обновляем если пользователь вводит данные
        if (dataUpdated && currentView === 'nte-wizard' && content && content.style.display !== 'none' && !isAnyInputFocused) {
            saveNTEFormState();
            content.innerHTML = renderNTEView();
            setupNTEEventListeners();
            console.log('✅ NTE Wizard обновлен с новыми данными');
        } else if (dataUpdated && currentView === 'nte-wizard' && isAnyInputFocused) {
            console.log('⏸️ Пользователь вводит данные, откладываем обновление');
        }
        if (isAnyInputFocused) {
            console.log('⏸️ Пользователь вводит данные, обновление отложено');
            dataUpdated = false;
        }

        return dataUpdated;
    }

    function getCdataIp() {
        // Пытаемся найти CDATA номер из данных
        const cdataNumber = collectedData.cdataNumber;
        if (cdataNumber && CDATA_IPS_MAP[cdataNumber]) {
            console.log('✅ Найден CDATA IP:', CDATA_IPS_MAP[cdataNumber], 'для CDATA-', cdataNumber);
            return CDATA_IPS_MAP[cdataNumber];
        }

        // Если не нашли, пробуем получить из IP адреса
        const { ip, cdataNumber: freshCdata } = getIpAndCdataNumber();
        if (freshCdata && CDATA_IPS_MAP[freshCdata]) {
            console.log('✅ Найден CDATA IP из fresh данных:', CDATA_IPS_MAP[freshCdata]);
            return CDATA_IPS_MAP[freshCdata];
        }

        console.log('⚠️ CDATA IP не найден');
        return '';
    }

    function resetNTEMacIfNeeded() {
        console.log('🔄 Полный сброс и обновление данных NTE/ONU');

        const freshContract = getContractNumber();
        const freshAddress = getAddress();
        const { ip: freshIp, cdataNumber: freshCdataNumber } = getIpAndCdataNumber();
        const freshVlan = getVlan();
        let freshOlt = getOlt();

        if (!freshOlt && freshIp) {
            freshOlt = freshIp;
        }

        collectedData.contract = freshContract;
        collectedData.address = freshAddress;
        collectedData.originalAddress = freshAddress;
        collectedData.ip = freshIp;
        collectedData.cdataNumber = freshCdataNumber;
        collectedData.vlan = freshVlan;
        collectedData.olt = freshOlt;

        if (freshContract && freshAddress) {
            const parts = extractAddressParts(freshAddress);
            collectedData.combined = createCombinedParam(freshContract, freshAddress, parts);
        } else {
            collectedData.combined = '';
        }
        collectedData.descWithoutContract = getDescWithoutContract();

        // Сбрасываем MAC и SN
        nteFormState.mac = '';
        nteFormState.profileAutoDetected = false;
        onuFormState.sn = '';

        console.log('📊 Полностью обновленные данные:', {
            contract: collectedData.contract,
            combined: collectedData.combined,
            desc: collectedData.descWithoutContract,
            olt: collectedData.olt,
            vlan: collectedData.vlan,
            ip: collectedData.ip
        });

        if (currentView === 'nte-wizard' && content) {
            content.innerHTML = renderNTEView();
            setupNTEEventListeners();
            showNotification('🔄 DESC изменился, данные обновлены', 'info');
        }
    }

    let container, content, toggleBtn, closeBtn, nteIcon;

    function openNTEWizard() {
        console.log('🔄 Открываем NTE Wizard');
        currentView = 'nte-wizard';
        nteMode = 'nte'; // Всегда начинаем с режима NTE

        const freshContract = getContractNumber();
        const freshAddress = getAddress();
        const { ip: freshIp, cdataNumber: freshCdata } = getIpAndCdataNumber();
        const freshVlan = getVlan();
        let freshOlt = getOlt();

        if (!freshOlt && freshIp) {
            freshOlt = freshIp;
        }

        collectedData.contract = freshContract;
        collectedData.address = freshAddress;
        collectedData.originalAddress = freshAddress;
        collectedData.ip = freshIp;
        collectedData.cdataNumber = freshCdata;
        collectedData.vlan = freshVlan;
        collectedData.olt = freshOlt;

        if (freshContract && freshAddress) {
            const parts = extractAddressParts(freshAddress);
            collectedData.combined = createCombinedParam(freshContract, freshAddress, parts);
        }
        collectedData.descWithoutContract = getDescWithoutContract();

        console.log('📊 Данные при открытии NTE Wizard:', {
            desc: collectedData.descWithoutContract,
            olt: collectedData.olt,
            vlan: collectedData.vlan,
            combined: collectedData.combined
        });

        nteFormState.profileAutoDetected = false;

        if (content) {
            content.innerHTML = renderNTEView();
            setupNTEEventListeners();
        }

        const titleSpan = document.querySelector('#timernet-window .header-title');
        if (titleSpan) {
            titleSpan.textContent = 'НАСТРОЙКА NTE/ONU';
        }
    }



    function saveNTEFormState() {
        const statusRadio = document.querySelector('input[name="nte-status"]:checked');
        if (statusRadio) {
            nteFormState.status = statusRadio.value;
        }

        const macInput = document.getElementById('nte-mac-input');
        if (macInput) {
            nteFormState.mac = macInput.value;
        }

        const profileSelect = document.getElementById('nte-profile-select');
        if (profileSelect) {
            nteFormState.profile = profileSelect.value;
        }
    }

    function renderNTEView() {
        // Принудительно получаем свежие данные перед рендером
        const freshVlan = getVlan();
        const freshOlt = getOlt();
        const freshIp = getIpAndCdataNumber();

        // Обновляем collectedData если нашли свежие данные
        if (freshVlan) collectedData.vlan = freshVlan;
        if (freshOlt) collectedData.olt = freshOlt;
        if (freshIp.ip) collectedData.ip = freshIp.ip;
        if (freshIp.cdataNumber) collectedData.cdataNumber = freshIp.cdataNumber;
        if (!collectedData.olt && collectedData.ip) collectedData.olt = collectedData.ip;

        // Получаем CDATA IP
        const cdataIp = getCdataIp();

        // Данные для отображения в зависимости от режима
        let displayOlt, displayDesc;

        if (nteMode === 'onu') {
            // Для ONU: показываем CDATA IP и полный DESC
            displayOlt = cdataIp || '❌ НЕ НАЙДЕН';
            displayDesc = collectedData.combined || getDescWithoutContract() || '—';
        } else {
            // Для NTE: показываем обычный OLT и DESC без договора
            displayOlt = collectedData.olt || '❌ НЕ НАЙДЕН';
            displayDesc = getDescWithoutContract() || '—';
        }

        const currentVlan = collectedData.vlan || '';

        console.log('📊 Рендер NTE/ONU View:', {
            mode: nteMode,
            desc: displayDesc,
            olt: displayOlt,
            vlan: currentVlan,
            cdataIp: cdataIp
        });

        const savedStatus = nteMode === 'nte' ? nteFormState.status : onuFormState.status;
        const savedMac = nteFormState.mac;
        const savedProfile = nteFormState.profile;
        const savedSN = onuFormState.sn;

        return `
            <style>
                .nte-wizard {
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                }
                .nte-section {
                    background: #f8f9fa;
                    border-radius: 8px;
                    padding: 12px;
                    border: 1px solid #e0e0e0;
                }
                .nte-section-title {
                    color: #FF9800;
                    font-weight: 700;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 10px;
                }
                .nte-data-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                    font-size: 12px;
                }
                .nte-label {
                    color: #666;
                    font-weight: 500;
                }
                .nte-value {
                    color: #333;
                    font-weight: 600;
                    font-family: 'SF Mono', monospace;
                    word-break: break-all;
                    text-align: right;
                    max-width: 60%;
                }
                .mode-switch {
                    display: flex;
                    background: #e0e0e0;
                    border-radius: 8px;
                    padding: 3px;
                    margin-bottom: 15px;
                }
                .mode-btn {
                    flex: 1;
                    padding: 8px;
                    border: none;
                    background: transparent;
                    cursor: pointer;
                    font-family: 'Orbitron', sans-serif;
                    font-size: 11px;
                    font-weight: 600;
                    color: #666;
                    border-radius: 6px;
                    transition: all 0.2s;
                    letter-spacing: 0.5px;
                }
                .mode-btn.active {
                    background: white;
                    color: #FF9800;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .mode-btn:hover:not(.active) {
                    background: rgba(255,255,255,0.5);
                }
                .nte-radio-group {
                    display: flex;
                    gap: 20px;
                    margin-bottom: 10px;
                }
                .nte-radio-group label {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    cursor: pointer;
                    font-size: 12px;
                }
                .nte-input {
                    width: 100%;
                    padding: 8px 10px;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    font-size: 12px;
                    font-family: 'SF Mono', monospace;
                    box-sizing: border-box;
                    margin-bottom: 10px;
                }
                .nte-input:focus {
                    outline: none;
                    border-color: #FF9800;
                    box-shadow: 0 0 0 2px rgba(255, 152, 0, 0.1);
                }
                .nte-select {
                    width: 100%;
                    padding: 8px 10px;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    font-size: 12px;
                    background: white;
                    cursor: pointer;
                    margin-bottom: 10px;
                }
                .nte-select:focus {
                    outline: none;
                    border-color: #FF9800;
                }
                .nte-button {
                    background: linear-gradient(135deg, #FF9800, #F57C00);
                    color: white;
                    border: none;
                    padding: 10px 15px;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    font-family: 'Orbitron', sans-serif;
                    letter-spacing: 0.5px;
                    transition: all 0.2s;
                    margin-top: 5px;
                    width: 100%;
                }
                .nte-button:hover {
                    background: linear-gradient(135deg, #F57C00, #E65100);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 8px rgba(255, 152, 0, 0.3);
                }
                .nte-button-secondary {
                    background: #6c757d;
                    margin-top: 10px;
                }
                .nte-button-secondary:hover {
                    background: #5a6268;
                    box-shadow: 0 4px 8px rgba(108, 117, 125, 0.3);
                }
                .nte-hint {
                    font-size: 10px;
                    color: #999;
                    margin-top: 5px;
                }
                .nte-mac-preview {
                    font-size: 11px;
                    color: #FF9800;
                    margin-top: 5px;
                    font-family: 'SF Mono', monospace;
                }
                .nte-warning {
                    background: #fff3e0;
                    border: 1px solid #ff9800;
                    color: #e65100;
                    padding: 8px;
                    border-radius: 6px;
                    font-size: 11px;
                    margin-bottom: 10px;
                }
                .preview-box {
                    background: #f0f0f0;
                    border-radius: 6px;
                    padding: 10px;
                    font-family: 'SF Mono', monospace;
                    font-size: 11px;
                    margin-bottom: 10px;
                    white-space: pre-line;
                    border: 1px solid #ddd;
                }
                .nte-profile-auto {
                    background: #e8f5e9;
                    color: #2e7d32;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    margin-top: 5px;
                }
            </style>

            <div class="nte-wizard">
                <!-- Переключатель NTE / ONU -->
                <div class="mode-switch">
                    <button class="mode-btn ${nteMode === 'nte' ? 'active' : ''}" id="mode-nte-btn">NTE</button>
                    <button class="mode-btn ${nteMode === 'onu' ? 'active' : ''}" id="mode-onu-btn">ONU</button>
                </div>

                <div class="nte-section">
                    <div class="nte-section-title">📊 Данные из биллинга</div>
                    <div class="nte-data-row">
                        <span class="nte-label">DESC${nteMode === 'onu' ? ' (полный)' : ' (без договора)'}:</span>
                        <span class="nte-value">${displayDesc}</span>
                    </div>
                    <div class="nte-data-row">
                        <span class="nte-label">${nteMode === 'onu' ? 'CDATA IP' : 'OLT'}:</span>
                        <span class="nte-value" style="${displayOlt !== '❌ НЕ НАЙДЕН' ? 'color: #4CAF50;' : 'color: #f44336;'}">${displayOlt}</span>
                    </div>
                    <div class="nte-data-row">
                        <span class="nte-label">VLAN:</span>
                        <span class="nte-value" style="${currentVlan ? 'color: #4CAF50;' : 'color: #f44336;'}">${currentVlan || '❌ НЕ НАЙДЕН'}</span>
                    </div>
                </div>

                <div class="nte-section">
                    <div class="nte-section-title">🔌 Статус ${nteMode === 'nte' ? 'НТЕ' : 'ONU'}</div>
                    <div class="nte-radio-group">
                        <label>
                            <input type="radio" name="nte-status" value="not_connected" ${savedStatus === 'not_connected' ? 'checked' : ''}>
                            Не подключена
                        </label>
                        <label>
                            <input type="radio" name="nte-status" value="connected" ${savedStatus === 'connected' ? 'checked' : ''}>
                            Подключена (unconfigured)
                        </label>
                    </div>
                </div>
                

                <div id="nte-dynamic-form" class="nte-section">
                    <div class="nte-section-title" id="nte-form-title">${nteMode === 'nte' ? (savedStatus === 'not_connected' ? '➕ Новая НТЕ' : '✅ НТЕ подключена') : '🔧 Настройка ONU'}</div>
                    <div id="nte-form-content"></div>
                </div>

                ${(nteMode === 'nte' && (!collectedData.olt || !collectedData.vlan)) || (nteMode === 'onu' && (!cdataIp || !collectedData.vlan)) ? `
                    <div class="nte-warning">
                        ⚠️ ${nteMode === 'onu' && !cdataIp ? 'CDATA IP не найден. ' : ''}${nteMode === 'nte' && !collectedData.olt ? 'OLT не найден. ' : ''}${!collectedData.vlan ? 'VLAN не найден. ' : ''}
                    </div>
                ` : ''}

                <div id="nte-preview" class="preview-box" style="display: none;"></div>

                <button class="nte-button" id="nte-copy-config">📋 Скопировать данные</button>
            </div>
        `;
    }
    // Добавить новую функцию конвертации раскладки
    function convertRussianToEnglish(text) {
        const russianToEnglishMap = {
            'а': 'f', 'А': 'F',
            'б': ',', 'Б': '<',
            'в': 'd', 'В': 'D',
            'г': 'u', 'Г': 'U',
            'д': 'l', 'Д': 'L',
            'е': 't', 'Е': 'T',
            'ё': '`', 'Ё': '~',
            'ж': ';', 'Ж': ':',
            'з': 'p', 'З': 'P',
            'и': 'b', 'И': 'B',
            'й': 'q', 'Й': 'Q',
            'к': 'r', 'К': 'R',
            'л': 'k', 'Л': 'K',
            'м': 'v', 'М': 'V',
            'н': 'y', 'Н': 'Y',
            'о': 'j', 'О': 'J',
            'п': 'g', 'П': 'G',
            'р': 'h', 'Р': 'H',
            'с': 'c', 'С': 'C',
            'т': 'n', 'Т': 'N',
            'у': 'e', 'У': 'E',
            'ф': 'a', 'Ф': 'A',
            'х': '[', 'Х': '{',
            'ц': 'w', 'Ц': 'W',
            'ч': 'x', 'Ч': 'X',
            'ш': 'i', 'Ш': 'I',
            'щ': 'o', 'Щ': 'O',
            'ъ': ']', 'Ъ': '}',
            'ы': 's', 'Ы': 'S',
            'ь': 'm', 'Ь': 'M',
            'э': '\'', 'Э': '"',
            'ю': '.', 'Ю': '>',
            'я': 'z', 'Я': 'Z',
            'А': 'F', 'Б': ',', 'В': 'D', 'Г': 'U', 'Д': 'L', 'Е': 'T',
            'Ж': ';', 'З': 'P', 'И': 'B', 'Й': 'Q', 'К': 'R', 'Л': 'K',
            'М': 'V', 'Н': 'Y', 'О': 'J', 'П': 'G', 'Р': 'H', 'С': 'C',
            'Т': 'N', 'У': 'E', 'Ф': 'A', 'Х': '[', 'Ц': 'W', 'Ч': 'X',
            'Ш': 'I', 'Щ': 'O', 'Ъ': ']', 'Ы': 'S', 'Ь': 'M', 'Э': '\'',
            'Ю': '.', 'Я': 'Z'
        };

        return text.split('').map(char => russianToEnglishMap[char] || char).join('');
    }

    function setupNTEEventListeners() {
        const statusRadios = document.querySelectorAll('input[name="nte-status"]');
        const formTitle = document.getElementById('nte-form-title');
        const formContent = document.getElementById('nte-form-content');
        const previewBox = document.getElementById('nte-preview');

        // Флаг для отслеживания фокуса на поле ввода
        let isInputFocused = false;
        let isSNFocused = false;
        // Обработчики для переключателя режимов
        const modeNteBtn = document.getElementById('mode-nte-btn');
        const modeOnuBtn = document.getElementById('mode-onu-btn');

        if (modeNteBtn) {
            modeNteBtn.addEventListener('click', function() {
                if (nteMode !== 'nte') {
                    nteMode = 'nte';
                    saveCurrentFormState();
                    content.innerHTML = renderNTEView();
                    setupNTEEventListeners();
                }
            });
        }

        if (modeOnuBtn) {
            modeOnuBtn.addEventListener('click', function() {
                if (nteMode !== 'onu') {
                    nteMode = 'onu';
                    saveCurrentFormState();
                    content.innerHTML = renderNTEView();
                    setupNTEEventListeners();
                }
            });
        }

        function saveCurrentFormState() {
            if (nteMode === 'nte') {
                saveNTEFormState();
            } else {
                saveONUFormState();
            }
        }

        function saveONUFormState() {
            const snInput = document.getElementById('onu-sn-input');
            if (snInput) {
                onuFormState.sn = snInput.value;
            }
            const statusRadio = document.querySelector('input[name="nte-status"]:checked');
            if (statusRadio) {
                onuFormState.status = statusRadio.value;
            }
        }

                function updatePreview() {
                    let desc, olt, vlan;

                    if (nteMode === 'onu') {
                        desc = collectedData.combined || getDescWithoutContract() || '—';
                        olt = getCdataIp() || '—';
                        vlan = getVlan() || collectedData.vlan || '—';

                        if (getVlan()) collectedData.vlan = getVlan();
                        const cdataIp = getCdataIp();
                        if (cdataIp) collectedData.olt = cdataIp;
                    } else {
                        desc = getDescWithoutContract() || '—';
                        vlan = getVlan() || collectedData.vlan || '—';
                        olt = getOlt() || collectedData.olt || collectedData.ip || '—';

                        if (getVlan()) collectedData.vlan = getVlan();
                        if (getOlt()) collectedData.olt = getOlt();
                    }

                    const selectedStatus = document.querySelector('input[name="nte-status"]:checked')?.value || 'not_connected';
                    let selectedProfile = '';

                    if (nteMode === 'nte' && selectedStatus === 'not_connected') {
                        const profileSelect = document.getElementById('nte-profile-select');
                        selectedProfile = profileSelect ? profileSelect.value : nteFormState.profile;
                    }

                    let identifier = '';

                    if (nteMode === 'onu') {
                        const snInput = document.getElementById('onu-sn-input');
                        if (snInput && snInput.value) {
                            identifier = snInput.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
                        }
                    } else {
                        if (selectedStatus === 'not_connected') {
                            const macInput = document.getElementById('nte-mac-input');
                            if (macInput) {
                                const rawMac = macInput.value.replace(/[^0-9A-F]/g, '');
                                if (rawMac.length === 12) {
                                    identifier = formatMAC(rawMac);
                                } else if (macInput.value) {
                                    identifier = macInput.value;
                                }
                            }
                        }
                    }

                    previewBox.style.display = 'block';

                    if (nteMode === 'onu') {
                        previewBox.innerHTML = `<strong>Предпросмотр (ONU):</strong>
SN: ${identifier || '—'}
CDATA IP: ${olt}
Vlan: ${vlan}
Desc: ${desc}`;
                    } else {
                        let profileLine = '';
                        if (selectedStatus === 'not_connected') {
                            profileLine = `\nProfile: ${selectedProfile}`;
                        }

                        previewBox.innerHTML = `<strong>Предпросмотр (NTE):</strong>
MAC: ${identifier || '—'}${profileLine}
OLT: ${olt}
Vlan: ${vlan}
Desc: ${desc}`;
                    }
                }

                function updateForm() {
            if (nteMode === 'onu') {
                const selectedStatus = document.querySelector('input[name="nte-status"]:checked')?.value || 'not_connected';
                onuFormState.status = selectedStatus;

                if (selectedStatus === 'not_connected') {
                    formTitle.textContent = '➕ Новая ONU';
                    formContent.innerHTML = `
                        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">SN (серийный номер):</label>
                        <input type="text" id="onu-sn-input" class="nte-input" placeholder="HWTCAF6DEECC" maxlength="12" value="${onuFormState.sn}">
                        <div id="onu-sn-preview" class="nte-mac-preview"></div>
                        <div class="nte-hint">Введите серийный номер ONU (12 символов)</div>
                    `;

                    const snInput = document.getElementById('onu-sn-input');
                    const snPreview = document.getElementById('onu-sn-preview');

                    snInput.addEventListener('focus', () => {
                        isSNFocused = true;
                    });
                    snInput.addEventListener('blur', () => {
                        setTimeout(() => { isSNFocused = false; }, 200);
                    });

                    function updateSNPreview() {
                        let sn = snInput.value;
                        const convertedSN = convertRussianToEnglish(sn);
                        if (convertedSN !== sn) {
                            snInput.value = convertedSN;
                            sn = convertedSN;
                        }
                        sn = sn.toUpperCase();
                        if (sn !== snInput.value) {
                            snInput.value = sn;
                        }
                        const cleanSN = sn.replace(/[^0-9A-Z]/g, '');
                        if (cleanSN.length > 0) {
                            snPreview.textContent = cleanSN;
                            if (cleanSN.length === 12) {
                                snPreview.style.color = '#4CAF50';
                                snPreview.textContent = `✅ SN: ${cleanSN}`;
                            } else {
                                snPreview.style.color = '#FF9800';
                            }
                        } else {
                            snPreview.textContent = '';
                        }
                        onuFormState.sn = snInput.value;
                        updatePreview();
                    }

                    snInput.addEventListener('input', updateSNPreview);
                    snInput.addEventListener('paste', (e) => {
                        setTimeout(updateSNPreview, 50);
                    });
                    updateSNPreview();
                } else {
                    formTitle.textContent = '✅ ONU подключена';
                    formContent.innerHTML = `
                        <div style="background: #e3f2fd; padding: 10px; border-radius: 6px; margin-top: 10px;">
                            <div style="font-size: 11px; color: #1976D2;">
                                💡 ONU будет найдена по статусу unconfigured и настроена автоматически
                            </div>
                        </div>
                    `;
                }
            } else {
                // Режим NTE
                const selectedStatus = document.querySelector('input[name="nte-status"]:checked')?.value || 'not_connected';
                nteFormState.status = selectedStatus;

                if (selectedStatus === 'not_connected') {
                    formTitle.textContent = '➕ Новая НТЕ';
                    formContent.innerHTML = `
                        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">MAC-адрес:</label>
                        <input type="text" id="nte-mac-input" class="nte-input" placeholder="02005E09DCF8 или 02:00:5E:09:DC:F8" maxlength="17" value="${nteFormState.mac}">
                        <div id="nte-mac-preview" class="nte-mac-preview"></div>
                        <div id="nte-profile-hint" class="nte-profile-auto"></div>

                        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px; margin-top: 10px;">Профиль:</label>
                        <select id="nte-profile-select" class="nte-select">
                            ${NTE_PROFILES.map(p => `<option value="${p}" ${nteFormState.profile === p ? 'selected' : ''}>${p}</option>`).join('')}
                        </select>
                        <div class="nte-hint">Выберите профиль для данного типа НТЕ</div>
                    `;

                    const macInput = document.getElementById('nte-mac-input');
                    const macPreview = document.getElementById('nte-mac-preview');
                    const profileHint = document.getElementById('nte-profile-hint');
                    const profileSelect = document.getElementById('nte-profile-select');

                    macInput.addEventListener('focus', () => { isInputFocused = true; });
                    macInput.addEventListener('blur', () => {
                        setTimeout(() => { isInputFocused = false; }, 200);
                    });

                    function updateMacPreview() {
                        let mac = macInput.value;
                        const convertedMac = convertRussianToEnglish(mac);
                        if (convertedMac !== mac) {
                            macInput.value = convertedMac;
                            mac = convertedMac;
                        }
                        mac = mac.toUpperCase();
                        if (mac !== macInput.value) {
                            macInput.value = mac;
                        }
                        const rawMac = mac.replace(/[^0-9A-F]/g, '');
                        if (rawMac.length >= 2) {
                            const formatted = rawMac.match(/.{1,2}/g).join(':');
                            macPreview.textContent = `Формат: ${formatted}`;
                        } else {
                            macPreview.textContent = rawMac ? 'Введите MAC' : '';
                        }
                        if (rawMac.length === 12) {
                            macPreview.style.color = '#4CAF50';
                            macPreview.textContent = `✅ MAC: ${formatMAC(rawMac)}`;
                            if (!nteFormState.profileAutoDetected) {
                                const detectedProfile = detectProfileByMAC(mac);
                                if (detectedProfile) {
                                    profileSelect.value = detectedProfile;
                                    nteFormState.profile = detectedProfile;
                                    nteFormState.profileAutoDetected = true;
                                    let profileName = detectedProfile === 'NTE-2-VPU' ? 'NTE-2 (ICT)' : 'NTE-RG (ZTE)';
                                    profileHint.textContent = `🔍 Автоматически определен профиль: ${profileName}`;
                                    profileHint.style.cssText = 'background: #e8f5e9; color: #2e7d32; padding: 4px 8px; border-radius: 4px; font-size: 11px; margin-top: 5px;';
                                } else {
                                    profileHint.textContent = '⚠️ MAC не распознан, выберите профиль вручную';
                                    profileHint.style.cssText = 'background: #fff3e0; color: #e65100; padding: 4px 8px; border-radius: 4px; font-size: 11px; margin-top: 5px;';
                                }
                            }
                        } else if (rawMac.length > 0) {
                            macPreview.style.color = '#FF9800';
                            profileHint.textContent = '';
                            nteFormState.profileAutoDetected = false;
                        }
                        nteFormState.mac = macInput.value;
                        updatePreview();
                    }

                    macInput.addEventListener('input', updateMacPreview);
                    macInput.addEventListener('paste', (e) => {
                        setTimeout(updateMacPreview, 50);
                    });
                    updateMacPreview();

                    profileSelect.addEventListener('change', function() {
                        nteFormState.profile = this.value;
                        nteFormState.profileAutoDetected = false;
                        updatePreview();
                    });

                } else {
                    formTitle.textContent = '✅ НТЕ подключена';
                    formContent.innerHTML = `
                        <div style="background: #e3f2fd; padding: 10px; border-radius: 6px; margin-top: 10px;">
                            <div style="font-size: 11px; color: #1976D2;">
                                💡 НТЕ будет найдена по статусу unconfigured и настроена автоматически<br>
                                <span style="font-size: 10px; color: #666;">Профиль определяется автоматически</span>
                            </div>
                        </div>
                    `;
                }
            }

            updatePreview();
        }

        // Обработчики для статуса NTE
        if (statusRadios.length > 0) {
            statusRadios.forEach(radio => {
                radio.addEventListener('change', updateForm);
            });
        }

        updateForm();
                function getCurrentFormData() {
                    if (nteMode === 'onu') {
                        const selectedStatus = document.querySelector('input[name="nte-status"]:checked')?.value || 'not_connected';

                        if (selectedStatus === 'not_connected') {
                            const snInput = document.getElementById('onu-sn-input');
                            const sn = snInput ? snInput.value.toUpperCase().replace(/[^0-9A-Z]/g, '') : '';

                            if (sn.length !== 12) {
                                showNotification('❌ SN должен содержать 12 символов', 'error');
                                return null;
                            }

                            return { mode: 'onu', status: selectedStatus, sn: sn };
                        }

                        return { mode: 'onu', status: selectedStatus, sn: '' };
                    } else {
                        const selectedStatus = document.querySelector('input[name="nte-status"]:checked')?.value || 'not_connected';
                        let macAddress = '';
                        let selectedProfile = '';

                        if (selectedStatus === 'not_connected') {
                            const macInput = document.getElementById('nte-mac-input');
                            const rawMac = macInput.value.replace(/[^0-9A-F]/g, '');

                            if (rawMac.length !== 12) {
                                showNotification('❌ Введите корректный MAC-адрес (12 символов)', 'error');
                                return null;
                            }

                            macAddress = formatMAC(rawMac);

                            const profileSelect = document.getElementById('nte-profile-select');
                            selectedProfile = profileSelect ? profileSelect.value : nteFormState.profile;
                        }

                        return { mode: 'nte', status: selectedStatus, mac: macAddress, profile: selectedProfile };
                    }
                }


        document.getElementById('nte-copy-config').addEventListener('click', function() {
            const data = getCurrentFormData();
            if (!data) return;

            if (data.mode === 'onu') {
                copyONUConfig(data.sn, data.status);
            } else {
                copyNTEConfig(data.status, data.mac, data.profile);
            }
        });

        // Сохраняем флаг в глобальную переменную для доступа из updateCollectedData
        window.nteInputFocused = () => isInputFocused;
        window.isSNInputFocused = () => isSNFocused;
    }
                function copyONUConfig(sn, status) {
                    const desc = collectedData.combined || getDescWithoutContract() || '—';
                    const vlan = collectedData.vlan;
                    const cdataIp = getCdataIp();

                    const statusText = status === 'not_connected' ? 'Не подключена' : 'Подключена';

                    let output;
                    if (status === 'not_connected') {
                        output = `Status: ${statusText}
SN: ${sn || '—'}
CDATA IP: ${cdataIp || '—'}
Vlan: ${vlan || '—'}
Desc: ${desc || '—'}`;
                    } else {
                        output = `Status: ${statusText}
CDATA IP: ${cdataIp || '—'}
Vlan: ${vlan || '—'}
Desc: ${desc || '—'}`;
                    }

                    navigator.clipboard.writeText(output).then(() => {
                        showNotification('✅ Данные ONU скопированы в буфер обмена', 'success');
                    }).catch(err => {
                        console.error('Ошибка копирования:', err);
                        showNotification('❌ Ошибка копирования', 'error');
                    });
                }

    function formatMAC(mac) {
        mac = mac.toUpperCase().replace(/[^0-9A-F]/g, '');
        if (mac.length !== 12) return mac;
        return mac.match(/.{2}/g).join(':');
    }

    function detectProfileByMAC(mac) {
        const cleanMac = mac.toUpperCase().replace(/[^0-9A-F]/g, '');
        const prefix = cleanMac.substring(0, 6);

        if (prefix === '02005E') {
            console.log('✅ Обнаружен MAC ICT (02:00:5E), профиль: NTE-2-VPU');
            return 'NTE-2-VPU';
        }

        if (prefix === '02004B') {
            console.log('✅ Обнаружен MAC ZTE (02:00:4B), профиль: NTE-RG-VPU');
            return 'NTE-RG-VPU';
        }

        return null;
    }

    function setupCopyButtons() {
        // Кнопки копирования больше не используются (main-view удалён)
    }

    function updateContent() {
        const dataChanged = updateCollectedData();

        if (!content) return;
        if (content.style.display === 'none') return;

        if (currentView === 'nte-wizard') {
            if (dataChanged) {
                saveNTEFormState();
                content.innerHTML = renderNTEView();
                setupNTEEventListeners();
                console.log('🔄 NTE Wizard обновлен из updateContent');
            }
        }
    }

    function createWindow() {
        if (document.getElementById('timernet-container')) return;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);

        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);

        container = document.createElement('div');
        container.id = 'timernet-container';
        container.style.cssText = `
            position: fixed;
            bottom: 60px;
            right: 10px;
            z-index: 999998;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            opacity: 0.7;
            transition: opacity 0.3s ease;
        `;

        container.onmouseenter = () => { container.style.opacity = '1'; };
        container.onmouseleave = () => { container.style.opacity = '0.7'; };

        const iconsWrapper = document.createElement('div');
        iconsWrapper.style.cssText = `
            position: relative;
            width: 104px;
            height: 32px;
            margin-bottom: -2px;
            align-self: flex-start;
            margin-left: 10px;
        `;

        // EXTENSION ICON
        const extensionIcon = document.createElement('div');
        extensionIcon.id = 'extension-nav-icon';
        extensionIcon.style.cssText = `
            position: absolute;
            left: 0;
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

        extensionIcon.onclick = findAndLaunchExtension;

        // NTE ICON
        nteIcon = document.createElement('div');
        nteIcon.id = 'nte-nav-icon';
        nteIcon.style.cssText = `
            position: absolute;
            left: 52px;
            bottom: 0;
            width: 42px;
            height: 12px;
            background: linear-gradient(135deg, #FF9800, #F57C00);
            border: none;
            border-radius: 12px 12px 0px 0px;
            box-shadow: 0 -2px 8px rgba(255, 152, 0, 0.3);
            cursor: pointer;
            overflow: hidden;
            transition: height 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
            pointer-events: auto;
            z-index: 999999;
        `;

        const nteText = document.createElement('span');
        nteText.textContent = 'NTE';
        nteText.style.cssText = `
            color: white;
            font-family: 'Orbitron', Arial, sans-serif;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.5px;
            position: absolute;
            bottom: -2px;
            left: 50%;
            transform: translateX(-50%);
            pointer-events: none;
            text-shadow: 0 1px 2px rgba(0,0,0,0.2);
            transition: bottom 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
            z-index: 2;
            white-space: nowrap;
        `;

        nteIcon.appendChild(nteText);

        const nteTooltip = document.createElement('div');
        nteTooltip.textContent = 'Настройка НТЕ';
        nteTooltip.style.cssText = `
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

        nteIcon.appendChild(nteTooltip);

        nteIcon.onmouseover = () => {
            nteIcon.style.height = '32px';
            nteIcon.style.background = 'linear-gradient(135deg, #F57C00, #E65100)';
            nteText.style.bottom = '12px';
            nteTooltip.style.opacity = '1';
        };

        nteIcon.onmouseout = () => {
            nteIcon.style.height = '12px';
            nteIcon.style.background = 'linear-gradient(135deg, #FF9800, #F57C00)';
            nteText.style.bottom = '-2px';
            nteTooltip.style.opacity = '0';
        };

        nteIcon.onclick = openNTEWizard;

        iconsWrapper.appendChild(extensionIcon);
        iconsWrapper.appendChild(nteIcon);

        const windowDiv = document.createElement('div');
        windowDiv.id = 'timernet-window';
        windowDiv.style.cssText = `
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
            padding: 12px 14px;
            border-radius: 11px 11px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
            border-bottom: 1px solid rgba(255, 255, 255, 0.15);
        `;

        const titleSpan = document.createElement('span');
        titleSpan.className = 'header-title';
        titleSpan.innerHTML = '⚙️ NTE/ONU';
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

        toggleBtn = document.createElement('button');
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

        closeBtn = document.createElement('button');
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

        content = document.createElement('div');
        content.id = 'data-content';
        content.style.cssText = `
            padding: 14px;
            transition: all 0.3s ease;
            display: none;
            background: white;
            max-height: 300px;
            overflow-y: auto;
        `;

        windowDiv.appendChild(header);
        windowDiv.appendChild(content);

        container.appendChild(iconsWrapper);
        container.appendChild(windowDiv);
        document.body.appendChild(container);

        // Инициализация данных при создании окна
        const initData = () => {
            const contract = getContractNumber();
            const address = getAddress();
            const { ip, cdataNumber } = getIpAndCdataNumber();
            const vlan = getVlan();
            let olt = getOlt();

            if (!olt && ip) olt = ip;

            collectedData = {
                contract: contract || '',
                address: address || '',
                originalAddress: address || '',
                ip: ip || '',
                cdataNumber: cdataNumber || '',
                vlan: vlan || '',
                olt: olt || '',
                combined: '',
                descWithoutContract: ''
            };

            if (contract && address) {
                const parts = extractAddressParts(address);
                collectedData.combined = createCombinedParam(contract, address, parts);
                collectedData.descWithoutContract = getDescWithoutContract();
            }

            lastContract = contract;
            lastAddress = address;
            lastDesc = collectedData.combined;
            ipFoundForCurrentDesc = !!ip;
        };

        initData();

        // Открываем сразу NTE/ONU настройку
        currentView = 'nte-wizard';
        let isCollapsed = false;
        content.style.display = 'block';
        content.innerHTML = renderNTEView();
        setupNTEEventListeners();
        toggleBtn.innerHTML = '−';
        toggleBtn.title = 'Свернуть';

        toggleBtn.onclick = function(e) {
            e.stopPropagation();
            if (isCollapsed) {
                content.style.display = 'block';
                toggleBtn.innerHTML = '−';
                toggleBtn.title = 'Свернуть';
                if (currentView === 'nte-wizard') {
                    content.innerHTML = renderNTEView();
                    setupNTEEventListeners();
                }
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

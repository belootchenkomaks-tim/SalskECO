// ==UserScript==
// @name         BILLING UP NTE
// @namespace    http://tampermonkey.net/
// @version      10.3
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
            renderBarContent();
            setupBarInputHandlers();
            console.log('✅ NTE Bar обновлен с новыми данными');
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
            renderBarContent();
            setupBarInputHandlers();
            showNotification('🔄 DESC изменился, данные обновлены', 'info');
        }
    }

    let container, content;



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

    function setupBarInputHandlers() {
        let isInputFocused = false;
        let isSNFocused = false;

        // ===== Mode switch =====
        document.getElementById('mode-nte-btn')?.addEventListener('click', function() {
            if (nteMode !== 'nte') {
                nteMode = 'nte';
                saveNTEFormState();
                renderBarContent();
                setupBarInputHandlers();
            }
        });
        document.getElementById('mode-onu-btn')?.addEventListener('click', function() {
            if (nteMode !== 'onu') {
                nteMode = 'onu';
                saveONUFormState();
                renderBarContent();
                setupBarInputHandlers();
            }
        });

        // ===== Status radio =====
        document.querySelectorAll('input[name="nte-status"]').forEach(radio => {
            radio.addEventListener('change', function() {
                updateBarForm();
                setupBarInputHandlers();
            });
        });

        // ===== MAC / SN handlers =====
        attachMacInputHandlers();
        attachSNInputHandlers();

        // ===== Profile select =====
        document.getElementById('nte-profile-select')?.addEventListener('change', function() {
            nteFormState.profile = this.value;
            nteFormState.profileAutoDetected = false;
        });

        // ===== Copy button =====
        document.getElementById('nte-copy-config')?.addEventListener('click', function() {
            var data = getBarFormData();
            if (!data) return;
            if (data.mode === 'onu') {
                copyONUConfig(data.sn, data.status);
            } else {
                copyNTEConfig(data.status, data.mac, data.profile);
            }
        });

        window.nteInputFocused = function() { return isInputFocused; };
        window.isSNInputFocused = function() { return isSNFocused; };

        function attachMacInputHandlers() {
            var macInput = document.getElementById('nte-mac-input');
            if (!macInput) return;

            macInput.addEventListener('focus', function() { isInputFocused = true; });
            macInput.addEventListener('blur', function() {
                setTimeout(function() { isInputFocused = false; }, 200);
            });

            function updateMacPreview() {
                var mac = macInput.value;
                var convertedMac = convertRussianToEnglish(mac);
                if (convertedMac !== mac) { macInput.value = convertedMac; mac = convertedMac; }
                mac = mac.toUpperCase();
                if (mac !== macInput.value) { macInput.value = mac; }
                var rawMac = mac.replace(/[^0-9A-F]/g, '');
                var macPreview = document.getElementById('nte-mac-preview');
                var profileHint = document.getElementById('nte-profile-hint');
                var profileSelect = document.getElementById('nte-profile-select');

                if (rawMac.length >= 2) {
                    var formatted = rawMac.match(/.{1,2}/g).join(':');
                    if (macPreview) macPreview.textContent = 'Формат: ' + formatted;
                } else {
                    if (macPreview) macPreview.textContent = rawMac ? 'Введите MAC' : '';
                }
                if (rawMac.length === 12) {
                    if (macPreview) { macPreview.style.color = '#4CAF50'; macPreview.textContent = '✅ MAC: ' + formatMAC(rawMac); }
                    if (!nteFormState.profileAutoDetected && profileSelect) {
                        var detected = detectProfileByMAC(mac);
                        if (detected) {
                            profileSelect.value = detected;
                            nteFormState.profile = detected;
                            nteFormState.profileAutoDetected = true;
                            if (profileHint) profileHint.textContent = '🔍 Авто: ' + (detected === 'NTE-2-VPU' ? 'NTE-2 (ICT)' : 'NTE-RG (ZTE)');
                        } else {
                            if (profileHint) profileHint.textContent = '⚠️ Выберите профиль';
                        }
                    }
                } else if (rawMac.length > 0) {
                    if (macPreview) macPreview.style.color = '#FF9800';
                    if (profileHint) profileHint.textContent = '';
                    nteFormState.profileAutoDetected = false;
                }
                nteFormState.mac = macInput.value;
            }

            macInput.addEventListener('input', updateMacPreview);
            macInput.addEventListener('paste', function() { setTimeout(updateMacPreview, 50); });
            updateMacPreview();

            var profileSelect = document.getElementById('nte-profile-select');
            if (profileSelect) {
                profileSelect.addEventListener('change', function() {
                    nteFormState.profile = this.value;
                    nteFormState.profileAutoDetected = false;
                });
            }
        }

        function attachSNInputHandlers() {
            var snInput = document.getElementById('onu-sn-input');
            if (!snInput) return;

            snInput.addEventListener('focus', function() { isSNFocused = true; });
            snInput.addEventListener('blur', function() {
                setTimeout(function() { isSNFocused = false; }, 200);
            });

            function updateSNPreview() {
                var sn = snInput.value;
                var convertedSN = convertRussianToEnglish(sn);
                if (convertedSN !== sn) { snInput.value = convertedSN; sn = convertedSN; }
                sn = sn.toUpperCase();
                if (sn !== snInput.value) { snInput.value = sn; }
                var cleanSN = sn.replace(/[^0-9A-Z]/g, '');
                var snPreview = document.getElementById('onu-sn-preview');
                if (!snPreview) return;
                if (cleanSN.length > 0) {
                    snPreview.textContent = cleanSN;
                    if (cleanSN.length === 12) {
                        snPreview.style.color = '#4CAF50';
                        snPreview.textContent = '✅ SN: ' + cleanSN;
                    } else { snPreview.style.color = '#FF9800'; }
                } else { snPreview.textContent = ''; }
                onuFormState.sn = snInput.value;
            }

            snInput.addEventListener('input', updateSNPreview);
            snInput.addEventListener('paste', function() { setTimeout(updateSNPreview, 50); });
            updateSNPreview();
        }

        function getBarFormData() {
            if (nteMode === 'onu') {
                var sel = document.querySelector('input[name="nte-status"]:checked');
                var status = sel ? sel.value : 'not_connected';
                if (status === 'not_connected') {
                    var snInput = document.getElementById('onu-sn-input');
                    var sn = snInput ? snInput.value.toUpperCase().replace(/[^0-9A-Z]/g, '') : '';
                    if (sn.length !== 12) { showNotification('❌ SN должен содержать 12 символов', 'error'); return null; }
                    return { mode: 'onu', status: status, sn: sn };
                }
                return { mode: 'onu', status: status, sn: '' };
            } else {
                var sel = document.querySelector('input[name="nte-status"]:checked');
                var status = sel ? sel.value : 'not_connected';
                var macAddress = '';
                var selectedProfile = '';
                if (status === 'not_connected') {
                    var macInput = document.getElementById('nte-mac-input');
                    var rawMac = macInput ? macInput.value.replace(/[^0-9A-F]/g, '') : '';
                    if (rawMac.length !== 12) { showNotification('❌ Введите корректный MAC-адрес', 'error'); return null; }
                    macAddress = formatMAC(rawMac);
                    var profileSelect = document.getElementById('nte-profile-select');
                    selectedProfile = profileSelect ? profileSelect.value : nteFormState.profile;
                }
                return { mode: 'nte', status: status, mac: macAddress, profile: selectedProfile };
            }
        }

        function saveONUFormState() {
            var snInput = document.getElementById('onu-sn-input');
            if (snInput) onuFormState.sn = snInput.value;
            var statusRadio = document.querySelector('input[name="nte-status"]:checked');
            if (statusRadio) onuFormState.status = statusRadio.value;
        }
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

        if (currentView === 'nte-wizard') {
            if (dataChanged) {
                saveNTEFormState();
                renderBarContent();
                setupBarInputHandlers();
                console.log('🔄 NTE Bar обновлен из updateContent');
            }
        }
    }

    function createWindow() {
        if (document.getElementById('timernet-container')) return;

        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);

        // ========== НИЖНЯЯ ПОЛОСА (72px, белый фон) ==========
        container = document.createElement('div');
        container.id = 'timernet-container';
        container.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 80px;
            z-index: 999999;
            background: #ffffff;
            display: flex;
            flex-direction: row;
            align-items: center;
            padding: 4px 8px;
            gap: 8px;
            box-shadow: 0 -2px 8px rgba(0,0,0,0.15);
            font-family: 'Orbitron', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            box-sizing: border-box;
            border-top: 1px solid #e0e0e0;
        `;

        // ========== ЛЕВАЯ КОЛОНКА: кнопки стопкой ==========
        const leftCol = document.createElement('div');
        leftCol.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex-shrink: 0;
        `;

        const rocketBtn = document.createElement('button');
        rocketBtn.textContent = '🚀 Расш.';
        rocketBtn.style.cssText = `
            background: linear-gradient(135deg, #9C27B0, #7B1FA2);
            color: white;
            border: none;
            padding: 2px 12px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            font-family: 'Orbitron', sans-serif;
            cursor: pointer;
            letter-spacing: 0.3px;
            transition: all 0.2s ease;
            height: 24px;
            white-space: nowrap;
        `;
        rocketBtn.onmouseover = () => { rocketBtn.style.background = 'linear-gradient(135deg, #7B1FA2, #6A1B9A)'; };
        rocketBtn.onmouseout = () => { rocketBtn.style.background = 'linear-gradient(135deg, #9C27B0, #7B1FA2)'; };
        rocketBtn.onclick = findAndLaunchExtension;

        const nteBtn = document.createElement('button');
        nteBtn.textContent = '⚙️ NTE';
        nteBtn.style.cssText = `
            background: linear-gradient(135deg, #FF9800, #F57C00);
            color: white;
            border: none;
            padding: 2px 12px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            font-family: 'Orbitron', sans-serif;
            cursor: pointer;
            letter-spacing: 0.3px;
            transition: all 0.2s ease;
            height: 24px;
            white-space: nowrap;
        `;
        nteBtn.onmouseover = () => { nteBtn.style.background = 'linear-gradient(135deg, #F57C00, #E65100)'; };
        nteBtn.onmouseout = () => { nteBtn.style.background = 'linear-gradient(135deg, #FF9800, #F57C00)'; };

        leftCol.appendChild(rocketBtn);
        leftCol.appendChild(nteBtn);

        // ========== ПРАВАЯ ЧАСТЬ: контент NTE/ONU ==========
        const rightArea = document.createElement('div');
        rightArea.id = 'nte-right-area';
        rightArea.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 0;
            overflow: hidden;
        `;

        content = document.createElement('div');
        content.id = 'nte-bar-content';
        content.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 4px;
            width: 100%;
        `;

        rightArea.appendChild(content);

        container.appendChild(leftCol);
        container.appendChild(rightArea);
        document.body.appendChild(container);

        // ========== ИНИЦИАЛИЗАЦИЯ ДАННЫХ ==========
        function initData() {
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
        }

        initData();

        // Рендерим NTE контент в правую часть
        currentView = 'nte-wizard';
        renderBarContent();
        setupBarInputHandlers();

        setInterval(updateContent, 2000);
    }

    function renderBarContent() {
        if (!content) return;

        // Принудительно получаем свежие данные
        var fVlan = getVlan();
        var fOlt = getOlt();
        var fIp = getIpAndCdataNumber();
        if (fVlan) collectedData.vlan = fVlan;
        if (fOlt) collectedData.olt = fOlt;
        if (fIp.ip) collectedData.ip = fIp.ip;
        if (fIp.cdataNumber) collectedData.cdataNumber = fIp.cdataNumber;
        if (!collectedData.olt && collectedData.ip) collectedData.olt = collectedData.ip;

        var cdataIp = getCdataIp();
        var oltVal, descVal;
        if (nteMode === 'onu') {
            oltVal = cdataIp || '❌';
            descVal = collectedData.combined || '—';
        } else {
            oltVal = collectedData.olt || '❌';
            descVal = getDescWithoutContract() || '—';
        }
        var vlanVal = collectedData.vlan || '—';
        var savedStatus = nteMode === 'nte' ? nteFormState.status : onuFormState.status;

        // Предпросмотр — левая часть (идентификатор)
        var idLine = '', rightLine = '';
        if (nteMode === 'onu') {
            var sn = onuFormState.sn ? onuFormState.sn.toUpperCase().replace(/[^0-9A-Z]/g, '') : '';
            idLine = 'SN: ' + (sn || '—');
            rightLine = 'CDATA: ' + oltVal + '  VLAN: ' + vlanVal;
        } else {
            var mac = nteFormState.mac ? nteFormState.mac.replace(/[^0-9A-F]/g, '') : '';
            var macDisp = mac.length === 12 ? formatMAC(mac) : (mac || '—');
            idLine = 'MAC: ' + macDisp;
            var pLine = (savedStatus === 'not_connected' && nteFormState.profile) ? '  Profile: ' + nteFormState.profile : '';
            rightLine = 'OLT: ' + oltVal + '  VLAN: ' + vlanVal + pLine;
        }

        content.innerHTML = '' +
            '<style>' +
                '.bc-l { font-size:10px; color:#999; font-weight:600; font-family:Orbitron,sans-serif; letter-spacing:0.3px; }' +
                '.bc-v { font-size:12px; font-family:SF Mono,monospace; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }' +
                '.bc-v.og { color:#4CAF50; } .bc-v.ob { color:#f44336; }' +
                '.bc-ms { display:inline-flex; background:#e0e0e0; border-radius:5px; padding:2px; gap:0; }' +
                '.bc-mb { padding:3px 12px; border:none; background:transparent; cursor:pointer; font-family:Orbitron,sans-serif; font-size:11px; font-weight:600; color:#666; border-radius:4px; }' +
                '.bc-mb.act { background:white; color:#FF9800; box-shadow:0 1px 3px rgba(0,0,0,0.1); }' +
                '.bc-rl { display:flex; align-items:center; gap:3px; cursor:pointer; font-size:11px; white-space:nowrap; color:#333; }' +
                '.bc-f { padding:3px 6px; border:1px solid #ccc; border-radius:4px; font-size:11px; font-family:SF Mono,monospace; box-sizing:border-box; }' +
                '.bc-f:focus { outline:none; border-color:#FF9800; }' +
                '.bc-sl { padding:3px 4px; border:1px solid #ccc; border-radius:4px; font-size:11px; background:white; }' +
                '.bc-cp { background:linear-gradient(135deg,#FF9800,#F57C00); color:white; border:none; padding:4px 12px; border-radius:4px; font-size:10px; font-weight:600; cursor:pointer; font-family:Orbitron,sans-serif; white-space:nowrap; }' +
                '.bc-cp:hover { background:linear-gradient(135deg,#F57C00,#E65100); }' +
                '.bc-ph { font-size:10px; color:#FF9800; font-family:SF Mono,monospace; }' +
                '.bc-pv { font-size:10px; font-family:SF Mono,monospace; color:#555; overflow:hidden; }' +
            '</style>' +

            '<div style="display:flex;height:100%;gap:6px;align-items:stretch;min-width:0;">' +

                // Колонка 2: Режим + Статус
                '<div style="display:flex;flex-direction:column;gap:3px;flex:0 0 135px;justify-content:center;">' +
                    '<div class="bc-ms">' +
                        '<button class="bc-mb ' + (nteMode === 'nte' ? 'act' : '') + '" id="mode-nte-btn">NTE</button>' +
                        '<button class="bc-mb ' + (nteMode === 'onu' ? 'act' : '') + '" id="mode-onu-btn">ONU</button>' +
                    '</div>' +
                    '<div style="display:flex;flex-direction:column;gap:1px;">' +
                        '<label class="bc-rl"><input type="radio" name="nte-status" value="not_connected" ' + (savedStatus === 'not_connected' ? 'checked' : '') + '> Не подключена</label>' +
                        '<label class="bc-rl"><input type="radio" name="nte-status" value="connected" ' + (savedStatus === 'connected' ? 'checked' : '') + '> Подключена</label>' +
                    '</div>' +
                '</div>' +

                // Колонка 3: Данные
                '<div style="display:flex;flex-direction:column;gap:2px;flex:2;justify-content:center;min-width:0;">' +
                    '<div style="display:flex;align-items:center;gap:4px;">' +
                        '<span class="bc-l">DESC:</span>' +
                        '<span class="bc-v" style="flex:1;" title="' + descVal + '">' + descVal + '</span>' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:4px;">' +
                        '<span class="bc-l">' + (nteMode === 'onu' ? 'CDATA' : 'OLT') + ':</span>' +
                        '<span class="bc-v ' + (oltVal !== '❌' ? 'og' : 'ob') + '">' + oltVal + '</span>' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:4px;">' +
                        '<span class="bc-l">VLAN:</span>' +
                        '<span class="bc-v ' + (vlanVal !== '—' ? 'og' : 'ob') + '">' + vlanVal + '</span>' +
                    '</div>' +
                '</div>' +

                // Колонка 4: Форма (MAC/SN + Profile)
                '<div style="display:flex;flex-direction:column;gap:3px;flex:1.3;justify-content:center;min-width:0;">' +
                    '<div id="bar-form-fields" style="display:flex;flex-direction:column;gap:3px;"></div>' +
                '</div>' +

                // Колонка 5: Предпросмотр (2 строки) + Копировать
                '<div style="display:flex;flex-direction:column;gap:2px;flex:0 0 190px;justify-content:center;">' +
                    '<div class="bc-pv">' + idLine + '</div>' +
                    '<div class="bc-pv">' + rightLine + '</div>' +
                    '<button class="bc-cp" id="nte-copy-config" style="align-self:flex-end;margin-top:1px;">📋 Копировать</button>' +
                '</div>' +

            '</div>';

        updateBarForm();
    }

    // Заполняет форму (MAC/SN + профиль) в колонке 4
    function updateBarForm() {
        var formFields = document.getElementById('bar-form-fields');
        if (!formFields) return;
        var selectedStatus = document.querySelector('input[name="nte-status"]:checked')?.value || 'not_connected';

        if (nteMode === 'onu') {
            if (selectedStatus === 'not_connected') {
                formFields.innerHTML = '' +
                    '<div style="display:flex;align-items:center;gap:4px;">' +
                        '<span class="bc-l" style="flex-shrink:0;">SN:</span>' +
                        '<input type="text" id="onu-sn-input" class="bc-f" placeholder="HWTCAF6DEECC" maxlength="12" value="' + onuFormState.sn + '" style="width:140px;">' +
                    '</div>' +
                    '<span id="onu-sn-preview" class="bc-ph"></span>';
            } else {
                formFields.innerHTML = '<span style="font-size:11px;color:#1976D2;">✅ Настроится автоматически</span>';
            }
        } else {
            if (selectedStatus === 'not_connected') {
                formFields.innerHTML = '' +
                    '<div style="display:flex;align-items:center;gap:4px;">' +
                        '<span class="bc-l" style="flex-shrink:0;">MAC:</span>' +
                        '<input type="text" id="nte-mac-input" class="bc-f" placeholder="02005E09DCF8" maxlength="17" value="' + nteFormState.mac + '" style="width:160px;">' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:4px;">' +
                        '<span class="bc-l" style="flex-shrink:0;">Profile:</span>' +
                        '<select id="nte-profile-select" class="bc-sl" style="width:160px;">' +
                            NTE_PROFILES.map(function(p) { return '<option value="' + p + '" ' + (nteFormState.profile === p ? 'selected' : '') + '>' + p + '</option>'; }).join('') +
                        '</select>' +
                    '</div>' +
                    '<div style="display:flex;gap:6px;">' +
                        '<span id="nte-mac-preview" class="bc-ph"></span>' +
                        '<span id="nte-profile-hint" style="font-size:10px;color:#999;"></span>' +
                    '</div>';
            } else {
                formFields.innerHTML = '<span style="font-size:11px;color:#1976D2;">✅ Настроится автоматически</span>';
            }
        }

        setupBarInputHandlers();
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

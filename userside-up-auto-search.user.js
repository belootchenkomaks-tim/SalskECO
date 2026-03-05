// ==UserScript==
// @name         USERSIDE UP - Auto Search (DEBUG)
// @namespace    http://tampermonkey.net/
// @version      3.6
// @description  Автоматически ищет по номеру договора, если не найдено - по адресу
// @author       Max
// @match        http://5.59.141.59:8080/oper/*
// @updateURL    https://raw.githubusercontent.com/belootchenkomaks-tim/SalskECO/refs/heads/main/userside-up-auto-search.user.js
// @downloadURL  https://raw.githubusercontent.com/belootchenkomaks-tim/SalskECO/refs/heads/main/userside-up-auto-search.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    console.log('%c🔍 USERSIDE UP - DEBUG VERSION 3.6', 'background: #2196F3; color: white; padding: 5px; border-radius: 5px;');
    console.log('🕒 Время загрузки:', new Date().toLocaleTimeString());

    // Ключи для отметок
    const SEARCH_PERFORMED_KEY = 'userside_search_performed';
    const PROFILE_OPENED_KEY = 'userside_profile_opened';
    const SEARCH_STAGE_KEY = 'userside_search_stage';

    // Получаем параметры из URL
    function getUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const searchParam = urlParams.get('search');
        const addressParam = urlParams.get('address_data');

        console.log('📊 Параметры URL:');
        console.log('  - search:', searchParam);
        console.log('  - address_data:', addressParam);

        return {
            search: searchParam ? decodeURIComponent(searchParam) : null,
            address: addressParam ? decodeURIComponent(addressParam) : null
        };
    }

    // Проверяем, не выполняли ли мы уже поиск
    function isSearchAlreadyPerformed() {
        const performed = sessionStorage.getItem(SEARCH_PERFORMED_KEY);
        const currentUrl = window.location.href.split('&address_data')[0];

        console.log('🔍 Проверка выполнения поиска:');
        console.log('  - performed:', performed);
        console.log('  - currentUrl:', currentUrl);

        if (performed === currentUrl) {
            console.log('⏭️ Поиск уже выполнялся для этого URL');
            return true;
        }
        return false;
    }

    // Проверяем, не открывали ли мы уже профиль
    function isProfileAlreadyOpened() {
        const opened = sessionStorage.getItem(PROFILE_OPENED_KEY);
        const currentUrl = window.location.href.split('&address_data')[0];

        console.log('🔍 Проверка открытия профиля:');
        console.log('  - opened:', opened);
        console.log('  - currentUrl:', currentUrl);

        if (opened === currentUrl) {
            console.log('⏭️ Профиль уже открывался для этого URL');
            return true;
        }
        return false;
    }

    // Получаем текущий этап поиска
    function getCurrentSearchStage() {
        const stage = sessionStorage.getItem(SEARCH_STAGE_KEY) || 'contract';
        console.log('📌 Текущий этап поиска:', stage);
        return stage;
    }

    // Устанавливаем этап поиска
    function setSearchStage(stage) {
        sessionStorage.setItem(SEARCH_STAGE_KEY, stage);
        console.log('📌 Установлен этап поиска:', stage);
    }

    // Проверяем, есть ли результаты поиска
    function hasSearchResults() {
        console.log('🔍 Проверка наличия результатов:');

        // Проверяем наличие сообщения "Нет записей"
        const noRecords = document.querySelector('div.label_stop');
        if (noRecords) {
            console.log('  - Найден div.label_stop:', noRecords.textContent);
            if (noRecords.textContent.includes('Нет записей')) {
                console.log('❌ Результатов нет: сообщение "Нет записей"');
                return false;
            }
        }

        // Проверяем наличие строк с результатами
        const rows = document.querySelectorAll('tr[class*="table_item"]');
        console.log(`  - Найдено строк: ${rows.length}`);

        return rows.length > 0;
    }

    // Извлекаем короткий адрес для поиска (только улица и дом)
    function extractShortAddress(fullAddress) {
        if (!fullAddress) {
            console.log('❌ Адрес пустой');
            return '';
        }

        console.log('📍 Полный адрес для обработки:', fullAddress);

        // Пробуем разные паттерны для извлечения улицы и дома

        // Паттерн 1: ул Название, дом N
        let match = fullAddress.match(/ул\s+([^,]+),?\s*дом\s+([^,\s]+)/i);
        if (match) {
            const result = `${match[1].trim()} ${match[2].trim()}`;
            console.log('✅ Паттерн 1 (ул... дом...):', result);
            return result;
        }

        // Паттерн 2: ул Название, N (без слова "дом")
        match = fullAddress.match(/ул\s+([^,]+),?\s*(\d+[^,\s]*)/i);
        if (match) {
            const result = `${match[1].trim()} ${match[2].trim()}`;
            console.log('✅ Паттерн 2 (ул... N):', result);
            return result;
        }

        // Паттерн 3: ищем улицу и дом в конце адреса
        const parts = fullAddress.split(',');
        console.log('📌 Части адреса:', parts);

        if (parts.length >= 2) {
            // Ищем часть с номером дома
            for (let i = parts.length - 1; i >= 0; i--) {
                const part = parts[i].trim();
                if (part.match(/\d+/)) {
                    console.log('  - Найдена часть с номером:', part);
                    // Ищем предыдущую часть с улицей
                    if (i > 0) {
                        let street = parts[i-1].trim();
                        street = street.replace(/^(ул|улица|пер|проспект)\s+/i, '');
                        const result = `${street} ${part}`;
                        console.log('✅ Паттерн 3 (последние части):', result);
                        return result;
                    }
                }
            }
        }

        // Если ничего не нашли, возвращаем первые 50 символов
        const result = fullAddress.substring(0, 50);
        console.log('⚠️ Используем первые 50 символов:', result);
        return result;
    }

    // Функция для поиска и открытия профиля
    function findAndOpenProfile(searchQuery, searchStage) {
        console.log(`%c🔍 ПОИСК: "${searchQuery}" (${searchStage})`, 'background: #FFC107; color: black; padding: 3px;');

        // Ждем загрузки результатов
        setTimeout(() => {
            console.log('⏰ Проверка результатов через 2 секунды');

            // Проверяем наличие результатов
            const hasResults = hasSearchResults();
            console.log('  - hasResults:', hasResults);

            if (!hasResults) {
                console.log('❌ Результаты не найдены');

                // Если это был поиск по договору и есть адрес, пробуем поиск по адресу
                if (searchStage === 'contract') {
                    const params = getUrlParams();
                    console.log('📦 Параметры для перехода к адресу:', params);

                    if (params.address) {
                        console.log('🔄 Переходим к поиску по адресу');

                        // Извлекаем короткий адрес
                        const shortAddress = extractShortAddress(params.address);
                        console.log('📍 Короткий адрес для поиска:', shortAddress);

                        if (shortAddress) {
                            // Выполняем поиск по адресу
                            setSearchStage('address');

                            // Очищаем sessionStorage для нового поиска
                            sessionStorage.removeItem(SEARCH_PERFORMED_KEY);

                            // Выполняем поиск
                            performSearch(shortAddress, 'address');
                        } else {
                            console.log('❌ Не удалось извлечь адрес');
                            showNotification('❌ Не удалось извлечь адрес для поиска', 'error');
                        }
                    } else {
                        console.log('❌ Нет адреса для поиска');
                        showNotification('❌ Абонент не найден', 'error');
                    }
                }
                return;
            }

            // Если есть результаты, открываем профиль
            const rows = document.querySelectorAll('tr[class*="table_item"]');
            console.log(`🔍 Найдено строк: ${rows.length}`);

            // Ищем точное совпадение для договора, для адреса берем первого
            let found = false;

            for (let row of rows) {
                let shouldOpen = false;

                if (searchStage === 'contract') {
                    // Для договора ищем точное совпадение
                    const rowHtml = row.innerHTML;
                    if (rowHtml.includes(searchQuery)) {
                        shouldOpen = true;
                        console.log('✅ Найдена строка с нужным договором');
                    }
                } else {
                    // Для адреса берем первую строку
                    shouldOpen = true;
                    console.log('✅ Найден результат по адресу');
                }

                if (shouldOpen) {
                    const profileLink = row.querySelector('a[href*="core_section=customer"]') ||
                                       row.querySelector('td:first-child a');

                    if (profileLink) {
                        console.log('🖱️ Открываем профиль:', profileLink.href);
                        sessionStorage.setItem(PROFILE_OPENED_KEY, window.location.href.split('&address_data')[0]);
                        profileLink.click();
                        found = true;
                        break;
                    }
                }
            }

            // Если не нашли по договору, но есть результаты, открываем первого
            if (!found && searchStage === 'contract' && rows.length > 0) {
                const firstLink = rows[0].querySelector('a[href*="core_section=customer"]') ||
                                 rows[0].querySelector('td:first-child a');

                if (firstLink) {
                    console.log('⚠️ Открываем первого абонента');
                    sessionStorage.setItem(PROFILE_OPENED_KEY, window.location.href.split('&address_data')[0]);
                    firstLink.click();
                }
            }

        }, 2000);
    }

    // Функция для выполнения поиска
    function performSearch(query, searchStage) {
        console.log(`%c🔍 ВЫПОЛНЕНИЕ ПОИСКА: "${query}" (${searchStage})`, 'background: #4CAF50; color: white; padding: 3px;');

        let attempts = 0;
        const maxAttempts = 30;

        const interval = setInterval(() => {
            attempts++;
            console.log(`🔄 Попытка ${attempts}/${maxAttempts} найти поле поиска`);

            const searchInput = document.getElementById('top_field');
            const searchButton = document.getElementById('top_button');

            if (searchInput && searchButton) {
                clearInterval(interval);
                console.log('✅ Поле поиска найдено');
                console.log('  - searchInput:', searchInput);
                console.log('  - searchButton:', searchButton);

                // Очищаем и вставляем текст
                searchInput.value = '';
                console.log('  - Поле очищено');

                searchInput.value = query;
                console.log('  - Вставлен текст:', searchInput.value);

                // Триггерим события
                ['keyup', 'input', 'change'].forEach(eventType => {
                    searchInput.dispatchEvent(new Event(eventType, { bubbles: true }));
                    console.log(`  - Событие ${eventType} отправлено`);
                });

                // Отмечаем поиск
                sessionStorage.setItem(SEARCH_PERFORMED_KEY, window.location.href.split('&address_data')[0]);
                setSearchStage(searchStage);

                // Нажимаем кнопку поиска
                setTimeout(() => {
                    console.log('🖱️ Нажимаем кнопку поиска');
                    searchButton.click();
                }, 500);

            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                console.error('❌ Поле поиска не найдено за', maxAttempts, 'попыток');
                showNotification('❌ Ошибка: поле поиска не найдено', 'error');
            }
        }, 300);
    }

    // Показ уведомлений
    function showNotification(message, type = 'info') {
        console.log(`🔔 Уведомление [${type}]: ${message}`);

        const colors = {
            info: '#4CAF50',
            error: '#f44336',
            warning: '#ff9800'
        };

        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 10px 20px;
            background: ${colors[type]};
            color: white;
            border-radius: 5px;
            z-index: 9999;
            font-family: Arial, sans-serif;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            font-size: 14px;
            font-weight: bold;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Проверка страницы результатов
    function isSearchResultsPage() {
        const urlParams = new URLSearchParams(window.location.search);
        const section = urlParams.get('core_section');
        const action = urlParams.get('action');

        const isResults = section === 'customer_list' && action === 'search_page';
        console.log('🔍 Проверка страницы результатов:', isResults);
        console.log('  - section:', section);
        console.log('  - action:', action);

        return isResults;
    }

    // Основная функция
    function init() {
        console.log('%c📍 ИНИЦИАЛИЗАЦИЯ СКРИПТА', 'background: #9C27B0; color: white; padding: 5px;');
        console.log('📍 Текущий URL:', window.location.href);
        console.log('📍 document.readyState:', document.readyState);

        const params = getUrlParams();
        console.log('📦 Параметры URL:', params);

        // Если мы на странице результатов
        if (isSearchResultsPage()) {
            console.log('%c📊 СТРАНИЦА РЕЗУЛЬТАТОВ', 'background: #FF9800; color: black; padding: 3px;');

            const profileOpened = isProfileAlreadyOpened();
            console.log('  - profileOpened:', profileOpened);

            if (!profileOpened) {
                const currentStage = getCurrentSearchStage();

                if (params.search) {
                    console.log(`🎯 Этап поиска: ${currentStage}`);

                    if (currentStage === 'contract') {
                        findAndOpenProfile(params.search, 'contract');
                    } else if (currentStage === 'address') {
                        findAndOpenProfile(params.search, 'address');
                    }
                } else {
                    console.log('❌ Нет search параметра в URL');
                }
            }
            return;
        }

        // Если есть поисковый запрос и поиск еще не выполнялся
        if (params.search) {
            console.log('🎯 Есть search параметр');

            const searchPerformed = isSearchAlreadyPerformed();
            console.log('  - searchPerformed:', searchPerformed);

            if (!searchPerformed) {
                console.log('🎯 Запускаем поиск по договору');
                setSearchStage('contract');

                setTimeout(() => {
                    performSearch(params.search, 'contract');
                }, 1000);
            }
        } else {
            console.log('ℹ️ Нет поискового запроса в URL');
        }
    }

    // Запуск
    console.log('🚀 Скрипт загружен, готов к запуску');

    if (document.readyState === 'loading') {
        console.log('⏳ Документ загружается, ждем DOMContentLoaded');
        document.addEventListener('DOMContentLoaded', init);
    } else {
        console.log('✅ Документ уже загружен, запускаем init');
        setTimeout(init, 500);
    }

    // Дополнительный запуск после полной загрузки страницы
    window.addEventListener('load', function() {
        console.log('📌 Событие load - проверяем, не нужно ли что-то сделать');
        // Можно добавить дополнительную логику здесь
    });

})();

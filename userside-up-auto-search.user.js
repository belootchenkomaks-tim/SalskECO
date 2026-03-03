// ==UserScript==
// @name         USERSIDE UP - Auto Search
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Автоматически ищет по номеру договора и открывает профиль абонента
// @author       Max
// @match        http://5.59.141.59:8080/oper/*
// @updateURL    https://raw.githubusercontent.com/belootchenkomaks-tim/SalskECO/refs/heads/main/userside-up-auto-search.user.js
// @downloadURL  https://raw.githubusercontent.com/belootchenkomaks-tim/SalskECO/refs/heads/main/userside-up-auto-search.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    console.log('🔍 USERSIDE UP - Auto Search & Open Profile: Скрипт загружен');

    // Ключ для отметки о выполненном поиске
    const SEARCH_PERFORMED_KEY = 'userside_search_performed';
    const PROFILE_OPENED_KEY = 'userside_profile_opened';

    // Получаем search-параметр из URL
    function getSearchQueryFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const searchParam = urlParams.get('search');

        if (searchParam) {
            try {
                const decodedQuery = decodeURIComponent(searchParam);
                console.log('🔍 Найден поисковый запрос в URL:', decodedQuery);
                return decodedQuery;
            } catch (e) {
                console.error('Ошибка декодирования URL:', e);
            }
        }
        return null;
    }

    // Проверяем, не выполняли ли мы уже поиск
    function isSearchAlreadyPerformed() {
        const performed = sessionStorage.getItem(SEARCH_PERFORMED_KEY);
        const currentUrl = window.location.href;

        if (performed === currentUrl) {
            console.log('⏭️ Поиск уже выполнялся для этого URL');
            return true;
        }

        sessionStorage.removeItem(SEARCH_PERFORMED_KEY);
        return false;
    }

    // Проверяем, не открывали ли мы уже профиль
    function isProfileAlreadyOpened() {
        const opened = sessionStorage.getItem(PROFILE_OPENED_KEY);
        const currentUrl = window.location.href;

        if (opened === currentUrl) {
            console.log('⏭️ Профиль уже открывался для этого URL');
            return true;
        }

        return false;
    }

    // Функция для проверки, на странице ли мы результатов поиска
    function isSearchResultsPage() {
        const urlParams = new URLSearchParams(window.location.search);
        const section = urlParams.get('core_section');
        const action = urlParams.get('action');

        return section === 'customer_list' && action === 'search_page';
    }

    // Функция для поиска и открытия профиля абонента по номеру договора
    function findAndOpenProfile(searchQuery) {
        console.log('🔍 Ищем абонента с номером договора:', searchQuery);

        // Ждем загрузки таблицы с результатами
        setTimeout(() => {
            // Ищем все строки таблицы с результатами
            const rows = document.querySelectorAll('tr[class*="table_item"]');

            console.log(`🔍 Найдено строк: ${rows.length}`);

            for (let row of rows) {
                const rowHtml = row.innerHTML;

                // Проверяем, содержит ли строка номер договора
                if (rowHtml.includes(searchQuery)) {
                    console.log('✅ Найдена строка с нужным договором');

                    // Ищем ссылку на профиль в первом столбце (обычно это номер)
                    // Это может быть ссылка вида ?core_section=customer&action=show&id=XXX
                    const profileLink = row.querySelector('a[href*="core_section=customer"]');

                    if (profileLink) {
                        console.log('🖱️ Нажимаем на ссылку профиля:', profileLink.href);

                        // Отмечаем, что профиль будет открыт
                        sessionStorage.setItem(PROFILE_OPENED_KEY, window.location.href);

                        // Переходим по ссылке
                        profileLink.click();
                        return;
                    }

                    // Если не нашли ссылку на профиль, ищем любую ссылку в первом столбце
                    const firstCellLink = row.querySelector('td:first-child a');
                    if (firstCellLink) {
                        console.log('🖱️ Нажимаем на ссылку в первом столбце:', firstCellLink.href);

                        sessionStorage.setItem(PROFILE_OPENED_KEY, window.location.href);
                        firstCellLink.click();
                        return;
                    }
                }
            }

            // Если не нашли по номеру договора, открываем первого абонента
            const firstRow = document.querySelector('tr[class*="table_item"]');
            if (firstRow) {
                const firstLink = firstRow.querySelector('a[href*="core_section=customer"]') ||
                                 firstRow.querySelector('td:first-child a');

                if (firstLink) {
                    console.log('⚠️ Открываем первого абонента в списке');

                    sessionStorage.setItem(PROFILE_OPENED_KEY, window.location.href);
                    firstLink.click();
                    return;
                }
            }

            console.log('❌ Не найден ни один абонент');

        }, 2000); // Даем время на загрузку результатов
    }

    // Функция для выполнения поиска
    function performSearch(query) {
        console.log('🔍 Выполняем поиск:', query);

        let attempts = 0;
        const maxAttempts = 30;

        const interval = setInterval(() => {
            attempts++;

            const searchInput = document.getElementById('top_field');
            const searchButton = document.getElementById('top_button');

            if (searchInput && searchButton) {
                clearInterval(interval);
                console.log('✅ Поле поиска найдено!');

                // Очищаем поле
                searchInput.value = '';

                // Вставляем текст
                searchInput.value = query;

                // Триггерим события
                searchInput.dispatchEvent(new Event('keyup', { bubbles: true }));
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                searchInput.dispatchEvent(new Event('change', { bubbles: true }));

                console.log('✏️ Текст вставлен:', searchInput.value);

                // Отмечаем, что поиск выполнен
                sessionStorage.setItem(SEARCH_PERFORMED_KEY, window.location.href);

                // Нажимаем кнопку поиска
                setTimeout(() => {
                    console.log('🖱️ Нажимаем кнопку поиска');
                    searchButton.click();

                }, 500);

            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                console.error('❌ Поле поиска не найдено за', maxAttempts, 'попыток');
            }
        }, 300);
    }

    // Основная функция
    function init() {
        console.log('📍 Текущий URL:', window.location.href);

        // Получаем поисковый запрос из URL
        const searchQuery = getSearchQueryFromUrl();

        // Если мы на странице результатов поиска
        if (isSearchResultsPage()) {
            console.log('📊 Это страница результатов поиска');

            // Проверяем, не открывали ли мы уже профиль
            if (!isProfileAlreadyOpened() && searchQuery) {
                console.log('🎯 На странице результатов, ищем профиль для:', searchQuery);
                findAndOpenProfile(searchQuery);
            }
            return;
        }

        // Если есть поисковый запрос и мы не на странице результатов
        if (searchQuery && !isSearchAlreadyPerformed()) {
            console.log('🎯 Найден запрос, запускаем поиск');

            setTimeout(() => {
                performSearch(searchQuery);
            }, 1000);
        } else {
            console.log('ℹ️ Нет поискового запроса в URL или поиск уже выполнен');
        }
    }

    // Запускаем после загрузки страницы
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 500);
    }

})();

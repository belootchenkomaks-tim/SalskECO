// ==UserScript==
// @name         LTE - Set Favicon & Keep Session Alive
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Устанавливает иконку, автологин и поддерживает сессию активной
// @author       Max
// @match        http://172.18.0.100
// @match        http://172.18.0.100/*
// @match        http://172.18.0.101
// @match        http://172.18.0.101/*
// @match        http://172.18.0.102
// @match        http://172.18.0.102/*
// @match        http://172.18.0.103
// @match        http://172.18.0.103/*
// @match        http://172.18.0.104
// @match        http://172.18.0.104/*
// @match        http://172.18.0.105
// @match        http://172.18.0.105/*
// @match        http://172.18.0.106
// @match        http://172.18.0.106/*
// @match        http://172.18.0.107
// @match        http://172.18.0.107/*
// @match        http://172.18.0.108
// @match        http://172.18.0.108/*
// @match        http://172.18.0.109
// @match        http://172.18.0.109/*
// @match        http://172.18.0.110
// @match        http://172.18.0.110/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // Получаем номер LTE
    const currentIp = window.location.hostname;
    const lastOctet = currentIp.split('.')[3];

    // Определяем номер для отображения
    let displayNumber;
    if (lastOctet === '110') {
        displayNumber = '10';
    } else {
        displayNumber = lastOctet.slice(-1);
    }

    // ==================== УСТАНОВКА ИКОНКИ ====================

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    const colors = [
        '#FF5733', '#33FF57', '#3357FF', '#FF33F5', '#FFD733',
        '#33FFF5', '#F533FF', '#FF8333', '#33FF83', '#8333FF'
    ];

    const lastDigit = lastOctet.slice(-1);
    const colorIndex = parseInt(lastDigit) % 10;
    ctx.fillStyle = colors[colorIndex];
    ctx.beginPath();
    ctx.arc(16, 16, 14, 0, 2 * Math.PI);
    ctx.fill();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(16, 16, 14, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.fillStyle = '#000000';
    if (displayNumber === '10') {
        ctx.font = 'bold 16px Arial';
    } else {
        ctx.font = 'bold 18px Arial';
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayNumber, 16, 16);

    const faviconUrl = canvas.toDataURL('image/png');

    // Устанавливаем иконку
    if (document.head) {
        let link = document.querySelector('link[rel="icon"]') || document.createElement('link');
        link.rel = 'icon';
        link.href = faviconUrl;
        if (!document.querySelector('link[rel="icon"]')) {
            document.head.appendChild(link);
        }
    }

    // ==================== АВТОЛОГИН (ТОЛЬКО 1 РАЗ) ====================

    if (window.location.pathname === '/login' || window.location.pathname === '/login.html' || window.location.pathname === '/') {

        if (!sessionStorage.getItem('lte_auto_login_done')) {

            console.log(`🔐 LTE-${lastOctet}: Автологин через 10 секунд...`);

            setTimeout(() => {
                const usernameField = document.querySelector('input[name="username"], input[type="text"][name="username"]');
                const passwordField = document.querySelector('input[name="password"], input[type="password"]');

                if (usernameField && passwordField) {
                    usernameField.value = 'admin';
                    passwordField.value = 'password';

                    sessionStorage.setItem('lte_auto_login_done', 'true');

                    const submitButton = document.querySelector('input[type="submit"], button[type="submit"]');
                    if (submitButton) {
                        submitButton.click();
                    } else {
                        const form = usernameField.closest('form');
                        if (form) form.submit();
                    }

                    console.log(`✅ LTE-${lastOctet}: Автологин выполнен`);
                }
            }, 10000);
        }
    }

    // ==================== ПОДДЕРЖАНИЕ СЕССИИ ====================

    // Функция для отправки "пинга" на сервер
    function keepSessionAlive() {
        // Просто запрашиваем любую страницу, чтобы сервер видел активность
        fetch(window.location.href, {
            method: 'HEAD',  // HEAD запрос легче, чем GET
            cache: 'no-cache',
            credentials: 'same-origin'  // передаем куки авторизации
        }).then(() => {
            console.log(`💓 LTE-${lastOctet}: Пинг отправлен, сессия активна`);
        }).catch(err => {
            // Ошибка может быть если сессия уже умерла - ничего страшного
            console.log(`⚠️ LTE-${lastOctet}: Ошибка пинга:`, err);
        });
    }

    // Переменная для таймера
    let inactivityTimer;
    const SESSION_TIMEOUT = 55 * 60 * 1000; // 55 минут (чуть меньше часа)

    // Функция сброса таймера при активности
    function resetInactivityTimer() {
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
        }

        // Устанавливаем новый таймер - через 55 минут бездействия отправим пинг
        inactivityTimer = setTimeout(() => {
            console.log(`⏰ LTE-${lastOctet}: 55 минут бездействия, отправляем пинг...`);
            keepSessionAlive();
            // После пинга перезапускаем таймер
            resetInactivityTimer();
        }, SESSION_TIMEOUT);
    }

    // Слушаем события активности пользователя
    const activityEvents = [
        'mousedown', 'mousemove', 'keydown',
        'scroll', 'touchstart', 'click'
    ];

    function onUserActivity() {
        resetInactivityTimer();
    }

    // Добавляем обработчики событий
    activityEvents.forEach(eventType => {
        window.addEventListener(eventType, onUserActivity, { passive: true });
    });

    // Также учитываем видимость страницы (переключение вкладок)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            // Пользователь вернулся на вкладку - сбрасываем таймер
            resetInactivityTimer();
            // И сразу отправляем пинг, чтобы точно активировать сессию
            keepSessionAlive();
        }
    });

    // Запускаем таймер при загрузке страницы
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', resetInactivityTimer);
    } else {
        resetInactivityTimer();
    }

    // Также отправляем пинг сразу при загрузке страницы
    setTimeout(keepSessionAlive, 5000);

})();

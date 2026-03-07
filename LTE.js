// ==UserScript==
// @name         LTE - Set Favicon & One-Time Login
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Устанавливает иконку и выполняет автологин только один раз на странице входа
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
// @updateURL    https://raw.githubusercontent.com/belootchenkomaks-tim/SalskECO/refs/heads/main/LTE.js
// @downloadURL  https://raw.githubusercontent.com/belootchenkomaks-tim/SalskECO/refs/heads/main/LTE.js
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

    // ==================== УСТАНОВКА ИКОНКИ (ВСЕГДА) ====================

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

    // ==================== АВТОЛОГИН ТОЛЬКО 1 РАЗ ====================

    // Проверяем, что это страница входа
    if (window.location.pathname === '/login' || window.location.pathname === '/login.html' || window.location.pathname === '/') {

        // Используем sessionStorage для отметки, что уже авторизовались
        if (!sessionStorage.getItem('lte_auto_login_done')) {

            console.log(`🔐 LTE-${lastOctet}: Автологин через 10 секунд...`);

            setTimeout(() => {
                const usernameField = document.querySelector('input[name="username"], input[type="text"][name="username"]');
                const passwordField = document.querySelector('input[name="password"], input[type="password"]');

                if (usernameField && passwordField) {
                    usernameField.value = 'admin';
                    passwordField.value = 'password';

                    // Отмечаем, что автологин выполнен
                    sessionStorage.setItem('lte_auto_login_done', 'true');

                    // Ищем кнопку отправки
                    const submitButton = document.querySelector('input[type="submit"], button[type="submit"]');
                    if (submitButton) {
                        submitButton.click();
                    } else {
                        const form = usernameField.closest('form');
                        if (form) form.submit();
                    }

                    console.log(`✅ LTE-${lastOctet}: Автологин выполнен`);
                }
            }, 10000); // 10 секунд
        }
    }

})();

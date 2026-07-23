'use strict';

const currentVersion = process.versions.node;
const majorVersion = parseInt(currentVersion.split('.')[0], 10);
const requiredVersion = 20;

if (majorVersion < requiredVersion) {
    // Menggunakan ANSI Escape Codes murni agar tetap berfungsi meski dependencies belum diinstall
    const colors = {
        red: '\x1b[31m',
        yellow: '\x1b[33m',
        cyan: '\x1b[36m',
        blue: '\x1b[34m',
        reset: '\x1b[0m',
        bold: '\x1b[1m'
    };

    const width = 60;
    
    const printLine = (text, color = '') => {
        // Hilangkan ANSI codes untuk menghitung panjang karakter asli
        const plainText = text.replace(/\x1b\[[0-9;]*m/g, '');
        const padLen = Math.max(0, width - 4 - plainText.length);
        const padding = ' '.repeat(padLen);
        console.error(`${colors.red}${colors.bold}│${colors.reset} ${color}${text}${colors.reset}${padding} ${colors.red}${colors.bold}│${colors.reset}`);
    };

    console.error('');
    console.error(`${colors.red}${colors.bold}┌${'─'.repeat(width - 2)}┐${colors.reset}`);
    console.error(`${colors.red}${colors.bold}│${' '.repeat(Math.floor((width - 32) / 2))}🔥 ASTRA ENGINE CRASHED 🔥${' '.repeat(Math.ceil((width - 32) / 2) - 2)}│${colors.reset}`);
    console.error(`${colors.red}${colors.bold}├${'─'.repeat(width - 2)}┤${colors.reset}`);
    
    printLine('');
    printLine(`${colors.bold}CiaaTopUpbail requires a modern Node.js environment.`, colors.yellow);
    printLine('This library uses advanced multi-device capabilities', colors.yellow);
    printLine('that are only supported on the latest V8 Engine.', colors.yellow);
    printLine('');
    printLine(`Required Node.js : ${colors.cyan}${colors.bold}>= v${requiredVersion}.0.0`);
    printLine(`Current Node.js  : ${colors.red}${colors.bold}v${currentVersion}`);
    printLine('');
    printLine(`Action Required:`, colors.cyan);
    printLine(`Please upgrade your Node.js version to proceed.`);
    printLine(`${colors.blue}https://nodejs.org/en/download/`);
    printLine('');
    
    console.error(`${colors.red}${colors.bold}└${'─'.repeat(width - 2)}┘${colors.reset}`);
    console.error('');
    
    process.exit(1);
}

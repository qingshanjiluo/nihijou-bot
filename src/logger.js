const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, `bot-${new Date().toISOString().slice(0,10)}.log`);
const stream = fs.createWriteStream(logFile, { flags: 'a' });

function formatTime() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').slice(0, 19);
}

function log(level, ...args) {
    const msg = `[${formatTime()}] [${level}] ${args.join(' ')}`;
    console.log(msg);
    stream.write(msg + '\n');
}

module.exports = {
    info: (...args) => log('INFO', ...args),
    error: (...args) => log('ERROR', ...args),
    warn: (...args) => log('WARN', ...args),
    debug: (...args) => log('DEBUG', ...args),
};
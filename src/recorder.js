const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const recordDir = path.join(__dirname, '..', 'records');
if (!fs.existsSync(recordDir)) fs.mkdirSync(recordDir, { recursive: true });

let stream = null, count = 0;
function getFileName() {
    return path.join(recordDir, `actions-${Date.now()}.json`);
}
function startRecording() {
    if (stream) stream.end();
    stream = fs.createWriteStream(getFileName());
    stream.write('[\n');
    count = 0;
    logger.info('操作录制已启动');
}
function recordAction(action) {
    if (!stream) return;
    const line = (count++ ? ',\n' : '') + JSON.stringify({ timestamp: Date.now(), ...action });
    stream.write(line);
}
function stopRecording() {
    if (stream) {
        stream.write('\n]\n');
        stream.end();
        stream = null;
        logger.info('操作录制已停止');
    }
}
async function injectRecorder(page) {
    await page.exposeFunction('__recordAction', recordAction);
    await page.evaluate(() => {
        if (window.__recorder) return;
        window.__recorder = true;
        document.addEventListener('click', e => {
            let t = e.target;
            window.__recordAction({
                type: 'click', tag: t.tagName, id: t.id, class: t.className,
                text: t.innerText?.slice(0,100), x: e.clientX, y: e.clientY, url: location.href
            });
        });
        document.addEventListener('input', e => {
            let t = e.target;
            if (t.matches('input,textarea')) {
                window.__recordAction({ type: 'input', tag: t.tagName, id: t.id, value: t.value });
            }
        });
        let timer;
        window.addEventListener('scroll', () => {
            if (timer) return;
            timer = setTimeout(() => {
                window.__recordAction({ type: 'scroll', scrollX: window.scrollX, scrollY: window.scrollY });
                timer = null;
            }, 200);
        });
    });
}
module.exports = { startRecording, stopRecording, injectRecorder };
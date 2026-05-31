const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const snapDir = path.join(__dirname, '..', 'snapshots');
if (!fs.existsSync(snapDir)) fs.mkdirSync(snapDir, { recursive: true });

async function capture(page, label) {
    const ts = Date.now();
    const name = `${ts}_${label.replace(/[^a-z0-9]/gi, '_')}`;
    const html = await page.content();
    fs.writeFileSync(path.join(snapDir, `${name}.html`), html);
    await page.screenshot({ path: path.join(snapDir, `${name}.png`), fullPage: true });
    logger.info(`快照已保存: ${name}`);
}
module.exports = { capture };
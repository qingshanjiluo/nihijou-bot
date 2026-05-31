const pkg = require('../package.json');

function getBotVersion() {
    return pkg.version;
}

async function detectSiteVersion() {
    // 简单实现，若需要可改为请求网站并解析版本信息
    return 'unknown';
}

module.exports = { getBotVersion, detectSiteVersion };
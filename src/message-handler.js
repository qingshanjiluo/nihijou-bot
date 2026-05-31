const logger = require('./logger');
const config = require('./config');
const crypto = require('crypto');

async function watchMessages(page, onNewMessage) {
    const panelSelector = config.CHAT_PANEL_SELECTOR;
    const msgSelector = `${panelSelector} ${config.CHAT_MESSAGE_SELECTOR}`;
    
    logger.info(`等待聊天面板: ${panelSelector}`);
    await page.waitForSelector(panelSelector, { timeout: 30000 });
    logger.info(`聊天面板已出现: ${panelSelector}`);

    let lastMessageHashes = new Set();
    const pollInterval = 1500; // 1.5秒
    let active = true;

    // 面板守护：每8秒检查一次，确保面板打开
    const keepPanelOpen = setInterval(async () => {
        if (!active) return;
        try {
            const isVisible = await page.isVisible(panelSelector, { timeout: 1000 }).catch(() => false);
            if (!isVisible) {
                logger.warn('聊天面板不可见，尝试重新打开...');
                await page.click(config.CHAT_PANEL_BUTTON, { force: true });
                await page.waitForSelector(panelSelector, { timeout: 5000 });
                logger.info('聊天面板已重新打开');
                // 不清空哈希，避免重复处理旧消息
            }
        } catch (err) {
            logger.error(`面板守护错误: ${err.message}`);
        }
    }, 8000);

    let lastHeartbeatLog = 0;
    const poll = async () => {
        if (!active) return;
        try {
            // 心跳日志（每60秒）
            if (Date.now() - lastHeartbeatLog > 60000) {
                logger.debug('消息轮询心跳正常');
                lastHeartbeatLog = Date.now();
            }

            const items = await page.$$(msgSelector);
            if (!items || items.length === 0) return;

            const messages = await Promise.all(items.map(async (item) => {
                let sender = '', content = '', raw = '';
                const isEvent = await item.evaluate(el => el.classList && el.classList.contains('chatRecordEvent'));
                if (isEvent) {
                    const p = await item.$('p');
                    raw = p ? await p.innerText() : await item.innerText();
                    const match = raw.match(/^【(.+?)】(.*)/);
                    if (match) {
                        sender = match[1];
                        content = match[2].trim();
                    } else {
                        sender = 'system';
                        content = raw;
                    }
                } else {
                    const nickSpan = await item.$('.chatNick');
                    const contentSpan = await item.$('.chatContent span');
                    if (nickSpan && contentSpan) {
                        sender = await nickSpan.innerText();
                        content = await contentSpan.innerText();
                        raw = `【${sender}】${content}`;
                    } else {
                        raw = await item.innerText();
                        const match = raw.match(/^【(.+?)】(.*)/);
                        if (match) {
                            sender = match[1];
                            content = match[2].trim();
                        } else {
                            sender = 'unknown';
                            content = raw;
                        }
                    }
                }
                const hash = crypto.createHash('md5').update(raw).digest('hex');
                return { sender, content, raw, hash, timestamp: Date.now() };
            }));

            const newMessages = messages.filter(msg => !lastMessageHashes.has(msg.hash));
            if (newMessages.length > 0) {
                for (const msg of newMessages) {
                    if (msg.sender !== config.BOT_NICKNAME && msg.sender !== 'system') {
                        logger.info(`📩 新消息: ${msg.sender}: ${msg.content.slice(0, 50)}`);
                        await onNewMessage(msg);
                    }
                }
                for (const msg of messages) lastMessageHashes.add(msg.hash);
                if (lastMessageHashes.size > 2000) {
                    const toDelete = [...lastMessageHashes].slice(0, 1000);
                    toDelete.forEach(h => lastMessageHashes.delete(h));
                }
            }
        } catch (err) {
            logger.error(`消息轮询出错: ${err.message}`);
            if (err.message.includes('closed') || err.message.includes('Target page')) {
                logger.error('页面已关闭，停止轮询');
                active = false;
            }
        }
    };

    await poll();
    const pollIntervalId = setInterval(poll, pollInterval);

    return () => {
        active = false;
        clearInterval(pollIntervalId);
        clearInterval(keepPanelOpen);
        logger.info('消息轮询和面板守护已停止');
    };
}

module.exports = { watchMessages };
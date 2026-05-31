const config = require('./config');
const BrowserBot = require('./browser');
const { planNextAction } = require('./ai-engine');
const { executeCommand, executeDebugCommand } = require('./actions');
const { executeToolCall } = require('./tools');
const { watchMessages } = require('./message-handler');
const logger = require('./logger');

let bot = null;
let active = true;
let messageQueue = [];
let conversationHistory = [];
let lastReplyTime = 0;
let planningTimer = null;
let songMonitorTimer = null;
let stopWatching = null;

let processedMessageIds = new Set();
const myDisplayNick = config.BOT_NICKNAME.split('@')[0];

function getMessageId(msg) {
    return `${msg.sender}|${msg.content}|${Math.floor(msg.timestamp / 1000)}`;
}

// 检查运行时段（北京时间6-18点）
function isWithinActiveHours() {
    const now = new Date();
    const beijingHour = (now.getUTCHours() + 8) % 24;
    return beijingHour >= 6 && beijingHour < 18;
}

async function enterRoomWithRetry(roomId, roomName, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            logger.info(`尝试进入房间 (${attempt}/${maxRetries})...`);
            await bot.enterRoom(roomId, roomName);
            logger.info('成功进入房间');
            return true;
        } catch (err) {
            logger.error(`进入房间失败 (尝试 ${attempt}/${maxRetries}): ${err.message}`);
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            } else {
                return false;
            }
        }
    }
    return false;
}

async function startSongMonitor() {
    if (songMonitorTimer) clearInterval(songMonitorTimer);
    songMonitorTimer = setInterval(async () => {
        if (!active || !bot || !bot.page) return;
        try {
            const songInfo = await bot.getCurrentSong();
            logger.info(`🎵 当前播放: ${songInfo}`);
        } catch (err) {
            logger.error(`获取歌曲信息失败: ${err.message}`);
        }
    }, 120000);
    logger.info('🎵 歌曲监控已启动，每2分钟获取一次');
}

async function executeDecision(decision) {
    if (!decision.should_act) return;
    const now = Date.now();
    if (decision.action_type === 'reply' && decision.content) {
        if (now - lastReplyTime < config.REPLY_COOLDOWN_SEC * 1000) {
            logger.info(`⏸️ 冷却中 (${config.REPLY_COOLDOWN_SEC}s)，跳过回复`);
            return;
        }
        try {
            await bot.sendMessage(decision.content);
            lastReplyTime = Date.now();
            conversationHistory.push({ role: 'assistant', content: decision.content, timestamp: Date.now() });
            if (conversationHistory.length > config.MAX_CONTEXT_MESSAGES) conversationHistory.shift();
            logger.info(`💬 回复: ${decision.content.slice(0, 50)}`);
        } catch (err) {
            logger.error(`发送消息失败: ${err.message}`);
            active = false;
        }
    } else if (decision.action_type === 'tool' && decision.tool_calls) {
        for (const tc of decision.tool_calls) {
            const fakeCall = { function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } };
            try {
                await executeToolCall(bot, fakeCall);
                if (tc.name === 'send_message') {
                    conversationHistory.push({ role: 'assistant', content: `[发送: ${tc.arguments.content}]`, timestamp: Date.now() });
                    if (conversationHistory.length > config.MAX_CONTEXT_MESSAGES) conversationHistory.shift();
                }
            } catch (err) {
                logger.error(`执行工具失败: ${err.message}`);
                active = false;
            }
        }
    }
}

async function planningLoop() {
    if (!active) return;
    try {
        const newMessages = [...messageQueue];
        messageQueue = [];

        if (newMessages.length === 0 && conversationHistory.length === 0) {
            planningTimer = setTimeout(planningLoop, config.PLAN_DEFAULT_WAIT_SEC * 1000);
            return;
        }

        for (const msg of newMessages) {
            if (msg.sender === myDisplayNick || msg.sender === config.BOT_NICKNAME) continue;
            if (msg.content.includes('法力值+')) continue;
            conversationHistory.push({ role: 'user', content: `${msg.sender}: ${msg.content}`, timestamp: Date.now() });
        }
        while (conversationHistory.length > config.MAX_CONTEXT_MESSAGES) conversationHistory.shift();

        const recentMessagesForAI = conversationHistory.slice(-15).map(entry => ({
            sender: entry.role === 'user' ? entry.content.split(':')[0] : 'bot',
            content: entry.role === 'user' ? entry.content.split(':').slice(1).join(':').trim() : entry.content,
            timestamp: entry.timestamp
        }));

        const decision = await planNextAction(recentMessagesForAI, conversationHistory);
        const waitSec = decision.wait_seconds || config.PLAN_DEFAULT_WAIT_SEC;

        await executeDecision(decision);

        planningTimer = setTimeout(planningLoop, waitSec * 1000);
    } catch (err) {
        logger.error(`规划循环出错: ${err.message}`);
        planningTimer = setTimeout(planningLoop, config.PLAN_DEFAULT_WAIT_SEC * 1000);
    }
}

function onNewMessage(msg) {
    if (!active) return;
    if (msg.content.startsWith('/boss_')) {
        logger.info(`🔧 调试命令: ${msg.content}`);
        executeDebugCommand(bot, msg.content).catch(err => logger.error(`调试命令执行失败: ${err.message}`));
        return;
    }
    if (msg.sender === myDisplayNick || msg.sender === config.BOT_NICKNAME) return;
    if (msg.sender === 'system') return;
    if (msg.content.includes('法力值+')) return;

    const msgId = getMessageId(msg);
    if (processedMessageIds.has(msgId)) {
        logger.debug(`⏭️ 重复消息已忽略: ${msg.sender}: ${msg.content.slice(0, 30)}`);
        return;
    }
    processedMessageIds.add(msgId);
    if (processedMessageIds.size > 500) {
        const toDelete = [...processedMessageIds].slice(0, 200);
        toDelete.forEach(id => processedMessageIds.delete(id));
    }

    messageQueue.push(msg);
    logger.debug(`📥 消息入队: ${msg.sender}: ${msg.content.slice(0, 40)}`);
}

async function start() {
    if (!isWithinActiveHours()) {
        const now = new Date();
        const beijingHour = (now.getUTCHours() + 8) % 24;
        logger.info(`当前北京时间 ${beijingHour} 点，不在运行时段 (6:00-18:00)，程序退出`);
        process.exit(0);
    }

    try {
        bot = new BrowserBot(config.BOT_NICKNAME, config.BOT_AVATAR_ID);
        await bot.init();
        await bot.login();
        logger.info('登录成功，准备进入房间...');

        const entered = await enterRoomWithRetry(config.DEFAULT_ROOM_ID, config.DEFAULT_ROOM_NAME, 3);
        if (!entered) {
            logger.error('无法进入房间，程序退出');
            await bot.close();
            process.exit(1);
        }

        await bot.page.waitForSelector(config.CHAT_PANEL_SELECTOR, { timeout: 15000 });
        await bot.sendMessage('hi');
        await bot.sendMessage('/sun');

        startSongMonitor();
        stopWatching = await watchMessages(bot.page, onNewMessage);
        planningLoop();

        if (config.RUN_DURATION_SEC > 0) {
            setTimeout(async () => {
                logger.info(`运行时间到，退出`);
                await shutdown();
            }, config.RUN_DURATION_SEC * 1000);
        }
    } catch (err) {
        logger.error('启动失败:', err);
        logger.error(err.stack);
        process.exit(1);
    }
}

async function shutdown() {
    if (!active) return;
    active = false;
    if (planningTimer) clearTimeout(planningTimer);
    if (songMonitorTimer) clearInterval(songMonitorTimer);
    if (stopWatching) stopWatching();
    if (bot) await bot.close();
    logger.info('机器人已关闭');
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
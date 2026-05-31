require('dotenv').config();
const path = require('path');

module.exports = {
    // AI
    AI_API_KEY: process.env.AI_API_KEY,
    AI_BASE_URL: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    AI_MODEL: process.env.AI_MODEL || 'gpt-3.5-turbo',
    LLM_TEMPERATURE: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
    LLM_MAX_TOKENS: parseInt(process.env.LLM_MAX_TOKENS || '500'),

    // 机器人身份
    BOT_NICKNAME: process.env.BOT_NICKNAME || '最中幻想@pipi20100817',
    BOT_AVATAR_ID: parseInt(process.env.BOT_AVATAR_ID || '32'),

    // 房间配置
    DEFAULT_ROOM_ID: (() => {
        const raw = process.env.DEFAULT_ROOM_ID;
        if (!raw) return null;
        const parsed = parseInt(raw);
        return !isNaN(parsed) && parsed > 0 ? parsed : null;
    })(),
    DEFAULT_ROOM_NAME: process.env.DEFAULT_ROOM_NAME || '東雲研究所',

    // 浏览器
    HEADLESS: process.env.HEADLESS !== 'false',
    SLOW_MO: parseInt(process.env.SLOW_MO || '50'),

    // 行为控制
    DEFAULT_ACTIVE_INTERVAL_SEC: parseInt(process.env.DEFAULT_ACTIVE_INTERVAL_SEC || '30'),
    REPLY_COOLDOWN_SEC: parseInt(process.env.REPLY_COOLDOWN_SEC || '5'),
    MAX_CONTEXT_MESSAGES: parseInt(process.env.MAX_CONTEXT_MESSAGES || '20'),
    PLAN_DEFAULT_WAIT_SEC: parseInt(process.env.PLAN_DEFAULT_WAIT_SEC || '10'),   // 新增：默认等待秒数
    RUN_DURATION_SEC: parseInt(process.env.RUN_DURATION_SEC || '0'),

    // 是否回复所有普通消息
    REPLY_TO_ALL: process.env.REPLY_TO_ALL === 'true',

    // UI 选择器
    CHAT_PANEL_BUTTON: process.env.CHAT_PANEL_BUTTON || '#btnB',
    SETTING_PANEL_BUTTON: '#btnC',
    PLAYLIST_BUTTON: '#btnA',
    CHAT_PANEL_SELECTOR: process.env.CHAT_PANEL_SELECTOR || '.ant-drawer-body .chatRecordArea',
    CHAT_MESSAGE_SELECTOR: process.env.CHAT_MESSAGE_SELECTOR || '.chatRecordTimeDesc, .chatRecordItem',

    // 风格文件
    STYLE_FILE_PATH: path.join(process.cwd(), 'style.txt'),
};
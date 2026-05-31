const axios = require('axios');
const fs = require('fs');
const config = require('./config');
const logger = require('./logger');
const { tools } = require('./tools');

const botShortNick = (config.BOT_NICKNAME || '最中幻想').split('@')[0];

let styleContent = '';
try {
    styleContent = fs.readFileSync(config.STYLE_FILE_PATH, 'utf8');
    logger.info(`已加载风格文件: ${config.STYLE_FILE_PATH}`);
} catch (err) {
    styleContent = `你是${botShortNick}，nichijou.cn聊天室的机器人。保持友善活泼，可以使用魔法命令和表情。`;
    logger.warn(`无法加载风格文件，使用默认风格`);
}

function buildPlanningPrompt() {
    return `${styleContent}

你当前处于规划模式。你会收到一系列最近的消息（包括你自己之前的回复）。请根据这些消息，决定下一步行动。

输出格式必须是严格的JSON，包含以下字段：
{
    "should_act": true/false,
    "action_type": "reply" 或 "tool",
    "content": "回复内容",              // 如果 action_type 为 "reply"
    "tool_calls": [                       // 如果 action_type 为 "tool"
        {"name": "send_message", "arguments": {"content": "xxx"}},
        {"name": "wait", "arguments": {"seconds": 5}},
        {"name": "play_song", "arguments": {"keyword": "歌名"}},
        {"name": "change_room", "arguments": {"room_id": 1}},
        {"name": "get_room_list", "arguments": {}}
    ],
    "wait_seconds": 20,                // 建议20秒左右
    "reason": "简短说明为什么这样决定"
}

重要规则：
1. **只关注最近的消息**：不要重复回应很久以前的对话。如果最近没有新消息或没有人@你，可以设置 should_act = false。
2. **魔法命令格式必须正确**：
   - 送花：/rose_昵称（带下划线）
   - 扔拖鞋：/shoe_昵称
   - 阳光普照：/sun
   - 烟花：/firework
3. **不要每条消息都回复**：只有当被@、被提问、或你想主动使用魔法/分享时才回复。
4. **主动行动**：你可以主动使用魔法（如 /sun、/rose_某用户）或切换房间，但频率不宜过高。
5. **避免刷屏**：如果最近消息中你自己连续出现多次，应设置 should_act = false。
6. **忽略系统消息**（如"xxx的法力值+5"）。
7. **回复风格**：简短有趣，可以偶尔用 ^_^ 或 :-)，但不要每句都用。绝对不要使用表情符号（😊等）。
8. **推荐歌手**：洛天依、初音未来、亚细亚旷世奇才、周杰伦、毛不易。可以主动点他们的歌。

当前时间：${new Date().toLocaleString()}
`;
}

async function planNextAction(recentMessages, conversationHistory = []) {
    const startTime = Date.now();
    // 构建消息列表：最近15条对话
    const msgList = recentMessages.slice(-15).map(m => `${m.sender}: ${m.content}`).join('\n');
    // 也可以额外提供最近的历史（但 recentMessages 已经足够）
    const userPrompt = `最近消息：\n${msgList}\n\n请根据以上最近的消息，决定下一步行动。`;

    try {
        const response = await axios.post(`${config.AI_BASE_URL}/chat/completions`, {
            model: config.AI_MODEL,
            messages: [
                { role: 'system', content: buildPlanningPrompt() },
                { role: 'user', content: userPrompt }
            ],
            temperature: config.LLM_TEMPERATURE,
            max_tokens: config.LLM_MAX_TOKENS,
            response_format: { type: "json_object" }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.AI_API_KEY}`
            },
            timeout: 30000
        });

        let jsonStr = response.data.choices[0].message.content;
        const match = jsonStr.match(/\{[\s\S]*\}/);
        if (match) jsonStr = match[0];
        const decision = JSON.parse(jsonStr);
        const elapsed = Date.now() - startTime;
        logger.info(`✅ 规划完成 (${elapsed}ms): ${decision.reason || '无理由'} | 动作: ${decision.should_act ? decision.action_type : '无'} | 等待 ${decision.wait_seconds || config.PLAN_DEFAULT_WAIT_SEC}s`);
        return decision;
    } catch (err) {
        logger.error(`规划失败: ${err.message}`);
        // 如果JSON解析失败，返回一个安全的默认决策
        return { should_act: false, wait_seconds: config.PLAN_DEFAULT_WAIT_SEC, reason: '规划API错误' };
    }
}

/**
 * 生成主动发言内容（用于定时主动发起聊天）
 * @param {boolean} isActiveTalk - 是否为主动发言模式
 * @returns {Promise<string>} 生成的发言内容
 */
async function generateActiveTalk(isActiveTalk = true) {
    try {
        const prompt = isActiveTalk
            ? '你正在 nichijou.cn 聊天室中。请主动发起一段简短的聊天，可以说说音乐、天气、心情等轻松话题，或者使用一个魔法（如 /sun）。回复要简短有趣，不超过30个字。'
            : '请根据当前聊天室氛围，生成一段自然的回复。';

        const response = await axios.post(`${config.AI_BASE_URL}/chat/completions`, {
            model: config.AI_MODEL,
            messages: [
                { role: 'system', content: `${styleContent}\n回复要简短有趣，不超过30个字。` },
                { role: 'user', content: prompt }
            ],
            temperature: config.LLM_TEMPERATURE,
            max_tokens: 100,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.AI_API_KEY}`
            },
            timeout: 15000
        });

        const content = response.data.choices[0].message.content.trim();
        return content;
    } catch (err) {
        logger.error(`主动发言生成失败: ${err.message}`);
        return '';
    }
}

module.exports = { planNextAction, generateActiveTalk };
const config = require('./config');
const logger = require('./logger');
const { generateReplyWithTools, generateReplySimple } = require('./ai-engine');
const { executeToolCall } = require('./tools');
const { executeCommand } = require('./actions');
const fs = require('fs');
const path = require('path');

class Brain {
    constructor(bot) {
        this.bot = bot;
        this.messageQueue = [];      // 未处理的消息 { sender, content, timestamp }
        this.processedMessages = new Set(); // 已处理的消息去重
        this.conversationHistory = [];       // 对话上下文（最近10条）
        this.lastActionTime = 0;
        this.isProcessing = false;
        this.stylePrompt = this.loadStyle();
    }

    loadStyle() {
        try {
            // 优先加载项目根目录的 style.txt
            const stylePath = path.join(__dirname, '..', 'style.txt');
            return fs.readFileSync(stylePath, 'utf8');
        } catch (err) {
            logger.warn('未找到 style.txt，使用默认风格');
            return '你是聊天室机器人，活泼友善。';
        }
    }

    // 添加新消息到队列
    enqueueMessage(sender, content) {
        // 去重：如果这条消息内容与最后一条重复且时间相近，可能忽略
        const last = this.messageQueue[this.messageQueue.length - 1];
        if (last && last.content === content && last.sender === sender) {
            return;
        }
        this.messageQueue.push({ sender, content, timestamp: Date.now() });
        logger.debug(`消息入队: ${sender}: ${content.slice(0, 30)}`);
    }

    // 启动循环（每3秒检查一次）
    async startLoop() {
        setInterval(async () => {
            if (this.isProcessing) return;
            if (this.messageQueue.length === 0) return;

            const now = Date.now();
            if (now - this.lastActionTime < (config.MIN_REPLY_INTERVAL_MS || 5000)) {
                // 距离上次操作不足5秒，跳过此次循环
                return;
            }

            this.isProcessing = true;
            try {
                await this.step();
            } catch (err) {
                logger.error('决策步骤出错:', err);
            } finally {
                this.isProcessing = false;
                this.lastActionTime = Date.now();
            }
        }, 3000);
    }

    async step() {
        // 收集所有未处理的消息（最多10条）
        const pending = [...this.messageQueue];
        if (pending.length === 0) return;

        // 构建给 AI 的输入：近期对话历史 + 新消息列表
        const recentHistory = this.conversationHistory.slice(-8);
        const newMessagesText = pending.map(m => `[${m.sender}]: ${m.content}`).join('\n');
        
        const systemPrompt = `${this.stylePrompt}\n当前时间：${new Date().toLocaleString()}\n你可以使用以下工具：send_message, wait, next_song, previous_song, stop_song, play_song, change_room, click_element。\n规则：如果用户要求点歌、切歌、换房间等，请调用相应工具。如果你想要回复，使用 send_message 工具，内容放在 content 参数中。如果需要等待几秒再行动，可以调用 wait 工具。`;

        const userPrompt = `以下是最近的聊天记录（从早到晚）：\n${recentHistory.map(h => `[${h.role === 'user' ? h.sender : 'bot'}]: ${h.content}`).join('\n')}\n\n现在收到的新消息：\n${newMessagesText}\n\n请决定下一步行动（可以回复、等待、或执行某个操作）。注意：不要每条消息都回复，选择最重要的1-2条回应即可。回复时尽量简短有趣。`;

        logger.info(`🧠 AI规划中，新消息数: ${pending.length}`);

        try {
            const result = await generateReplyWithTools(userPrompt, [], systemPrompt);
            if (result.type === 'tool_calls') {
                for (const toolCall of result.tool_calls) {
                    if (toolCall.function.name === 'send_message') {
                        const args = JSON.parse(toolCall.function.arguments);
                        await this.bot.sendMessage(args.content);
                        // 记录到历史
                        this.conversationHistory.push({ role: 'assistant', sender: 'bot', content: args.content });
                    } else if (toolCall.function.name === 'wait') {
                        const args = JSON.parse(toolCall.function.arguments);
                        logger.info(`⏳ AI决定等待 ${args.seconds} 秒`);
                        await new Promise(r => setTimeout(r, args.seconds * 1000));
                    } else {
                        await executeToolCall(this.bot, toolCall);
                    }
                }
            } else if (result.content) {
                // 降级：如果没有工具调用但有文本，直接发送
                await this.bot.sendMessage(result.content);
                this.conversationHistory.push({ role: 'assistant', sender: 'bot', content: result.content });
            }

            // 将新消息加入历史记录（只保留非系统消息且不是机器人自己）
            for (const msg of pending) {
                if (msg.sender !== config.BOT_NICKNAME && msg.sender !== 'system') {
                    this.conversationHistory.push({ role: 'user', sender: msg.sender, content: msg.content });
                }
            }
            // 保持历史长度
            if (this.conversationHistory.length > 30) {
                this.conversationHistory = this.conversationHistory.slice(-30);
            }

            // 清空已处理的消息队列
            this.messageQueue = [];
        } catch (err) {
            logger.error('AI规划失败:', err);
        }
    }

    // 主动发言（独立于消息队列，由外部定时器调用）
    async activeTalk() {
        if (this.isProcessing) return;
        const now = Date.now();
        if (now - this.lastActionTime < (config.MIN_REPLY_INTERVAL_MS || 5000)) {
            return;
        }
        this.isProcessing = true;
        try {
            const reply = await generateReplySimple('主动发起聊天，说点有趣的话题或问候', true);
            let waitSeconds = config.DEFAULT_ACTIVE_INTERVAL_SEC;
            const waitMatch = reply.match(/\[wait=(\d+)\]/i);
            if (waitMatch) {
                waitSeconds = parseInt(waitMatch[1], 10);
                const cleanReply = reply.replace(/\[wait=\d+\]/i, '').trim();
                if (cleanReply) {
                    await this.bot.sendMessage(cleanReply);
                    this.conversationHistory.push({ role: 'assistant', sender: 'bot', content: cleanReply });
                }
            } else if (reply) {
                await this.bot.sendMessage(reply);
                this.conversationHistory.push({ role: 'assistant', sender: 'bot', content: reply });
            }
            config.DEFAULT_ACTIVE_INTERVAL_SEC = waitSeconds;
            this.lastActionTime = Date.now();
        } catch (err) {
            logger.error('主动发言失败:', err);
        } finally {
            this.isProcessing = false;
        }
    }
}

module.exports = Brain;
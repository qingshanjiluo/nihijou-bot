const config = require('./config');
let magic = [];
let emotions = {};

try {
    magic = require('../style/magic.js');
    emotions = require('../style/emotions.js');
} catch(e) {
    magic = [
        { command: "/air", cost: 1, desc: "查看当前法力值" },
        { command: "/sun", cost: "未知", desc: "分享法力值给房间所有人" },
        { command: "/rose_", cost: 15, desc: "送花，增加对方10法力" },
        { command: "/shoe_", cost: 15, desc: "扔拖鞋，减少对方10法力" },
        { command: "/firework", cost: 30, desc: "释放烟花特效" },
        { command: "/wow", cost: 10, desc: "释放礼炮" }
    ];
    emotions = { '/嗯': 'en.gif', '/微笑': 'smil.gif' };
}

class Executor {
    constructor(bot) {
        this.bot = bot;
        this.page = bot.page;
    }

    async execute(cmdText) {
        const parts = cmdText.trim().split(/\s+/);
        let cmd = parts[0].toLowerCase();
        const arg = parts.slice(1).join(' ');

        // 命令格式修正：将 /rose 转为 /rose_，/shoe 转为 /shoe_
        let originalCmd = cmdText;
        if (cmd === '/rose' && arg) {
            cmd = '/rose_';
            originalCmd = `/rose_${arg}`;
        } else if (cmd === '/shoe' && arg) {
            cmd = '/shoe_';
            originalCmd = `/shoe_${arg}`;
        }

        // 点歌
        if (cmd === '/play') {
            if (!arg) return '歌名呢？';
            await this.playSong(arg);
            return `点歌: ${arg}`;
        }

        // 调节音量
        if (cmd === '/volume') {
            let v = parseInt(arg);
            if (isNaN(v) || v < 0 || v > 100) return '音量 0-100';
            await this.setVolume(v);
            return `音量 ${v}`;
        }

        // 切换播放模式
        if (cmd === '/mode') {
            if (!['顺序播放', '随机播放', '单曲循环'].includes(arg)) return '模式错误';
            await this.setMode(arg);
            return `模式: ${arg}`;
        }

        // 获取用户列表
        if (cmd === '/users') {
            let users = await this.bot.getUserList();
            return users.length ? `用户: ${users.join(', ')}` : '无其他用户';
        }

        // 下一首 / 上一首
        if (cmd === '/next' || cmd === '/next_song') {
            await this.nextSong();
            return '已切换到下一首';
        }
        if (cmd === '/prev' || cmd === '/previous_song') {
            await this.prevSong();
            return '已切换到上一首';
        }

        // 魔法命令匹配
        const magicCmd = magic.find(m => m.command === cmd);
        if (magicCmd) {
            // 发送原始命令（带参数）
            await this.bot.sendMessage(originalCmd);
            return `✨ ${magicCmd.desc}`;
        }

        // 表情命令
        if (emotions[cmd]) {
            await this.bot.sendMessage(cmd);
            return `😊 表情: ${cmd}`;
        }

        // 其他以 '/' 开头的自定义命令
        if (cmd.startsWith('/')) {
            await this.bot.sendMessage(originalCmd);
            return `施法: ${originalCmd}`;
        }

        return null;
    }

    async playSong(keyword) {
        const p = this.page;
        await p.click(config.PLAYLIST_BUTTON, { force: true });
        await p.waitForSelector('.musicListTemplate');
        await p.click('.musicListSearch p');
        await p.fill('.searchListInput', keyword);
        await p.waitForTimeout(1000);
        await p.click('.searchListItem:first-child .searchItemName');
        await p.click('.musicOptions:has-text("播放")');
    }

    async nextSong() {
        await this.page.click('#btnF', { force: true });
    }

    async prevSong() {
        await this.page.click('#btnD', { force: true });
    }

    async setVolume(level) {
        const p = this.page;
        await p.click(config.SETTING_PANEL_BUTTON, { force: true });
        await p.waitForSelector('.settingTemplate');
        const slider = await p.$('.ant-slider-handle');
        if (slider) {
            const box = await slider.boundingBox();
            const percent = level / 100;
            const startX = box.x + box.width / 2;
            const startY = box.y + box.height / 2;
            const endX = startX + (percent - 0.5) * 200;
            await p.mouse.move(startX, startY);
            await p.mouse.down();
            await p.mouse.move(endX, startY);
            await p.mouse.up();
        }
        await p.click('.ant-drawer-mask');
    }

    async setMode(mode) {
        const p = this.page;
        await p.click(config.SETTING_PANEL_BUTTON, { force: true });
        await p.waitForSelector('.settingTemplate');
        await p.click('.ant-select-selection-item:has-text("顺序播放")');
        await p.click(`.ant-select-item-option-content:has-text("${mode}")`);
        await p.click('.ant-drawer-mask');
    }
}

// 调试命令（BOSS专用，不经过AI规划）
async function executeDebugCommand(bot, cmdText) {
    const parts = cmdText.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');
    const executor = new Executor(bot);

    if (cmd === '/boss_next') {
        await executor.nextSong();
        await bot.sendMessage('[调试] 已强制下一首');
        return true;
    }
    if (cmd === '/boss_prev') {
        await executor.prevSong();
        await bot.sendMessage('[调试] 已强制上一首');
        return true;
    }
    if (cmd === '/boss_play' && arg) {
        await executor.playSong(arg);
        await bot.sendMessage(`[调试] 强制点歌: ${arg}`);
        return true;
    }
    if (cmd === '/boss_status') {
        const song = await bot.getCurrentSong();
        await bot.sendMessage(`[调试] 当前歌曲: ${song}`);
        return true;
    }
    return false;
}

async function executeCommand(bot, cmd) {
    return await new Executor(bot).execute(cmd);
}

module.exports = { executeCommand, executeDebugCommand };
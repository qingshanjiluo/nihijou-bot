const { chromium } = require('playwright');
const config = require('./config');
const logger = require('./logger');
const RateLimiter = require('./rate-limiter');

class BrowserBot {
    constructor(nickname, avatarId) {
        this.nickname = nickname;
        this.avatarId = avatarId;
        this.browser = null;
        this.page = null;
        this.currentRoomId = null;
        this.currentRoomName = null;
        this.rateLimiter = new RateLimiter(30); // 每分钟最多30条消息
    }

    async init() {
        this.browser = await chromium.launch({
            headless: config.HEADLESS,
            slowMo: config.SLOW_MO,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.page = await this.browser.newPage();
        
        this.page.on('requestfailed', request => {
            const url = request.url();
            if (url.includes('music.126.net') || url.includes('cos.ap-guangzhou') || url.includes('.mp3') || url.includes('.png')) {
                logger.debug(`资源加载失败（忽略）: ${url}`);
            } else {
                logger.warn(`请求失败: ${url}`, request.failure());
            }
        });
        
        this.page.on('pageerror', error => {
            logger.warn(`页面错误: ${error.message}`);
        });
        
        logger.info('浏览器已启动');
    }

    async dismissOverlays() {
        const overlays = [
            '#connectError',
            '.comFullAbsDiv.errmordalGrid',
            '.ant-modal-mask'
        ];
        for (const sel of overlays) {
            const el = await this.page.$(sel);
            if (el && await el.isVisible()) {
                const btn = await this.page.$(`${sel} button, ${sel} .comBtn, ${sel} .ant-modal-close`);
                if (btn) {
                    await btn.click({ force: true });
                    logger.info(`已关闭覆盖层 ${sel}（点击按钮）`);
                } else {
                    await el.click({ force: true });
                    logger.info(`已关闭覆盖层 ${sel}（点击遮罩）`);
                }
                await this.page.waitForTimeout(500);
            }
        }
    }

    async login() {
        await this.page.goto('https://nichijou.cn/hall');
        await this.page.waitForLoadState('networkidle');
        await this.dismissOverlays();

        const loginCard = await this.page.$('.loginBoxCard');
        if (!loginCard) {
            logger.info('已登录，无需重新登录');
            return;
        }

        logger.info('检测到登录面板，开始执行登录流程');
        
        const avatar = `.avatarBoxImg[alt="${this.avatarId}"]`;
        await this.page.waitForSelector(avatar, { timeout: 10000 });
        await this.page.click(avatar, { force: true });
        logger.info(`已选择头像 ${this.avatarId}`);

        const nickInput = await this.page.$('.loginBoxNickInput');
        await nickInput.fill('');
        await nickInput.fill(this.nickname);
        logger.info(`已填写昵称: ${this.nickname}`);

        const enterBtn = await this.page.waitForSelector('.loginBoxBtnEnter:not([disabled])', { timeout: 10000 });
        await enterBtn.click({ force: true });
        logger.info('已点击“进入大厅”按钮');

        await this.page.waitForSelector('.loginBoxCard', { state: 'detached', timeout: 15000 });
        await this.page.waitForSelector('.hallRoomList', { timeout: 15000 });
        await this.dismissOverlays();
        logger.info('登录成功，已进入大厅');
    }

    async getRoomList() {
        await this.page.waitForSelector('.hallRoomItemCard', { timeout: 10000 });
        const rooms = await this.page.$$eval('.hallRoomItemCard', cards => {
            return cards.map(card => {
                let roomId = card.getAttribute('data-id') || card.id;
                if (roomId && !/^\d+$/.test(roomId)) roomId = null;
                if (!roomId) {
                    const onclick = card.getAttribute('onclick');
                    if (onclick) {
                        const match = onclick.match(/room\?id=(\d+)/);
                        if (match) roomId = parseInt(match[1]);
                    }
                } else {
                    roomId = parseInt(roomId);
                }
                const nameEl = card.querySelector('.hallRoomTitle p');
                const name = nameEl ? nameEl.innerText.trim() : '';
                return { id: roomId, name };
            });
        });
        return rooms.filter(r => r.id !== null && r.name);
    }

    async isInRoom() {
        const url = this.page.url();
        return url.includes('/room') && url.includes('id=');
    }

    async enterRoomById(roomId, retryCount = 0) {
        logger.info(`通过ID进入房间: ${roomId} (尝试 ${retryCount + 1}/3)`);
        if (await this.isInRoom() && this.page.url().includes(`id=${roomId}`)) {
            logger.info(`已在房间 ID=${roomId}，跳过进入`);
            return;
        }
        await this.page.goto(`https://nichijou.cn/room?id=${roomId}`);
        await this.page.waitForLoadState('networkidle');
        try {
            await this.page.waitForSelector('.roomInfoTitle', { timeout: 20000 });
        } catch (err) {
            if (retryCount < 2) {
                logger.warn(`等待房间信息超时，重试 (${retryCount + 1}/3)...`);
                await this.page.waitForTimeout(2000);
                return this.enterRoomById(roomId, retryCount + 1);
            } else {
                throw new Error(`进入房间 ID=${roomId} 失败，等待超时`);
            }
        }
        await this.dismissOverlays();
        this.currentRoomId = roomId;
        try {
            const nameEl = await this.page.$('.roomInfoTitle');
            if (nameEl) this.currentRoomName = await nameEl.innerText();
        } catch(e) {}
        await this.openChatPanel();
        logger.info(`已进入房间 ID=${roomId}, 名称=${this.currentRoomName || '未知'}`);
    }

    async enterRoomByName(roomName, retryCount = 0) {
        logger.info(`通过名称进入房间: ${roomName} (尝试 ${retryCount + 1}/3)`);
        if (await this.isInRoom() && this.currentRoomName === roomName) {
            logger.info(`已在房间 ${roomName}，跳过进入`);
            return;
        }
        const roomSelector = `.hallRoomTitle:has-text("${roomName}")`;
        try {
            await this.page.waitForSelector(roomSelector, { timeout: 10000 });
            await this.page.click(roomSelector, { force: true });
            await this.page.waitForSelector('.roomInfoTitle', { timeout: 20000 });
        } catch (err) {
            if (retryCount < 2) {
                logger.warn(`进入房间名称失败，重试 (${retryCount + 1}/3)...`);
                await this.page.waitForTimeout(2000);
                return this.enterRoomByName(roomName, retryCount + 1);
            } else {
                throw new Error(`进入房间 ${roomName} 失败`);
            }
        }
        await this.dismissOverlays();
        const url = this.page.url();
        const idMatch = url.match(/[?&]id=(\d+)/);
        if (idMatch) this.currentRoomId = parseInt(idMatch[1]);
        this.currentRoomName = roomName;
        await this.openChatPanel();
        logger.info(`已进入房间: ${roomName} (ID=${this.currentRoomId})`);
    }

    async openChatPanel() {
        const chatBtn = config.CHAT_PANEL_BUTTON || '#btnB';
        logger.info(`尝试打开聊天记录面板: ${chatBtn}`);
        try {
            await this.page.click(chatBtn, { force: true });
            await this.page.waitForSelector(config.CHAT_PANEL_SELECTOR, { timeout: 15000 });
            logger.info('聊天记录面板已打开');
        } catch (e) {
            logger.error(`打开聊天记录面板失败: ${e.message}`);
        }
    }

    async enterRoom(roomId = null, roomName = null) {
        if (roomId !== null) {
            try {
                await this.enterRoomById(roomId);
                return;
            } catch (err) {
                logger.warn(`通过ID ${roomId} 进入房间最终失败: ${err.message}，将尝试使用名称`);
            }
        }
        const targetName = roomName || config.DEFAULT_ROOM_NAME;
        await this.enterRoomByName(targetName);
    }

    async sendMessage(text) {
        // 检查页面是否仍然可用
        if (!this.page || this.page.isClosed()) {
            logger.error('页面已关闭，无法发送消息');
            throw new Error('Page closed');
        }
        try {
            // 速率限制：等待直到允许发送
            await this.rateLimiter.record();
            
            await this.dismissOverlays();
            await this.page.waitForSelector('textarea.rc-textarea', { timeout: 5000 });
            await this.page.fill('textarea.rc-textarea', text);
            await this.page.keyboard.press('Enter');
            logger.info(`发送: ${text}`);
        } catch (err) {
            logger.error(`发送消息失败: ${err.message}`);
            throw err;
        }
    }

    async getUserList() {
        const users = await this.page.$$eval('.avatarBoxNick', els => 
            els.map(el => el.innerText.trim()).filter(t => t && t !== this.nickname.split('@')[0])
        );
        return [...new Set(users)];
    }

    async getCurrentSong() {
        try {
            const songElement = await this.page.$('.roomInfoSongName');
            if (songElement) {
                const text = await songElement.innerText();
                return text.trim() || '未知歌曲';
            }
            return '未获取到歌曲信息';
        } catch (err) {
            return `获取失败: ${err.message}`;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            logger.info('浏览器已关闭');
        }
    }
}

module.exports = BrowserBot;
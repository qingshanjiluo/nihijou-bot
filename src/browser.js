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
        // 验证 roomId 是有效的正整数
        if (!roomId || isNaN(roomId) || roomId <= 0) {
            logger.warn(`无效的房间ID: ${roomId}，无法通过ID进入`);
            throw new Error(`Invalid roomId: ${roomId}`);
        }
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

        // 策略1: 先确保在大厅页面，然后通过 getRoomList 获取房间 ID，再用 URL 直接导航
        try {
            // 确保当前在大厅页面，以便获取房间列表
            const currentUrl = this.page.url();
            if (!currentUrl.includes('/hall')) {
                logger.info('当前不在大厅页面，先导航到大厅获取房间列表');
                await this.page.goto('https://nichijou.cn/hall');
                await this.page.waitForLoadState('networkidle');
                await this.dismissOverlays();
            }

            const rooms = await this.getRoomList();
            const matchedRoom = rooms.find(r => r.name === roomName);
            if (matchedRoom && matchedRoom.id) {
                logger.info(`通过名称匹配到房间 ID=${matchedRoom.id}，使用 URL 直接进入`);
                await this.enterRoomById(matchedRoom.id);
                this.currentRoomName = roomName;
                return;
            }
            logger.warn(`在大厅未找到名称为 "${roomName}" 的房间，可用房间: ${rooms.map(r => r.name).join(', ')}`);
        } catch (err) {
            logger.warn(`获取房间列表失败: ${err.message}`);
        }

        // 策略2: 如果 getRoomList 失败，尝试直接导航到大厅并等待房间卡片加载后重试
        try {
            logger.info('尝试重新加载大厅页面...');
            await this.page.goto('https://nichijou.cn/hall');
            await this.page.waitForLoadState('networkidle');
            await this.dismissOverlays();
            await this.page.waitForSelector('.hallRoomItemCard', { timeout: 20000 });

            const rooms = await this.getRoomList();
            const matchedRoom = rooms.find(r => r.name === roomName);
            if (matchedRoom && matchedRoom.id) {
                logger.info(`重新加载大厅后匹配到房间 ID=${matchedRoom.id}，使用 URL 直接进入`);
                await this.enterRoomById(matchedRoom.id);
                this.currentRoomName = roomName;
                return;
            }
        } catch (err2) {
            logger.warn(`重新加载大厅后仍无法获取房间列表: ${err2.message}`);
        }

        // 策略3: 最后的回退 - 尝试通过遍历 DOM 点击房间卡片
        try {
            logger.info('尝试通过点击房间卡片进入...');
            await this.page.waitForSelector('.hallRoomItemCard', { timeout: 15000 });
            const cards = await this.page.$$('.hallRoomItemCard');
            let clicked = false;
            for (const card of cards) {
                const titleEl = await card.$('.hallRoomTitle p');
                if (titleEl) {
                    const text = await titleEl.innerText();
                    if (text.trim() === roomName) {
                        await card.click({ force: true });
                        clicked = true;
                        break;
                    }
                }
            }
            if (!clicked) {
                throw new Error(`未找到名称为 "${roomName}" 的房间卡片`);
            }
            await this.page.waitForSelector('.roomInfoTitle', { timeout: 20000 });
        } catch (err) {
            if (retryCount < 2) {
                logger.warn(`进入房间名称失败，重试 (${retryCount + 1}/3)...`);
                await this.page.waitForTimeout(2000);
                return this.enterRoomByName(roomName, retryCount + 1);
            } else {
                throw new Error(`进入房间 ${roomName} 失败，已重试 3 次`);
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
        const targetName = roomName || config.DEFAULT_ROOM_NAME;

        // 确定有效的 roomId：优先使用传入的 roomId，否则使用 config 中的 DEFAULT_ROOM_ID
        const effectiveRoomId = (roomId !== null && !isNaN(roomId) && roomId > 0)
            ? roomId
            : (config.DEFAULT_ROOM_ID !== null && !isNaN(config.DEFAULT_ROOM_ID) && config.DEFAULT_ROOM_ID > 0
                ? config.DEFAULT_ROOM_ID
                : null);

        // 如果有有效的 roomId，优先使用 URL 直接导航（最可靠）
        if (effectiveRoomId !== null) {
            try {
                await this.enterRoomById(effectiveRoomId);
                return;
            } catch (err) {
                logger.warn(`通过ID ${effectiveRoomId} 进入房间最终失败: ${err.message}，将尝试使用名称`);
            }
        }

        // 没有 roomId 时，先确保在大厅页面，然后通过名称获取房间 ID
        try {
            // 确保当前在大厅页面，以便 getRoomList 能正常工作
            const currentUrl = this.page.url();
            if (!currentUrl.includes('/hall')) {
                logger.info('当前不在大厅页面，先导航到大厅获取房间列表');
                await this.page.goto('https://nichijou.cn/hall');
                await this.page.waitForLoadState('networkidle');
                await this.dismissOverlays();
            }

            const rooms = await this.getRoomList();
            const matchedRoom = rooms.find(r => r.name === targetName);
            if (matchedRoom && matchedRoom.id) {
                logger.info(`通过名称 "${targetName}" 匹配到房间 ID=${matchedRoom.id}，使用 URL 直接进入`);
                await this.enterRoomById(matchedRoom.id);
                this.currentRoomName = targetName;
                return;
            }
            logger.warn(`在大厅未找到名称为 "${targetName}" 的房间`);
        } catch (err) {
            logger.warn(`获取房间列表失败: ${err.message}`);
        }

        // 最后回退：通过 enterRoomByName 尝试（它内部也有重试和导航到大厅的逻辑）
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
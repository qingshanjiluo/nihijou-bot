const logger = require('./logger');

// 工具定义（供 OpenAI function calling 使用）
const tools = [
    {
        type: "function",
        function: {
            name: "send_message",
            description: "向当前聊天室发送一条消息。发送魔法命令时必须使用精确格式（例如 /sun、/rose_昵称、/shoe_昵称、/play 歌名），命令和参数之间不要加多余空格。",
            parameters: {
                type: "object",
                properties: {
                    content: { type: "string", description: "消息内容，必须包含完整的命令字符串，例如 '/sun' 或 '/rose_媛馨' 或 '/play 青花瓷'。" }
                },
                required: ["content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "wait",
            description: "等待指定的秒数后再执行下一个动作。",
            parameters: {
                type: "object",
                properties: {
                    seconds: { type: "integer", description: "等待秒数，范围1-60", minimum: 1, maximum: 60 }
                },
                required: ["seconds"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "next_song",
            description: "切换到下一首歌曲。",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: "previous_song",
            description: "切换到上一首歌曲。",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: "stop_song",
            description: "停止当前播放的歌曲。",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: "play_song",
            description: "搜索并播放指定歌曲。",
            parameters: {
                type: "object",
                properties: {
                    keyword: { type: "string", description: "歌曲名或歌手名，例如 '青花瓷' 或 '周杰伦'" }
                },
                required: ["keyword"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "change_room",
            description: "切换到另一个聊天房间。可以传入房间名称或房间ID。如果不确定房间ID，可以先调用 get_room_list 获取所有房间。",
            parameters: {
                type: "object",
                properties: {
                    room_id: { type: "integer", description: "房间ID（数字）" },
                    room_name: { type: "string", description: "房间名称（如'東雲研究所'）" }
                },
                oneOf: [{ required: ["room_id"] }, { required: ["room_name"] }]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_room_list",
            description: "获取大厅所有房间的列表（ID和名称），用于之后切换房间。",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: "click_element",
            description: "点击页面上的指定元素（谨慎使用）。",
            parameters: {
                type: "object",
                properties: {
                    selector: { type: "string", description: "CSS选择器，例如 '#btnF'" }
                },
                required: ["selector"]
            }
        }
    }
];

// 工具执行函数映射
async function executeToolCall(bot, toolCall) {
    const { name, arguments: args } = toolCall.function;
    const parsedArgs = JSON.parse(args || '{}');
    logger.info(`🔧 执行工具: ${name}, 参数: ${JSON.stringify(parsedArgs)}`);

    switch (name) {
        case 'send_message':
            await bot.sendMessage(parsedArgs.content);
            return { success: true, result: `已发送: ${parsedArgs.content}` };
        case 'wait':
            await new Promise(resolve => setTimeout(resolve, parsedArgs.seconds * 1000));
            return { success: true, result: `等待了 ${parsedArgs.seconds} 秒` };
        case 'next_song':
            await bot.page.click('#btnF', { force: true });
            return { success: true, result: '已切换到下一首' };
        case 'previous_song':
            await bot.page.click('#btnD', { force: true });
            return { success: true, result: '已切换到上一首' };
        case 'stop_song':
            await bot.page.click('#btnG', { force: true });
            return { success: true, result: '已停止/暂停播放' };
        case 'play_song':
            const { executeCommand } = require('./actions');
            const reply = await executeCommand(bot, `/play ${parsedArgs.keyword}`);
            return { success: true, result: reply };
        case 'change_room':
            // 先点击返回大厅按钮
            await bot.page.click('#btnJ', { force: true });
            await bot.page.waitForSelector('.hallRoomList', { timeout: 10000 });
            if (parsedArgs.room_id !== undefined) {
                await bot.enterRoomById(parsedArgs.room_id);
            } else if (parsedArgs.room_name) {
                await bot.enterRoomByName(parsedArgs.room_name);
            } else {
                throw new Error('缺少 room_id 或 room_name');
            }
            // 重新打开聊天面板
            await bot.openChatPanel();
            return { success: true, result: `已切换到房间: ${parsedArgs.room_id || parsedArgs.room_name}` };
        case 'get_room_list':
            const rooms = await bot.getRoomList();
            const roomInfo = rooms.map(r => `ID ${r.id}: ${r.name}`).join('\n');
            return { success: true, result: `可用的房间列表：\n${roomInfo}` };
        case 'click_element':
            await bot.page.click(parsedArgs.selector, { force: true });
            return { success: true, result: `已点击 ${parsedArgs.selector}` };
        default:
            return { success: false, result: `未知工具: ${name}` };
    }
}

module.exports = { tools, executeToolCall };
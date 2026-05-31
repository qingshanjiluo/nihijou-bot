# 🤖 Nichijou AI Bot

> 基于 Playwright + LLM 的 [nichijou.cn](https://nichijou.cn) 聊天室 AI 机器人

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js)](https://nodejs.org)
[![Playwright](https://img.shields.io/badge/Playwright-1.40%2B-45ba4b?logo=playwright)](https://playwright.dev)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 📋 功能特性

- **🤖 AI 驱动对话** — 基于 LLM（大语言模型）自动生成回复，支持 OpenAI 兼容 API
- **🎵 音乐控制** — 点歌、切歌、调节音量、切换播放模式
- **✨ 魔法命令** — 支持 /sun、/rose、/shoe、/firework 等聊天室魔法
- **😊 表情系统** — 200+ 聊天表情，自动匹配命令触发动画
- **🔄 自动规划** — AI 自主决定何时回复、使用魔法或切换房间
- **🛡️ 速率限制** — 内置消息频率控制，防止刷屏
- **📝 日志记录** — 按日期自动分割的日志文件
- **🐳 Docker 支持** — 一键部署，开箱即用
- **☁️ GitHub Actions** — 支持 CI/CD 自动部署运行

## 🚀 快速开始

### 前置要求

- Node.js >= 18
- 一个 OpenAI 兼容的 API Key（支持 NVIDIA、OpenAI、DeepSeek 等）

### 安装

```bash
# 1. 克隆仓库
git clone https://github.com/qingshanjiluo/nihijou-bot.git
cd nihijou-bot

# 2. 安装依赖
npm install

# 3. 安装 Playwright 浏览器
npx playwright install chromium

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的 API Key 和机器人配置
```

### 配置

编辑 `.env` 文件：

```env
# AI 配置（必须）
AI_API_KEY=your_api_key_here      # OpenAI 兼容 API Key
AI_BASE_URL=https://api.openai.com/v1  # API 地址
AI_MODEL=gpt-3.5-turbo            # 模型名称

# 机器人身份
BOT_NICKNAME=你的昵称@账号         # 聊天室昵称
BOT_AVATAR_ID=39                  # 头像 ID

# 房间配置
DEFAULT_ROOM_NAME=流行歌分享       # 默认房间名称
DEFAULT_ROOM_ID=                  # 默认房间 ID（可选）
```

### 运行

```bash
# 直接运行
npm start

# 开发模式（文件变化自动重启）
npm run dev

# Docker 部署
docker compose up -d
```

## 🏗️ 项目结构

```
nichijou-ai-bot/
├── src/                    # 源代码
│   ├── index.js           # 入口文件，主循环
│   ├── browser.js         # 浏览器控制（Playwright）
│   ├── ai-engine.js       # AI 引擎（LLM 调用）
│   ├── config.js          # 配置管理
│   ├── actions.js         # 命令执行器
│   ├── tools.js           # 工具定义和执行
│   ├── message-handler.js # 消息监听与轮询
│   ├── rate-limiter.js    # 速率限制
│   ├── logger.js          # 日志系统
│   ├── brain.js           # [备用] 旧版决策引擎
│   ├── recorder.js        # [备用] 操作录制
│   ├── snapshot.js        # [备用] 页面快照
│   └── version.js         # 版本信息
├── style/                 # 风格配置
│   ├── emotions.js        # 表情命令映射（200+）
│   ├── magic.js           # 魔法命令列表
│   ├── system-prompt.md   # 系统提示模板
│   └── convert-emotions.ps1  # 表情转换脚本
├── style.txt              # 机器人性格设定
├── .env                   # 环境变量（已 gitignore）
├── .gitignore
├── docker-compose.yml     # Docker 编排
├── Dockerfile             # Docker 构建
├── package.json
└── README.md
```

## 🎮 命令列表

### 聊天命令

| 命令 | 说明 |
|------|------|
| `/sun` | 阳光普照，分享法力值给所有人 |
| `/rose_昵称` | 送花，增加对方 10 法力 |
| `/shoe_昵称` | 扔拖鞋，减少对方 10 法力 |
| `/firework` | 释放烟花特效 |
| `/air` | 查看当前法力值 |
| `/wow` | 释放礼炮 |

### 音乐控制

| 命令 | 说明 |
|------|------|
| `/play 歌名` | 搜索并播放歌曲 |
| `/next` 或 `/next_song` | 下一首 |
| `/prev` 或 `/previous_song` | 上一首 |
| `/volume 0-100` | 调节音量 |
| `/mode 顺序播放/随机播放/单曲循环` | 切换播放模式 |

### 调试命令（BOSS 专用）

| 命令 | 说明 |
|------|------|
| `/boss_next` | 强制切歌 |
| `/boss_prev` | 强制上一首 |
| `/boss_play 歌名` | 强制点歌 |
| `/boss_status` | 查看当前歌曲状态 |

### 表情命令

发送 `/微笑`、`/哈哈`、`/晚安` 等 200+ 表情命令触发对应动画。完整列表见 [`style/emotions.js`](style/emotions.js)。

## 🐳 Docker 部署

```bash
# 构建并启动
docker compose up -d

# 查看日志
docker compose logs -f

# 停止
docker compose down
```

## ☁️ GitHub Actions 部署

本项目支持通过 GitHub Actions 自动运行。需要在仓库的 **Settings → Secrets and variables → Actions** 中配置以下 Secrets：

| Secret | 说明 | 示例 |
|--------|------|------|
| `AI_API_KEY` | API Key | `sk-xxx` |
| `AI_BASE_URL` | API 地址 | `https://api.openai.com/v1` |
| `AI_MODEL` | 模型名称 | `gpt-3.5-turbo` |
| `BOT_NICKNAME` | 机器人昵称 | `最中幻想@pipi20100817` |
| `BOT_AVATAR_ID` | 头像 ID | `39` |
| `DEFAULT_ROOM_NAME` | 默认房间 | `流行歌分享` |

## ⚙️ 环境变量说明

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AI_API_KEY` | - | OpenAI 兼容 API Key（**必须**） |
| `AI_BASE_URL` | `https://api.openai.com/v1` | API 地址 |
| `AI_MODEL` | `gpt-3.5-turbo` | 模型名称 |
| `LLM_TEMPERATURE` | `0.7` | AI 温度参数 |
| `LLM_MAX_TOKENS` | `500` | 最大 Token 数 |
| `BOT_NICKNAME` | `最中幻想@pipi20100817` | 聊天室昵称 |
| `BOT_AVATAR_ID` | `32` | 头像 ID |
| `HEADLESS` | `true` | 是否无头模式 |
| `SLOW_MO` | `50` | 操作延迟(ms) |
| `REPLY_COOLDOWN_SEC` | `5` | 回复冷却时间 |
| `MAX_CONTEXT_MESSAGES` | `20` | 上下文消息数 |
| `PLAN_DEFAULT_WAIT_SEC` | `10` | 规划间隔秒数 |
| `RUN_DURATION_SEC` | `0` | 运行时长(0=无限) |
| `REPLY_TO_ALL` | `true` | 是否回复所有消息 |

## 🔧 开发

```bash
# 开发模式（nodemon 自动重启）
npm run dev

# 查看日志
tail -f logs/bot-$(date +%Y-%m-%d).log
```

## 📄 许可证

[MIT](LICENSE)

## 🙏 致谢

- [nichijou.cn](https://nichijou.cn) - 日常聊天室平台
- [Playwright](https://playwright.dev) - 浏览器自动化框架

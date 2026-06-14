---
name: supabase-html-app-blueprint
description: 构建 Supabase + GitHub Pages 单文件网页应用的标准流程和避坑指南
metadata: 
  node_type: memory
  type: project
  originSessionId: a03a7e9a-e9ce-4724-9f4b-67120f8647f2
---

# Supabase + GitHub Pages 单文件应用蓝图

## 技术选型

- **后端**: Supabase 免费版（PostgreSQL + Auth + Storage）
- **前端**: 单文件 HTML + Supabase JS CDN
- **部署**: GitHub Pages（免费，HTTPS）
- **数据库**: Supabase PostgreSQL，RLS 策略控制权限

## 标准流程（按顺序执行）

### 1. Supabase 项目创建
- supabase.com → GitHub 登录 → New Project
- 密码记下来，Region 选 Singapore
- 等 2 分钟初始化

### 2. 数据库建表
- Supabase SQL Editor → 粘贴建表 SQL
- **列名用 snake_case**（`question_text`、`create_time`、`image_id`）
- 必须创建 RLS 策略：自己的数据可读写，所有人可读（用于互访）
- 必须创建 `handle_new_user()` 触发器 + `UPDATE auth.users SET email_confirmed_at = NOW()` 跳过邮件验证

### 3. 获取密钥
- 用 Management API 拉取 anon key（避免用户在网页上找不到）
- 或直接在 Settings → API 页面复制
- Anon key 是公开的，可嵌入前端代码

### 4. 前端构建
- Supabase JS v2 从 CDN 加载：`<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`
- 初始化：`supabase.createClient(SUPABASE_URL, ANON_KEY)`

### 5. 配置注入
- **强制覆盖** localStorage 配置，不用 `if(!exists)`：
  ```js
  localStorage.setItem('mc_sb_url', URL);
  localStorage.setItem('mc_sb_key', KEY);
  localStorage.setItem('mc_mode', 'supabase');
  ```

### 6. 部署
- GitHub 新建 Public 仓库
- `git push` 推送代码
- Settings → Pages → Branch: `main` → Save
- URL: `https://用户名.github.io/仓库名/`

## 避坑清单

### ❌ better-sqlite3 在 Windows 需要 Python 编译工具
→ ✅ 改用 JSON 文件存储（server.js）或直接用 Supabase

### ❌ 数据库 snake_case 列名 vs JS camelCase 变量名不一致
- DB: `question_text` / JS: `questionText`
→ ✅ 在 `getQuestions()` 返回数据时**显式映射所有字段**：
```js
return data.map(q => ({
  ...q,
  questionText: q.question_text || '',
  knowledgePoints: q.knowledge_points || '',
  createTime: q.create_time,
  imageId: q.image_id,
  important: !!q.important,
}));
```

### ❌ `.single()` 查询不到单行时抛异常
→ ✅ 用 `.maybeSingle()` 返回 null 而不抛错

### ❌ 函数在 IIFE 闭包内，HTML onclick 属性访问不到
→ ✅ 需要全局调用的函数挂到 `window.showLightbox = function(){}`

### ❌ localStorage 用 `if(!getItem())` 预设配置，旧缓存导致跳过
→ ✅ 用 `localStorage.setItem()` 直接强制覆盖

### ❌ Supabase 新用户注册后 `email_confirmed_at` 为 null 导致登录失败
→ ✅ 在 `handle_new_user()` 触发器中加 `UPDATE auth.users SET email_confirmed_at = NOW()`

### ❌ 多条重复的注入代码块
→ ✅ 每次编辑后检查是否有重复代码，保持代码整洁

### ❌ 在终端用 curl 传 token 会被 Claude Code 拦截
→ ✅ 让用户在本地终端自己执行，或写 Node.js 脚本让用户跑

### ❌ 跨网络访问不能用 localhost
→ ✅ Supabase 是云服务天然跨网络，不需要自建服务器

## 项目结构模板
```
项目/
├── index.html           # 主入口（GitHub Pages 部署）
├── supabase-setup.sql   # 数据库建表脚本
└── .gitignore           # data/  .DS_Store
```

不需要 Node.js、不需要 server.js、不需要 package.json。

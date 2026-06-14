# 智学错题集 - 项目记忆

## 技术架构
- **前端**: 单文件 HTML，Supabase JS CDN
- **后端**: Supabase (PostgreSQL + Auth)
- **部署**: GitHub Pages
- **URL**: https://lsm-develop.github.io/mistake-book/
- **Supabase**: qjjzavoxrsuwfymqjduz.supabase.co

## 关键代码规范
1. **DB 字段 snake_case → JS camelCase 映射**: 在 getQuestions() 中显式转换 question_text→questionText, knowledge_points→knowledgePoints, create_time→createTime, image_id→imageId
2. **查询用 .maybeSingle()** 不要用 .single()（空结果不抛异常）
3. **全局函数挂 window**: onclick 属性调用的函数必须 `window.xxx = function(){}`
4. **配置强制覆盖**: localStorage.setItem() 不用 if(!exists)
5. **移动端 ≤768px**: 卡片布局替代表格，筛选栏可折叠
6. **注册触发器**: handle_new_user() 中 UPDATE email_confirmed_at = NOW() 跳过邮件验证

## 用户偏好
- 中文交流
- 单文件部署优先
- 手机拍照直调摄像头 (capture="environment")
- 图片 Canvas 压缩 800px/0.7质量
- 跨设备数据同步

## 项目文件
- index.html - 主应用（已部署）
- supabase-setup.sql - 数据库建表（含 RLS）
- .claude/ - 详细记忆文件

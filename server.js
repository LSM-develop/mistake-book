/*
 * 智学错题集 · 后端服务器
 * Node.js + Express + JSON文件存储
 * 支持多用户、跨设备数据同步、图片存储、数据互访
 * 零原生依赖，开箱即用
 */

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// ─── 配置 ───────────────────────────────────────────
const PORT = process.env.PORT || 3030;
const JWT_SECRET = process.env.JWT_SECRET || 'mistake_book_jwt_secret_2025';
const JWT_EXPIRES = '30d';
const BODY_LIMIT = '50mb';
const DATA_DIR = path.join(__dirname, 'data');

// ─── JSON 文件存储引擎 ───────────────────────────────
// 每个"表"对应一个 JSON 文件，内存中缓存，写操作同步落盘
function createStore(filename, defaultData = []) {
  const filePath = path.join(DATA_DIR, filename);
  let cache = null;

  function ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  function load() {
    if (cache !== null) return cache;
    ensureDir();
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        cache = JSON.parse(raw);
      } else {
        cache = defaultData;
        save();
      }
    } catch (e) {
      console.error(`[STORE] 读取 ${filename} 失败:`, e.message);
      cache = defaultData;
    }
    return cache;
  }

  function save() {
    ensureDir();
    try {
      fs.writeFileSync(filePath, JSON.stringify(cache, null, 2), 'utf-8');
    } catch (e) {
      console.error(`[STORE] 写入 ${filename} 失败:`, e.message);
    }
  }

  return {
    read() { return load(); },
    write(data) { cache = data; save(); },
    mutate(fn) { const d = this.read(); fn(d); this.write(d); },
    filePath,
  };
}

// 初始化各个存储
const usersStore = createStore('users.json', [
  { id: 1, username: 'admin', password: '', role: 'admin', created_at: new Date().toISOString() }
]);
const questionsStore = createStore('questions.json', []);
const subjectsStore = createStore('subjects.json', []);
const imagesStore = createStore('images.json', []);

// 初始化默认管理员密码
(function initAdmin() {
  const users = usersStore.read();
  const admin = users.find(u => u.username === 'admin');
  if (admin && !admin.password) {
    admin.password = bcrypt.hashSync('admin123', 10);
    usersStore.write(users);
    console.log('[INIT] 默认管理员已创建: admin / admin123');
  }
})();

// ─── Express 应用 ──────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

// ─── JWT 中间件 ─────────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录，请先登录' });
  }
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

// ─── 认证路由 ──────────────────────────────────────

app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    if (username.length < 2 || username.length > 20) return res.status(400).json({ error: '用户名长度需在2-20个字符之间' });
    if (password.length < 4) return res.status(400).json({ error: '密码长度至少4个字符' });

    const users = usersStore.read();
    if (users.find(u => u.username === username)) return res.status(409).json({ error: '用户名已存在' });

    const hash = bcrypt.hashSync(password, 10);
    const newId = users.length ? Math.max(...users.map(u => u.id)) + 1 : 1;
    const newUser = { id: newId, username, password: hash, role: 'user', created_at: new Date().toISOString() };
    users.push(newUser);
    usersStore.write(users);

    // 初始化默认科目
    const defaultSubjects = ['数学','语文','英语','物理','化学','生物','历史','地理','政治'];
    const allSubjects = subjectsStore.read();
    allSubjects.push({ user_id: newId, subjects: defaultSubjects });
    subjectsStore.write(allSubjects);

    console.log(`[AUTH] 新用户注册: ${username} (id=${newId})`);
    res.json({ success: true, message: '注册成功，请登录' });
  } catch (e) {
    console.error('[AUTH] 注册错误:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });

    const user = usersStore.read().find(u => u.username === username);
    if (!user) return res.status(401).json({ error: '用户名或密码错误' });
    if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: '用户名或密码错误' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET, { expiresIn: JWT_EXPIRES }
    );

    console.log(`[AUTH] 用户登录: ${username} (id=${user.id})`);
    res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (e) {
    console.error('[AUTH] 登录错误:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// ─── 错题 CRUD ─────────────────────────────────────

app.get('/api/questions', authMiddleware, (req, res) => {
  try {
    const questions = questionsStore.read()
      .filter(q => q.user_id === req.user.id)
      .sort((a, b) => b.create_time - a.create_time)
      .map(q => ({ ...q, important: !!q.important }));
    res.json({ questions });
  } catch (e) {
    console.error('[Q] 获取错题错误:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.post('/api/questions', authMiddleware, (req, res) => {
  try {
    const { id, subject, category, knowledgePoints, level, questionText, analysis, important, imageId, createTime } = req.body;
    if (!subject) return res.status(400).json({ error: '科目不能为空' });

    const qId = id || Date.now();
    const allQ = questionsStore.read();
    const existingIdx = allQ.findIndex(q => q.id === qId && q.user_id === req.user.id);

    const qData = {
      id: qId,
      user_id: req.user.id,
      subject,
      category: category || '',
      knowledge_points: knowledgePoints || '',
      level: level || 'medium',
      question_text: questionText || '',
      analysis: analysis || '',
      important: important ? 1 : 0,
      image_id: imageId || null,
      create_time: createTime || Date.now(),
    };

    if (existingIdx >= 0) {
      qData.create_time = allQ[existingIdx].create_time; // 保留原创建时间
      allQ[existingIdx] = qData;
    } else {
      allQ.push(qData);
    }

    questionsStore.write(allQ);
    res.json({ success: true, question: { ...qData, important: !!qData.important } });
  } catch (e) {
    console.error('[Q] 创建/更新错题错误:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.put('/api/questions/:id', authMiddleware, (req, res) => {
  try {
    const qId = parseInt(req.params.id);
    const { subject, category, knowledgePoints, level, questionText, analysis, important, imageId } = req.body;
    if (!subject) return res.status(400).json({ error: '科目不能为空' });

    const allQ = questionsStore.read();
    const idx = allQ.findIndex(q => q.id === qId && q.user_id === req.user.id);
    if (idx < 0) return res.status(404).json({ error: '错题不存在' });

    allQ[idx] = {
      ...allQ[idx],
      subject,
      category: category || '',
      knowledge_points: knowledgePoints || '',
      level: level || 'medium',
      question_text: questionText || '',
      analysis: analysis || '',
      important: important ? 1 : 0,
      image_id: imageId || null,
    };

    questionsStore.write(allQ);
    res.json({ success: true, question: { ...allQ[idx], important: !!allQ[idx].important } });
  } catch (e) {
    console.error('[Q] 更新错题错误:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.delete('/api/questions/:id', authMiddleware, (req, res) => {
  try {
    const qId = parseInt(req.params.id);
    let allQ = questionsStore.read();
    const question = allQ.find(q => q.id === qId && q.user_id === req.user.id);
    if (!question) return res.status(404).json({ error: '错题不存在' });

    // 删除关联图片
    if (question.image_id) {
      let allImg = imagesStore.read();
      allImg = allImg.filter(img => !(img.id === question.image_id && img.user_id === req.user.id));
      imagesStore.write(allImg);
    }

    allQ = allQ.filter(q => !(q.id === qId && q.user_id === req.user.id));
    questionsStore.write(allQ);
    res.json({ success: true });
  } catch (e) {
    console.error('[Q] 删除错题错误:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ─── 科目管理 ──────────────────────────────────────

app.get('/api/subjects', authMiddleware, (req, res) => {
  try {
    let record = subjectsStore.read().find(s => s.user_id === req.user.id);
    if (!record) {
      const def = ['数学','语文','英语','物理','化学','生物','历史','地理','政治'];
      const allS = subjectsStore.read();
      allS.push({ user_id: req.user.id, subjects: def });
      subjectsStore.write(allS);
      record = { subjects: def };
    }
    res.json({ subjects: record.subjects });
  } catch (e) {
    console.error('[SUBJ] 获取科目错误:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.put('/api/subjects', authMiddleware, (req, res) => {
  try {
    const { subjects } = req.body;
    if (!Array.isArray(subjects)) return res.status(400).json({ error: '科目数据格式错误' });

    const allS = subjectsStore.read();
    const idx = allS.findIndex(s => s.user_id === req.user.id);
    if (idx >= 0) {
      allS[idx].subjects = subjects;
    } else {
      allS.push({ user_id: req.user.id, subjects });
    }
    subjectsStore.write(allS);
    res.json({ success: true, subjects });
  } catch (e) {
    console.error('[SUBJ] 更新科目错误:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ─── 图片管理 ──────────────────────────────────────

app.post('/api/images', authMiddleware, (req, res) => {
  try {
    const { id, data } = req.body;
    if (!id || !data) return res.status(400).json({ error: '缺少图片ID或数据' });
    if (data.length > 15 * 1024 * 1024) return res.status(400).json({ error: '图片过大，请压缩后再上传' });

    const allImg = imagesStore.read();
    const existingIdx = allImg.findIndex(img => img.id === id && img.user_id === req.user.id);
    if (existingIdx >= 0) {
      allImg[existingIdx].data = data;
    } else {
      allImg.push({ id, user_id: req.user.id, data });
    }
    imagesStore.write(allImg);
    res.json({ success: true, id });
  } catch (e) {
    console.error('[IMG] 上传图片错误:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.get('/api/images/:id', authMiddleware, (req, res) => {
  try {
    const img = imagesStore.read().find(img => img.id === req.params.id && img.user_id === req.user.id);
    if (!img) return res.status(404).json({ error: '图片不存在' });
    res.json({ id: img.id, data: img.data });
  } catch (e) {
    console.error('[IMG] 获取图片错误:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.delete('/api/images/:id', authMiddleware, (req, res) => {
  try {
    let allImg = imagesStore.read();
    allImg = allImg.filter(img => !(img.id === req.params.id && img.user_id === req.user.id));
    imagesStore.write(allImg);
    res.json({ success: true });
  } catch (e) {
    console.error('[IMG] 删除图片错误:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ─── 数据互访 ──────────────────────────────────────

app.get('/api/explore/users', authMiddleware, (req, res) => {
  try {
    const allQ = questionsStore.read();
    const users = usersStore.read().map(u => {
      const qCount = allQ.filter(q => q.user_id === u.id).length;
      return { id: u.id, username: u.username, role: u.role, question_count: qCount, created_at: u.created_at };
    }).sort((a, b) => a.username.localeCompare(b.username));
    res.json({ users });
  } catch (e) {
    console.error('[EXP] 获取用户列表错误:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.get('/api/explore/:userId/questions', authMiddleware, (req, res) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    const targetUser = usersStore.read().find(u => u.id === targetUserId);
    if (!targetUser) return res.status(404).json({ error: '用户不存在' });

    const questions = questionsStore.read()
      .filter(q => q.user_id === targetUserId)
      .sort((a, b) => b.create_time - a.create_time)
      .map(q => ({ ...q, important: !!q.important }));

    res.json({ user: { id: targetUser.id, username: targetUser.username }, questions });
  } catch (e) {
    console.error('[EXP] 探索错题错误:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.get('/api/explore/:userId/images/:imgId', authMiddleware, (req, res) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    const img = imagesStore.read().find(img => img.id === req.params.imgId && img.user_id === targetUserId);
    if (!img) return res.status(404).json({ error: '图片不存在' });
    res.json({ id: img.id, data: img.data });
  } catch (e) {
    console.error('[EXP] 获取他人图片错误:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ─── 备份导入导出 ──────────────────────────────────

app.post('/api/backup/export', authMiddleware, (req, res) => {
  try {
    const questions = questionsStore.read()
      .filter(q => q.user_id === req.user.id)
      .sort((a, b) => b.create_time - a.create_time)
      .map(q => ({ ...q, important: !!q.important }));

    const images = {};
    imagesStore.read().filter(img => img.user_id === req.user.id).forEach(img => { images[img.id] = img.data; });

    const subjRecord = subjectsStore.read().find(s => s.user_id === req.user.id);
    const subjects = subjRecord ? subjRecord.subjects : [];

    res.json({
      exportVersion: '2.0',
      user: req.user.username,
      exportTime: new Date().toISOString(),
      questions, images, subjects,
    });
  } catch (e) {
    console.error('[BK] 导出错误:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.post('/api/backup/import', authMiddleware, (req, res) => {
  try {
    const { questions, images, subjects } = req.body;
    if (!questions && !images && !subjects) return res.status(400).json({ error: '备份数据为空' });

    // 导入错题（合并，以 id 为去重条件）
    if (questions && Array.isArray(questions)) {
      const allQ = questionsStore.read();
      const existingIds = new Set(allQ.filter(q => q.user_id === req.user.id).map(q => q.id));
      for (const q of questions) {
        const qData = {
          id: q.id,
          user_id: req.user.id,
          subject: q.subject || '',
          category: q.category || '',
          knowledge_points: q.knowledge_points || q.knowledgePoints || '',
          level: q.level || 'medium',
          question_text: q.question_text || q.questionText || '',
          analysis: q.analysis || '',
          important: q.important ? 1 : 0,
          image_id: q.image_id || q.imageId || null,
          create_time: q.create_time || q.createTime || Date.now(),
        };
        if (existingIds.has(q.id)) {
          const idx = allQ.findIndex(x => x.id === q.id && x.user_id === req.user.id);
          if (idx >= 0) allQ[idx] = qData;
        } else {
          allQ.push(qData);
        }
      }
      questionsStore.write(allQ);
    }

    // 导入图片
    if (images && typeof images === 'object') {
      const allImg = imagesStore.read();
      const existingImgIds = new Set(allImg.filter(img => img.user_id === req.user.id).map(img => img.id));
      for (const [id, data] of Object.entries(images)) {
        if (existingImgIds.has(id)) {
          const idx = allImg.findIndex(img => img.id === id && img.user_id === req.user.id);
          if (idx >= 0) allImg[idx].data = data;
        } else {
          allImg.push({ id, user_id: req.user.id, data });
        }
      }
      imagesStore.write(allImg);
    }

    // 导入科目
    if (subjects && Array.isArray(subjects)) {
      const allS = subjectsStore.read();
      const idx = allS.findIndex(s => s.user_id === req.user.id);
      if (idx >= 0) {
        // 合并科目
        const merged = [...new Set([...allS[idx].subjects, ...subjects])];
        allS[idx].subjects = merged;
      } else {
        allS.push({ user_id: req.user.id, subjects });
      }
      subjectsStore.write(allS);
    }

    res.json({ success: true, message: '导入成功' });
  } catch (e) {
    console.error('[BK] 导入错误:', e.message);
    res.status(500).json({ error: '服务器内部错误: ' + e.message });
  }
});

// ─── 管理员路由 ─────────────────────────────────────

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const allQ = questionsStore.read();
    const allImg = imagesStore.read();
    const users = usersStore.read().map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      created_at: u.created_at,
      question_count: allQ.filter(q => q.user_id === u.id).length,
      image_count: allImg.filter(img => img.user_id === u.id).length,
    }));
    res.json({ users });
  } catch (e) {
    console.error('[ADMIN] 获取用户列表错误:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (userId === req.user.id) return res.status(400).json({ error: '不能删除自己的管理员账号' });

    const users = usersStore.read();
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    // 删除所有关联数据
    usersStore.write(users.filter(u => u.id !== userId));
    questionsStore.write(questionsStore.read().filter(q => q.user_id !== userId));
    subjectsStore.write(subjectsStore.read().filter(s => s.user_id !== userId));
    imagesStore.write(imagesStore.read().filter(img => img.user_id !== userId));

    console.log(`[ADMIN] 管理员 ${req.user.username} 删除了用户 id=${userId}`);
    res.json({ success: true, message: '用户及所有数据已删除' });
  } catch (e) {
    console.error('[ADMIN] 删除用户错误:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ─── 静态文件服务 ──────────────────────────────────
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '错题集系统.html'));
});

// ─── 启动服务器 ─────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('═══════════════════════════════════════════');
  console.log('  📚 智学错题集 · 服务器已启动');
  console.log(`  🌐 本地访问: http://localhost:${PORT}`);
  console.log(`  📱 局域网访问: http://<本机IP>:${PORT}`);
  console.log(`  👤 默认管理员: admin / admin123`);
  console.log(`  💾 数据目录: ${DATA_DIR}`);
  console.log('═══════════════════════════════════════════');
});

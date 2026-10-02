// ==========================================
// Yozora × LAVA Forum — script.js
// ==========================================

const SUPABASE_URL = 'https://dveuaxwmdwblimcuxukg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1SjRmI6uwWUI7C_aRZ9Cvw_kWywHFaq';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentView = 'forumView';
let currentFilter = 'latest';
let activeVoiceChannel = null;

let isMuted = false;
let isDeafened = false;
let isCamOn = false;
let isVoiceFullscreen = false;

let usersInVoice = {};
let voiceChatMessages = {};
let localStream = null;
let contextMenuPostId = null;

let audioCtx = null;
let analyser = null;
let micSource = null;
let isSpeakingState = false;

let tracks = [];
let currentIndex = -1;
let widget = null;

let posts = [];
let users = [];
let ignoreRealtimeUntil = 0;

// ==========================================
// ПЕРЕКЛЮЧАТЕЛЬ ТЕМ
// ==========================================

function applyTheme(theme) {
    if (theme !== 'lava' && theme !== 'yozora') theme = 'lava';
    document.body.setAttribute('data-theme', theme);

    // Меняем логотип
    const logoIcon = document.getElementById('logoIcon');
    const logoText = document.getElementById('logoText');
    if (logoIcon) logoIcon.textContent = theme === 'lava' ? '🔥' : '🌌';
    if (logoText) logoText.textContent = theme === 'lava' ? 'LAVA' : 'Yozora';

    // Голосовой заголовок
    const voiceTitle = document.getElementById('voiceServerTitle');
    if (voiceTitle) voiceTitle.textContent = theme === 'lava' ? '🔥 LAVA Voice' : '🌌 Yozora Voice';

    localStorage.setItem('forum_theme', theme);
}

function toggleTheme() {
    const current = document.body.getAttribute('data-theme') || 'lava';
    const next = current === 'lava' ? 'yozora' : 'lava';
    applyTheme(next);
    showToast(next === 'lava' ? '🔥 Тема LAVA' : '🌌 Тема Yozora');
}

// ==========================================
// ЗАГРУЗКА / СОХРАНЕНИЕ
// ==========================================

window.onload = async function() {
    // Загружаем сохранённую тему
    const savedTheme = localStorage.getItem('forum_theme') || 'lava';
    applyTheme(savedTheme);

    loadUserFromStorage();
    initLavaDrips();
    initNightScene();
    initActivityTracking();
    initVoiceXpTimer();

    await loadUsersFromSupabase();
    await loadPostsFromSupabase();

    supabaseClient
        .channel('posts-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, payload => {
            handlePostRealtime(payload);
        })
        .subscribe();

    supabaseClient
        .channel('users-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, payload => {
            if (payload.new && payload.new.id) {
                const idx = users.findIndex(u => u.id === payload.new.id);
                const u = rowToUser(payload.new);
                if (idx > -1) users[idx] = u; else users.push(u);
            }
        })
        .subscribe();

    const volBar = document.getElementById('volumeBar');
    if (volBar) changeVolume(volBar.value);

    document.addEventListener('click', () => {
        const menu = document.getElementById('postContextMenu');
        if (menu) menu.style.display = 'none';
    });
};

// ==========================================
// ФОНОВЫЕ ЭФФЕКТЫ
// ==========================================

function initLavaDrips() {
    const container = document.getElementById('lavaDripsLayer');
    if (!container) return;
    for (let i = 0; i < 22; i++) {
        const drip = document.createElement('div');
        drip.className = 'lava-drip';
        drip.style.left = `${Math.random() * 100}%`;
        drip.style.animationDuration = `${5 + Math.random() * 9}s`;
        drip.style.animationDelay = `${Math.random() * 10}s`;
        drip.style.width = `${2 + Math.random() * 3}px`;
        container.appendChild(drip);
    }
}

function initNightScene() {
    const layer = document.getElementById('firefliesLayer');
    if (!layer) return;
    const count = 14;
    for (let i = 0; i < count; i++) {
        const fly = document.createElement('div');
        fly.className = 'firefly';
        const x = Math.random() * 100;
        const y = 60 + Math.random() * 40;
        const riseDuration = 25 + Math.random() * 20;
        const flickerDelay = Math.random() * 4;
        const flickerDur = 3 + Math.random() * 3;
        fly.style.left = x + '%';
        fly.style.top = y + '%';
        fly.style.animationDuration = `${riseDuration}s, ${flickerDur}s`;
        fly.style.animationDelay = `${Math.random() * -20}s, ${flickerDelay}s`;
        const size = 3 + Math.random() * 3;
        fly.style.width = size + 'px';
        fly.style.height = size + 'px';
        layer.appendChild(fly);
    }
}

// ==========================================
// USER / POST ROW
// ==========================================

function rowToUser(row) {
    return {
        id: row.id,
        username: row.username,
        email: row.email || '',
        password: row.password || '',
        avatar: row.avatar || '',
        banner: row.banner || '',
        xp: row.xp || 0,
        level: row.level || 1,
        isAdmin: !!row.is_admin,
        lastActive: row.last_active || 0,
        likedPostIds: row.liked_post_ids || [],
        createdAt: row.created_at || null
    };
}

function userToRow(u) {
    const row = {
        id: u.id,
        username: u.username,
        email: u.email || '',
        password: u.password || '',
        avatar: u.avatar || '',
        banner: u.banner || '',
        xp: u.xp || 0,
        level: u.level || 1,
        is_admin: !!u.isAdmin,
        last_active: u.lastActive || Date.now(),
        liked_post_ids: u.likedPostIds || []
    };
    if (u.createdAt) row.created_at = u.createdAt;
    return row;
}

async function loadUsersFromSupabase() {
    try {
        const { data, error } = await supabaseClient.from('users').select('*');
        if (error) throw error;
        users = (data || []).map(rowToUser);
    } catch (e) {
        console.warn('users load error, fallback local', e);
        users = JSON.parse(localStorage.getItem('lava_users')) || [];
    }
}

async function loadPostsFromSupabase() {
    try {
        const { data, error } = await supabaseClient
            .from('posts')
            .select('*')
            .order('id', { ascending: false });
        if (error) throw error;
        posts = (data || []).map(rowToPost);
    } catch (e) {
        console.warn('posts load error, fallback local', e);
        posts = JSON.parse(localStorage.getItem('lava_posts')) || [];
    }
    renderPosts();
}

function rowToPost(row) {
    return {
        id: row.id,
        title: row.title || '',
        text: row.text || '',
        author: row.author || '',
        authorId: row.authorid || '',
        avatar: row.avatar || '',
        date: row.date || '',
        likes: row.likes || 0,
        likedBy: row.likedby || [],
        comments: row.comments || [],
        media: row.media || ''
    };
}

function postToRow(p) {
    return {
        title: p.title,
        text: p.text,
        author: p.author,
        authorid: p.authorId,
        avatar: p.avatar,
        date: p.date,
        likes: p.likes,
        likedby: p.likedBy || [],
        comments: p.comments || [],
        media: p.media || ''
    };
}

function handlePostRealtime(payload) {
    if (Date.now() < ignoreRealtimeUntil) {
        if (payload.new) {
            const evt = payload.eventType;
            if (evt === 'INSERT' || evt === 'UPDATE') {
                const incoming = rowToPost(payload.new);
                const idx = posts.findIndex(p => p.id === incoming.id);
                if (idx > -1) posts[idx] = incoming;
                else posts.unshift(incoming);
            }
        }
        return;
    }

    const evt = payload.eventType;
    if (evt === 'INSERT' || evt === 'UPDATE') {
        if (!payload.new) return;
        const incoming = rowToPost(payload.new);
        const idx = posts.findIndex(p => p.id === incoming.id);
        if (idx > -1) posts[idx] = incoming;
        else posts.unshift(incoming);
    } else if (evt === 'DELETE') {
        if (payload.old && payload.old.id) posts = posts.filter(p => p.id !== payload.old.id);
    }
    renderPosts();
    if (currentView === 'likedView') renderLikedPosts();
    if (currentView === 'profileView' && currentUser) showProfileView(currentUser.id);
}

async function savePostToSupabase(post) {
    localStorage.setItem('lava_posts', JSON.stringify(posts));
    try {
        if (!post.id || post.id > 1e12) {
            const { data, error } = await supabaseClient
                .from('posts')
                .insert(postToRow(post))
                .select()
                .single();
            if (error) throw error;
            if (data) {
                const real = rowToPost(data);
                const idx = posts.findIndex(p => p.id === post.id);
                if (idx > -1) posts[idx] = real;
            }
        } else {
            const { error } = await supabaseClient
                .from('posts')
                .update(postToRow(post))
                .eq('id', post.id);
            if (error) throw error;
        }
    } catch (e) {
        console.error('savePost error:', e);
    }
}

async function deletePostFromSupabase(postId) {
    try {
        await supabaseClient.from('posts').delete().eq('id', postId);
    } catch (e) {
        console.error('deletePost error:', e);
    }
}

async function saveUserToSupabase(user) {
    try {
        await supabaseClient.from('users').upsert(userToRow(user));
        localStorage.setItem('lava_users', JSON.stringify(users));
    } catch (e) {
        console.error('saveUser error:', e);
    }
}

function saveData() {
    localStorage.setItem('lava_posts', JSON.stringify(posts));
    localStorage.setItem('lava_users', JSON.stringify(users));
}
function saveDataToSupabase() { saveData(); }

// ==========================================
// АДМИН
// ==========================================

function openAdminModal() {
    document.getElementById('adminLoginInput').value = '';
    document.getElementById('adminPassInput').value = '';
    openModal('adminModal');
}

async function submitAdminAuth() {
    const login = document.getElementById('adminLoginInput').value.trim();
    const pass = document.getElementById('adminPassInput').value.trim();

    if (login === 'adminss' && pass === '0992166') {
        if (!currentUser) {
            currentUser = {
                id: 'admin_usr_' + Date.now(),
                username: 'Admin',
                email: 'admin@gmail.com',
                avatar: '', banner: '',
                lastActive: Date.now(),
                xp: 500, level: 99,
                likedPostIds: [],
                isAdmin: true,
                createdAt: Date.now()
            };
            users.push(currentUser);
        } else {
            currentUser.isAdmin = true;
            const idx = users.findIndex(u => u.id === currentUser.id);
            if (idx > -1) users[idx] = currentUser;
        }
        localStorage.setItem('lava_current_user', JSON.stringify(currentUser));
        await saveUserToSupabase(currentUser);
        updateHeaderAndSidebar();
        closeModal('adminModal');
        showToast("🛡️ Вы авторизовались как Администратор!");
        renderPosts();
        if (currentView === 'profileView') showProfileView(currentUser.id);
    } else {
        showToast("Неверный логин или пароль админа!");
    }
}

async function exitAdminMode() {
    if (!currentUser) return;
    currentUser.isAdmin = false;
    const idx = users.findIndex(u => u.id === currentUser.id);
    if (idx > -1) users[idx] = currentUser;
    localStorage.setItem('lava_current_user', JSON.stringify(currentUser));
    await saveUserToSupabase(currentUser);
    updateHeaderAndSidebar();
    renderPosts();
    if (currentView === 'profileView') showProfileView(currentUser.id);
    showToast("Вы вышли из админ режима");
}

// ==========================================
// XP
// ==========================================

function addXp(amount, showNotification = false) {
    if (!currentUser) return;
    if (!currentUser.xp) currentUser.xp = 0;
    if (!currentUser.level) currentUser.level = 1;

    currentUser.xp += amount;
    while (currentUser.xp >= 100) {
        currentUser.xp -= 100;
        currentUser.level += 1;
        showToast(`🎉 Поздравляем! Уровень повышен до ${currentUser.level}!`);
    }

    const idx = users.findIndex(u => u.id === currentUser.id);
    if (idx > -1) users[idx] = currentUser;
    localStorage.setItem('lava_current_user', JSON.stringify(currentUser));
    saveUserToSupabase(currentUser);
    updateHeaderAndSidebar();

    if (showNotification) showXpPopup();
}

function initVoiceXpTimer() {
    setInterval(() => {
        if (currentUser && activeVoiceChannel) addXp(15, false);
    }, 5 * 60 * 1000);
}

let xpPopupTimeout = null;
function showXpPopup() {
    const popup = document.getElementById('xpPopup');
    const fill = document.getElementById('xpBarFill');
    const title = document.getElementById('xpPopupTitle');
    const lvl = currentUser ? (currentUser.level || 1) : 1;
    const xp = currentUser ? (currentUser.xp || 0) : 0;
    title.textContent = `Ваш уровень: ${lvl} (${xp}/100 XP)`;
    fill.style.width = `${xp}%`;
    popup.classList.add('show');
    if (xpPopupTimeout) clearTimeout(xpPopupTimeout);
    xpPopupTimeout = setTimeout(() => popup.classList.remove('show'), 7000);
}

function openXP() {
    if (!currentUser) { openAuth('login'); showToast("Сначала войдите в аккаунт"); return; }
    showXpPopup();
}

function getDeclension(number, one, few, many) {
    const mod10 = number % 10, mod100 = number % 100;
    if (mod100 >= 11 && mod100 <= 19) return many;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;
    return many;
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return "в сети";
    const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSeconds < 10) return "В сети";
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `был ${diffMinutes} ${getDeclension(diffMinutes, "минуту", "минуты", "минут")} назад`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `был ${diffHours} ${getDeclension(diffHours, "час", "часа", "часов")} назад`;
    const diffDays = Math.floor(diffHours / 24);
    return `был ${diffDays} ${getDeclension(diffDays, "день", "дня", "дней")} назад`;
}

function formatDateNow() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatPostDate(raw) {
    if (!raw) return '';
    const m = String(raw).match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/);
    if (!m) return raw;

    const postDate = new Date(
        parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]),
        parseInt(m[4]), parseInt(m[5])
    );
    const now = new Date();
    const diffMin = Math.floor((now - postDate) / 60000);
    const pad = n => String(n).padStart(2, '0');
    const timeStr = `${pad(postDate.getHours())}:${pad(postDate.getMinutes())}`;

    if (diffMin < 1) return 'только что';
    if (diffMin < 60) return `${diffMin} ${getDeclension(diffMin, 'минуту', 'минуты', 'минут')} назад`;
    if (postDate.toDateString() === now.toDateString()) return `сегодня в ${timeStr}`;

    const yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    if (postDate.toDateString() === yest.toDateString()) return `вчера в ${timeStr}`;

    return `${pad(postDate.getDate())}.${pad(postDate.getMonth() + 1)}.${postDate.getFullYear()} ${timeStr}`;
}

function formatRegistrationDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function initActivityTracking() {
    setInterval(() => {
        if (currentUser) {
            currentUser.lastActive = Date.now();
            localStorage.setItem('lava_current_user', JSON.stringify(currentUser));
        }
        const statusElem = document.getElementById('userStatusText');
        if (statusElem) statusElem.textContent = currentUser ? "В сети" : "Гость";
    }, 1000);
}

function loadUserFromStorage() {
    const saved = localStorage.getItem('lava_current_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        currentUser.lastActive = Date.now();
        if (!currentUser.likedPostIds) currentUser.likedPostIds = [];
        if (currentUser.level === undefined) currentUser.level = 1;
        updateHeaderAndSidebar();
    }
}

function updateHeaderAndSidebar() {
    const sideName = document.getElementById('sideUsername');
    const sideAvatar = document.getElementById('sideAvatar');
    const sideLevel = document.getElementById('sideUserLevel');
    const accBtn = document.getElementById('accountButton');
    const headerAcc = document.getElementById('headerAccount');

    if (currentUser) {
        const adminBadge = currentUser.isAdmin ? ' 🛡️' : '';
        sideName.textContent = currentUser.username + adminBadge;
        sideAvatar.innerHTML = currentUser.avatar ? `<img src="${currentUser.avatar}">` : '👤';
        if (sideLevel) {
            sideLevel.textContent = currentUser.level || 1;
            sideLevel.style.display = 'inline-block';
        }

        if (currentUser.isAdmin) {
            accBtn.textContent = 'Выйти из админ режима';
            accBtn.onclick = exitAdminMode;
        } else {
            accBtn.textContent = 'Выйти';
            accBtn.onclick = logout;
        }

        headerAcc.innerHTML = `
            <button class="accent-button" onclick="protectedAction(() => showProfileView(currentUser.id))">Профиль ${adminBadge}</button>
            <button onclick="logout()">Выйти</button>
        `;
    } else {
        sideName.textContent = "Гость";
        sideAvatar.innerHTML = '👤';
        if (sideLevel) sideLevel.style.display = 'none';
        accBtn.textContent = 'Войти';
        accBtn.onclick = () => openAuth('login');

        headerAcc.innerHTML = `
            <button onclick="openAuth('login')">Войти</button>
            <button class="accent-button" onclick="openAuth('register')">Регистрация</button>
        `;
    }

    if (typeof updatePresence === 'function') updatePresence();
}

async function logout() {
    if (currentUser) {
        currentUser.lastActive = Date.now() - 60000;
        const idx = users.findIndex(u => u.id === currentUser.id);
        if (idx > -1) users[idx] = currentUser;
        await saveUserToSupabase(currentUser);
    }
    currentUser = null;
    localStorage.removeItem('lava_current_user');
    updateHeaderAndSidebar();
    showToast("Вы вышли из системы");
    renderPosts();
}

function protectedAction(callback) {
    if (!currentUser) { openAuth('login'); showToast("Сначала войдите в аккаунт"); return; }
    callback();
}

function showForumView() { switchView('forumView'); renderPosts(); }
function showVoiceView() { switchView('voiceView'); }

function openLikedView() {
    if (!currentUser) { openAuth('login'); showToast("Сначала войдите в аккаунт"); return; }
    switchView('likedView');
    renderLikedPosts();
}

function switchView(viewId) {
    currentView = viewId;
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.getElementById(viewId).style.display = 'flex';
}

// ==========================================
// ПОСТЫ
// ==========================================

function generatePostHTML(post) {
    const isLikedByMe = currentUser && currentUser.likedPostIds && currentUser.likedPostIds.includes(post.id);
    const canDeletePost = currentUser && (currentUser.id === post.authorId || currentUser.isAdmin);
    const canDeleteMedia = currentUser && currentUser.isAdmin && post.media;

    return `
        <div class="post" data-post-id="${post.id}" oncontextmenu="handlePostContextMenu(event, ${post.id})">
            <div class="post-head">
                <div class="post-author-row" onclick="showProfileView('${post.authorId}')">
                    <div class="post-user-avatar">${post.avatar ? `<img src="${post.avatar}">` : '👤'}</div>
                    <div>
                        <span class="post-author">${escapeHtml(post.author)}</span>
                        <span class="post-time">${escapeHtml(formatPostDate(post.date))}</span>
                    </div>
                </div>
            </div>
            <h2 class="lava-topic-title">${escapeHtml(post.title)}</h2>
            <p class="post-text">${escapeHtml(post.text)}</p>
            ${post.media ? `
                <div style="position:relative; display:inline-block; max-width:100%;">
                    <img src="${post.media}" class="post-media">
                    ${canDeleteMedia ? `<button onclick="deletePostImage(${post.id})" style="position:absolute; top:8px; right:8px; background:rgba(244,113,181,0.9); color:#fff; border:none; border-radius:6px; padding:4px 8px; font-size:11px; cursor:pointer;">🗑 Удалить фото</button>` : ''}
                </div>
            ` : ''}
            <div class="post-footer-row" style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; flex-wrap: wrap; gap: 10px;">
                <div class="post-actions" style="margin-bottom: 0;">
                    <button onclick="toggleLike(${post.id}, this)" class="like-btn ${isLikedByMe ? 'liked' : ''}">
                        <span class="heart-icon">❤</span> <span class="like-count">${post.likes}</span>
                    </button>
                    <button onclick="openComments(${post.id})">💬 Комментарии (${post.comments ? post.comments.length : 0})</button>
                    ${canDeletePost ? `<button onclick="deletePost(${post.id})" style="color:#f471b5;">🗑 Удалить</button>` : ''}
                </div>
            </div>
        </div>
    `;
}

async function deletePostImage(postId) {
    if (!currentUser || !currentUser.isAdmin) return;
    const post = posts.find(p => p.id === postId);
    if (post) {
        post.media = '';
        await savePostToSupabase(post);
        renderPosts();
        if (currentView === 'profileView') showProfileView(post.authorId);
        showToast("🛡 Картинка поста удалена админом");
    }
}

function renderPosts() {
    const container = document.getElementById('posts');
    if (!container) return;
    const searchInput = document.getElementById('searchInput');
    const searchVal = searchInput ? searchInput.value.toLowerCase() : '';

    let filtered = posts.filter(p =>
        (p.title || '').toLowerCase().includes(searchVal) ||
        (p.text || '').toLowerCase().includes(searchVal)
    );

    if (currentFilter === 'popular') filtered.sort((a, b) => b.likes - a.likes);
    else filtered.sort((a, b) => b.id - a.id);

    const topicCountElem = document.getElementById('topicCount');
    if (topicCountElem) topicCountElem.textContent = `${filtered.length} тем`;

    if (filtered.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:var(--muted); padding:40px; font-size:14px;">🔥 Пока тихо... Создай первую тему</div>`;
        return;
    }
    container.innerHTML = filtered.map(generatePostHTML).join('');
}

function renderLikedPosts() {
    const container = document.getElementById('likedPostsList');
    if (!container) return;
    if (!currentUser || !currentUser.likedPostIds || currentUser.likedPostIds.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:var(--muted); padding:30px;">У вас пока нет понравившихся тем</div>`;
        return;
    }
    const likedPosts = posts.filter(p => currentUser.likedPostIds.includes(p.id));
    if (likedPosts.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:var(--muted); padding:30px;">У вас пока нет понравившихся тем</div>`;
        return;
    }
    container.innerHTML = likedPosts.map(generatePostHTML).join('');
}

function handlePostContextMenu(event, postId) {
    event.preventDefault();
    contextMenuPostId = postId;
    const menu = document.getElementById('postContextMenu');
    menu.style.top = `${event.clientY}px`;
    menu.style.left = `${event.clientX}px`;
    menu.style.display = 'block';
}

function openReportModalFromContext() {
    document.getElementById('postContextMenu').style.display = 'none';
    openModal('reportModal');
}

function setFilter(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderPosts();
}

function createPost() {
    document.getElementById('postTitle').value = '';
    document.getElementById('postText').value = '';
    document.getElementById('postMediaFile').value = '';
    const el = document.getElementById('postMediaName');
    if (el) el.textContent = '';
    openModal('postModal');
}

function submitPost() {
    const title = document.getElementById('postTitle').value.trim();
    const text = document.getElementById('postText').value.trim();
    const fileInput = document.getElementById('postMediaFile');

    if (!title || !text) { showToast("Заполните заголовок и текст"); return; }

    const finishCreation = async (mediaUrl = '') => {
        const tempPost = {
            id: Date.now(),
            title, text,
            author: currentUser.username,
            authorId: currentUser.id,
            avatar: currentUser.avatar || '',
            date: formatDateNow(),
            likes: 0,
            likedBy: [],
            comments: [],
            media: mediaUrl
        };
        posts.unshift(tempPost);
        renderPosts();
        closeModal('postModal');

        await savePostToSupabase(tempPost);

        if (currentView === 'profileView') showProfileView(currentUser.id);
        addXp(20, false);
        showToast("Тема успешно создана! (+20 XP)");
    };

    if (fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = e => finishCreation(e.target.result);
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        finishCreation('');
    }
}

async function deletePost(id) {
    const postToDelete = posts.find(p => p.id === id);
    if (postToDelete && currentUser && postToDelete.authorId === currentUser.id) addXp(-20, false);

    posts = posts.filter(p => p.id !== id);
    users.forEach(u => {
        if (u.likedPostIds) u.likedPostIds = u.likedPostIds.filter(pid => pid !== id);
    });
    if (currentUser && currentUser.likedPostIds) {
        currentUser.likedPostIds = currentUser.likedPostIds.filter(pid => pid !== id);
        localStorage.setItem('lava_current_user', JSON.stringify(currentUser));
        await saveUserToSupabase(currentUser);
    }
    await deletePostFromSupabase(id);
    renderPosts();
    if (currentView === 'likedView') renderLikedPosts();
    if (currentView === 'profileView') showProfileView(currentUser ? currentUser.id : '');
    showToast("Тема удалена");
}

async function toggleLike(postId, btn) {
    if (!currentUser) { openAuth('login'); return; }
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    if (!post.likedBy) post.likedBy = [];
    if (!currentUser.likedPostIds) currentUser.likedPostIds = [];

    const index = post.likedBy.indexOf(currentUser.id);
    const wasLiked = index > -1;

    if (wasLiked) {
        post.likedBy.splice(index, 1);
        post.likes--;
        currentUser.likedPostIds = currentUser.likedPostIds.filter(id => id !== postId);
        addXp(-10, false);
        showToast("❤ Лайк снят (-10 XP)");
    } else {
        post.likedBy.push(currentUser.id);
        post.likes++;
        if (!currentUser.likedPostIds.includes(postId)) currentUser.likedPostIds.push(postId);
        addXp(10, false);
        showToast("❤ Лайк поставлен! (+10 XP)");
    }

    ignoreRealtimeUntil = Date.now() + 1200;

    const idx = users.findIndex(u => u.id === currentUser.id);
    if (idx > -1) users[idx] = currentUser;
    localStorage.setItem('lava_current_user', JSON.stringify(currentUser));
    await savePostToSupabase(post);
    await saveUserToSupabase(currentUser);

    if (btn) {
        btn.classList.toggle('liked', !wasLiked);
        const countEl = btn.querySelector('.like-count');
        if (countEl) countEl.textContent = post.likes;

        if (!wasLiked) {
            btn.classList.remove('flash');
            void btn.offsetWidth;
            btn.classList.add('flash');
            setTimeout(() => btn.classList.remove('flash'), 600);
        }
    }

    if (currentView === 'likedView') renderLikedPosts();
    if (currentView === 'profileView') showProfileView(currentUser.id);
}

// ==========================================
// КОММЕНТАРИИ
// ==========================================

let currentCommentPostId = null;
function openComments(postId) {
    currentCommentPostId = postId;
    renderCommentsList();
    openModal('commentsModal');
}

function renderCommentsList() {
    const post = posts.find(p => p.id === currentCommentPostId);
    if (!post) return;
    document.getElementById('commentsTitle').textContent = `Комментарии`;
    const container = document.getElementById('commentsList');

    if (!post.comments || post.comments.length === 0) {
        container.innerHTML = `<div style="color:var(--muted); text-align:center; padding:20px;">Пока нет комментариев</div>`;
        return;
    }
    container.innerHTML = post.comments.map(c => {
        const canDeleteComment = currentUser && (currentUser.id === c.authorId || currentUser.isAdmin);
        const canDeleteMedia = currentUser && currentUser.isAdmin && c.media;

        let avatar = c.avatar || '';
        if (!avatar) {
            const u = users.find(x => x.id === c.authorId);
            if (u && u.avatar) avatar = u.avatar;
        }

        return `
            <div class="comment" style="margin-bottom:10px; display: flex; gap:10px; align-items: flex-start; background: var(--accent-glow); padding:10px 12px; border-radius:10px; border: 1px solid var(--border);">
                <div class="comment-avatar" style="width:38px; height:38px; flex-shrink:0; border-radius:50%; overflow:hidden; background:var(--panel-solid); display:flex; align-items:center; justify-content:center; font-size:16px; border: 2px solid var(--accent);">
                    ${avatar ? `<img src="${avatar}" style="width:100%;height:100%;object-fit:cover;">` : '👤'}
                </div>
                <div style="flex:1;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                        <div style="font-weight:700; font-size:13px; color:var(--accent-bright);">
                            ${escapeHtml(c.author)}
                            <span style="font-size:10px; color:var(--muted); font-weight:400; margin-left:6px;">${escapeHtml(formatPostDate(c.date || ''))}</span>
                        </div>
                        ${canDeleteComment ? `<button onclick="deleteComment(${c.id})" style="background:transparent; border:none; color:var(--danger); cursor:pointer; font-size:12px;">Удалить</button>` : ''}
                    </div>
                    <div style="font-size:13px; color:var(--text-soft); margin-top:3px;">${escapeHtml(c.text)}</div>
                    ${c.media ? `
                        <div style="position:relative; display:inline-block; margin-top:6px;">
                            <img src="${c.media}" class="comment-media">
                            ${canDeleteMedia ? `<button onclick="deleteCommentImage(${post.id}, ${c.id})" style="position:absolute; top:4px; right:4px; background:rgba(244,113,181,0.9); color:#fff; border:none; border-radius:4px; padding:2px 6px; font-size:10px; cursor:pointer;">🗑 Фото</button>` : ''}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

async function deleteCommentImage(postId, commentId) {
    if (!currentUser || !currentUser.isAdmin) return;
    const post = posts.find(p => p.id === postId);
    if (post && post.comments) {
        const comment = post.comments.find(c => c.id === commentId);
        if (comment) {
            comment.media = '';
            await savePostToSupabase(post);
            renderCommentsList();
            showToast("🛡️ Картинка комментария удалена");
        }
    }
}

function submitComment() {
    const textInput = document.getElementById('commentText');
    const fileInput = document.getElementById('commentMediaFile');
    const text = textInput.value.trim();
    if (!text && !fileInput.files[0]) return;

    const post = posts.find(p => p.id === currentCommentPostId);
    if (!post) return;
    if (!post.comments) post.comments = [];

    const finishComment = async (mediaUrl = '') => {
        post.comments.push({
            id: Date.now(),
            authorId: currentUser.id,
            author: currentUser.username,
            avatar: currentUser.avatar || '',
            text,
            date: formatDateNow(),
            media: mediaUrl
        });
        textInput.value = '';
        fileInput.value = '';
        const el = document.getElementById('commentMediaName');
        if (el) el.textContent = '';

        await savePostToSupabase(post);
        renderCommentsList();
        renderPosts();
        if (currentView === 'likedView') renderLikedPosts();
        addXp(10, false);
        showToast("💬 Комментарий отправлен! (+10 XP)");
    };

    if (fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = e => finishComment(e.target.result);
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        finishComment('');
    }
}

async function deleteComment(commentId) {
    const post = posts.find(p => p.id === currentCommentPostId);
    if (!post || !post.comments) return;
    const i = post.comments.findIndex(c => c.id === commentId);
    if (i > -1) {
        post.comments.splice(i, 1);
        await savePostToSupabase(post);
        renderCommentsList();
        renderPosts();
        if (currentView === 'likedView') renderLikedPosts();
        addXp(-10, false);
        showToast("Комментарий удален (-10 XP)");
    }
}

// ==========================================
// ГОЛОСОВЫЕ КАНАЛЫ
// ==========================================

const voiceChannelsData = [
    { id: 'general', name: '🔊 Общий канал' },
    { id: 'gaming', name: '🎮 Игровая зона' },
    { id: 'music', name: '🎵 Музыкальный чилл' }
];

function setupAudioAnalysis(stream) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        micSource = audioCtx.createMediaStreamSource(stream);
        micSource.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        function checkVolume() {
            if (!localStream || isMuted) {
                if (isSpeakingState) { isSpeakingState = false; renderVoiceGrid(); }
                requestAnimationFrame(checkVolume);
                return;
            }
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const speakingNow = (sum / dataArray.length) > 12;
            if (speakingNow !== isSpeakingState) { isSpeakingState = speakingNow; renderVoiceGrid(); }
            requestAnimationFrame(checkVolume);
        }
        checkVolume();
    } catch (e) {
        console.warn("Audio Context setup warning:", e);
    }
}

async function joinVoiceChannel(channelId) {
    if (!currentUser) {
        openAuth('login');
        showToast("Войдите, чтобы подключиться");
        return;
    }

    try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStream = audioStream;
        setupAudioAnalysis(audioStream);
        if (localStream.getAudioTracks().length > 0) {
            localStream.getAudioTracks()[0].enabled = !isMuted;
        }
    } catch (err) {
        showToast("Микрофон подключен в симуляционном режиме");
        localStream = null;
    }

    for (let key in usersInVoice) {
        usersInVoice[key] = usersInVoice[key].filter(u => u.id !== currentUser.id);
    }

    if (!usersInVoice[channelId]) usersInVoice[channelId] = [];
    usersInVoice[channelId].push({
        id: currentUser.id,
        name: currentUser.username,
        avatar: currentUser.avatar || ''
    });

    activeVoiceChannel = channelId;

    const channelObj = voiceChannelsData.find(c => c.id === channelId);
    document.getElementById('activeVoiceHeader').textContent = `# ${channelObj.name}`;

    document.getElementById('voiceGridArea').style.display = 'block';
    document.getElementById('discordVoiceBar').style.display = 'flex';
    document.getElementById('discordInputBox').style.display = 'flex';
    document.getElementById('discordMessages').style.display = 'flex';

    renderVoiceChannels();
    renderVoiceGrid();
    renderVoiceChatMessages();
    showToast(`Подключено к: ${channelObj.name}`);
}

function disconnectVoice() {
    if (!activeVoiceChannel) return;

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    usersInVoice[activeVoiceChannel] = usersInVoice[activeVoiceChannel].filter(u => u.id !== currentUser.id);
    activeVoiceChannel = null;

    document.getElementById('voiceGridArea').style.display = 'none';
    document.getElementById('discordVoiceBar').style.display = 'none';
    document.getElementById('discordInputBox').style.display = 'none';
    document.getElementById('discordMessages').style.display = 'none';
    document.getElementById('activeVoiceHeader').textContent = '# Выберите голосовой канал';

    renderVoiceChannels();
    showToast("Отключено от канала");
}

function renderVoiceChannels() {
    const listElem = document.getElementById('voiceChannelsList');
    if (!listElem) return;
    listElem.innerHTML = voiceChannelsData.map(ch => `
        <div class="discord-channel-group">
            <div class="discord-channel-row ${activeVoiceChannel === ch.id ? 'active' : ''}" onclick="joinVoiceChannel('${ch.id}')">
                <span>${ch.name}</span>
                <span style="font-size:11px; color:var(--muted);">${usersInVoice[ch.id] ? usersInVoice[ch.id].length : 0}</span>
            </div>
            <div class="discord-channel-users-list">
                ${(usersInVoice[ch.id] || []).map(u => `
                    <div class="discord-subchannel-user" onclick="openVoiceUserModal('${u.id}', '${escapeHtml(u.name)}')">
                        <div class="mini-avatar">${u.avatar ? `<img src="${u.avatar}">` : '👤'}</div>
                        <span>${escapeHtml(u.name)}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function renderVoiceGrid() {
    if (!activeVoiceChannel) return;
    const grid = document.getElementById('discordUsersGrid');
    const members = usersInVoice[activeVoiceChannel] || [];

    grid.innerHTML = members.map(m => {
        const isMe = m.id === currentUser?.id;
        const speaking = isMe ? (isSpeakingState && !isMuted && !m.adminMuted) : false;
        const userMuted = isMe ? (isMuted || m.adminMuted) : (m.isMuted || m.adminMuted);
        const userDeaf = isMe ? (isDeafened || m.adminDeafened) : (m.isDeafened || m.adminDeafened);

        let mediaHtml = (isMe && isCamOn)
            ? `<video class="tile-video" autoplay playsinline muted id="selfVideoElem"></video>`
            : `<div class="tile-avatar">${m.avatar ? `<img src="${m.avatar}">` : '👤'}</div>`;

        return `
            <div class="discord-user-tile ${userMuted ? 'muted' : ''} ${speaking ? 'speaking' : ''}" onclick="openVoiceUserModal('${m.id}', '${escapeHtml(m.name)}')">
                ${mediaHtml}
                <div class="tile-username">
                    ${escapeHtml(m.name)}
                    ${userMuted ? '🔇' : ''}
                    ${userDeaf ? '🎧' : ''}
                </div>
            </div>
        `;
    }).join('');

    if (isCamOn && localStream && localStream.getVideoTracks().length > 0) {
        setTimeout(() => {
            const vElem = document.getElementById('selfVideoElem');
            if (vElem) {
                vElem.srcObject = localStream;
                vElem.play().catch(e => console.log(e));
            }
        }, 50);
    }
}

function toggleMuteMic() {
    isMuted = !isMuted;
    if (localStream && localStream.getAudioTracks().length > 0) {
        localStream.getAudioTracks()[0].enabled = !isMuted;
    }
    const btn = document.getElementById('micBtn');
    btn.style.background = isMuted ? '#f471b5' : 'rgba(255,255,255,0.05)';
    btn.textContent = isMuted ? '🔇 Выкл. микр' : '🎤 Микрофон';
    renderVoiceGrid();
}

function toggleDeafen() {
    isDeafened = !isDeafened;
    const btn = document.getElementById('deafenBtn');
    btn.style.background = isDeafened ? '#f471b5' : 'rgba(255,255,255,0.05)';
    if (localStream && localStream.getAudioTracks().length > 0) {
        localStream.getAudioTracks()[0].enabled = !isDeafened;
    }
    if (isDeafened && !isMuted) toggleMuteMic();
}

async function toggleCam() {
    isCamOn = !isCamOn;
    const btn = document.getElementById('camBtn');

    if (isCamOn) {
        try {
            const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
            const videoTrack = videoStream.getVideoTracks()[0];
            if (localStream) {
                localStream.getVideoTracks().forEach(t => localStream.removeTrack(t));
                localStream.addTrack(videoTrack);
            } else {
                localStream = videoStream;
            }
            btn.style.background = '#34d399';
            showToast("📷 Камера включена");
        } catch (err) {
            isCamOn = false;
            btn.style.background = 'rgba(255,255,255,0.05)';
            showToast("Не удалось подключить камеру");
        }
    } else {
        if (localStream) {
            localStream.getVideoTracks().forEach(t => {
                t.stop();
                localStream.removeTrack(t);
            });
        }
        btn.style.background = 'rgba(255,255,255,0.05)';
        showToast("📷 Камера выключена");
    }
    renderVoiceGrid();
}

function toggleVoiceFullscreen() {
    isVoiceFullscreen = !isVoiceFullscreen;
    document.querySelector('.discord-container').classList.toggle('fullscreen-voice-mode', isVoiceFullscreen);
}

function sendVoiceMessage() {
    const input = document.getElementById('voiceMessageInput');
    const text = input.value.trim();
    if (!text) return;
    if (!voiceChatMessages[activeVoiceChannel]) voiceChatMessages[activeVoiceChannel] = [];
    voiceChatMessages[activeVoiceChannel].push({ author: currentUser.username, text });
    localStorage.setItem('lava_voice_msgs', JSON.stringify(voiceChatMessages));
    input.value = '';
    renderVoiceChatMessages();
}

function renderVoiceChatMessages() {
    if (!activeVoiceChannel) return;
    const container = document.getElementById('discordMessages');
    const msgs = voiceChatMessages[activeVoiceChannel] || [];
    container.innerHTML = msgs.length === 0
        ? `<div style="color:var(--muted); font-size:13px;">Нет сообщений в чате канала</div>`
        : msgs.map(m => `
            <div class="discord-msg-card"><span style="font-weight:700; color:var(--accent-bright);">${escapeHtml(m.author)}:</span> ${escapeHtml(m.text)}</div>
        `).join('');
    container.scrollTop = container.scrollHeight;
}

let selectedVoiceUser = null;
function openVoiceUserModal(userId, userName) {
    selectedVoiceUser = { id: userId, name: userName };
    document.getElementById('vModalUsername').textContent = userName;

    const adminBox = document.getElementById('adminVoiceControls');
    if (adminBox) {
        adminBox.style.display = (currentUser && currentUser.isAdmin) ? 'flex' : 'none';
    }
    openModal('voiceUserModal');
}

function adminToggleUserMic() {
    if (!currentUser || !currentUser.isAdmin || !selectedVoiceUser) return;
    if (!activeVoiceChannel || !usersInVoice[activeVoiceChannel]) return;
    const u = usersInVoice[activeVoiceChannel].find(user => user.id === selectedVoiceUser.id);
    if (u) {
        u.adminMuted = !u.adminMuted;
        renderVoiceGrid();
        renderVoiceChannels();
        closeModal('voiceUserModal');
        showToast(`🛡️ Микрофон ${selectedVoiceUser.name} ${u.adminMuted ? 'выключен' : 'включен'}`);
    }
}

function adminToggleUserSound() {
    if (!currentUser || !currentUser.isAdmin || !selectedVoiceUser) return;
    if (!activeVoiceChannel || !usersInVoice[activeVoiceChannel]) return;
    const u = usersInVoice[activeVoiceChannel].find(user => user.id === selectedVoiceUser.id);
    if (u) {
        u.adminDeafened = !u.adminDeafened;
        renderVoiceGrid();
        renderVoiceChannels();
        closeModal('voiceUserModal');
        showToast(`🛡 Звук ${selectedVoiceUser.name} ${u.adminDeafened ? 'выключен' : 'включен'}`);
    }
}

function vModalGoProfile() { closeModal('voiceUserModal'); showProfileView(selectedVoiceUser.id); }
function vModalAddFriend() { closeModal('voiceUserModal'); showToast(`Запрос отправлен`); }
function vModalReport() { closeModal('voiceUserModal'); openModal('reportModal'); }

// ==========================================
// ПРОФИЛЬ
// ==========================================

function showProfileView(userId) {
    switchView('profileView');
    let profileUser = currentUser && currentUser.id === userId
        ? currentUser
        : (users.find(u => u.id === userId) || {
            id: userId, username: "Участник", avatar: "", banner: "",
            lastActive: Date.now() - 300000, level: 1, createdAt: null
        });

    const adminBadge = profileUser.isAdmin ? ' 🛡️' : '';
    document.getElementById('profUsername').textContent = profileUser.username + adminBadge;

    const regDate = formatRegistrationDate(profileUser.createdAt);
    const profDateElem = document.getElementById('profDate');
    profDateElem.innerHTML = `Уровень: <span style="color:var(--accent); font-weight:600;">${profileUser.level || 1}</span> | Дата регистрации: <span style="color:#e2e8f0;">${regDate}</span>`;

    const statusElem = document.getElementById('profStatus');
    if (statusElem) {
        statusElem.textContent = formatTimeAgo(profileUser.lastActive);
        statusElem.style.color = (profileUser.lastActive && Date.now() - profileUser.lastActive < 10000) ? '#34d399' : 'var(--muted)';
    }

    document.getElementById('profAvatar').innerHTML = profileUser.avatar ? `<img src="${profileUser.avatar}">` : '👤';
    document.getElementById('profBanner').style.backgroundImage = profileUser.banner ? `url('${profileUser.banner}')` : 'none';
    document.getElementById('editProfBtn').style.display = currentUser && currentUser.id === profileUser.id ? 'block' : 'none';

    let adminProfActions = document.getElementById('adminProfileActions');
    if (!adminProfActions) {
        adminProfActions = document.createElement('div');
        adminProfActions.id = 'adminProfileActions';
        adminProfActions.style.cssText = 'margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;';
        document.querySelector('.profile-details').appendChild(adminProfActions);
    }

    if (currentUser && currentUser.isAdmin && currentUser.id !== profileUser.id) {
        adminProfActions.innerHTML = `
            <button onclick="adminResetUserAvatar('${profileUser.id}')" style="background:#f471b5; border:none; color:#fff; padding:6px 12px; border-radius:8px; font-size:12px; cursor:pointer;">🛡️ Сбросить аватар</button>
            <button onclick="adminResetUserBanner('${profileUser.id}')" style="background:#f471b5; border:none; color:#fff; padding:6px 12px; border-radius:8px; font-size:12px; cursor:pointer;">🛡 Сбросить баннер</button>
        `;
        adminProfActions.style.display = 'flex';
    } else {
        adminProfActions.style.display = 'none';
    }

    const userPosts = posts.filter(p => p.authorId === profileUser.id);
    const container = document.getElementById('profileUserPostsList');

    if (userPosts.length === 0) {
        container.innerHTML = `<p style="color:var(--muted); font-size:13px;">Нет тем.</p>`;
    } else {
        container.innerHTML = userPosts.map(generatePostHTML).join('');
    }
}

async function adminResetUserAvatar(userId) {
    if (!currentUser || !currentUser.isAdmin) return;
    let targetUser = users.find(u => u.id === userId);
    if (targetUser) {
        targetUser.avatar = '';
        posts.forEach(p => { if (p.authorId === userId) { p.avatar = ''; savePostToSupabase(p); } });
        await saveUserToSupabase(targetUser);
        if (currentUser.id === userId) currentUser.avatar = '';
        localStorage.setItem('lava_current_user', JSON.stringify(currentUser));
        updateHeaderAndSidebar();
        renderPosts();
        if (currentView === 'profileView') showProfileView(userId);
        showToast("🛡️ Аватар сброшен админом");
    }
}

async function adminResetUserBanner(userId) {
    if (!currentUser || !currentUser.isAdmin) return;
    let targetUser = users.find(u => u.id === userId);
    if (targetUser) {
        targetUser.banner = '';
        await saveUserToSupabase(targetUser);
        if (currentUser.id === userId) currentUser.banner = '';
        localStorage.setItem('lava_current_user', JSON.stringify(currentUser));
        if (currentView === 'profileView') showProfileView(userId);
        showToast("🛡️ Баннер сброшен админом");
    }
}

function openEditProfileModal() {
    document.getElementById('editUsernameInput').value = currentUser.username;
    openModal('editProfileModal');
}

function saveProfileChanges() {
    const newName = document.getElementById('editUsernameInput').value.trim();
    if (newName) currentUser.username = newName;

    currentUser.lastActive = Date.now();
    const avatarFile = document.getElementById('editAvatarFile').files[0];
    const bannerFile = document.getElementById('editBannerFile').files[0];

    const finishSave = async () => {
        localStorage.setItem('lava_current_user', JSON.stringify(currentUser));
        const idx = users.findIndex(u => u.id === currentUser.id);
        if (idx > -1) users[idx] = currentUser;
        await saveUserToSupabase(currentUser);
        updateHeaderAndSidebar();
        closeModal('editProfileModal');
        showProfileView(currentUser.id);
        showToast("Профиль сохранен!");
    };

    if (avatarFile || bannerFile) {
        let loaded = 0, total = (avatarFile ? 1 : 0) + (bannerFile ? 1 : 0);
        if (avatarFile) {
            const r = new FileReader();
            r.onload = e => { currentUser.avatar = e.target.result; if (++loaded === total) finishSave(); };
            r.readAsDataURL(avatarFile);
        }
        if (bannerFile) {
            const r = new FileReader();
            r.onload = e => { currentUser.banner = e.target.result; if (++loaded === total) finishSave(); };
            r.readAsDataURL(bannerFile);
        }
    } else {
        finishSave();
    }
}

// ==========================================
// АВТОРИЗАЦИЯ
// ==========================================

let authMode = 'login';
function openAuth(mode) {
    authMode = mode;
    document.getElementById('authTitle').textContent = mode === 'login' ? 'Авторизация' : 'Регистрация';

    const emailInput = document.getElementById('authEmail');
    const gearBtn = document.getElementById('authGearBtn');

    if (mode === 'register') {
        emailInput.style.display = 'block';
        gearBtn.style.display = 'none';
    } else {
        emailInput.style.display = 'none';
        gearBtn.style.display = currentUser ? 'flex' : 'none';
    }

    document.getElementById('authSwitch').innerHTML = mode === 'login'
        ? `Нет аккаунта? <span style="color:var(--accent); cursor:pointer;" onclick="openAuth('register')">Зарегистрироваться</span>`
        : `Уже есть аккаунт? <span style="color:var(--accent); cursor:pointer;" onclick="openAuth('login')">Войти</span>`;
    openModal('authModal');
}

async function submitAuth() {
    const username = document.getElementById('authUsername').value.trim();
    const password = document.getElementById('authPassword').value.trim();
    const emailInput = document.getElementById('authEmail').value.trim();

    if (!username || !password) { showToast("Заполните все поля"); return; }

    if (authMode === 'register') {
        if (!emailInput || !emailInput.endsWith('@gmail.com')) {
            showToast("Введите настоящую почту @gmail.com!");
            return;
        }
        if (users.find(u => u.username === username)) { showToast("Имя занято"); return; }

        const newUser = {
            id: 'u_' + Date.now(),
            username,
            email: emailInput,
            password,
            avatar: '', banner: '',
            lastActive: Date.now(),
            xp: 0, level: 1,
            likedPostIds: [],
            createdAt: Date.now()
        };
        users.push(newUser);
        currentUser = newUser;
        await saveUserToSupabase(newUser);
        closeModal('authModal');
        updateHeaderAndSidebar();
        showToast("Успешная регистрация!");
    } else {
        const found = users.find(u => u.username === username && u.password === password);
        if (!found) { showToast("Неверный логин или пароль"); return; }
        currentUser = found;
        currentUser.lastActive = Date.now();
        if (currentUser.xp === undefined) currentUser.xp = 0;
        if (currentUser.level === undefined) currentUser.level = 1;
        if (!currentUser.likedPostIds) currentUser.likedPostIds = [];
        const idx = users.findIndex(u => u.id === currentUser.id);
        if (idx > -1) users[idx] = currentUser;
        await saveUserToSupabase(currentUser);
        closeModal('authModal');
        updateHeaderAndSidebar();
        showToast("Успешный вход!");
    }
    renderPosts();
}

function openForgotPasswordModal() {
    closeModal('authModal');
    document.getElementById('forgotEmailInput').value = '';
    openModal('forgotPasswordModal');
}

function sendRecoveryCode() {
    const email = document.getElementById('forgotEmailInput').value.trim();
    if (!email || !email.endsWith('@gmail.com')) {
        showToast("Введите корректную почту @gmail.com");
        return;
    }
    closeModal('forgotPasswordModal');
    showToast("Код подтверждения отправлен на почту!");
    openModal('verifyCodeModal');
}

function confirmRecoveryCode() {
    const code = document.getElementById('verifyCodeInput').value.trim();
    if (!code) { showToast("Введите код подтверждения"); return; }
    closeModal('verifyCodeModal');
    showToast("Почта успешно подтверждена! Теперь можно войти.");
}

// ==========================================
// SOUNDCLOUD ПЛЕЕР
// ==========================================

function addTrack() {
    const input = document.getElementById("url");
    const error = document.getElementById("error");
    const url = input.value.trim();

    error.textContent = "";

    if (!url) { error.textContent = "Вставь ссылку SoundCloud."; return; }
    if (!url.includes("soundcloud.com")) { error.textContent = "Это не ссылка SoundCloud."; return; }

    tracks.push({ url, name: "SoundCloud трек" });
    input.value = "";
    renderQueue();
    playTrack(tracks.length - 1);
}

function playTrack(index) {
    if (!tracks[index]) return;
    currentIndex = index;
    const track = tracks[index];
    const container = document.getElementById("soundcloud");

    container.innerHTML = `
        <iframe
            id="sc-player"
            allow="autoplay"
            scrolling="no"
            frameborder="no"
            src="https://w.soundcloud.com/player/?url=${encodeURIComponent(track.url)}&auto_play=true&show_artwork=true&show_comments=false&show_user=true&hide_related=true">
        </iframe>
    `;

    const iframe = document.getElementById("sc-player");
    widget = SC.Widget(iframe);

    widget.bind(SC.Widget.Events.READY, function() {
        const currentVolume = parseInt(document.getElementById('volumeBar').value);
        widget.setVolume(currentVolume);
        widget.play();
        document.getElementById("play").textContent = "⏸";
        widget.getCurrentSound(function(sound) {
            if (sound) {
                document.getElementById("title").textContent = sound.title;
                document.getElementById("currentTrackLabel").textContent = sound.title;
            }
        });
    });

    widget.bind(SC.Widget.Events.PLAY, function() { document.getElementById("play").textContent = "⏸"; });
    widget.bind(SC.Widget.Events.PAUSE, function() { document.getElementById("play").textContent = "▶"; });
    widget.bind(SC.Widget.Events.FINISH, function() { next(); });

    renderQueue();
}

function togglePlaySC() { if (widget) widget.toggle(); }

function next() {
    if (!tracks.length) return;
    let index = currentIndex + 1;
    if (index >= tracks.length) index = 0;
    playTrack(index);
}

function previous() {
    if (!tracks.length) return;
    let index = currentIndex - 1;
    if (index < 0) index = tracks.length - 1;
    playTrack(index);
}

function changeVolume(val) {
    document.getElementById('volumeVal').textContent = val + '%';
    const bar = document.getElementById('volumeBar');
    if (bar) bar.style.background = `linear-gradient(to right, var(--accent) ${val}%, rgba(255, 255, 255, 0.08) ${val}%)`;
    if (widget) widget.setVolume(parseInt(val));
}

function renderQueue() {
    const queue = document.getElementById("queue");
    queue.innerHTML = "";

    tracks.forEach(function(track, index) {
        const item = document.createElement("div");
        item.className = "track" + (index === currentIndex ? " active" : "");
        item.innerHTML = `
            <div style="font-size:13px;">${index + 1}. ${track.name}</div>
            <small style="color:#888; font-size:11px;">SoundCloud</small>
        `;
        item.onclick = function() { playTrack(index); };
        queue.appendChild(item);
    });
}

// ==========================================
// МОДАЛКИ / TOAST / ESCAPE
// ==========================================

function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function showToast(text) {
    const t = document.getElementById('toast');
    t.textContent = text;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function openSystem() { openModal('systemModal'); }
function confirmReport() { closeModal('reportModal'); showToast("Жалоба отправлена"); }

try {
    const savedVoiceMsgs = localStorage.getItem('lava_voice_msgs');
    if (savedVoiceMsgs) voiceChatMessages = JSON.parse(savedVoiceMsgs);
} catch(e) {}
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

// Аудио контекст и анализатор речи
let audioCtx = null;
let analyser = null;
let micSource = null;
let isSpeakingState = false;

// SoundCloud Плеер
let tracks = [];
let currentIndex = -1;
let widget = null;

// Посты и пользователи
let posts = JSON.parse(localStorage.getItem('lava_posts')) ||[cite: 26];
let users = JSON.parse(localStorage.getItem('lava_users')) ||[cite: 26];

window.onload = function() {
    loadUserFromStorage();
    renderPosts();
    renderVoiceChannels();
    initLavaDrips();
    initActivityTracking(); 
    initVoiceXpTimer();     

    const volBar = document.getElementById('volumeBar');
    if (volBar) {
        changeVolume(volBar.value);
    }

    // Синхронизация данных между вкладками браузера через localStorage
    window.addEventListener('storage', (event) => {
        if (event.key === 'lava_posts') {
            posts = JSON.parse(event.newValue) || [];
            renderPosts();
            if (currentView === 'likedView') renderLikedPosts();
            if (currentView === 'profileView' && currentUser) showProfileView(currentUser.id);
        }
        if (event.key === 'lava_users') {
            users = JSON.parse(event.newValue) || [];
        }
        if (event.key === 'lava_current_user') {
            currentUser = event.newValue ? JSON.parse(event.newValue) : null;
            updateHeaderAndSidebar();
            if (currentView === 'likedView') renderLikedPosts();
        }
    });

    document.addEventListener('click', () => {
        const menu = document.getElementById('postContextMenu');
        if (menu) menu.style.display = 'none';
    });

    document.addEventListener('mousedown', (e) => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            setTimeout(() => {
                if (document.activeElement && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                    document.activeElement.blur();
                }
            }, 0);
        }
    });
};

function openAdminModal() {
    document.getElementById('adminLoginInput').value = '';
    document.getElementById('adminPassInput').value = '';
    openModal('adminModal');
}

function submitAdminAuth() {
    const login = document.getElementById('adminLoginInput').value.trim();
    const pass = document.getElementById('adminPassInput').value.trim();

    if (login === 'adminss' && pass === '0992166') {
        if (!currentUser) {
            currentUser = { 
                id: 'admin_usr_' + Date.now(), 
                username: 'Admin', 
                email: 'admin@gmail.com',
                avatar: '', 
                banner: '', 
                lastActive: Date.now(), 
                xp: 500, 
                level: 99, 
                likedPostIds: [], 
                isAdmin: true 
            };
        } else {
            currentUser.isAdmin = true;
        }

        users = users.map(u => u.id === currentUser.id ? currentUser : u);
        if (!users.find(u => u.id === currentUser.id)) users.push(currentUser);

        localStorage.setItem('lava_current_user', JSON.stringify(currentUser));
        saveData();
        updateHeaderAndSidebar();
        closeModal('adminModal');
        showToast("🛡️ Вы авторизовались как Администратор!");
        renderPosts();
        if (currentView === 'profileView') showProfileView(currentUser.id);
    } else {
        showToast("Неверный логин или пароль админа!");
    }
}

function exitAdminMode() {
    if (currentUser) {
        currentUser.isAdmin = false;
        users = users.map(u => u.id === currentUser.id ? currentUser : u);
        localStorage.setItem('lava_current_user', JSON.stringify(currentUser));
        saveData();
        updateHeaderAndSidebar();
        renderPosts();
        if (currentView === 'profileView') showProfileView(currentUser.id);
        showToast("Вы вышли из админ режима");
    }
}

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

    users = users.map(u => u.id === currentUser.id ? currentUser : u);
    localStorage.setItem('lava_current_user', JSON.stringify(currentUser));
    saveData();
    updateHeaderAndSidebar();
    
    if (showNotification) {
        showXpPopup();
    }
}

function initVoiceXpTimer() {
    setInterval(() => {
        if (currentUser && activeVoiceChannel) {
            addXp(15, false); 
        }
    }, 5 * 60 * 1000); 
}

let xpPopupTimeout = null;
function showXpPopup() {
    const popup = document.getElementById('xpPopup');
    const fill = document.getElementById('xpBarFill');
    const title = document.getElementById('xpPopupTitle');
    
    let currentLevel = currentUser ? (currentUser.level || 1) : 1;
    let currentXp = currentUser ? (currentUser.xp || 0) : 0;
    
    title.textContent = `Ваш уровень: ${currentLevel} (${currentXp}/100 XP)`;
    fill.style.width = `${currentXp}%`;

    popup.classList.add('show');

    if (xpPopupTimeout) clearTimeout(xpPopupTimeout);

    xpPopupTimeout = setTimeout(() => {
        popup.classList.remove('show');
    }, 7000);
}

function openXP() {
    if (!currentUser) {
        openAuth('login');
        showToast("Сначала войдите в аккаунт");
        return;
    }
    showXpPopup();
}

function getDeclension(number, one, few, many) {
    let mod10 = number % 10;
    let mod100 = number % 100;
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
    if (diffMinutes < 60) {
        let word = getDeclension(diffMinutes, "минуту", "минуты", "минут");
        return `был ${diffMinutes} ${word} назад`;
    }
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
        let word = getDeclension(diffHours, "час", "часа", "часов");
        return `был ${diffHours} ${word} назад`;
    }
    
    const diffDays = Math.floor(diffHours / 24);
    let word = getDeclension(diffDays, "день", "дня", "дней");
    return `был ${diffDays} ${word} назад`;
}

function initActivityTracking() {
    setInterval(() => {
        if (currentUser) {
            currentUser.lastActive = Date.now();
            localStorage.setItem('lava_current_user', JSON.stringify(currentUser));
        }

        const statusElem = document.getElementById('userStatusText');
        if (statusElem) {
            statusElem.textContent = currentUser ? "В сети" : "Гость";
        }
    }, 1000);
}

function initLavaDrips() {
    const container = document.getElementById('lavaDripsLayer');
    if (!container) return;
    const dripCount = 22;

    for (let i = 0; i < dripCount; i++) {
        const drip = document.createElement('div');
        drip.className = 'lava-drip';
        
        const left = Math.random() * 100;
        const duration = 5 + Math.random() * 9;
        const delay = Math.random() * 10;
        const width = 2 + Math.random() * 3;

        drip.style.left = `${left}%`;
        drip.style.animationDuration = `${duration}s`;
        drip.style.animationDelay = `${delay}s`;
        drip.style.width = `${width}px`;

        container.appendChild(drip);
    }
}

function saveData() {
    localStorage.setItem('lava_posts', JSON.stringify(posts));
    localStorage.setItem('lava_users', JSON.stringify(users));
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
            sideLevel.style.display = 'block';
        }
        
        if (currentUser.isAdmin) {
            accBtn.textContent = 'Выйти из админ режима';
            accBtn.onclick = exitAdminMode;
        } else {
            accBtn.textContent = 'Выйти';
            accBtn.onclick = logout;
        }

        headerAcc.innerHTML = `
            <button class="orange-button" onclick="protectedAction(() => showProfileView(currentUser.id))">Профиль ${adminBadge}</button>
            <button onclick="logout()">Выйти</button>
        `;
    } else {
        sideName.textContent = "Гость";
        sideAvatar.innerHTML = '👤';
        if (sideLevel) {
            sideLevel.style.display = 'none';
        }
        accBtn.textContent = 'Войти';
        accBtn.onclick = () => openAuth('login');

        headerAcc.innerHTML = `
            <button onclick="openAuth('login')">Войти</button>
            <button class="orange-button" onclick="openAuth('register')">Регистрация</button>
        `;
    }
}

function logout() {
    if (currentUser) {
        currentUser.lastActive = Date.now() - 60000;
        users = users.map(u => u.id === currentUser.id ? currentUser : u);
        saveData();
    }
    currentUser = null;
    localStorage.removeItem('lava_current_user');
    updateHeaderAndSidebar();
    showToast("Вы вышли из системы");
    renderPosts();
}

function protectedAction(callback) {
    if (!currentUser) {
        openAuth('login');
        showToast("Сначала войдите в аккаунт");
        return;
    }
    callback();
}

function showForumView() { switchView('forumView'); renderPosts(); }
function showVoiceView() { switchView('voiceView'); }

function openLikedView() {
    if (!currentUser) {
        openAuth('login');
        showToast("Сначала войдите в аккаунт");
        return;
    }
    switchView('likedView');
    renderLikedPosts();
}

function switchView(viewId) {
    currentView = viewId;
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.getElementById(viewId).style.display = 'flex';
}

function generatePostHTML(post) {
    const isLikedByMe = currentUser && currentUser.likedPostIds && currentUser.likedPostIds.includes(post.id);
    const canDeletePost = currentUser && (currentUser.id === post.authorId || currentUser.isAdmin);
    const canDeleteMedia = currentUser && currentUser.isAdmin && post.media;

    return `
        <div class="post" oncontextmenu="handlePostContextMenu(event, ${post.id})">
            <div class="post-head">
                <div class="post-author-row" onclick="showProfileView('${post.authorId}')">
                    <div class="post-user-avatar">${post.avatar ? `<img src="${post.avatar}">` : '👤'}</div>
                    <div>
                        <span class="post-author dark-blue-username">${escapeHtml(post.author)}</span>
                        <span class="post-time">${post.date}</span>
                    </div>
                </div>
            </div>
            <h2 class="lava-topic-title">${escapeHtml(post.title)}</h2>
            <p class="post-text">${escapeHtml(post.text)}</p>
            ${post.media ? `
                <div style="position:relative; display:inline-block; max-width:100%;">
                    <img src="${post.media}" class="post-media">
                    ${canDeleteMedia ? `<button onclick="deletePostImage(${post.id})" style="position:absolute; top:8px; right:8px; background:rgba(242,63,67,0.9); color:#fff; border:none; border-radius:6px; padding:4px 8px; font-size:11px; cursor:pointer;">🗑 Удалить фото</button>` : ''}
                </div>
            ` : ''}
            
            <div class="post-footer-row" style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; flex-wrap: wrap; gap: 10px;">
                <div class="post-actions" style="margin-bottom: 0;">
                    <button onclick="toggleLike(${post.id})" class="like-btn ${isLikedByMe ? 'liked' : ''}">
                        <span class="heart-icon" style="${isLikedByMe ? 'color: #f23f43;' : ''}">❤</span> ${post.likes}
                    </button>
                    <button onclick="openComments(${post.id})">💬 Комментарии (${post.comments ? post.comments.length : 0})</button>
                    ${canDeletePost ? `<button onclick="deletePost(${post.id})" style="color:#f23f43;">🗑 Удалить</button>` : ''}
                </div>
            </div>
        </div>
    `;
}

function deletePostImage(postId) {
    if (!currentUser || !currentUser.isAdmin) return;
    const post = posts.find(p => p.id === postId);
    if (post) {
        post.media = '';
        saveData();
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
        p.title.toLowerCase().includes(searchVal) || p.text.toLowerCase().includes(searchVal)
    );

    if (currentFilter === 'popular') {
        filtered.sort((a, b) => b.likes - a.likes);
    } else {
        filtered.sort((a, b) => b.id - a.id);
    }

    const topicCountElem = document.getElementById('topicCount');
    if (topicCountElem) topicCountElem.textContent = `${filtered.length} тем`;

    if (filtered.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:var(--muted); padding:30px;">Тем пока нет</div>`;
        return;
    }

    container.innerHTML = filtered.map(post => generatePostHTML(post)).join('');
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

    container.innerHTML = likedPosts.map(post => generatePostHTML(post)).join('');
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
    const mediaNameElem = document.getElementById('postMediaName');
    if (mediaNameElem) mediaNameElem.textContent = '';
    openModal('postModal');
}

function submitPost() {
    const title = document.getElementById('postTitle').value.trim();
    const text = document.getElementById('postText').value.trim();
    const fileInput = document.getElementById('postMediaFile');

    if (!title || !text) {
        showToast("Заполните заголовок и текст");
        return;
    }

    const finishCreation = (mediaUrl = '') => {
        posts.unshift({
            id: Date.now(),
            title,
            text,
            author: currentUser.username,
            authorId: currentUser.id,
            avatar: currentUser.avatar || '',
            date: "Только что",
            likes: 0,
            likedBy: [],
            comments: [],
            media: mediaUrl
        });
        saveData();
        closeModal('postModal');
        renderPosts();
        
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

function deletePost(id) {
    const postToDelete = posts.find(p => p.id === id);
    if (postToDelete && currentUser && postToDelete.authorId === currentUser.id) {
        addXp(-20, false);
    }

    posts = posts.filter(p => p.id !== id);
    users.forEach(u => {
        if (u.likedPostIds) u.likedPostIds = u.likedPostIds.filter(pid => pid !== id);
    });
    if (currentUser && currentUser.likedPostIds) {
        currentUser.likedPostIds = currentUser.likedPostIds.filter(pid => pid !== id);
        localStorage.setItem('lava_current_user', JSON.stringify(currentUser));
    }
    saveData();
    renderPosts();
    if (currentView === 'likedView') renderLikedPosts();
    if (currentView === 'profileView') showProfileView(currentUser ? currentUser.id : '');
    showToast("Тема удалена");
}

function toggleLike(postId) {
    if (!currentUser) { openAuth('login'); return; }
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    if (!post.likedBy) post.likedBy = [];
    if (!currentUser.likedPostIds) currentUser.likedPostIds = [];

    const index = post.likedBy.indexOf(currentUser.id);
    if (index > -1) {
        post.likedBy.splice(index, 1);
        post.likes--;
        currentUser.likedPostIds = currentUser.likedPostIds.filter(id => id !== postId);

        addXp(-10, false);
        showToast("❤ Лайк снят (-10 XP)");
    } else {
        post.likedBy.push(currentUser.id);
        post.likes++;
        if (!currentUser.likedPostIds.includes(postId)) {
            currentUser.likedPostIds.push(postId);
        }

        addXp(10, false);
        showToast("❤ Лайк поставлен и сохранен! (+10 XP)");
    }

    users = users.map(u => u.id === currentUser.id ? currentUser : u);
    localStorage.setItem('lava_current_user', JSON.stringify(currentUser));
    saveData();
    
    renderPosts();
    if (currentView === 'likedView') renderLikedPosts();
    if (currentView === 'profileView') showProfileView(currentUser.id);
}

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
        container.innerHTML = `<div style="color:var(--muted); text-align:center;">Нет комментариев</div>`;
        return;
    }

    container.innerHTML = post.comments.map(c => {
        const canDeleteComment = currentUser && (currentUser.id === c.authorId || currentUser.isAdmin);
        const canDeleteMedia = currentUser && currentUser.isAdmin && c.media;

        return `
            <div class="comment" style="margin-bottom:10px; display: flex; justify-content: space-between; align-items: flex-start; background: rgba(255,255,255,0.03); padding:8px 12px; border-radius:8px;">
                <div style="flex:1;">
                    <div style="font-weight:600; font-size:13px; color:#3b82f6;">${escapeHtml(c.author)} <span style="font-size:10px; color:var(--muted);">${c.date}</span></div>
                    <div style="font-size:13px; color:#cbd5e1; margin-top:2px;">${escapeHtml(c.text)}</div>
                    ${c.media ? `
                        <div style="position:relative; display:inline-block; margin-top:6px;">
                            <img src="${c.media}" class="comment-media">
                            ${canDeleteMedia ? `<button onclick="deleteCommentImage(${post.id}, ${c.id})" style="position:absolute; top:4px; right:4px; background:rgba(242,63,67,0.9); color:#fff; border:none; border-radius:4px; padding:2px 6px; font-size:10px; cursor:pointer;">🗑 Фото</button>` : ''}
                        </div>
                    ` : ''}
                </div>
                ${canDeleteComment ? `<button onclick="deleteComment(${c.id})" style="background:transparent; border:none; color:#f23f43; cursor:pointer; font-size:12px; margin-left:8px;">Удалить</button>` : ''}
            </div>
        `;
    }).join('');
}

function deleteCommentImage(postId, commentId) {
    if (!currentUser || !currentUser.isAdmin) return;
    const post = posts.find(p => p.id === postId);
    if (post && post.comments) {
        const comment = post.comments.find(c => c.id === commentId);
        if (comment) {
            comment.media = '';
            saveData();
            renderCommentsList();
            showToast("🛡️ Картинка комментария удалена админом");
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

    const finishComment = (mediaUrl = '') => {
        post.comments.push({ 
            id: Date.now(), 
            authorId: currentUser.id,
            author: currentUser.username, 
            text, 
            date: "Только что", 
            media: mediaUrl 
        });
        saveData();
        textInput.value = '';
        fileInput.value = '';
        const mediaNameElem = document.getElementById('commentMediaName');
        if (mediaNameElem) mediaNameElem.textContent = '';
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

function deleteComment(commentId) {
    const post = posts.find(p => p.id === currentCommentPostId);
    if (!post || !post.comments) return;

    const commentIndex = post.comments.findIndex(c => c.id === commentId);
    if (commentIndex > -1) {
        post.comments.splice(commentIndex, 1);
        saveData();
        renderCommentsList();
        renderPosts();
        if (currentView === 'likedView') renderLikedPosts();
        
        addXp(-10, false);
        showToast("Комментарий удален (-10 XP)");
    }
}

const voiceChannelsData = [
    { id: 'general', name: '🔊 Общий канал' },
    { id: 'gaming', name: '🎮 Игровая зона' },
    { id: 'music', name: '🎵 Музыкальный чилл' }
];

function setupAudioAnalysis(stream) {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        micSource = audioCtx.createMediaStreamSource(stream);
        micSource.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        function checkVolume() {
            if (!localStream || isMuted) {
                if (isSpeakingState) {
                    isSpeakingState = false;
                    renderVoiceGrid();
                }
                requestAnimationFrame(checkVolume);
                return;
            }
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            let average = sum / dataArray.length;
            let speakingNow = average > 12;

            if (speakingNow !== isSpeakingState) {
                isSpeakingState = speakingNow;
                renderVoiceGrid();
            }
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
    btn.style.background = isMuted ? '#f23f43' : '#2b2d31';
    btn.textContent = isMuted ? '🔇 Выкл. микр' : '🎤 Микрофон';
    renderVoiceGrid();
}

function toggleDeafen() {
    isDeafened = !isDeafened;
    const btn = document.getElementById('deafenBtn');
    btn.style.background = isDeafened ? '#f23f43' : '#2b2d31';
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
            btn.style.background = '#23a55a';
            showToast("📷 Камера включена");
        } catch (err) {
            isCamOn = false;
            btn.style.background = '#2b2d31';
            showToast("Не удалось подключить камеру");
        }
    } else {
        if (localStream) {
            localStream.getVideoTracks().forEach(t => {
                t.stop();
                localStream.removeTrack(t);
            });
        }
        btn.style.background = '#2b2d31';
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
    input.value = '';
    renderVoiceChatMessages();
}

function renderVoiceChatMessages() {
    if (!activeVoiceChannel) return;
    const container = document.getElementById('discordMessages');
    const msgs = voiceChatMessages[activeVoiceChannel] || [];
    container.innerHTML = msgs.length === 0 ? `<div style="color:var(--muted); font-size:13px;">Нет сообщений в чате канала</div>` : msgs.map(m => `
        <div class="discord-msg-card"><span style="font-weight:600; color:#3b82f6;">${escapeHtml(m.author)}:</span> ${escapeHtml(m.text)}</div>
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

function showProfileView(userId) {
    switchView('profileView');
    let profileUser = currentUser && currentUser.id === userId ? currentUser : (users.find(u => u.id === userId) || { id: userId, username: "Участник", avatar: "", banner: "", lastActive: Date.now() - 300000, level: 1 });

    const adminBadge = profileUser.isAdmin ? ' 🛡️' : '';
    document.getElementById('profUsername').textContent = profileUser.username + adminBadge;
    
    const profDateElem = document.getElementById('profDate');
    profDateElem.innerHTML = `Уровень: <span style="color:var(--orange); font-weight:600;">${profileUser.level || 1}</span> | На форуме с 2026 года`;
    
    const statusElem = document.getElementById('profStatus');
    if (statusElem) {
        statusElem.textContent = formatTimeAgo(profileUser.lastActive);
        statusElem.style.color = (profileUser.lastActive && Date.now() - profileUser.lastActive < 10000) ? '#23a55a' : 'var(--muted)';
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
            <button onclick="adminResetUserAvatar('${profileUser.id}')" style="background:#f23f43; border:none; color:#fff; padding:6px 12px; border-radius:8px; font-size:12px; cursor:pointer;">🛡️ Сбросить аватар</button>
            <button onclick="adminResetUserBanner('${profileUser.id}')" style="background:#f23f43; border:none; color:#fff; padding:6px 12px; border-radius:8px; font-size:12px; cursor:pointer;">🛡 Сбросить баннер</button>
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
        container.innerHTML = userPosts.map(post => generatePostHTML(post)).join('');
    }
}

function adminResetUserAvatar(userId) {
    if (!currentUser || !currentUser.isAdmin) return;
    let targetUser = users.find(u => u.id === userId);
    if (targetUser) {
        targetUser.avatar = '';
        posts.forEach(p => { if (p.authorId === userId) p.avatar = ''; });
        saveData();
        if (currentUser.id === userId) currentUser.avatar = '';
        localStorage.setItem('lava_current_user', JSON.stringify(currentUser));
        updateHeaderAndSidebar();
        renderPosts();
        if (currentView === 'profileView') showProfileView(userId);
        showToast("🛡️ Аватар сброшен админом");
    }
}

function adminResetUserBanner(userId) {
    if (!currentUser || !currentUser.isAdmin) return;
    let targetUser = users.find(u => u.id === userId);
    if (targetUser) {
        targetUser.banner = '';
        saveData();
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

    const finishSave = () => {
        localStorage.setItem('lava_current_user', JSON.stringify(currentUser));
        users = users.map(u => u.id === currentUser.id ? currentUser : u);
        saveData();
        updateHeaderAndSidebar();
        closeModal('editProfileModal');
        showProfileView(currentUser.id);
        showToast("Профиль сохранен!");
    };

    if (avatarFile || bannerFile) {
        let loaded = 0, total = (avatarFile ? 1 : 0) + (bannerFile ? 1 : 0);
        if (avatarFile) {
            const r = new FileReader();
            r.onload = e => { currentUser.avatar = e.target.result; if(++loaded === total) finishSave(); };
            r.readAsDataURL(avatarFile);
        }
        if (bannerFile) {
            const r = new FileReader();
            r.onload = e => { currentUser.banner = e.target.result; if(++loaded === total) finishSave(); };
            r.readAsDataURL(bannerFile);
        }
    } else {
        finishSave();
    }
}

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
        ? `Нет аккаунта? <span style="color:var(--orange); cursor:pointer;" onclick="openAuth('register')">Зарегистрироваться</span>`
        : `Уже есть аккаунт? <span style="color:var(--orange); cursor:pointer;" onclick="openAuth('login')">Войти</span>`;
    openModal('authModal');
}

function submitAuth() {
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
            avatar: '', 
            banner: '', 
            lastActive: Date.now(), 
            xp: 0, 
            level: 1, 
            likedPostIds: [] 
        };
        users.push(newUser);
        currentUser = newUser;
        saveData();
        closeModal('authModal');
        updateHeaderAndSidebar();
        showToast("Успешная регистрация!");
    } else {
        let found = users.find(u => u.username === username && u.password === password);
        if (!found) { showToast("Неверный логин или пароль"); return; }
        currentUser = found;
        currentUser.lastActive = Date.now();
        if (currentUser.xp === undefined) currentUser.xp = 0;
        if (currentUser.level === undefined) currentUser.level = 1;
        if (!currentUser.likedPostIds) currentUser.likedPostIds = [];
        users = users.map(u => u.id === currentUser.id ? currentUser : u);
        saveData();
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
    if (!code) {
        showToast("Введите код подтверждения");
        return;
    }
    closeModal('verifyCodeModal');
    showToast("Почта успешно подтверждена! Теперь можно войти.");
}

// --- SOUNDCLOUD ПЛЕЕР ---
function addTrack() {
    const input = document.getElementById("url");
    const error = document.getElementById("error");
    const url = input.value.trim();

    error.textContent = "";

    if (!url) {
        error.textContent = "Вставь ссылку SoundCloud.";
        return;
    }

    if (!url.includes("soundcloud.com")) {
        error.textContent = "Это не ссылка SoundCloud.";
        return;
    }

    tracks.push({
        url: url,
        name: "SoundCloud трек"
    });

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

    widget.bind(SC.Widget.Events.PLAY, function() {
        document.getElementById("play").textContent = "⏸";
    });

    widget.bind(SC.Widget.Events.PAUSE, function() {
        document.getElementById("play").textContent = "▶";
    });

    widget.bind(SC.Widget.Events.FINISH, function() {
        next();
    });

    renderQueue();
}

function togglePlaySC() {
    if (!widget) return;
    widget.toggle();
}

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
    if (bar) {
        bar.style.background = `linear-gradient(to right, var(--orange) ${val}%, rgba(255, 255, 255, 0.15) ${val}%)`;
    }
    if (widget) {
        widget.setVolume(parseInt(val));
    }
}

function renderQueue() {
    const queue = document.getElementById("queue");
    queue.innerHTML = "";

    tracks.forEach(function(track, index) {
        const item = document.createElement("div");
        item.className = "track" + (index === currentIndex ? " active" : "");
        item.style.cssText = "margin-top:6px; padding:10px; border-radius:10px; background:#292929; cursor:pointer;";
        
        item.innerHTML = `
            <div style="font-size:13px;">${index + 1}. ${track.name}</div>
            <small style="color:#888; font-size:11px;">SoundCloud</small>
        `;

        item.onclick = function() {
            playTrack(index);
        };

        queue.appendChild(item);
    });
}

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
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
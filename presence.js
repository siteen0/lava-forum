// ==========================================
// presence.js — счётчик онлайна (Supabase Presence)
// ==========================================

let presenceRoom = null;
let onlineUsersCache = [];

function getMyIdentity() {
    if (typeof currentUser !== 'undefined' && currentUser) {
        return {
            key: currentUser.id,
            username: currentUser.username || 'Участник',
            avatar: currentUser.avatar || ''
        };
    }
    let guestId = localStorage.getItem('lava_guest_id');
    if (!guestId) {
        guestId = 'guest_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('lava_guest_id', guestId);
    }
    return { key: guestId, username: 'Гость', avatar: '' };
}

function initPresence() {
    if (presenceRoom) { updatePresence(); return; }

    const me = getMyIdentity();

    presenceRoom = supabaseClient.channel('lava-online', {
        config: { presence: { key: me.key } }
    });

    presenceRoom
        .on('presence', { event: 'sync' }, () => {
            const state = presenceRoom.presenceState();
            onlineUsersCache = Object.values(state).flat();
            renderOnlineCounter();
        })
        // Уведомления о входе/выходе отключены
        .on('presence', { event: 'join' }, () => {})
        .on('presence', { event: 'leave' }, () => {})
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') await trackSelf();
        });
}

async function trackSelf() {
    if (!presenceRoom) return;
    const me = getMyIdentity();
    try {
        await presenceRoom.track({
            key: me.key,
            username: me.username,
            avatar: me.avatar,
            online_at: new Date().toISOString()
        });
    } catch (e) { console.warn('presence track error', e); }
}

async function updatePresence() {
    if (!presenceRoom) return;
    try {
        await presenceRoom.untrack();
        await trackSelf();
    } catch (e) { console.warn('presence update error', e); }
}

function renderOnlineCounter() {
    const el = document.getElementById('onlineCounter');
    if (!el) return;

    const total = onlineUsersCache.length;
    const named = onlineUsersCache.filter(u => u.username && u.username !== 'Гость');
    const tooltip = named.length ? named.map(u => u.username).join(', ') : 'только гости';

    el.textContent = `🟢 Онлайн: ${total}`;
    el.title = tooltip;
    el.style.color = total > 1 ? '#23a55a' : '#94a3b8';
}

// Обновляем своё состояние раз в 30 сек
setInterval(() => {
    if (presenceRoom && typeof currentUser !== 'undefined' && currentUser) trackSelf();
}, 30000);

// Запускаем presence после загрузки страницы
window.addEventListener('load', () => {
    setTimeout(initPresence, 600);
});
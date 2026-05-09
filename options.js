// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-target')));
});

function switchTab(targetId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`[data-target="${targetId}"]`).classList.add('active');
    document.getElementById(targetId).classList.add('active');
}

// "API Key Help" shortcut link
document.getElementById('go-help').addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('tab-help');
});

// Toggle API key visibility
const apiKeyInput = document.getElementById('apiKey');
document.getElementById('toggleKey').addEventListener('click', () => {
    const isHidden = apiKeyInput.type === 'password';
    apiKeyInput.type = isHidden ? 'text' : 'password';
    document.getElementById('icon-eye').style.display = isHidden ? 'none' : 'block';
    document.getElementById('icon-eye-off').style.display = isHidden ? 'block' : 'none';
});

// Save settings
document.getElementById('save').addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    const language = document.getElementById('language').value;
    const status = document.getElementById('status');

    if (!key) {
        status.textContent = 'API key cannot be empty.';
        status.className = 'status error';
        setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);
        return;
    }

    chrome.storage.local.set({ tmdbApiKey: key, language }, () => {
        status.textContent = 'Settings saved — reload Letterboxd to apply.';
        status.className = 'status success';
        updateBadge(language);
        setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);
    });
});

// Load saved settings
const toggleDefaults = {
    enableTitle: true,
    enableSynopsis: true,
    enableCastPhotos: true,
    enableStreaming: true,
    hideLetterboxdStreaming: false,
    enableSubtitles: true,
    enableTrailer: true,
    enableWatchlistStreaming: true,
};

chrome.storage.local.get(['tmdbApiKey', 'language', ...Object.keys(toggleDefaults)], (result) => {
    if (result.tmdbApiKey) apiKeyInput.value = result.tmdbApiKey;
    const lang = result.language || 'fr-FR';
    document.getElementById('language').value = lang;
    updateBadge(lang);

    for (const [key, def] of Object.entries(toggleDefaults)) {
        const el = document.getElementById(`opt-${key}`);
        if (el) el.checked = result[key] !== undefined ? result[key] : def;
    }
});

// Auto-save toggles + notifie le content script en live
for (const key of Object.keys(toggleDefaults)) {
    const el = document.getElementById(`opt-${key}`);
    if (el) el.addEventListener('change', () => {
        const value = el.checked;
        chrome.storage.local.set({ [key]: value });
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab?.id) chrome.tabs.sendMessage(tab.id, { action: 'applyLiveSetting', key, value }).catch(() => {});
        });
    });
}

// Clear cache
document.getElementById('clear-cache').addEventListener('click', () => {
    const statusEl = document.getElementById('cache-status');
    chrome.storage.local.get(null, items => {
        const cacheKeys = Object.keys(items).filter(k =>
            k.includes('_cache_v3_') ||
            k.startsWith('watch_v1_') ||
            k.startsWith('credits_v1_') ||
            k.startsWith('trailer_v1_')
        );
        if (!cacheKeys.length) {
            statusEl.textContent = 'Cache is already empty.';
            statusEl.className = 'cache-status';
            setTimeout(() => { statusEl.textContent = ''; }, 3000);
            return;
        }
        chrome.storage.local.remove(cacheKeys, () => {
            statusEl.textContent = `${cacheKeys.length} entries cleared.`;
            statusEl.className = 'cache-status';
            setTimeout(() => { statusEl.textContent = ''; }, 3000);
        });
    });
});

function updateBadge(langCode) {
    const badge = document.getElementById('header-badge');
    if (badge) badge.textContent = langCode.split('-')[0].toUpperCase();
}

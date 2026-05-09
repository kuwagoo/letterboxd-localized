const norm = s => s.trim().replace(/\s+/g, ' ').toLowerCase();

const LANG3 = {
    ar:'ara', be:'bel', bg:'bul', bn:'ben', bs:'bos', ca:'cat', cs:'cze', cy:'wel',
    da:'dan', de:'ger', el:'ell', en:'eng', eo:'epo', es:'spa', et:'est', eu:'baq',
    fa:'per', fi:'fin', fr:'fre', gl:'glg', he:'heb', hi:'hin', hr:'hrv', hu:'hun',
    id:'ind', it:'ita', ja:'jpn', ka:'geo', kk:'kaz', ko:'kor', lt:'lit', lv:'lav',
    mk:'mac', ml:'mal', ms:'may', nb:'nor', nl:'nld', pl:'pol', pt:'por', ro:'rum',
    ru:'rus', sk:'slo', sl:'slv', sq:'alb', sr:'srp', sv:'swe', ta:'tam', te:'tel',
    th:'tha', tl:'tgl', tr:'tur', uk:'ukr', ur:'urd', vi:'vie', zh:'chi', zu:'zul',
};

const settings = {
    enableTitle: true,
    enableSynopsis: true,
    enableCastPhotos: true,
    enableStreaming: true,
    hideLetterboxdStreaming: false,
    enableSubtitles: true,
    enableTrailer: true,
    enableWatchlistStreaming: true,
    language: 'fr-FR',
};

// Helper async pour sendMessage
const sendMsg = msg => new Promise(resolve => {
    chrome.runtime.sendMessage(msg, response => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(response);
    });
});

chrome.storage.local.get(Object.keys(settings), result => {
    Object.keys(settings).forEach(k => { if (result[k] !== undefined) settings[k] = result[k]; });
    // Déclencher les icônes streaming sur la watchlist après chargement des settings
    if (document.body.classList.contains('my-watchlist') &&
        document.body.classList.contains('my-own-page') &&
        settings.enableWatchlistStreaming) {
        processWatchlistPage();
    }
});

// onChanged garde les settings à jour si d'autres contextes modifient le storage
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
        if (key in settings) settings[key] = newValue;
    }
});

// Message direct depuis le popup → application live immédiate
chrome.runtime.onMessage.addListener((request) => {
    if (request.action !== 'applyLiveSetting') return;
    applyLiveSetting(request.key, request.value);
});

function applyLiveSetting(key, value) {
    settings[key] = value;

    const show = (selector, visible) =>
        document.querySelectorAll(selector).forEach(el => { el.style.display = visible ? '' : 'none'; });

    switch (key) {
        case 'enableTitle':
            show('.fr-headline-subtitle, .review-fr-subtitle', value); break;
        case 'enableCastPhotos':
            show('.loc-cast-grid', value); break;
        case 'enableStreaming':
            show('.loc-watch-body', value); break;
        case 'hideLetterboxdStreaming': {
            const wd = document.querySelector('section.watch-panel #watch');
            if (wd) wd.style.display = value ? 'none' : ''; break;
        }
        case 'enableTrailer':
            show('.loc-watch-trailer', value); break;
        case 'enableSubtitles':
            show('.loc-subtitles', value); break;
        case 'enableWatchlistStreaming':
            show('.loc-watchlist-badge', value); break;
    }
}

// ── Posters ───────────────────────────────────────────────────────────────────

function processFilms() {
    const posters = document.querySelectorAll('.poster:not(.processed-fr), .poster-container:not(.processed-fr), .film-poster:not(.processed-fr)');

    posters.forEach(poster => {
        poster.classList.add('processed-fr');

        let slug = poster.getAttribute('data-film-slug');
        if (!slug) {
            const filmDiv = poster.querySelector('div[data-film-slug]');
            if (filmDiv) slug = filmDiv.getAttribute('data-film-slug');
        }
        if (!slug) {
            const link = poster.tagName === 'A' ? poster : poster.querySelector('a.frame, a[href*="/film/"]');
            if (link) {
                const href = link.getAttribute('href');
                if (href && href.includes('/film/')) {
                    const parts = href.split('/film/');
                    if (parts.length > 1) slug = parts[1].replace(/\//g, '');
                }
            }
        }

        if (slug && settings.enableTitle) {
            chrome.runtime.sendMessage({ action: "fetchFrenchTitle", slug }, (response) => {
                if (chrome.runtime.lastError) return;
                if (response && response.title) addTitleToPoster(poster, response.title, response.lang);
            });
        }
    });

    processHeadline();
    processReviewHeader();
}

function addTitleToPoster(posterElement, localizedTitle) {
    const frame = posterElement.tagName === 'A' ? posterElement : posterElement.querySelector('a.frame, a.film-poster, a[href*="/film/"]');
    if (frame) {
        const originalTitle = frame.getAttribute('data-original-title') || frame.getAttribute('title') || "";
        if (originalTitle && !originalTitle.includes(localizedTitle)) {
            frame.setAttribute('data-original-title', `${originalTitle} <br/><span class="fr-tooltip-sourcetext" style="font-size:0.9em; font-style:italic; opacity:0.8; letter-spacing: 0.3px;">${localizedTitle}</span>`);
            frame.setAttribute('title', `${originalTitle} \n ${localizedTitle}`);
        } else if (!originalTitle) {
            frame.setAttribute('data-original-title', localizedTitle);
            frame.setAttribute('title', localizedTitle);
        }
        const frameTitleSpan = frame.querySelector('.frame-title');
        if (frameTitleSpan && !frameTitleSpan.textContent.includes(localizedTitle)) {
            frameTitleSpan.innerHTML = `${frameTitleSpan.textContent} <br/><i class="fr-tooltip-sourcetext">${localizedTitle}</i>`;
        }
    } else {
        posterElement.setAttribute('title', localizedTitle);
    }
}

// ── Film page headline ────────────────────────────────────────────────────────

function processHeadline() {
    const headline = document.querySelector('.headline-1.primaryname:not(.processed-fr)');
    if (!headline) return;

    headline.classList.add('processed-fr');
    const path = window.location.pathname;
    if (!path.includes('/film/')) return;

    const slug = path.split('/film/')[1].split('/')[0];

    let imdbLink = document.querySelector('a[data-track-action="IMDb"]') || document.querySelector('a[href*="imdb.com/title/tt"]');
    let tmdbLink = document.querySelector('a[data-track-action="TMDb"]') || document.querySelector('a[href*="themoviedb.org/movie/"]');
    let imdbId = null, tmdbId = null;

    if (imdbLink) {
        const match = imdbLink.getAttribute('href').match(/\/title\/(tt\d+)/);
        if (match) imdbId = match[1];
    }
    if (tmdbLink) {
        const match = tmdbLink.getAttribute('href').match(/\/movie\/(\d+)/);
        if (match) tmdbId = match[1];
    }

    watchForPanel(tmdbId, imdbId);

    chrome.runtime.sendMessage({ action: "fetchFrenchTitle", slug, imdbId, tmdbId, forceUpdate: true }, (response) => {
        if (chrome.runtime.lastError || !response) return;

        if (settings.enableTitle && response.title) {
            const localizedNorm = norm(response.title);
            const alreadyShown = norm(headline.innerText) === localizedNorm;
            const originalNameEl = document.querySelector('.originalname');
            const sameAsOriginal = originalNameEl && norm(originalNameEl.innerText) === localizedNorm;
            if (!alreadyShown && !sameAsOriginal) {
                const sub = document.createElement('div');
                sub.className = 'fr-headline-subtitle';
                sub.innerText = response.title;
                headline.parentNode.appendChild(sub);
            }
        }

        if (settings.enableSynopsis && response.overview) {
            injectFrenchSynopsis(response.overview, response.lang);
        }

        if (settings.enableCastPhotos && tmdbId) processCastList(tmdbId);
    });
}

// ── Synopsis ──────────────────────────────────────────────────────────────────

function injectFrenchSynopsis(overview, langCode = 'en-US') {
    if (!overview) return;

    const langShort = langCode.split('-')[0].toUpperCase();
    const reviewContainer = document.querySelector('.review.body-text.-prose.-hero.prettify');
    if (!reviewContainer) return;

    const truncateDiv = reviewContainer.querySelector('.truncate');
    const targetContainer = truncateDiv || reviewContainer;
    if (targetContainer.querySelector('.fr-synopsis-toggle')) return;

    const existingP = targetContainer.querySelector('p');
    const contentTranslated = `${overview} <span style="display:inline-block; margin-left:5px; font-size:0.85em; color:#678; font-style:italic; opacity:0.8;" title="Automatically translated via TMDB">(${langShort})</span>`;
    const contentOriginal = existingP ? existingP.innerHTML : "";

    if (existingP) {
        existingP.innerHTML = contentTranslated;
        const toggleLink = document.createElement('a');
        toggleLink.className = 'fr-synopsis-toggle';
        toggleLink.href = '#';
        toggleLink.style.cssText = 'display:block; margin-top:8px; font-size:0.75em; color:#678; text-decoration:none; opacity:0.6; cursor:pointer;';
        toggleLink.innerText = "Show original version (EN)";
        toggleLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (existingP.innerHTML === contentTranslated) {
                existingP.innerHTML = contentOriginal;
                toggleLink.innerText = `Show translated version (${langShort})`;
            } else {
                existingP.innerHTML = contentTranslated;
                toggleLink.innerText = "Show original version (EN)";
            }
        });
        existingP.parentNode.insertBefore(toggleLink, existingP.nextSibling);
    } else {
        const p = document.createElement('p');
        p.innerHTML = contentTranslated;
        targetContainer.appendChild(p);
    }
}

// ── Cast photos ───────────────────────────────────────────────────────────────

function processCastList(tmdbId) {
    const castList = document.querySelector('.cast-list');
    if (!castList || castList.querySelector('.loc-cast-grid')) return;

    chrome.runtime.sendMessage({ action: 'fetchCastCredits', tmdbId }, (response) => {
        if (chrome.runtime.lastError || !response || !response.cast) return;

        const castMap = new Map(response.cast.map(a => [norm(a.name), a]));
        const links = [...castList.querySelectorAll('a.text-slug[href*="/actor/"]')].slice(0, 20);
        const matched = [];

        for (const link of links) {
            if (matched.length >= 10) break;
            const actor = castMap.get(norm(link.textContent));
            if (actor) matched.push({ actor, href: link.href });
        }

        if (!matched.length) return;

        const grid = document.createElement('div');
        grid.className = 'loc-cast-grid';

        matched.forEach(({ actor, href }) => {
            const card = document.createElement('a');
            card.className = 'loc-cast-card';
            card.href = href;

            if (actor.profile_path) {
                const img = document.createElement('img');
                img.className = 'loc-cast-photo';
                img.src = `https://image.tmdb.org/t/p/w185${actor.profile_path}`;
                img.alt = actor.name;
                img.loading = 'lazy';
                card.appendChild(img);
            } else {
                const ph = document.createElement('div');
                ph.className = 'loc-cast-placeholder';
                ph.textContent = actor.name.split(' ').map(w => w[0]).slice(0, 2).join('');
                card.appendChild(ph);
            }

            const name = document.createElement('span');
            name.className = 'loc-cast-name';
            name.textContent = actor.name;
            card.appendChild(name);

            if (actor.character) {
                const char = document.createElement('span');
                char.className = 'loc-cast-character';
                char.textContent = actor.character;
                card.appendChild(char);
            }

            grid.appendChild(card);
        });

        const paragraph = castList.querySelector('p');
        castList.insertBefore(grid, paragraph);
    });
}

// ── Streaming + Subtitles panel ───────────────────────────────────────────────

function watchForPanel(tmdbId, imdbId) {
    if (document.querySelector('.loc-watch-panel')) return;

    const tryBuild = () => {
        const watchPanel = document.querySelector('section.watch-panel');
        if (!watchPanel) return false;
        buildLocWatchPanel(tmdbId, imdbId, watchPanel);
        return true;
    };

    if (!tryBuild()) {
        const obs = new MutationObserver(() => { if (tryBuild()) obs.disconnect(); });
        obs.observe(document.body, { childList: true, subtree: true });
    }
}

function buildLocWatchPanel(tmdbId, imdbId, watchPanel) {
    if (document.querySelector('.loc-watch-panel')) return;

    if (settings.hideLetterboxdStreaming) {
        const hideWatch = () => {
            const wd = watchPanel.querySelector('#watch');
            if (wd) { wd.style.display = 'none'; return true; }
            return false;
        };
        if (!hideWatch()) {
            const obs = new MutationObserver(() => { if (hideWatch()) obs.disconnect(); });
            obs.observe(watchPanel, { childList: true, subtree: true });
        }
    }

    if (!settings.enableStreaming && !settings.enableSubtitles) return;

    const country = settings.language.split('-')[1] || 'FR';
    const section = document.createElement('section');
    section.className = 'loc-watch-panel';

    if (settings.enableStreaming && tmdbId) {
        chrome.runtime.sendMessage({ action: 'fetchWatchProviders', tmdbId }, (response) => {
            if (!chrome.runtime.lastError && response?.results) {
                const cd = response.results[country];
                if (cd) {
                    const streaming = cd.flatrate || [];
                    const vodMap = new Map();
                    (cd.rent || []).forEach(p => vodMap.set(p.provider_id, { ...p }));
                    (cd.buy  || []).forEach(p => {
                        if (!vodMap.has(p.provider_id)) vodMap.set(p.provider_id, { ...p });
                    });
                    const vod = [...vodMap.values()];

                    if (streaming.length || vod.length) {
                        const header = document.createElement('div');
                        header.className = 'loc-watch-header';
                        header.innerHTML = `<h3 class="loc-watch-title">Streaming <span class="loc-watch-country">${country}</span></h3>`;
                        section.appendChild(header);

                        const body = document.createElement('div');
                        body.className = 'loc-watch-body';
                        if (streaming.length) body.appendChild(buildProviderGroup(streaming, 'Stream', cd.link));
                        if (vod.length)       body.appendChild(buildProviderGroup(vod, 'Rent / Buy', cd.link));
                        section.appendChild(body);

                        if (settings.enableTrailer) {
                            chrome.runtime.sendMessage({ action: 'fetchTrailer', tmdbId, language: settings.language }, (res) => {
                                if (res?.key) {
                                    const a = document.createElement('a');
                                    a.className = 'loc-watch-trailer';
                                    a.href = `https://www.youtube.com/watch?v=${res.key}`;
                                    a.target = '_blank';
                                    a.rel = 'noopener noreferrer';
                                    a.title = res.name || 'Trailer';
                                    a.innerHTML = `<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Trailer`;
                                    header.appendChild(a);
                                }
                            });
                        }
                    }
                }
            }
            if (settings.enableSubtitles) section.appendChild(buildSubtitlesButton(imdbId));
            if (section.children.length) watchPanel.after(section);
        });
    } else {
        if (settings.enableSubtitles) {
            section.appendChild(buildSubtitlesButton(imdbId));
            watchPanel.after(section);
        }
    }
}

function buildProviderGroup(providers, label, jwLink) {
    const group = document.createElement('div');
    group.className = 'loc-watch-group';

    const typeLabel = document.createElement('span');
    typeLabel.className = 'loc-watch-type';
    typeLabel.textContent = label;
    group.appendChild(typeLabel);

    const list = document.createElement('div');
    list.className = 'loc-watch-list';

    providers.forEach(provider => {
        const a = document.createElement('a');
        a.className = 'loc-watch-service tooltip';
        a.href = jwLink || 'https://www.justwatch.com';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.setAttribute('data-original-title', provider.provider_name);

        if (provider.logo_path) {
            const img = document.createElement('img');
            img.src = `https://image.tmdb.org/t/p/w45${provider.logo_path}`;
            img.alt = provider.provider_name;
            img.className = 'loc-watch-logo';
            img.loading = 'lazy';
            a.appendChild(img);
        } else {
            const span = document.createElement('span');
            span.className = 'loc-watch-service-name';
            span.textContent = provider.provider_name;
            a.appendChild(span);
        }

        list.appendChild(a);
    });

    group.appendChild(list);
    return group;
}

function buildSubtitlesButton(imdbId) {
    const lang2 = settings.language.split('-')[0].toLowerCase();
    const lang3 = LANG3[lang2] || lang2;

    let url;
    if (imdbId) {
        url = `https://www.opensubtitles.org/${lang2}/search/imdbid-${imdbId}/sublanguageid-${lang3}`;
    } else {
        const title = document.querySelector('.headline-1.primaryname')?.innerText?.trim() || '';
        url = `https://www.opensubtitles.org/${lang2}/search/moviename-${title.replace(/\s+/g, '+')}/sublanguageid-${lang3}`;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'loc-subtitles';

    const btn = document.createElement('a');
    btn.className = 'loc-subtitles-btn';
    btn.href = url;
    btn.target = '_blank';
    btn.rel = 'noopener noreferrer';
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h4M15 15h2M7 11h2M13 11h4"/></svg>Find subtitles on OpenSubtitles`;

    wrapper.appendChild(btn);
    return wrapper;
}

// ── Review header ─────────────────────────────────────────────────────────────

function processReviewHeader() {
    const header = document.querySelector('.inline-production-masthead .name a:not(.processed-fr)');
    if (!header) return;

    header.classList.add('processed-fr');
    const href = header.getAttribute('href');
    if (!href?.includes('/film/')) return;

    const parts = href.split('/film/');
    if (parts.length < 2) return;

    const slug = parts[1].replace(/\//g, '');
    chrome.runtime.sendMessage({ action: "fetchFrenchTitle", slug }, (response) => {
        if (!response?.title) return;
        const masthead = header.closest('.inline-production-masthead');
        if (masthead && masthead.nextElementSibling?.className !== 'review-fr-subtitle') {
            if (header.innerText.trim() !== response.title) {
                const sub = document.createElement('div');
                sub.className = 'review-fr-subtitle';
                sub.innerText = response.title;
                masthead.parentNode.insertBefore(sub, masthead.nextSibling);
            }
        }
    });
}

// ── Watchlist streaming icons ─────────────────────────────────────────────────

async function processWatchlistPage() {
    const items = [...document.querySelectorAll('.griditem [data-item-slug]')];
    const BATCH = 5;
    for (let i = 0; i < items.length; i += BATCH) {
        await Promise.all(items.slice(i, i + BATCH).map(processWatchlistItem));
        if (i + BATCH < items.length) await new Promise(r => setTimeout(r, 400));
    }
}

async function processWatchlistItem(el) {
    const slug = el.dataset.itemSlug;
    if (!slug) return;

    const poster = el.querySelector('.poster');
    if (!poster || poster.querySelector('.loc-watchlist-badge')) return;

    const titleData = await sendMsg({ action: 'fetchFrenchTitle', slug });
    if (!titleData?.tmdbId) return;

    const watchData = await sendMsg({ action: 'fetchWatchProviders', tmdbId: titleData.tmdbId });
    if (!watchData?.results) return;

    const country = settings.language.split('-')[1] || 'FR';
    const providers = watchData.results[country]?.flatrate || [];
    if (!providers.length) return;

    buildWatchlistBadge(poster, providers);
}

function buildWatchlistBadge(posterEl, providers) {
    if (posterEl.querySelector('.loc-watchlist-badge')) return;

    const badge = document.createElement('div');
    badge.className = 'loc-watchlist-badge';

    providers.slice(0, 3).forEach(p => {
        if (!p.logo_path) return;
        const img = document.createElement('img');
        img.src = `https://image.tmdb.org/t/p/w45${p.logo_path}`;
        img.alt = p.provider_name;
        img.title = p.provider_name;
        img.loading = 'lazy';
        badge.appendChild(img);
    });

    if (providers.length > 3) {
        const more = document.createElement('span');
        more.className = 'loc-watchlist-more';
        more.textContent = `+${providers.length - 3}`;
        badge.appendChild(more);
    }

    if (badge.children.length) posterEl.appendChild(badge);
}

// ── Observer ──────────────────────────────────────────────────────────────────

let debounceTimer = null;
const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processFilms, 200);
});

observer.observe(document.body, { childList: true, subtree: true });
setTimeout(processFilms, 1000);

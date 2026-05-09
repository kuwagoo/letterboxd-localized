const storageGet = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));

const TTL = {
    title:   30 * 24 * 60 * 60 * 1000,
    watch:    7 * 24 * 60 * 60 * 1000,
    cast:    30 * 24 * 60 * 60 * 1000,
    trailer:  7 * 24 * 60 * 60 * 1000,
};

const isExpired = (cached, ttl) => !cached?.cachedAt || (Date.now() - cached.cachedAt) > ttl;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fetchFrenchTitle") {
        handleFetchLocalizedData(request.slug, request.imdbId, request.tmdbId, request.forceUpdate)
            .then(sendResponse)
            .catch(error => sendResponse({ error: error.message }));
        return true;
    }
    if (request.action === "fetchCastCredits") {
        handleFetchCastCredits(request.tmdbId)
            .then(sendResponse)
            .catch(error => sendResponse({ error: error.message }));
        return true;
    }
    if (request.action === "fetchWatchProviders") {
        handleFetchWatchProviders(request.tmdbId)
            .then(sendResponse)
            .catch(error => sendResponse({ error: error.message }));
        return true;
    }
    if (request.action === "fetchTrailer") {
        handleFetchTrailer(request.tmdbId, request.language)
            .then(sendResponse)
            .catch(error => sendResponse({ error: error.message }));
        return true;
    }
});

async function handleFetchLocalizedData(slug, imdbId = null, tmdbId = null, forceUpdate = false) {
    try {
        const { tmdbApiKey: apiKey, language = 'fr-FR' } = await storageGet(['tmdbApiKey', 'language']);
        const cacheKey = `${language}_cache_v3_${slug}`;

        const { [cacheKey]: cachedData } = await storageGet([cacheKey]);
        if (cachedData && !forceUpdate && !isExpired(cachedData, TTL.title)) return cachedData;
        if (!apiKey) return { error: "No API key" };

        const slugParts = slug ? slug.split('-') : [];
        let queryYear = null;
        if (slugParts.length > 1 && /^\d{4}$/.test(slugParts[slugParts.length - 1])) {
            queryYear = slugParts.pop();
        }
        const queryTitle = slugParts.join(' ');

        let searchUrl;
        let method = 'SEARCH';

        if (tmdbId) {
            method = 'GET';
            searchUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&language=${language}`;
        } else if (imdbId) {
            method = 'FIND';
            searchUrl = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id&language=${language}`;
        } else {
            if (!slug) throw new Error("Empty slug");
            searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(queryTitle)}&language=${language}`;
            if (queryYear) searchUrl += `&year=${queryYear}`;
        }

        const response = await fetch(searchUrl);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const json = await response.json();

        let foundMovie = null;
        if (method === 'GET') {
            foundMovie = json;
        } else if (method === 'FIND') {
            foundMovie = json.movie_results?.[0] ?? null;
        } else if (json.results?.length > 0) {
            if (queryYear) {
                const targetYear = parseInt(queryYear);
                foundMovie = json.results.find(m => {
                    if (!m.release_date) return false;
                    return Math.abs(parseInt(m.release_date.split('-')[0]) - targetYear) <= 1;
                });
            }
            if (!foundMovie) foundMovie = json.results[0];
        }

        if (foundMovie) {
            const resultData = {
                tmdbId: foundMovie.id,
                title: foundMovie.title || foundMovie.name,
                overview: foundMovie.overview || "",
                lang: language,
                cachedAt: Date.now()
            };
            await new Promise(resolve => chrome.storage.local.set({ [cacheKey]: resultData }, resolve));
            return resultData;
        }

        return { title: null };

    } catch (error) {
        return { error: error.message };
    }
}

async function handleFetchWatchProviders(tmdbId) {
    if (!tmdbId) return { error: 'No TMDB ID' };

    const cacheKey = `watch_v1_${tmdbId}`;
    const { [cacheKey]: cached, tmdbApiKey } = await storageGet([cacheKey, 'tmdbApiKey']);
    if (cached && !isExpired(cached, TTL.watch)) return cached;
    if (!tmdbApiKey) return { error: 'No API key' };

    const response = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/watch/providers?api_key=${tmdbApiKey}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = await response.json();
    const result = { results: json.results || {}, cachedAt: Date.now() };
    await new Promise(resolve => chrome.storage.local.set({ [cacheKey]: result }, resolve));
    return result;
}

async function handleFetchCastCredits(tmdbId) {
    if (!tmdbId) return { error: 'No TMDB ID' };

    const cacheKey = `credits_v1_${tmdbId}`;
    const { [cacheKey]: cached, tmdbApiKey } = await storageGet([cacheKey, 'tmdbApiKey']);
    if (cached && !isExpired(cached, TTL.cast)) return cached;
    if (!tmdbApiKey) return { error: 'No API key' };

    const response = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${tmdbApiKey}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = await response.json();
    const cast = (json.cast || []).slice(0, 10).map(a => ({
        name: a.name,
        character: a.character,
        profile_path: a.profile_path || null
    }));

    const result = { cast, cachedAt: Date.now() };
    await new Promise(resolve => chrome.storage.local.set({ [cacheKey]: result }, resolve));
    return result;
}

async function handleFetchTrailer(tmdbId, language) {
    if (!tmdbId) return { error: 'No TMDB ID' };

    const lang = language || 'fr-FR';
    const cacheKey = `trailer_v1_${tmdbId}_${lang}`;
    const { [cacheKey]: cached, tmdbApiKey } = await storageGet([cacheKey, 'tmdbApiKey']);
    if (cached && !isExpired(cached, TTL.trailer)) return cached;
    if (!tmdbApiKey) return { error: 'No API key' };

    const response = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${tmdbApiKey}&language=${lang}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = await response.json();
    const trailer = (json.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube');

    const result = { key: trailer?.key || null, name: trailer?.name || null, cachedAt: Date.now() };
    await new Promise(resolve => chrome.storage.local.set({ [cacheKey]: result }, resolve));
    return result;
}

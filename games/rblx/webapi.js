/* GN-BLOX: the Roblox web services a 2016 game talks to, answered right here in the page.
 *
 * The 2016 engine asks a web server for DataStores, game passes, asset ownership, groups, friends
 * and product info. There's no such server behind this site, and when one of those requests failed
 * the engine never woke the script that was waiting, so a single :SetAsync() or :PlayerOwnsAsset()
 * froze the game's main script. rblx.js now sends those requests to wb-api/<path>, the service
 * worker (coi-serviceworker.js) hands them to this page, and this answers them:
 *
 *   - DataStores and OrderedDataStores work, and are kept on this device (per game).
 *   - Nobody owns game passes or assets, nobody is in a group (rank 0, role "Guest"), nobody is
 *     friends, and products have plain info: games carry on instead of hanging.
 */
(function () {
  'use strict';
  const XML_BOOL = v => '<Value Type="boolean">' + (v ? 'true' : 'false') + '</Value>';
  const XML_INT = v => '<Value Type="integer">' + (v | 0) + '</Value>';
  const LIMIT = 4 * 1024 * 1024;   // keep each game's saved data under ~4 MB of localStorage

  function start(opts) {
    const storeKey = 'gnblox-ds:' + (opts.game || 'game');
    let data = {};
    try { data = JSON.parse(localStorage.getItem(storeKey) || '{}') || {}; } catch (e) { data = {}; }
    let saveTimer = 0;
    const save = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          const s = JSON.stringify(data);
          if (s.length < LIMIT) localStorage.setItem(storeKey, s);
          else console.warn('GN-BLOX: this game\'s saved data is over 4 MB; not saving more.');
        } catch (e) { console.warn('GN-BLOX: couldn\'t save game data', e); }
      }, 300);
    };
    addEventListener('pagehide', () => { clearTimeout(saveTimer); try { localStorage.setItem(storeKey, JSON.stringify(data)); } catch (e) {} });

    const slot = (type, scope, key, target) => [type || 'standard', scope || 'global', key || '', target || ''].join('\u0001');
    const form = body => {
      const out = {};
      for (const part of String(body || '').split('&')) {
        if (!part) continue;
        const i = part.indexOf('=');
        const k = decodeURIComponent((i < 0 ? part : part.slice(0, i)).replace(/\+/g, ' '));
        out[k] = i < 0 ? '' : decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' '));
      }
      return out;
    };
    const json = o => ({ type: 'application/json', body: JSON.stringify(o) });
    const text = s => ({ type: 'text/plain', body: String(s) });

    function persistence(op, q, body) {
      const type = q.get('type') || 'standard', scope = q.get('scope') || 'global';
      if (op === 'getV2') {
        const f = form(body), rows = [];
        for (let i = 0; f['qkeys[' + i + '].key'] != null; i++) {
          const k = { Scope: f['qkeys[' + i + '].scope'] || scope, Target: f['qkeys[' + i + '].target'] || '', Key: f['qkeys[' + i + '].key'] };
          const v = data[slot(type, k.Scope, k.Key, k.Target)];
          if (v != null) rows.push({ Key: k, Value: v });
        }
        return json({ data: rows });
      }
      if (op === 'set') {
        const f = form(body), id = slot(type, scope, q.get('key'), q.get('target'));
        // (UpdateAsync sends the value it expects to replace; one player per device, so it always wins)
        data[id] = f.value == null ? '' : f.value;
        save();
        return json({ data: data[id] });
      }
      if (op === 'increment') {
        const id = slot(type, scope, q.get('key'), q.get('target'));
        const now = (parseInt(data[id], 10) || 0) + (parseInt(q.get('value'), 10) || 0);
        data[id] = String(now);
        save();
        return json({ data: now });
      }
      if (op === 'getSortedValues') {
        const key = q.get('key') || '', size = Math.max(1, Math.min(100, parseInt(q.get('pageSize'), 10) || 50));
        const asc = /^true$/i.test(q.get('ascending') || '');
        const min = q.has('inclusiveMinValue') ? Number(q.get('inclusiveMinValue')) : -Infinity;
        const max = q.has('inclusiveMaxValue') ? Number(q.get('inclusiveMaxValue')) : Infinity;
        const prefix = slot(type, scope, key, '').slice(0, -1);
        const all = Object.keys(data).filter(k => k.startsWith(prefix + '\u0001'))
          .map(k => ({ Target: k.slice(prefix.length + 1), Value: parseInt(data[k], 10) || 0 }))
          .filter(e => e.Value >= min && e.Value <= max)
          .sort((a, b) => (asc ? a.Value - b.Value : b.Value - a.Value) || (a.Target < b.Target ? -1 : 1));
        const start = Math.max(0, parseInt(q.get('exclusiveStartKey'), 10) || 0);
        const page = all.slice(start, start + size);
        return json({ data: { Entries: page, ExclusiveStartKey: start + size < all.length ? String(start + size) : null } });
      }
      return json({ data: null });
    }

    function answer(method, url, body) {
      const u = new URL(url, location.href);
      const path = u.pathname.replace(/^.*?\/wb-api\//, '/').toLowerCase(), q = u.searchParams;
      const qi = name => { for (const [k, v] of q) if (k.toLowerCase() === name) return v; return ''; };
      let m;
      if ((m = path.match(/^\/persistence\/(getv2|set|increment|getsortedvalues)$/))) {
        const op = { getv2: 'getV2', set: 'set', increment: 'increment', getsortedvalues: 'getSortedValues' }[m[1]];
        return persistence(op, q, body);
      }
      if (path === '/ownership/hasasset') return text('false');
      if (path === '/ownership/assets') return json({ data: [], previousPageCursor: null, nextPageCursor: null });
      if (path.startsWith('/game/gamepass/')) return text(XML_BOOL(false));
      if (path.startsWith('/game/luawebservice/handlesocialrequest')) {
        const method = qi('method').toLowerCase();
        if (method === 'getgrouprank') return text(XML_INT(0));
        if (method === 'getgrouprole') return text('Guest');
        return text(XML_BOOL(false));   // IsInGroup, IsFriendsWith, IsBestFriendsWith
      }
      if (path.includes('productinfo')) {
        const id = parseInt(qi('assetid') || qi('productid'), 10) || 0;
        return json({ TargetId: id, AssetId: id, ProductId: id, Name: 'Item ' + id, Description: '', AssetTypeId: 0, Creator: { Id: 1, Name: 'GN-BLOX', CreatorType: 'User' },
          IconImageAssetId: 0, Created: '2016-01-01T00:00:00Z', Updated: '2016-01-01T00:00:00Z', PriceInRobux: 0, PriceInTickets: null, Sales: 0, IsNew: false, IsForSale: false,
          IsPublicDomain: false, IsLimited: false, IsLimitedUnique: false, Remaining: null, MinimumMembershipLevel: 0, ContentRatingTypeId: 0 });
      }
      if (path.startsWith('/userblock/getblockedusers')) return json({ success: true, userList: [], total: 0 });
      if (path.startsWith('/userblock/')) return json({ success: true });
      if (/^\/users\/\d+\/friends/.test(path) || path === '/my/friendsonline') return json([]);
      if (/^\/users\/\d+\/canmanage/.test(path)) return json({ Success: true, CanManage: false });
      if (path.startsWith('/universes/')) return json({ UniverseId: 0 });
      if (path.startsWith('/game/getallowedexperimentalfeatures')) return json({ AllowedFeatures: [] });
      if (path.startsWith('/asset')) return text('<roblox version="4"></roblox>');   // require(id) / LoadAsset: an empty model
      return text('');
    }

    // Only one game tab answers (a second one would apply every DataStore write twice).
    const ch = new BroadcastChannel('gnblox-api');
    let mine = !navigator.locks;
    if (navigator.locks) navigator.locks.request('gnblox-webapi', () => { mine = true; return new Promise(() => {}); });
    ch.onmessage = e => {
      const d = e.data || {};
      if (!d.id || typeof d.url !== 'string' || !mine) return;
      let r;
      try { r = answer(d.method || 'GET', d.url, d.body || ''); } catch (err) { r = { type: 'text/plain', body: '' }; console.warn('GN-BLOX web API:', err); }
      if (opts.debug) console.log('GN-BLOX web API:', d.method, d.url.replace(/^.*?\/wb-api/, ''), '->', r.body.slice(0, 160));
      ch.postMessage({ id: d.id, reply: r.body, type: r.type });
    };
    return { answer, get data() { return data; } };
  }

  window.GNWebApi = { start };
})();

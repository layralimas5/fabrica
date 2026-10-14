/*!
 * Fábrica — rastreamento de conversões das nossas landing pages e apps.
 *
 * <script src="https://fabrica-s.netlify.app/t.js"
 *         data-key="pk_..."                      chave pública do projeto (Projetos > Rastreamento)
 *         data-endpoint="https://<ref>.supabase.co/functions/v1/track"
 *         data-consent="required"                "required" (padrão): só guarda o id do visitante depois de fabrica.consent(true)
 *                                                "granted": a política de privacidade do site já cobre a medição
 *         data-decorate="app.momentumm.com"      domínios que recebem a origem nos links (LP → quiz → app)
 *         data-pageview="off"                    no quiz e no app: não conta visita à landing page
 *         async></script>
 *
 * API: fabrica.track('quiz_start'), fabrica.consent(true|false), fabrica.attribution(), fabrica.decorate(url)
 * Sem consentimento os eventos ainda contam, mas anônimos: sem id de visitante, sem nada guardado no navegador.
 * Nunca envia e-mail, nome, query string ou IP. Eventos: lp_view (automático), quiz_start, quiz_complete,
 * signup, trial_start, subscription.
 */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script || window.fabrica) return;
  var KEY = script.getAttribute('data-key');
  var ENDPOINT = (script.getAttribute('data-endpoint') || '').replace(/\/+$/, '');
  var CONSENT_MODE = script.getAttribute('data-consent') === 'granted' ? 'granted' : 'required';
  var DECORATE = (script.getAttribute('data-decorate') || '').split(',').map(function (d) { return d.trim().toLowerCase(); }).filter(Boolean);
  var EVENTS = ['lp_view', 'quiz_start', 'quiz_complete', 'signup', 'trial_start', 'subscription'];
  var STORE = 'fabrica:v1';
  var PAGEVIEW = script.getAttribute('data-pageview') !== 'off';
  if (!KEY || !ENDPOINT) return;

  function randomId() {
    var bytes = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  function read() {
    try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; }
  }
  function write(state) {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* storage blocked: events stay anonymous */ }
  }

  var stored = read();
  var consent = CONSENT_MODE === 'granted' || Boolean(stored && stored.consent);
  var memory = { first: null, last: null };

  function touchFromUrl() {
    var search = new URLSearchParams(location.search);
    var touch = {
      source: search.get('utm_source'), medium: search.get('utm_medium'), campaign: search.get('utm_campaign'),
      content: search.get('utm_content'), link: search.get('fab_l'), at: new Date().toISOString(),
    };
    return touch.source || touch.link || touch.campaign ? touch : null;
  }

  function state() {
    if (!consent) return memory;
    var current = read() || {};
    if (!current.visitor) current.visitor = randomId();
    if (!current.session || Date.now() - (current.seen || 0) > 30 * 60 * 1000) current.session = randomId();
    current.seen = Date.now();
    current.consent = true;
    if (memory.first && !current.first) current.first = memory.first;
    if (memory.last) current.last = memory.last;
    write(current);
    return current;
  }

  var arriving = touchFromUrl();
  if (arriving) {
    memory.first = (stored && stored.first) || arriving;
    memory.last = arriving;
  } else if (stored) {
    memory.first = stored.first || null;
    memory.last = stored.last || null;
  }

  var queue = [];
  var timer = null;
  function flush(useBeacon) {
    timer = null;
    if (!queue.length) return;
    var body = JSON.stringify({ key: KEY, events: queue.splice(0, 20) });
    var url = ENDPOINT + '/event';
    if (useBeacon && navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
    fetch(url, { method: 'POST', body: body, headers: { 'Content-Type': 'text/plain' }, keepalive: true, credentials: 'omit' }).catch(function () {});
  }

  function track(name) {
    if (EVENTS.indexOf(name) === -1) return;
    var current = state();
    queue.push({
      id: randomId(), name: name, occurredAt: new Date().toISOString(), path: location.pathname, consent: consent,
      visitorId: consent ? current.visitor : null, sessionId: consent ? current.session : null,
      firstTouch: current.first || memory.first, lastTouch: current.last || memory.last,
    });
    if (!timer) timer = setTimeout(flush, 800);
  }

  /** Adds the origin to links that go to our other sites (quiz, app), so sign-up still knows where the visit came from. */
  function decorate(href) {
    try {
      var url = new URL(href, location.href);
      var touch = memory.last || memory.first;
      if (!touch) return url.toString();
      if (touch.source) url.searchParams.set('utm_source', touch.source);
      if (touch.medium) url.searchParams.set('utm_medium', touch.medium);
      if (touch.campaign) url.searchParams.set('utm_campaign', touch.campaign);
      if (touch.content) url.searchParams.set('utm_content', touch.content);
      if (touch.link) url.searchParams.set('fab_l', touch.link);
      if (consent) url.searchParams.set('fab_v', state().visitor);
      return url.toString();
    } catch (e) { return href; }
  }

  document.addEventListener('click', function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!anchor || !DECORATE.length) return;
    var host = anchor.hostname.toLowerCase();
    if (DECORATE.some(function (domain) { return host === domain || host.slice(-domain.length - 1) === '.' + domain; })) anchor.href = decorate(anchor.href);
  }, true);

  // A visitor id passed by our own site (fab_v) continues the same visitor across domains, once there is consent.
  var passed = new URLSearchParams(location.search).get('fab_v');
  if (passed && /^[a-f0-9]{32}$/.test(passed) && consent) { var s = read() || {}; s.visitor = passed; write(s); }

  window.fabrica = {
    track: track,
    consent: function (granted) {
      consent = Boolean(granted);
      if (consent) state();
      else try { localStorage.removeItem(STORE); } catch (e) { /* nothing stored */ }
    },
    /** What the sign-up form sends to the app's server, so the server event keeps the origin. */
    attribution: function () {
      var current = consent ? state() : memory;
      return { visitorId: consent ? current.visitor : null, firstTouch: current.first || memory.first, lastTouch: current.last || memory.last };
    },
    decorate: decorate,
  };

  addEventListener('pagehide', function () { flush(true); });
  if (PAGEVIEW) track('lp_view');
})();

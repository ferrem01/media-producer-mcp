// ── shared/icons.js ──
// HOUSE ICONS: one set of line glyphs (24-unit grid, 2px round stroke) for
// every card that carries an icon -- notifications, checklist rows. Emoji
// read as a template, never as a product (Marc, Oct 14: "the cards we're
// using ... they just look like they're low quality"); a drawn glyph in the
// brand colour reads as designed.
//
//   mpIcons.names                 the glyph names
//   mpIcons.svg(name, opts)       an <svg> string ('' for an unknown name);
//                                 opts.color (default currentColor), opts.stroke
//   mpIcons.resolve(icon)         a glyph name for a card's icon field: a name
//                                 ('mail'), or an emoji saved films carry ('📥'
//                                 -> 'inbox'); null when nothing matches
(function () {
  var P = {
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    inbox: '<path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20"/><path d="M6.2 5h11.6L20 13v5.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5V13z"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5h4"/>',
    flame: '<path d="M12 3c.8 3.6 5.5 5.6 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.6 1.5-4 2.6-5.8.8 1.7 1.7 2.6 2.7 2.8.3-2.4-.6-4.8.2-7.5z"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    doc: '<path d="M6.5 3h7.5l4 4v14h-11.5z"/><path d="M14 3v4h4"/><path d="M9.5 12h5M9.5 16h5"/>',
    megaphone: '<path d="M3.5 10v4h3.5l8 5V5l-8 5z"/><path d="M18.5 9.5a3.5 3.5 0 0 1 0 5"/>',
    trash: '<path d="M4.5 7h15"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l1 13h9l1-13"/>',
    question: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.6v.4"/><circle cx="12" cy="16.8" r=".6" fill="currentColor"/>',
    tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7z"/><circle cx="8" cy="8" r="1.4"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.2 19.5a5.8 5.8 0 0 1 11.6 0"/><circle cx="17" cy="9.5" r="2.5"/><path d="M16 14.2a4.6 4.6 0 0 1 4.8 5.3"/>',
    user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    send: '<path d="M20.5 3.5L3.5 10.8l7 2.7 2.7 7z"/><path d="M10.5 13.5l10-10"/>',
    book: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5z"/><path d="M5 20.5v-15"/>',
    dollar: '<path d="M12 3.5v17"/><path d="M16 7.8c-.8-1.2-2.2-1.9-4-1.9-2.2 0-3.8 1.1-3.8 2.8 0 1.8 1.7 2.4 3.8 2.9s3.8 1.2 3.8 3c0 1.7-1.7 2.9-3.8 2.9-1.8 0-3.3-.8-4-2"/>',
    repeat: '<path d="M4.5 11V9.5a3 3 0 0 1 3-3h12"/><path d="M16.5 3.5l3 3-3 3"/><path d="M19.5 13v1.5a3 3 0 0 1-3 3h-12"/><path d="M7.5 20.5l-3-3 3-3"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    building: '<path d="M4.5 20.5V5.5l8-2.5v17.5"/><path d="M12.5 9h7v11.5"/><path d="M2.5 20.5h19"/><path d="M7.5 8h2M7.5 12h2M7.5 16h2M15.5 13h1.5M15.5 16.5h1.5"/>',
    chart: '<path d="M4 20V11M10 20V5M16 20v-6.5"/><path d="M2.5 20.5h19"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/>',
    alert: '<path d="M12 3.5l9.5 17h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.6" r=".6" fill="currentColor"/>',
    share: '<path d="M4.5 12.5v6.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-6.5"/><path d="M12 3.5v12"/><path d="M8 7.5l4-4 4 4"/>',
    chat: '<path d="M4 5.5h16v10.5H9.5L4 20z"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
    phone: '<path d="M5 4h3.5l1.5 4.5-2.2 1.3a11 11 0 0 0 6.4 6.4l1.3-2.2 4.5 1.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5l5 5"/>',
    zap: '<path d="M13 2.5L4.5 13.5H12l-1 8 8.5-11H12z"/>'
  };

  // Emoji a saved film carries -> the glyph that means the same thing.
  var EMOJI = {
    '📝': 'doc', '📄': 'doc', '📃': 'doc', '🗒': 'doc', '📋': 'doc',
    '📥': 'inbox', '📨': 'inbox', '📩': 'mail', '✉': 'mail', '📧': 'mail', '💌': 'mail',
    '🔔': 'bell', '🔥': 'flame', '🎯': 'target', '👀': 'eye', '👁': 'eye',
    '✅': 'check', '✔': 'check', '☑': 'check', '✓': 'check',
    '❌': 'x', '✖': 'x', '✕': 'x', '⛔': 'x', '🚫': 'x',
    '📣': 'megaphone', '📢': 'megaphone', '🗑': 'trash', '❓': 'question', '❔': 'question',
    '🏷': 'tag', '🤝': 'users', '👥': 'users', '👤': 'user', '👔': 'user', '🧑': 'user', '👩': 'user', '👨': 'user',
    '⏱': 'clock', '⏰': 'clock', '🕐': 'clock', '⌛': 'clock', '⏳': 'clock',
    '✈': 'send', '🚀': 'send', '📤': 'send', '📚': 'book', '📖': 'book', '🎓': 'book',
    '💲': 'dollar', '💰': 'dollar', '💵': 'dollar', '🔁': 'repeat', '🔄': 'repeat', '♻': 'repeat',
    '📅': 'calendar', '📆': 'calendar', '🗓': 'calendar', '🏢': 'building', '🏭': 'building', '🏬': 'building',
    '📈': 'chart', '📊': 'chart', '📉': 'chart', 'ℹ': 'info', '⚠': 'alert', '❗': 'alert', '🚨': 'alert',
    '💬': 'chat', '🗨': 'chat', '⭐': 'star', '🌟': 'star', '📞': 'phone', '📱': 'phone',
    '🔗': 'link', '🔍': 'search', '🔎': 'search', '⚡': 'zap'
  };

  function resolve(icon) {
    if (icon == null) return null;
    var s = String(icon).trim();
    if (!s) return null;
    var low = s.toLowerCase();
    if (P[low]) return low;
    // Strip variation selectors / skin tones so '🗑️' finds '🗑'.
    var bare = s.replace(/[︎️‍]|\uD83C[\uDFFB-\uDFFF]/g, '');
    if (EMOJI[bare]) return EMOJI[bare];
    var first = Array.from ? Array.from(bare)[0] : bare.charAt(0);
    return EMOJI[first] || null;
  }

  function svg(name, opts) {
    var body = P[name];
    if (!body) return '';
    opts = opts || {};
    var color = opts.color || 'currentColor';
    var stroke = opts.stroke || 2;
    return '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="' + color +
      '" stroke-width="' + stroke + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      body.replace(/currentColor/g, color) + '</svg>';
  }

  var api = { names: Object.keys(P), svg: svg, resolve: resolve };
  if (typeof window !== 'undefined') window.mpIcons = api;
  if (typeof globalThis !== 'undefined') globalThis.mpIcons = api;
})();

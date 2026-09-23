/**
 * Activity feed runtime -- new events land in a captured activity feed.
 *
 * The Quotient person and company pages (audience-person-detail,
 * audience-company-details) carry a real "Recent Activity" feed: day headers
 * ("Monday, September 21, 2026") over rows of icon + avatar + title + detail
 * link + time. A film needs that feed to MOVE: a signal fires, a row lands.
 *
 * capActivityFeed(tl, root, events, opts) schedules each event at its `at`:
 * the row is CLONED from a real row in the capture (so it can never drift
 * from the product's own styling), filled with the event, and inserted at the
 * top of the day group its date belongs to -- a group that does not exist yet
 * (a new day) is cloned from an existing one and slotted in date order.
 *
 * Event: { at, type, actor?, verb?, title?, detail?, date?, time?, source?,
 *          highlight? }
 *   type    -- one of ACTIVITY_TYPES below (email, web, meeting, CRM, lead
 *              score, lists, flows, product and custom events).
 *   actor   -- who did it (default: the page's person).
 *   title   -- the whole line, verbatim; else `${actor} ${verb}`.
 *   detail  -- the second line (email subject, page path, stage change...).
 *   date    -- 'YYYY-MM-DD' | 'today' | 'yesterday' | '-N' (days ago);
 *              default 'today', resolved against opts.today (else the date
 *              the film is rendered).
 *   time    -- the right-hand time label (default 'Just now').
 *   source  -- a small pill after the title: "HubSpot", "Product", "Website".
 *   highlight -- false to skip the accent wash the row lands with.
 *
 * Uses `var` throughout -- inlined into assembled HTML, no bundler.
 */

var ACTIVITY_ICON_PATHS = {
  mail: '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  delivered: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  click: '<path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/>',
  reply: '<path d="M20 18v-2a4 4 0 0 0-4-4H4"/><path d="m9 17-5-5 5-5"/>',
  bounce: '<path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="m17 17 4 4"/><path d="m21 17-4 4"/>',
  unsubscribe: '<path d="M22 15V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="M16 19h6"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  form: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  signup: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  deal: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  crm: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  score: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  list: '<path d="M11 12H3"/><path d="M16 6H3"/><path d="M16 18H3"/><path d="M18 9v6"/><path d="M21 12h-6"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  flow: '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  custom: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>'
};

/** Every event type the feed can show: its icon and default verb. */
var ACTIVITY_TYPES = {
  email_sent:         { icon: 'send',        verb: 'was sent an email' },
  email_delivered:    { icon: 'delivered',   verb: 'received an email' },
  email_opened:       { icon: 'mail',        verb: 'opened an email' },
  email_clicked:      { icon: 'click',       verb: 'clicked a link in an email' },
  email_replied:      { icon: 'reply',       verb: 'replied to an email' },
  email_bounced:      { icon: 'bounce',      verb: 'bounced an email' },
  unsubscribed:       { icon: 'unsubscribe', verb: 'unsubscribed' },
  page_view:          { icon: 'eye',         verb: 'viewed a page' },
  form_submitted:     { icon: 'form',        verb: 'submitted a form' },
  signup:             { icon: 'signup',      verb: 'signed up' },
  meeting_booked:     { icon: 'calendar',    verb: 'booked a meeting' },
  deal_stage_changed: { icon: 'deal',        verb: 'moved to a new deal stage' },
  crm_event:          { icon: 'crm',         verb: 'was updated in the CRM' },
  lead_score_changed: { icon: 'score',       verb: 'had their lead score change' },
  list_added:         { icon: 'list',        verb: 'was added to a list' },
  property_updated:   { icon: 'pencil',      verb: 'had a property updated' },
  flow_entered:       { icon: 'flow',        verb: 'entered a flow' },
  product_event:      { icon: 'zap',         verb: 'triggered a product event' },
  custom:             { icon: 'custom',      verb: 'triggered a custom event' }
};
// Older names, kept so a script written against them still lands.
var ACTIVITY_TYPE_ALIASES = { click: 'email_clicked', email_received: 'email_delivered', meeting: 'meeting_booked', custom_event: 'custom', deal_stage: 'deal_stage_changed', lead_score: 'lead_score_changed' };

var ACTIVITY_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var ACTIVITY_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function activityDayKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** "Monday, September 21, 2026" -> Date (local), or null. */
function activityParseHeader(text) {
  var m = String(text || '').match(/([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  var mi = ACTIVITY_MONTHS.indexOf(m[1]);
  if (mi < 0) return null;
  return new Date(Number(m[3]), mi, Number(m[2]));
}

function activityFormatHeader(d) {
  return ACTIVITY_DAYS[d.getDay()] + ', ' + ACTIVITY_MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

/** 'YYYY-MM-DD' | 'today' | 'yesterday' | '-N' -> Date, against `today`. */
function activityResolveDate(spec, today) {
  var base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (spec == null || spec === '' || spec === 'today') return base;
  if (spec === 'yesterday') return new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1);
  var rel = String(spec).match(/^-(\d+)$/);
  if (rel) return new Date(base.getFullYear(), base.getMonth(), base.getDate() - Number(rel[1]));
  var iso = String(spec).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return base;
}

/** '#393bf5' -> 'rgba(57,59,245,a)'; GSAP interpolates rgba, not color-mix. */
function activityRgba(hex, a) {
  var m = String(hex || '').match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return 'rgba(57,59,245,' + a + ')';
  return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')';
}

function activityInitials(name) {
  var parts = String(name || '').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** The feed's day groups, in page order: [{ el, header, rows, date }]. */
function activityGroups(root) {
  var out = [];
  root.querySelectorAll('h3').forEach(function (h) {
    var d = activityParseHeader(h.textContent);
    if (!d || !h.nextElementSibling) return;
    out.push({ el: h.parentElement, header: h, rows: h.nextElementSibling, date: d });
  });
  return out;
}

/** Swap an <svg>'s drawing for one of ours, keeping its size and color. */
function activitySetIcon(svg, key) {
  if (!svg) return;
  svg.innerHTML = ACTIVITY_ICON_PATHS[key] || ACTIVITY_ICON_PATHS.custom;
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
}

/** The leaf element holding the row's title: the first text leaf that is not
 *  inside the avatar or the detail link. */
function activityTitleEl(row) {
  var leaves = row.querySelectorAll('div, p, span');
  for (var i = 0; i < leaves.length; i++) {
    var n = leaves[i];
    if (n.children.length) continue;
    if (n.closest('[data-slot="avatar"]') || n.closest('a')) continue;
    if ((n.textContent || '').trim().length > 3) return n;
  }
  return null;
}

function activityTimeEl(row) {
  var leaves = row.querySelectorAll('div, span, p');
  var hit = null;
  leaves.forEach(function (n) {
    if (!n.children.length && /^\s*\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?\s*$/i.test(n.textContent || '')) hit = n;
  });
  return hit;
}

/** A capture freezes every box's height. A feed that grows needs its day
 *  groups (and the list around them) to size to their rows again, or a new
 *  row is squashed into the old height and a cloned day keeps its template's. */
function activityFreeHeights(els) {
  els.forEach(function (e) {
    if (!e || !e.style) return;
    e.style.height = 'auto';
    e.style.minHeight = '0px';
    e.style.maxHeight = 'none';
  });
}

function capActivityFeed(tl, root, events, opts) {
  if (!Array.isArray(events) || !events.length) return;
  opts = opts || {};
  var groups = activityGroups(root);
  if (!groups.length) return;
  var groupsParent = groups[0].el.parentElement;
  activityFreeHeights([groupsParent]);
  groups.forEach(function (g) { activityFreeHeights([g.el, g.rows]); });
  var rowTemplate = groups[0].rows.firstElementChild;
  if (!rowTemplate) return;
  rowTemplate = rowTemplate.cloneNode(true);
  var groupTemplate = groups[0].el.cloneNode(true);
  var accent = opts.accent || '#393bf5';
  var today = opts.today ? activityResolveDate(opts.today, new Date()) : new Date();
  var person = opts.person || '';

  var sorted = events.filter(Boolean).slice().sort(function (a, b) { return (Number(a.at) || 0) - (Number(b.at) || 0); });
  sorted.forEach(function (ev) {
    var type = ACTIVITY_TYPE_ALIASES[ev.type] || ev.type || 'custom';
    var spec = ACTIVITY_TYPES[type] || ACTIVITY_TYPES.custom;
    var at = Number(ev.at) || 0;
    var actor = ev.actor || person || 'Someone';
    var verb = ev.verb || spec.verb;
    if (!ev.verb && (type === 'custom' || type === 'product_event' || type === 'crm_event') && ev.name) verb = 'triggered “' + ev.name + '”';
    var title = ev.title || (actor + ' ' + verb);
    var date = activityResolveDate(ev.date, today);
    var key = activityDayKey(date);

    // Its day group: the one already on the page, or a new one cloned from
    // an existing group and slotted in date order (newest first).
    var group = null;
    for (var gi = 0; gi < groups.length; gi++) if (activityDayKey(groups[gi].date) === key) { group = groups[gi]; break; }
    var newGroup = false;
    if (!group) {
      var gel = groupTemplate.cloneNode(true);
      var gh = gel.querySelector('h3');
      gh.textContent = activityFormatHeader(date);
      var grows = gh.nextElementSibling;
      while (grows.firstChild) grows.removeChild(grows.firstChild);
      var before = null;
      for (var gj = 0; gj < groups.length; gj++) if (groups[gj].date < date) { before = groups[gj]; break; }
      groupsParent.insertBefore(gel, before ? before.el : null);
      activityFreeHeights([gel, grows]);
      group = { el: gel, header: gh, rows: grows, date: date };
      groups.push(group);
      groups.sort(function (a, b) { return b.date - a.date; });
      newGroup = true;
    }

    // The row, cloned from a real one and filled in.
    var row = rowTemplate.cloneNode(true);
    var svgs = row.querySelectorAll('svg');
    activitySetIcon(svgs[0], spec.icon);
    var titleEl = activityTitleEl(row);
    if (titleEl) {
      titleEl.textContent = title;
      if (ev.source) {
        var pill = document.createElement('span');
        pill.textContent = ev.source;
        pill.style.cssText = 'display:inline-block;margin-left:8px;padding:0 6px;border:1px solid rgb(228,228,236);border-radius:6px;font-size:11px;line-height:18px;font-weight:500;color:rgb(84,84,95);vertical-align:1px;';
        titleEl.appendChild(pill);
      }
    }
    var link = row.querySelector('a');
    if (link) {
      if (ev.detail) {
        var linkSvg = link.querySelector('svg');
        activitySetIcon(linkSvg, spec.icon);
        var texts = [];
        link.childNodes.forEach(function (n) { if (n.nodeType === 3) texts.push(n); });
        texts.forEach(function (n) { n.parentNode.removeChild(n); });
        link.appendChild(document.createTextNode(ev.detail));
      } else {
        link.parentNode.removeChild(link);
      }
    }
    var timeEl = activityTimeEl(row);
    if (timeEl) timeEl.textContent = ev.time || 'Just now';
    // A company feed shows each actor's initials; a person feed keeps the
    // person's own avatar unless someone else did it.
    var avatar = row.querySelector('[data-slot="avatar"]');
    if (avatar && ev.actor && !avatar.querySelector('img')) {
      var leaf = avatar;
      while (leaf.firstElementChild) leaf = leaf.firstElementChild;
      leaf.textContent = activityInitials(ev.actor);
    } else if (avatar && ev.actor && ev.actor !== person && avatar.querySelector('img')) {
      var img = avatar.querySelector('img');
      var chip = document.createElement('span');
      chip.textContent = activityInitials(ev.actor);
      chip.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:9999px;background:rgb(244,244,247);color:rgb(84,84,95);font-size:12px;font-weight:600;';
      img.parentNode.replaceChild(chip, img);
    }

    group.rows.insertBefore(row, group.rows.firstChild);

    // Land it: the row opens from nothing (the rows under it slide down), then
    // an accent wash fades off it. Heights are measured now, at build, so the
    // timeline seeks cleanly to any frame.
    row.style.overflow = 'hidden';
    var h = row.offsetHeight;
    gsap.set(row, { height: 0, autoAlpha: 0 });
    if (newGroup) {
      var hh = group.header.offsetHeight;
      group.header.style.overflow = 'hidden';
      gsap.set(group.header, { height: 0, autoAlpha: 0 });
      tl.to(group.header, { height: hh, autoAlpha: 1, duration: 0.35, ease: 'power2.out' }, Math.max(0, at - 0.2));
    }
    tl.to(row, { height: h, autoAlpha: 1, duration: 0.45, ease: 'power3.out' }, at);
    if (ev.highlight !== false) {
      tl.fromTo(row, { backgroundColor: activityRgba(accent, 0.12) },
        { backgroundColor: activityRgba(accent, 0), duration: 1.8, ease: 'power1.in', immediateRender: false }, at + 0.35);
    }
  });
}

/** Captured time labels were sized to the page's own font metrics; keep them
 *  on one line ("11:24:01 AM" wrapped to two in a 16px-narrower box). */
function capNoWrapTimes(root) {
  root.querySelectorAll('div, span, p').forEach(function (n) {
    if (!n.children.length && /^\s*\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)\s*$/i.test(n.textContent || '')) {
      n.style.whiteSpace = 'nowrap';
      n.style.width = 'auto';
      n.style.minWidth = 'max-content';
    }
  });
}

/**
 * Split a capture's data.script: `activity` actions belong to the feed, the
 * rest to the capture verbs. Returns { feed: [...events], verbs: [...] }.
 */
function capSplitActivityScript(data) {
  var feed = [], verbs = [];
  var lists = [data && data.activity, data && data.new_activities, data && data.activity_script];
  lists.forEach(function (l) { if (Array.isArray(l)) feed = feed.concat(l); });
  ((data && data.script) || []).forEach(function (a) {
    if (a && a.action === 'activity') feed.push(a); else verbs.push(a);
  });
  return { feed: feed, verbs: verbs };
}

/**
 * Fit a capture into its box. focus 'full' (default) shows all of it; a named
 * region ('feed', 'details') fills the box's width with that region, top
 * aligned -- new activity lands at the top, so that is where the eye goes.
 * `regions` maps a name to a function returning the region's element(s).
 */
function capFitFocus(el, frame, nativeW, nativeH, focus, zoom, regions) {
  // The box is often sized AFTER the component builds (the scene's layout
  // pass places it): a fit computed once, at build, used the fallback native
  // size and showed the wrong part of the page (measured on a storyboard card:
  // a feed focus showing the Details column). Fit now, and again whenever
  // the box's size changes.
  var last = '';
  var run = function () {
    var key = el.clientWidth + 'x' + el.clientHeight;
    if (key === last) return;
    last = key;
    capFitFocusOnce(el, frame, nativeW, nativeH, focus, zoom, regions);
  };
  run();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(run).observe(el);
}

function capFitFocusOnce(el, frame, nativeW, nativeH, focus, zoom, regions) {
  var pw = el.clientWidth || nativeW;
  var ph = el.clientHeight || nativeH;
  frame.style.position = 'absolute';
  frame.style.left = '0px';
  frame.style.top = '0px';
  frame.style.transformOrigin = '0 0';
  var pick = focus && regions && regions[focus] ? regions[focus]() : null;
  if (!pick) {
    var s = Math.min(pw / nativeW, ph / nativeH) || 1;
    frame.style.transform = 'translate(' + ((pw - nativeW * s) / 2) + 'px,' + ((ph - nativeH * s) / 2) + 'px) scale(' + s + ')';
    return;
  }
  frame.style.transform = 'none';
  var fr = frame.getBoundingClientRect();
  var r = pick.getBoundingClientRect();
  var pad = 56;
  var rx = r.left - fr.left - pad, ry = r.top - fr.top - pad, rw = r.width + pad * 2;
  // Fill the box: its width with the region, or its height with everything
  // from the region's top down, whichever is bigger -- a tall box (a split's
  // top half) must not end in an empty band. When that is wider than the box
  // the region stays LEFT aligned: titles read left to right, the times on
  // the far right are what give.
  var availH = nativeH - ry;
  // zoom > 1 closes in from the region's top-left corner (the newest rows,
  // their icons and titles): a feed at phone scale needs ~2x to be read.
  var z = Math.max(1, Number(zoom) || 1);
  var s2 = (Math.max(pw / rw, ph / availH) || 1) * z;
  var tx = rw * s2 > pw + 1 ? -rx * s2 : (pw - rw * s2) / 2 - rx * s2;
  var ty = -ry * s2;
  // Never past the page's own edges: padding around a region at the page's
  // edge would expose whatever is behind the component (a dark strip).
  if (nativeW * s2 >= pw) tx = Math.min(0, Math.max(pw - nativeW * s2, tx));
  if (nativeH * s2 >= ph) ty = Math.min(0, Math.max(ph - nativeH * s2, ty));
  frame.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s2 + ')';
}

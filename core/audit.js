/* Aurora Audit — profile / page health check. Pure functions, no network, no AI service: everything is computed
   on this computer from the profile and recent posts the extractors already read.
   analyze({ platform, profile, posts, now }) -> { score, grade, sections[], stats, notes[] } */
(function (root) {
  'use strict';

  /* What "good" looks like per platform (rough, widely used guide values — shown to the user as a guide, not a law). */
  const GUIDE = {
    instagram: { bioMax: 150, tags: [3, 10], tagsMatter: true, caption: [60, 1500], perWeek: [3, 7], eng: [0.005, 0.01, 0.03], engLabel: '(likes + comments) ÷ followers', videoMix: true },
    tiktok: { bioMax: 80, tags: [2, 6], tagsMatter: true, caption: [15, 160], perWeek: [3, 10], eng: [0.02, 0.04, 0.08], engLabel: '(likes + comments + shares) ÷ views', videoMix: false },
    facebook: { bioMax: 255, tags: [0, 3], tagsMatter: false, caption: [40, 600], perWeek: [3, 7], eng: [0.001, 0.003, 0.01], engLabel: '(reactions + comments + shares) ÷ followers', videoMix: false },
  };
  const CTA = /\b(dm|message us|contact|email|e-?mail|call|whatsapp|book|booking|order|shop|buy|visit|subscribe|follow|join|sign ?up|link in bio|click|tap|learn more|get|download|reserve|tag|share|comment|tell us|let us know|what do you think|drop a)\b|\?/i;
  const SECTION_MAX = { profile: 25, contact: 15, rhythm: 25, content: 20, engagement: 15 };
  const SECTION_LABEL = { profile: 'Bio & profile', contact: 'Link & contact', rhythm: 'Posting rhythm', content: 'Captions & hashtags', engagement: 'Engagement' };

  const num = (v) => (v == null || v === '' || isNaN(+v) ? null : +v);
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const pct = (x) => (x * 100 >= 10 ? (x * 100).toFixed(0) : (x * 100).toFixed(1)) + '%';
  const textOf = (p) => String(p.caption || p.text || p.description || '');
  const tagsOf = (p) => (Array.isArray(p.hashtags) && p.hashtags.length ? p.hashtags : textOf(p).match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => String(t).toLowerCase());
  const DAY = 86400000;

  /** Dates arrive as ISO strings (Instagram, TikTok) or as Facebook's relative / short text ("5h", "2 d", "Yesterday", "March 3"). */
  function parseWhen(v, now) {
    if (!v) return null;
    if (typeof v === 'number') return v;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const t = Date.parse(s); return isNaN(t) ? null : t; }
    let m = s.match(/^(\d+)\s*(s|sec|m|min|h|hr|hrs|hours?|d|days?|w|wks?|weeks?|y|yrs?|years?)\b/i);
    if (m) {
      const n = +m[1], u = m[2].toLowerCase()[0];
      const ms = u === 's' ? 1000 : u === 'm' ? 60000 : u === 'h' ? 3600000 : u === 'd' ? DAY : u === 'w' ? 7 * DAY : 365 * DAY;
      return now - n * ms;
    }
    if (/^just now|^now$/i.test(s)) return now;
    if (/^yesterday/i.test(s)) return now - DAY;
    const t = Date.parse(s.replace(/\bat\b/i, '').replace(/(\d)(st|nd|rd|th)\b/i, '$1'));
    if (!isNaN(t)) { let d = t; if (!/\d{4}/.test(s) && d > now + DAY) d -= 365 * DAY; return d; }
    return null;
  }

  /* ---------- checks: each returns { id, label, w, pts (0..1 or null = unknown), detail, tip } ---------- */
  function profileChecks(g, p) {
    const bio = String(p.bio || '').trim();
    const out = [];
    out.push({ id: 'name', label: 'Name', w: 2, pts: p.name || p.username ? 1 : 0, detail: p.name || p.username ? 'A display name is set.' : 'No name found.', tip: 'Add a clear name people can search for.' });
    const has = bio.length > 0;
    out.push({ id: 'bio', label: 'Bio is filled in', w: 7, pts: has ? 1 : 0, detail: has ? `Bio is ${bio.length} characters.` : 'The bio is empty.', tip: 'Write one line that says who you help and how — it is the first thing visitors read.' });
    if (has) {
      const lo = Math.round(g.bioMax * 0.3), r = bio.length / g.bioMax;
      const pts = bio.length < 20 ? 0.3 : bio.length < lo ? 0.65 : r <= 1 ? 1 : 0.8;
      out.push({ id: 'biolen', label: 'Bio length', w: 5, pts, detail: `${bio.length} of about ${g.bioMax} characters used.`, tip: bio.length < lo ? 'Use more of the space: what you offer, who it is for, and one proof point.' : 'Trim the bio so it is not cut off.' });
      out.push({ id: 'cta', label: 'Clear next step in the bio', w: 4, pts: CTA.test(bio) || /https?:\/\/|www\./i.test(bio) ? 1 : 0.2, detail: CTA.test(bio) ? 'The bio tells people what to do next.' : 'The bio has no call to action.', tip: 'End the bio with an action: "Book below", "DM us", "Shop now".' });
    }
    const cat = String(p.category || '').trim();
    out.push({ id: 'category', label: 'Category / account type', w: 3, pts: cat ? 1 : p.business ? 0.7 : 0.2, detail: cat ? `Category: ${cat}.` : p.business ? 'Business account without a category.' : 'No category or business label.', tip: 'Switch to a professional/business account and pick a category so people know what you do.' });
    out.push({ id: 'avatar', label: 'Profile picture', w: 2, pts: p.avatar === undefined ? null : p.avatar ? 1 : 0.2, detail: p.avatar ? 'A profile picture is set.' : 'No profile picture found.', tip: 'Use a clear logo or face — it is what shows next to every comment.' });
    return out;
  }
  function contactChecks(g, p) {
    const web = [].concat(p.website || p.websites || []).filter(Boolean);
    const email = [].concat(p.email || p.emails || []).filter(Boolean), phone = [].concat(p.phone || p.phones || []).filter(Boolean);
    const bioHasLink = /https?:\/\/|www\.|\.(com|net|org|io|co)\b/i.test(String(p.bio || ''));
    return [
      { id: 'link', label: 'Website / link', w: 8, pts: web.length ? 1 : bioHasLink ? 0.7 : 0, detail: web.length ? 'A link is set: ' + String(web[0]).slice(0, 60) : bioHasLink ? 'A link is only written in the bio text.' : 'No website or link.', tip: 'Add a link to your site, booking page or a link-in-bio page — it is the only clickable exit.' },
      { id: 'reach', label: 'Public way to contact you', w: 7, pts: email.length || phone.length ? 1 : 0.1, detail: email.length || phone.length ? 'A public ' + [email.length && 'email', phone.length && 'phone'].filter(Boolean).join(' and ') + ' is shown.' : 'No public email or phone is shown.', tip: 'Show a contact email or a call/email button so customers can reach you without a DM.' },
    ];
  }
  function rhythmChecks(g, posts, now) {
    const dated = posts.map((p) => parseWhen(p.postedAt, now)).filter((t) => t && t <= now + DAY).sort((a, b) => b - a);
    const info = { dated: dated.length };
    if (dated.length < 3) return { checks: [], info };
    const since = (now - dated[0]) / DAY, span = Math.max(1, (dated[0] - dated[dated.length - 1]) / DAY);
    const perWeek = ((dated.length - 1) / span) * 7;
    const gaps = []; for (let i = 0; i < dated.length - 1; i++) gaps.push((dated[i] - dated[i + 1]) / DAY);
    const medGap = median(gaps), maxGap = Math.max.apply(null, gaps);
    Object.assign(info, { daysSinceLast: since, perWeek, medianGapDays: medGap, longestGapDays: maxGap, spanDays: span });
    const [lo, hi] = g.perWeek;
    const freq = perWeek >= lo ? (perWeek > hi * 2 ? 0.8 : 1) : clamp(perWeek / lo) * 0.9;
    const days = (x) => (x < 1.5 ? 'about a day' : Math.round(x) + ' days');
    return {
      info,
      checks: [
        { id: 'recent', label: 'Posted recently', w: 8, pts: since <= 3 ? 1 : since <= 7 ? 0.85 : since <= 14 ? 0.6 : since <= 30 ? 0.3 : 0.05, detail: `The latest post is ${days(since)} old.`, tip: 'Accounts that go quiet lose reach — aim to post at least once a week, even something small.' },
        { id: 'freq', label: 'Posting frequency', w: 10, pts: freq, detail: `About ${perWeek.toFixed(1)} posts per week across the last ${Math.round(span)} days (a healthy range here is ${lo}–${hi}).`, tip: perWeek < lo ? `Try for ${lo}+ posts per week; batch-create a week of posts in one sitting.` : 'You are posting a lot — check that quality holds up.' },
        { id: 'steady', label: 'Steady schedule', w: 7, pts: maxGap <= Math.max(3, medGap * 3 + 2) ? 1 : maxGap <= 14 ? 0.6 : 0.25, detail: `Longest quiet stretch: ${days(maxGap)} (typical gap ${days(medGap)}).`, tip: 'Long gaps reset your audience\'s habit. Schedule posts ahead so holidays and busy weeks do not leave a hole.' },
      ],
    };
  }
  function contentChecks(g, posts) {
    if (posts.length < 3) return { checks: [], info: {} };
    const tags = posts.map(tagsOf), counts = tags.map((t) => t.length), avg = mean(counts);
    const withTags = counts.filter((c) => c > 0).length / posts.length;
    const all = [].concat.apply([], tags), uniq = new Set(all).size;
    const [tlo, thi] = g.tags;
    const caps = posts.map((p) => textOf(p).replace(/#[\p{L}\p{N}_]+/gu, '').trim().length);
    const [clo, chi] = g.caption;
    const capOk = caps.filter((c) => c >= clo && c <= chi).length / posts.length;
    const cta = posts.filter((p) => CTA.test(textOf(p))).length / posts.length;
    const info = { avgHashtags: avg, postsWithHashtags: withTags, uniqueHashtags: uniq, ctaShare: cta };
    const checks = [];
    if (g.tagsMatter) {
      const tpts = avg >= tlo && avg <= thi ? 1 : avg > thi ? clamp(1 - (avg - thi) / (thi * 2), 0.4, 0.8) : clamp(avg / tlo) * 0.9;
      checks.push({ id: 'tags', label: 'Hashtag use', w: 7, pts: tpts, detail: `About ${avg.toFixed(1)} hashtags per post (a healthy range is ${tlo}–${thi}); ${pct(withTags)} of posts have at least one.`, tip: avg < tlo ? `Add ${tlo}–${thi} specific hashtags per post — mix a few broad with a few niche ones.` : 'Too many hashtags look spammy. Keep only the most specific ones.' });
      if (all.length >= 8) checks.push({ id: 'tagvar', label: 'Hashtag variety', w: 3, pts: clamp(uniq / Math.max(1, all.length) / 0.5), detail: `${uniq} different hashtags across ${all.length} uses.`, tip: 'Rotate your hashtags instead of pasting the same set on every post.' });
    }
    checks.push({ id: 'caplen', label: 'Caption length', w: 5, pts: clamp(0.25 + capOk * 0.75), detail: `${pct(capOk)} of captions are a useful length (${clo}–${chi} characters).`, tip: caps.filter((c) => c < clo).length > posts.length / 2 ? 'Captions are very short — add context, a story or a tip so people have a reason to stop and read.' : 'Break very long captions into short paragraphs.' });
    checks.push({ id: 'ctaposts', label: 'Posts that invite a reply or action', w: 5, pts: clamp(cta / 0.3), detail: `${pct(cta)} of posts ask a question or tell people what to do.`, tip: 'End more posts with a question or a clear action ("Which one would you pick?", "Save this for later").' });
    if (g.videoMix) {
      const vids = posts.filter((p) => /reel|video/i.test(String(p.type || '')) || (p.media || []).some((m) => m.type === 'video')).length / posts.length;
      info.videoShare = vids;
      checks.push({ id: 'mix', label: 'Mix of video and photos', w: 3, pts: vids > 0 && vids < 1 ? 1 : vids === 1 ? 0.8 : 0.5, detail: `${pct(vids)} of recent posts are video/reels.`, tip: 'Add short videos — reels are shown to people who do not follow you yet.' });
    }
    return { checks, info };
  }
  function engagementChecks(g, p, posts) {
    const followers = num(p.followers) || num(p.likes);
    const rates = [];
    for (const x of posts) {
      const likes = num(x.likes) != null ? num(x.likes) : num(x.reactions);
      if (likes == null) continue;
      const inter = likes + (num(x.comments) || 0) + (g === GUIDE.tiktok ? num(x.shares) || 0 : g === GUIDE.facebook ? num(x.shares) || 0 : 0);
      const base = g === GUIDE.tiktok ? num(x.plays) || followers : followers;
      if (base) rates.push(inter / base);
    }
    const info = { posts: rates.length };
    if (rates.length < 3) return { checks: [], info };
    const r = median(rates), [poor, ok, good] = g.eng;
    const pts = r >= good ? 1 : r >= ok ? 0.75 + 0.25 * ((r - ok) / (good - ok)) : r >= poor ? 0.4 + 0.35 * ((r - poor) / (ok - poor)) : clamp(r / poor) * 0.4;
    info.rate = r;
    const likesArr = posts.map((x) => (num(x.likes) != null ? num(x.likes) : num(x.reactions))).filter((v) => v != null), comArr = posts.map((x) => num(x.comments)).filter((v) => v != null);
    const checks = [{ id: 'rate', label: 'Engagement rate', w: 10, pts, detail: `Typical post: ${pct(r)} ${g.engLabel} — as a rough guide ${pct(poor)} is low, ${pct(ok)} is fair and ${pct(good)}+ is strong.`, tip: 'Open with a hook in the first line, ask a question, and reply to every comment in the first hour.' }];
    if (likesArr.length >= 3 && comArr.length >= 3 && mean(likesArr) > 0) {
      const ratio = mean(comArr) / mean(likesArr); info.commentRatio = ratio;
      checks.push({ id: 'talk', label: 'People start conversations', w: 5, pts: clamp(ratio / 0.03), detail: `For every 100 likes there are about ${(ratio * 100).toFixed(1)} comments.`, tip: 'Ask something easy to answer in a word, or run a "this or that" post, to turn likes into comments.' });
    }
    return { checks, info };
  }

  function grade(score) { return score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F'; }
  function verdict(score) { return score >= 85 ? 'Excellent — a healthy, well-kept profile.' : score >= 70 ? 'Good — a few quick wins left.' : score >= 55 ? 'Fair — clear room to improve.' : score >= 40 ? 'Needs work — start with the top fixes below.' : 'Weak — fix the basics first.'; }

  function analyze({ platform, profile, posts, now }) {
    now = now || Date.now();
    const g = GUIDE[platform] || GUIDE.instagram;
    const p = profile || {}, list = (posts || []).filter(Boolean);
    const notes = [];
    const rhythm = rhythmChecks(g, list, now), content = contentChecks(g, list), eng = engagementChecks(g, p, list);
    const raw = { profile: profileChecks(g, p), contact: contactChecks(g, p), rhythm: rhythm.checks, content: content.checks, engagement: eng.checks };
    if (list.length < 3) notes.push(list.length ? 'Only ' + list.length + ' recent posts could be read, so the posting, caption and engagement scores are left out.' : 'No recent posts could be read, so only the profile was scored. Open the profile page itself and run the audit again.');
    else {
      if (!raw.rhythm.length) notes.push('Post dates could not be read, so posting rhythm was left out of the score.');
      if (!raw.engagement.length) notes.push('Likes/comments could not be read on these posts, so engagement was left out of the score.');
    }
    const sections = [];
    let earned = 0, avail = 0;
    for (const id of Object.keys(SECTION_MAX)) {
      const checks = raw[id].filter((c) => c.pts != null);
      if (!checks.length) { sections.push({ id, label: SECTION_LABEL[id], max: SECTION_MAX[id], score: null, findings: [] }); continue; }
      const tw = checks.reduce((a, c) => a + c.w, 0), got = checks.reduce((a, c) => a + c.w * clamp(c.pts), 0);
      const score = (got / tw) * SECTION_MAX[id];
      earned += score; avail += SECTION_MAX[id];
      sections.push({
        id, label: SECTION_LABEL[id], max: SECTION_MAX[id], score: Math.round(score * 10) / 10,
        findings: checks.map((c) => ({ id: c.id, label: c.label, level: c.pts >= 0.8 ? 'good' : c.pts >= 0.4 ? 'warn' : 'bad', points: Math.round(c.pts * 100), detail: c.detail, tip: c.pts < 0.8 ? c.tip : '', weight: c.w })),
      });
    }
    const score = avail ? Math.round((earned / avail) * 100) : 0;
    /* the fixes that would lift the score most: lost weight × section size */
    const fixes = [];
    for (const s of sections) for (const f of s.findings) if (f.tip) fixes.push({ section: s.label, label: f.label, level: f.level, tip: f.tip, gain: (1 - f.points / 100) * f.weight * (s.max / (s.findings.reduce((a, x) => a + x.weight, 0) || 1)) });
    fixes.sort((a, b) => b.gain - a.gain);
    const stats = {
      followers: num(p.followers), postsAnalysed: list.length, postsWithDates: rhythm.info.dated || 0,
      postsPerWeek: rhythm.info.perWeek != null ? Math.round(rhythm.info.perWeek * 10) / 10 : null,
      daysSinceLastPost: rhythm.info.daysSinceLast != null ? Math.round(rhythm.info.daysSinceLast * 10) / 10 : null,
      longestGapDays: rhythm.info.longestGapDays != null ? Math.round(rhythm.info.longestGapDays) : null,
      avgHashtags: content.info.avgHashtags != null ? Math.round(content.info.avgHashtags * 10) / 10 : null,
      engagementRate: eng.info.rate != null ? Math.round(eng.info.rate * 10000) / 100 : null,
    };
    /* what the optional "Copy audit for AI" step shares (public bio and latest captions); never sent anywhere by the extension itself */
    const web0 = [].concat(p.website || p.websites || []).filter(Boolean)[0];
    const snapshot = {
      bio: String(p.bio || '').replace(/\s+/g, ' ').trim().slice(0, 400), link: web0 ? String(web0).slice(0, 120) : '',
      hasContact: !![].concat(p.email || p.emails || [], p.phone || p.phones || []).filter(Boolean).length,
      captions: list.slice(0, 5).map((x) => textOf(x).replace(/\s+/g, ' ').trim().slice(0, 200)).filter(Boolean),
    };
    return { platform, score, grade: grade(score), verdict: verdict(score), sections, topFixes: fixes.slice(0, 5), stats, snapshot, notes, guide: { engagement: g.engLabel } };
  }

  /** Flat spreadsheet row for CSV / Excel / JSON export (the nested report is kept in `audit`). */
  function toRow(a, profile) {
    const p = profile || {}, row = {
      id: 'audit:' + (p.username || p.id || p.name || ''), username: p.username || '', name: p.name || '', url: p.url || '',
      score: a.score, grade: a.grade, verdict: a.verdict,
    };
    for (const s of a.sections) row[s.id + 'Score'] = s.score == null ? '' : `${s.score}/${s.max}`;
    Object.assign(row, { followers: a.stats.followers, postsAnalysed: a.stats.postsAnalysed, postsPerWeek: a.stats.postsPerWeek, daysSinceLastPost: a.stats.daysSinceLastPost, avgHashtags: a.stats.avgHashtags, engagementRatePercent: a.stats.engagementRate });
    row.topFixes = a.topFixes.map((f, i) => `${i + 1}. ${f.label}: ${f.tip}`).join(' | ');
    row.notes = a.notes.join(' ');
    row.audit = a;
    return row;
  }

  const api = { analyze, toRow, parseWhen, GUIDE, SECTION_LABEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AuroraAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

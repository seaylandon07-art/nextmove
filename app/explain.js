/* NextMove explanations: engine lines → plain-English reasons.
   Two voices: plain English (default) or chess notation. Material is measured only after trades finish. */
(() => {
const { VAL, NAME, mv, pvSan, matDiff, sanOf } = K;
const other = c => c === 'w' ? 'b' : 'w';
const SIDE = c => c === 'w' ? 'White' : 'Black';
const sideOf = fen => fen.split(' ')[1];
const plain = () => { try { return ((K.S().ui || {}).notation || 'plain') === 'plain'; } catch (e) { return true; } };
const T = (p, s) => plain() ? p : s;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function withTurn(ch, color) { const f = ch.fen().split(' '); f[1] = color; f[3] = '-'; const c = new Chess(); return c.load(f.join(' ')) ? c : null; }
function attackers(ch, sq, byColor) {
  const c = new Chess(ch.fen()); const p = c.get(sq);
  if (p && p.color === byColor) { c.remove(sq); c.put({ type: 'p', color: other(byColor) }, sq); }
  if (!p) c.put({ type: 'p', color: other(byColor) }, sq);
  const t = withTurn(c, byColor); if (!t) return [];
  return t.moves({ verbose: true }).filter(m => m.to === sq).map(m => ({ from: m.from, type: m.piece }));
}
const isProtected = (ch, sq) => { const p = ch.get(sq); return !!p && attackers(ch, sq, p.color).length > 0; };
const lowestAttacker = (ch, sq, byColor) => attackers(ch, sq, byColor).sort((a, b) => VAL[a.type] - VAL[b.type])[0] || null;
function targetsFrom(ch, sq) {
  const p = ch.get(sq); if (!p) return [];
  const t = withTurn(ch, p.color); if (!t) return [];
  return t.moves({ square: sq, verbose: true }).filter(m => m.captured).map(m => ({ sq: m.to, type: m.captured }))
    .filter(h => h.type === 'k' || VAL[h.type] > VAL[p.type] || !isProtected(ch, h.sq));
}
function forkOf(ch, sq) {
  const hits = targetsFrom(ch, sq).filter(h => h.type !== 'p');
  const names = hits.map(h => h.type === 'k' ? 'king' : NAME[h.type]);
  if (ch.in_check() && !names.includes('king')) names.unshift('king');
  const u = [...new Set(names)]; return u.length >= 2 ? u.slice(0, 2) : null;
}
function settle(fen, pv, me, maxPly = 12) {
  const c = new Chess(fen); const mats = [matDiff(c, me)]; const ms = [];
  for (let i = 0; i < Math.min(pv.length, maxPly); i++) { const before = c.fen(); const m = mv(c, pv[i]); if (!m) break; m.before = before; m.after = c.fen(); m.u = m.from + m.to + (m.promotion || ''); ms.push(m); mats.push(matDiff(c, me)); if (c.game_over()) break; }
  let lastCap = -1;
  for (let i = 0; i < Math.min(ms.length, 6); i++) if (ms[i].captured || ms[i].promotion) lastCap = i;
  let stop = lastCap + 1;
  while (stop < ms.length && (ms[stop].captured || ms[stop].promotion)) stop++;
  stop = Math.min(stop, ms.length);
  return { ms, mats, stop, net: mats[stop] - mats[0] };
}
function bigCapture(ms, stop, byColor, net) {
  const list = ms.slice(0, stop).map((m, k) => ({ ...m, k })).filter(m => m.color === byColor && m.captured);
  if (net == null) return list.sort((a, b) => VAL[b.captured] - VAL[a.captured] || a.k - b.k)[0] || null;
  return list.sort((a, b) => Math.abs(VAL[a.captured] - net) - Math.abs(VAL[b.captured] - net) || VAL[b.captured] - VAL[a.captured] || a.k - b.k)[0] || null;
}
function amount(n, piece) {
  n = Math.abs(n);
  if (piece && Math.abs(VAL[piece] - n) <= 1) return piece === 'p' ? 'a pawn' : `a ${NAME[piece]}`;
  if (n === 1) return 'a pawn';
  if (n === 2) return piece === 'r' ? 'the exchange (a rook for a minor piece)' : 'two pawns';
  if (n <= 4) return 'a piece';
  if (n <= 6) return 'about a rook’s worth of material';
  return 'a lot of material';
}

/* ---------- naming moves ---------- */
// short label: "Knight to f3", "Bishop takes rook on g5", "Castling kingside"
function label(fen, u) {
  const c = new Chess(fen); const m = mv(c, u); if (!m) return u;
  let s;
  if (m.flags.includes('k')) s = 'Castling kingside'; else if (m.flags.includes('q')) s = 'Castling queenside';
  else if (m.promotion) s = `Pawn ${m.captured ? 'takes on ' + m.to + ' and promotes' : 'promotes on ' + m.to}`;
  else if (m.captured) s = `${cap(NAME[m.piece])} takes ${NAME[m.captured]} on ${m.to}`;
  else s = `${cap(NAME[m.piece])} to ${m.to}`;
  return s + (c.in_checkmate() ? ' (checkmate)' : c.in_check() ? ' (check)' : '');
}
// clause: "your bishop takes their rook on g5"
function act(fen, u, who) {
  const c = new Chess(fen); const m = mv(c, u); if (!m) return u;
  const opp = who === 'your' ? 'their' : 'your';
  let s;
  if (m.flags.includes('k') || m.flags.includes('q')) s = `${who === 'your' ? 'you castle' : 'they castle'} ${m.flags.includes('k') ? 'kingside' : 'queenside'}`;
  else if (m.promotion) s = `${who} pawn ${m.captured ? `takes on ${m.to} and becomes` : `reaches ${m.to} and becomes`} a ${NAME[m.promotion]}`;
  else if (m.captured) s = `${who} ${NAME[m.piece]} takes ${opp} ${NAME[m.captured]} on ${m.to}`;
  else s = `${who} ${NAME[m.piece]} goes to ${m.to}`;
  return s + (c.in_checkmate() ? ' — checkmate' : c.in_check() ? ', with check' : '');
}
// infinitive: "move your knight to f3", "take their rook on g5 with your bishop"
function inf(fen, u, who) {
  const c = new Chess(fen); const m = mv(c, u); if (!m) return u;
  const opp = who === 'your' ? 'their' : 'your';
  let s;
  if (m.flags.includes('k') || m.flags.includes('q')) s = `castle ${m.flags.includes('k') ? 'kingside' : 'queenside'}`;
  else if (m.promotion) s = `push ${who} pawn to ${m.to} and make a ${NAME[m.promotion]}`;
  else if (m.captured) s = `take ${opp} ${NAME[m.captured]} on ${m.to} with ${who} ${NAME[m.piece]}`;
  else s = `move ${who} ${NAME[m.piece]} to ${m.to}`;
  return s + (c.in_checkmate() ? ' for checkmate' : c.in_check() ? ' with check' : '');
}
const san = (fen, u) => sanOf(fen, u);
const lineTxt = (fen, pv, n) => pvSan(fen, pv, Math.max(1, Math.min(n, 7)));

function words(l, color) {
  if (!l) return 'unclear';
  if (l.mate != null && l.mate !== 0) return (l.mate > 0) === (color === 'w') ? 'a forced win' : 'getting mated';
  const v = (l.cp ?? 0) * (color === 'w' ? 1 : -1);
  if (v >= 300) return 'winning'; if (v >= 120) return 'clearly better'; if (v >= 40) return 'slightly better';
  if (v > -40) return 'about equal'; if (v > -120) return 'slightly worse'; if (v > -300) return 'clearly worse'; return 'losing';
}
// what a move does, as a verb phrase ("develops the knight")
function idea(fen, u) {
  const c = new Chess(fen); const me = sideOf(fen); const m = mv(c, u); if (!m) return '';
  if (c.in_checkmate()) return 'is checkmate';
  if (m.flags.includes('k') || m.flags.includes('q')) return 'gets the king to safety';
  const f = forkOf(c, m.to); if (f) return `attacks the ${f[0]} and the ${f[1]} at the same time (a fork)`;
  if (m.captured) { const b = new Chess(fen); return isProtected(b, m.to) ? `takes the ${NAME[m.captured]} on ${m.to}` : `wins the ${NAME[m.captured]} on ${m.to} for free`; }
  if (m.promotion) return `makes a new ${NAME[m.promotion]}`;
  const t = targetsFrom(c, m.to).sort((a, b) => VAL[b.type] - VAL[a.type]).filter(h => h.type !== 'k');
  if (t.length) return `attacks the ${t[0].type === 'p' ? 'loose pawn' : NAME[t[0].type]} on ${t[0].sq}${t[1] ? ` and the ${t[1].type === 'p' ? 'pawn' : NAME[t[1].type]} on ${t[1].sq}` : ''}${c.in_check() ? ', with check' : ''}`;
  if (c.in_check()) return 'gives check';
  const rank = +m.from[1];
  if ((m.piece === 'n' || m.piece === 'b') && (rank === 1 || rank === 8)) return `develops the ${NAME[m.piece]}`;
  if (m.piece === 'p' && 'cdef'.includes(m.to[0]) && '45'.includes(m.to[1]) && +c.fen().split(' ')[5] <= 12) return 'takes space in the centre';
  if (m.piece === 'p' && (me === 'w' ? +m.to[1] >= 6 : +m.to[1] <= 3)) return 'pushes the passed pawn';
  return '';
}

// idea phrase to follow an inf()/act() that already names any capture
function idea2(fen, u) { const i = idea(fen, u); if (/for free$/.test(i)) return 'wins it for free'; if (/^takes the /.test(i)) return ''; return i; }
/* ---------- bad moves ---------- */
function whyBad(fen, u, pre, post, shows) {
  const me = sideOf(fen), op = other(me), out = [];
  const best = pre.lines[0], after = post.lines[0];
  const c0 = new Chess(fen); const c1 = new Chess(fen); const m = mv(c1, u);
  const bestU = best && best.move;
  const addShowBad = n => after && after.pv && after.pv.length && shows.push({ label: 'Show what happens', fen, pv: [u, ...after.pv.slice(0, n)] });
  const addShowBest = n => bestU && bestU !== u && shows.push({ label: 'Show the better move', fen, pv: best.pv.slice(0, n) });
  // mate
  if (after && after.mate != null && (me === 'w' ? after.mate < 0 : after.mate > 0)) {
    const n = Math.abs(after.mate), r0 = after.pv[0];
    out.push(n === 1 ? T(`This lets them checkmate you right away: ${act(c1.fen(), r0, 'their')}.`, `It allows mate in one: ${san(c1.fen(), r0)}.`)
      : T(`This lets them force checkmate in ${n} moves, starting when ${act(c1.fen(), r0, 'their')}.`, `It allows a forced mate in ${n}: ${lineTxt(c1.fen(), after.pv, n * 2 - 1)}.`));
    addShowBad(n * 2 - 1); addShowBest(5); return out;
  }
  const hadMate = best && best.mate != null && (me === 'w' ? best.mate > 0 : best.mate < 0);
  const keepsMate = after && after.mate != null && (me === 'w' ? after.mate > 0 : after.mate < 0);
  if (hadMate && !keepsMate) {
    const n = Math.abs(best.mate);
    out.push(n === 1 ? T(`You had checkmate: ${inf(fen, bestU, 'your')}.`.replace('You had checkmate: ', 'You could have checkmated them: '), `${san(fen, bestU)} was checkmate.`)
      : T(`You had a forced checkmate in ${n} moves. It starts if you ${inf(fen, bestU, 'your')}.`, `You had a forced mate in ${n}, starting with ${san(fen, bestU)}: ${lineTxt(fen, best.pv, n * 2 - 1)}.`));
    addShowBest(n * 2 - 1); return out;
  }
  const L = after && after.pv ? settle(c1.fen(), after.pv, me) : null;
  const B = best && best.pv ? settle(fen, best.pv, me) : null;
  const myOut = (matDiff(c1, me) - matDiff(c0, me)) + (L ? L.net : 0);
  const lost = -myOut, gain = B ? B.net : 0;
  if (L && lost >= 2) {
    const E = bigCapture(L.ms, L.stop, op, lost); const R = L.ms[0];
    if (E) {
      const S = E.to, piece = E.captured, what = amount(lost, piece), pc = NAME[piece];
      const rp = NAME[R.piece];
      if (S === m.to && E.k === 0) {
        if (!isProtected(c1, S)) out.push(T(`Nothing protects your ${pc} on ${S}, so their ${rp} on ${R.from} can just take it.`, `Your ${pc} on ${S} isn’t protected — ${R.san} just takes it.`));
        else { const a = lowestAttacker(c1, S, op); out.push(a && VAL[a.type] < VAL[piece] ? T(`On ${S} your ${pc} can be taken by their ${NAME[a.type]} on ${a.from} — a cheaper piece, so you lose material.`, `On ${S} your ${pc} can be taken by a ${NAME[a.type]}: ${R.san}.`) : T(`Your ${pc} on ${S} is attacked more times than it’s defended, so you lose it.`, `Your ${pc} on ${S} is attacked more times than it’s defended, so ${R.san} wins it.`)); }
      } else if (E.k === 0) {
        const p0 = c0.get(S); const wasSafe = p0 && p0.color === me && isProtected(c0, S);
        const t0 = withTurn(c0, op); const already = t0 && t0.moves({ verbose: true }).some(x => x.from === R.from && x.to === R.to);
        if (wasSafe && !isProtected(c1, S)) out.push(T(`Moving your ${NAME[m.piece]} away from ${m.from} left your ${pc} on ${S} unprotected, and their ${rp} on ${R.from} takes it.`, `Moving your ${NAME[m.piece]} off ${m.from} left the ${pc} on ${S} unprotected — ${R.san} takes it.`));
        else if (already) out.push(T(`You missed their threat: their ${rp} on ${R.from} could already take your ${pc} on ${S}, and your move didn’t stop it.`, `You missed the threat: ${R.san} was already coming, and your move didn’t stop it.`));
        else out.push(T(`Your move opens the way for their ${rp} on ${R.from} to take your ${pc} on ${S}.`, `${san(fen, u)} opens the way for ${R.san}, which wins ${what}.`));
      } else {
        const cR = new Chess(R.after); const f = forkOf(cR, R.to);
        const hits = (() => { const p = cR.get(R.to); const t = p && withTurn(cR, p.color); return !!t && t.moves({ square: R.to, verbose: true }).some(x => x.to === S); })();
        if (f) out.push(T(`Their ${rp} goes to ${R.to} and attacks your ${f[0]} and ${f[1]} at the same time (a fork). You can only save one, so you lose ${what}.`, `${R.san} forks your ${f[0]} and ${f[1]} — you can only save one, so you lose ${what}.`));
        else if (hits) out.push(T(`Their ${rp} goes to ${R.to}${R.captured ? `, taking your ${NAME[R.captured]},` : ''} and attacks your ${pc} on ${S}, which you can’t save.`, `${R.san}${R.captured ? ` grabs the ${NAME[R.captured]} and` : ''} hits your ${pc} on ${S}, and it can’t be saved.`));
        else if (R.san.includes('+')) out.push(T(`Their ${rp} gives check from ${R.to}, and after you deal with it they win ${what}.`, `${R.san} comes with check, and then ${E.san} wins ${what}.`));
        else out.push(T(`After their ${rp} goes to ${R.to}, you can’t keep everything protected and you lose ${what}.`, `After ${R.san} you can’t keep everything protected and lose ${what}.`));
      }
      if (!plain()) out.push(`The line: ${lineTxt(c1.fen(), after.pv, Math.min(L.stop, E.k + 2))}.`);
      addShowBad(Math.min(L.stop, E.k + 2));
    } else { out.push(T(`They win ${amount(lost)} by force.`, `${SIDE(op)} wins ${amount(lost)} with ${lineTxt(c1.fen(), after.pv, L.stop)}.`)); addShowBad(L.stop); }
  }
  if (B && gain >= 2 && gain - myOut >= 2 && bestU !== u) {
    const G = bigCapture(B.ms, B.stop, me, gain); const F = B.ms[0];
    if (G) {
      const pc = NAME[G.captured], S = G.to;
      if (G.k === 0) out.push(!isProtected(c0, S) ? T(`Better was to ${inf(fen, bestU, 'your')} — it wasn’t protected, so it was free.`, `Better was ${san(fen, bestU)}: the ${pc} on ${S} was unprotected and free to take.`) : T(`Better was to ${inf(fen, bestU, 'your')}, which wins ${amount(gain, G.captured)}.`, `Better was ${san(fen, bestU)}, winning ${amount(gain, G.captured)}.`));
      else {
        const cF = new Chess(F.after); const f = forkOf(cF, F.to);
        if (f) out.push(T(`Better was to ${inf(fen, bestU, 'your')}, attacking their ${f[0]} and ${f[1]} at once — it wins ${amount(gain, G.captured)}.`, `Better was ${san(fen, bestU)}, forking the ${f[0]} and the ${f[1]} — it wins ${amount(gain, G.captured)}.`));
        else if (F.san.includes('+')) out.push(T(`Better was to ${inf(fen, bestU, 'your')}, and after they deal with the check you win ${amount(gain, G.captured)}.`, `Better was ${san(fen, bestU)}: after the check, ${G.san} wins ${amount(gain, G.captured)}.`));
        else out.push(T(`Better was to ${inf(fen, bestU, 'your')} — a few moves later it wins ${amount(gain, G.captured)}.`, `Better was ${san(fen, bestU)}, which wins ${amount(gain, G.captured)}: ${lineTxt(fen, best.pv, B.stop)}.`));
      }
      addShowBest(Math.max(1, B.stop));
    }
  }
  if (!out.length) {
    const b = words(best, me), a = words(after, me);
    out.push(b === a ? 'Nothing is lost right away, but the engine sees a clearly better plan.' : `Nothing is lost right away, but your position goes from ${b} to ${a}.`);
    if (after && after.pv && after.pv[0]) { const i = plain() ? idea2(c1.fen(), after.pv[0]) : idea(c1.fen(), after.pv[0]); if (i) { out.push(T(`It lets them ${inf(c1.fen(), after.pv[0], 'their')}, which ${i}.`, `It lets ${SIDE(op)} play ${san(c1.fen(), after.pv[0])}, which ${i}.`)); addShowBad(2); } }
    if (bestU) { const i = idea(fen, bestU), i2 = idea2(fen, bestU); out.push(T(`Better was to ${inf(fen, bestU, 'your')}${i2 ? `, which ${i2}` : ''}.`, i ? `Better was ${san(fen, bestU)}, which ${i}.` : `Better was ${san(fen, bestU)}. Engine line: ${lineTxt(fen, best.pv, 5)}.`)); addShowBest(4); }
  } else if (bestU && !shows.some(s => s.label === 'Show the better move')) { out.push(T(`Better was to ${inf(fen, bestU, 'your')}.`, `Better was ${san(fen, bestU)}.`)); addShowBest(4); }
  return out;
}

/* ---------- good moves ---------- */
function whyGood(fen, u, pre, post, cls, shows) {
  const me = sideOf(fen); const out = [];
  const c1 = new Chess(fen); const m = mv(c1, u); const after = post.lines[0];
  if (c1.in_checkmate()) return ['Checkmate.'];
  const B = after && after.pv ? settle(c1.fen(), after.pv, me) : null;
  const i = idea(fen, u);
  if (cls === 'brilliant') {
    out.push(`You give up your ${NAME[m.piece]} on purpose — and it works.`);
    if (after && after.pv) { if (!plain()) out.push(`The point: ${lineTxt(fen, [u, ...after.pv], 7)}.`); shows.push({ label: 'Show why it works', fen, pv: [u, ...after.pv.slice(0, 6)] }); }
    return out;
  }
  if (cls === 'great') out.push('The only good move here — everything else was clearly worse.');
  if (i) out.push(T(`It ${i}.`, `${san(fen, u)} ${i}.`));
  const total = (matDiff(c1, me) - matDiff(new Chess(fen), me)) + (B ? B.net : 0);
  if (total >= 2 && !/wins|free|fork/.test(i)) { out.push(`It wins ${amount(total)}.`); shows.push({ label: 'Show how', fen, pv: [u, ...after.pv.slice(0, B.stop)] }); }
  if (!out.length) out.push(cls === 'best' ? 'The engine’s top choice.' : 'A solid move.');
  return out;
}

function explain({ fen, u, cls, pre, post, color, openName }) {
  const best = pre.lines[0]; const shows = [];
  const name = T(label(fen, u), san(fen, u));
  if (cls === 'book') return { head: `${name}: book move`, text: [`Known opening theory${openName ? ` (${openName})` : ''}.`], shows };
  if (cls === 'forced') return { head: `${name}: forced`, text: ['It was the only legal move.'], shows };
  if (['best', 'great', 'excellent', 'good', 'brilliant'].includes(cls)) {
    const text = whyGood(fen, u, pre, post, cls, shows);
    if ((cls === 'excellent' || cls === 'good') && best && best.move && best.move !== u) { text.push(T(`Slightly more precise was to ${inf(fen, best.move, 'your')}.`, `${san(fen, best.move)} was a little more precise.`)); shows.push({ label: 'Show the engine’s move', fen, pv: best.pv.slice(0, 4) }); }
    const word = { brilliant: 'brilliant', great: 'the only good move', best: 'the best move', excellent: 'excellent', good: 'good' }[cls];
    return { head: T(`${name}: ${word}`, `${name} is ${word}`), text, shows };
  }
  const word = cls === 'miss' ? 'a missed chance' : cls === 'inaccuracy' ? 'an inaccuracy' : 'a ' + cls;
  const text = whyBad(fen, u, pre, post, shows);
  if (cls === 'miss') text.unshift('Their last move was a mistake, and this lets it go.');
  return { head: T(`${name}: ${word}`, `${name} is ${word}`), text, shows };
}
function describeBest(fen, line) {
  if (!line || !line.move) return { text: '', shows: [] };
  const me = sideOf(fen); const B = settle(fen, line.pv, me); const i = idea(fen, line.move);
  const shows = [{ label: 'Show the solution', fen, pv: line.pv.slice(0, Math.max(B.stop, 3)) }];
  let text;
  if (line.mate != null && (me === 'w' ? line.mate > 0 : line.mate < 0)) text = T(`The best move was to ${inf(fen, line.move, 'your')} — it leads to checkmate in ${Math.abs(line.mate)}.`, `${san(fen, line.move)} leads to mate in ${Math.abs(line.mate)}: ${lineTxt(fen, line.pv, Math.abs(line.mate) * 2 - 1)}.`);
  else if (B.net >= 2) { const G = bigCapture(B.ms, B.stop, me, B.net); text = T(`The best move was to ${inf(fen, line.move, 'your')}. ${G && G.k === 0 ? 'That wins' : 'It ends up winning'} ${amount(B.net, G && G.captured)}.`, `${san(fen, line.move)} wins ${amount(B.net, G && G.captured)}: ${lineTxt(fen, line.pv, B.stop)}.`); }
  else { const i2 = idea2(fen, line.move); text = T(`The best move was to ${inf(fen, line.move, 'your')}${i2 ? `, which ${i2}` : ''}.`, `${san(fen, line.move)}${i ? ' ' + i : ''}. Line: ${lineTxt(fen, line.pv, 5)}.`); }
  return { text, shows };
}
Object.assign(K, { explain, describeBest, label, act, inf, settle, words, moveName: (fen, u) => T(label(fen, u), san(fen, u)), plainMode: plain, describeTactic: (fen, u) => { const i = idea(fen, u); return i ? `${san(fen, u)} ${i}.` : null; } });
})();

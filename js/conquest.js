'use strict';
/* STEEL FRONT — コンクエスト: 占領 / チケット / 試合タイマー */

/* =========================================================
   Conquest logic — 占領・チケット
   ========================================================= */
const CAP_TIME = 8;    // 占領に要する秒数 (人数で加速)
function countInFlag(f) {
  let blue = 0, red = 0;
  if (player.alive && Math.hypot(player.pos.x - f.x, player.pos.z - f.z) < FLAG_R) blue++;
  for (const s of soldiers) {
    if (!s.alive) continue;
    if (Math.hypot(s.obj.position.x - f.x, s.obj.position.z - f.z) < FLAG_R) {
      if (s.team === 1) blue++; else red++;
    }
  }
  return [blue, red];
}
function updateFlags(dt) {
  let playerCapping = null;
  for (const f of flags) {
    const [blue, red] = countInFlag(f);
    const net = blue - red;
    const el = document.getElementById('flag-' + f.id);
    let hot = false;
    if (net !== 0 && (blue > 0) !== (red > 0) || (blue > 0 && red > 0)) hot = blue > 0 || red > 0;
    if (net > 0 && f.own !== 1) {
      // 青が占領を進める (中立化 → 占領)
      const rate = typeof captureRateV058 === 'function' ? captureRateV058(f, blue, red, 1) : Math.min(net, 3);
      f.cap += dt * rate / CAP_TIME;
      hot = true;
      if (f.cap >= 1) {
        f.cap = 0;
        if (f.own === -1) { f.own = 0; }            // まず中立化
        else {
          f.own = 1;
          sfx.capture();
          addFeed(f.id + ' 拠点を占領!', 'blue');
          if (blue > 0 && Math.hypot(player.pos.x - f.x, player.pos.z - f.z) < FLAG_R) {
            game.score += 200; addFeed('占領ボーナス +200'); updateScoreUI();
          }
        }
        updateFlagVisual(f);
      }
    } else if (net < 0 && f.own !== -1) {
      const rate = typeof captureRateV058 === 'function' ? captureRateV058(f, blue, red, -1) : Math.min(-net, 3);
      f.cap += dt * rate / CAP_TIME;
      hot = true;
      if (f.cap >= 1) {
        f.cap = 0;
        if (f.own === 1) { f.own = 0; sfx.lost(); addFeed(f.id + ' 拠点を失った', 'red'); }
        else f.own = -1;
        updateFlagVisual(f);
      }
    } else if (net === 0) {
      f.cap = Math.max(0, f.cap - dt * 0.15);
    }
    // HUD 拠点アイコン
    if (el) {
      el.className = 'flag-ic' + (f.own === 1 ? ' f-blue' : f.own === -1 ? ' f-red' : '') + (hot ? ' f-hot' : '');
    }
    // プレイヤーが圏内で進行中なら占領バー表示
    if (Math.hypot(player.pos.x - f.x, player.pos.z - f.z) < FLAG_R && f.cap > 0.01 && net > 0 && f.own !== 1) {
      playerCapping = f;
    }
  }
  // 占領バーUI
  if (playerCapping) {
    ui.capBox.style.display = 'block';
    ui.capLabel.textContent = playerCapping.id + (playerCapping.own === -1 ? ' 中立化中' : ' 占領中');
    ui.capFill.style.width = (playerCapping.cap * 100) + '%';
  } else {
    ui.capBox.style.display = 'none';
  }
}
// チケット bleed: 過半数 (3以上) 保持で相手チケット減少
// v0.2.3: 試合タイマー
function updateMatchTimer(dt) {
  game.timeLeft -= dt;
  game.timerT += dt;
  if (game.timerT >= 0.5) {
    game.timerT = 0;
    const t = Math.max(0, game.timeLeft);
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    const el = ui.matchTimer;
    el.textContent = mm + ':' + String(ss).padStart(2, '0');
    el.classList.toggle('low', t <= 60);
  }
  if (game.timeLeft <= 0) {
    // 時間切れ: チケットが多い方の勝ち (同点は拠点数で判定)
    let win;
    if (game.ticketsBlue !== game.ticketsRed) win = game.ticketsBlue > game.ticketsRed;
    else {
      let b = 0, r = 0;
      for (const f of flags) { if (f.own === 1) b++; else if (f.own === -1) r++; }
      win = b >= r;
    }
    endMatch(win, true);
  }
}
function updateTickets(dt) {
  game.bleedT += dt;
  if (game.bleedT < 1) return;
  game.bleedT = 0;
  let blueFlags = 0, redFlags = 0;
  for (const f of flags) {
    if (f.own === 1) blueFlags++;
    else if (f.own === -1) redFlags++;
  }
  let changed = false;
  if (blueFlags >= 3) { game.ticketsRed = Math.max(0, game.ticketsRed - (blueFlags - 2)); changed = true; }
  if (redFlags >= 3) { game.ticketsBlue = Math.max(0, game.ticketsBlue - (redFlags - 2)); changed = true; }
  if (changed) { updateTicketsUI(); checkMatchEnd(); }
}
function checkMatchEnd() {
  if (!game.running) return;
  if (game.ticketsRed <= 0) endMatch(true);
  else if (game.ticketsBlue <= 0) endMatch(false);
}
function endMatch(win, timeUp = false) {
  game.running = false;
  stopEngine();
  document.exitPointerLock && document.exitPointerLock();
  const title = document.getElementById('gameover-title');
  title.textContent = win ? '勝利' : '敗北';
  title.style.color = win ? '#8affc1' : '#ff6b5e';
  title.style.textShadow = win ? '0 0 25px rgba(0,255,140,.9)' : '0 0 25px rgba(255,60,40,.9)';
  const kd = (player.deaths || 0) === 0 ? game.kills : (game.kills / player.deaths).toFixed(1);
  document.getElementById('final-stats').innerHTML =
    (timeUp ? '⏱ 時間切れ<br>' : '') +
    `SCORE: ${game.score}<br>KILLS: ${game.kills} / DEATHS: ${player.deaths || 0} (K/D ${kd})<br>チケット BLUE ${game.ticketsBlue} — RED ${game.ticketsRed}`;
  document.getElementById('respawn-screen').style.display = 'none';
  document.getElementById('gameover-screen').style.display = 'flex';
  if (typeof enhanceResultV045 === 'function') enhanceResultV045();
}

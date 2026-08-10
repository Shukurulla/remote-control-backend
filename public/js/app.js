// =========================================================
// SMM Bot Admin Panel — app.js
// =========================================================

let token = localStorage.getItem('token');
let socket = null;
let devices = [];          // all devices from server
let selectedIds = new Set(); // selected device IDs

// DOM
const loginPage = document.getElementById('loginPage');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');
const deviceList = document.getElementById('deviceList');
const toastContainer = document.getElementById('toastContainer');

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  token ? verifyToken() : showLogin();
});

// ── Auth ──────────────────────────────────────────────────
async function verifyToken() {
  try {
    const res = await fetch('/api/auth/verify', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.valid) {
      document.getElementById('adminName').textContent = data.username;
      showDashboard();
    } else {
      showLogin();
    }
  } catch { showLogin(); }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      token = data.token;
      localStorage.setItem('token', token);
      document.getElementById('adminName').textContent = data.username;
      showDashboard();
      toast('Muvaffaqiyatli kirdingiz! 🎉', 'success');
    } else {
      toast(data.error || 'Noto\'g\'ri login yoki parol', 'error');
    }
  } catch { toast('Server bilan aloqa yo\'q', 'error'); }
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('token');
  token = null;
  if (socket) socket.disconnect();
  showLogin();
});

function showLogin() { loginPage.style.display = 'flex'; dashboard.classList.remove('active'); }
function showDashboard() { loginPage.style.display = 'none'; dashboard.classList.add('active'); initSocket(); loadDevices(); }

// ── Socket.io ─────────────────────────────────────────────
function initSocket() {
  socket = io();
  socket.on('device_online', () => loadDevices());
  socket.on('device_offline', () => loadDevices());
  socket.on('command_result', (data) => {
    const ok = data.status === 'executed';
    toast(`${fmt(data.command)}: ${ok ? '✅ bajarildi' : '❌ xato'}`, ok ? 'success' : 'error');
    loadHistory();
  });
}

// ── Devices ───────────────────────────────────────────────
async function loadDevices() {
  try {
    const res = await fetch('/api/devices', { headers: { Authorization: `Bearer ${token}` } });
    devices = await res.json();
    renderDevices();
    updateStats();
    updateCountBadges();
    populateHistorySelect();
  } catch (e) { console.error(e); }
}

function renderDevices() {
  if (!devices.length) {
    deviceList.innerHTML = '<p style="color:var(--muted);font-size:13px;">Hali hech bir qurilma ulanmagan.</p>';
    return;
  }
  deviceList.innerHTML = devices.map(d => `
    <div class="device-item ${d.isOnline ? '' : 'offline'} ${selectedIds.has(d.deviceId) ? 'selected' : ''}"
         onclick="${d.isOnline ? `toggleDevice('${d.deviceId}')` : ''}">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span class="device-name">${d.deviceName || 'Noma\'lum'}</span>
        <input type="checkbox" ${selectedIds.has(d.deviceId) ? 'checked' : ''}
               ${d.isOnline ? '' : 'disabled'}
               onclick="event.stopPropagation();toggleDevice('${d.deviceId}')"
               style="accent-color:var(--accent);width:14px;height:14px;cursor:pointer;">
      </div>
      <div class="device-meta">
        <span class="status-dot ${d.isOnline ? 'online' : 'offline'}"></span>
        ${d.isOnline ? 'Online' : 'Offline'} · ${d.brand || ''} ${d.model || ''}
      </div>
    </div>
  `).join('');
}

function toggleDevice(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  renderDevices();
  updateCountBadges();
  updateSelectAllCheckbox();
}

function toggleSelectAll(cb) {
  if (cb.checked) {
    devices.filter(d => d.isOnline).forEach(d => selectedIds.add(d.deviceId));
  } else {
    selectedIds.clear();
  }
  renderDevices();
  updateCountBadges();
}

function updateSelectAllCheckbox() {
  const onlineIds = devices.filter(d => d.isOnline).map(d => d.deviceId);
  const allSelected = onlineIds.length > 0 && onlineIds.every(id => selectedIds.has(id));
  document.getElementById('selectAll').checked = allSelected;
}

function updateStats() {
  document.getElementById('totalDevices').textContent = devices.length;
  document.getElementById('onlineDevices').textContent = devices.filter(d => d.isOnline).length;
}

function updateCountBadges() {
  const n = selectedIds.size;
  document.getElementById('selectedCount').textContent = `${n} tanlangan`;
  ['tgDevCount', 'igDevCount', 'waDevCount', 'tgMsgDevCount', 'aiDevCount'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = n;
  });
}

// ── Send to selected devices ───────────────────────────────
async function sendToSelected(command, params) {
  if (!selectedIds.size) { toast('Kamida bitta online qurilma tanlang', 'error'); return; }

  const total = selectedIds.size;
  let sent = 0;
  let errors = 0;

  toast(`⏳ ${total} ta qurilmaga buyruq yuborilmoqda...`, 'info');

  for (const deviceId of selectedIds) {
    try {
      const res = await fetch('/api/commands/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ deviceId, command, params })
      });

      if (!res.ok) { errors++; continue; }

      const data = await res.json();
      // Backend har doim { success: true, command: {...} } qaytaradi agar qurilma topilsa
      if (data.success !== false) sent++;
      else errors++;

    } catch (e) {
      console.error('Send error:', e);
      errors++;
    }
  }

  if (sent === total) {
    toast(`✅ Barcha ${total} ta qurilmaga buyruq yuborildi!`, 'success');
  } else if (sent > 0) {
    toast(`⚠️ ${sent}/${total} qurilmaga yuborildi. ${errors} ta xato.`, 'info');
  } else {
    toast(`❌ Buyruq hech bir qurilmaga yetmadi. Qurilma online ekanini tekshiring.`, 'error');
  }

  setTimeout(loadHistory, 1500);
}

// ── Commands ──────────────────────────────────────────────
function sendTelegramComment() {
  const postUrl = document.getElementById('tgPostUrl').value.trim();
  const commentText = document.getElementById('tgCommentText').value.trim();
  if (!postUrl || !commentText) { toast('URL va izoh matni kiritilishi shart', 'error'); return; }
  sendToSelected('post_telegram_comment', { postUrl, commentText });
}

function sendInstagramComment() {
  const postUrl = document.getElementById('igPostUrl').value.trim();
  const commentText = document.getElementById('igCommentText').value.trim();
  if (!postUrl || !commentText) { toast('URL va izoh matni kiritilishi shart', 'error'); return; }
  sendToSelected('post_instagram_comment', { postUrl, commentText });
}

function sendWhatsAppMessage() {
  const recipient = document.getElementById('waRecipient').value.trim();
  const message = document.getElementById('waMessage').value.trim();
  if (!recipient || !message) { toast('Qabul qiluvchi va xabar kiritilishi shart', 'error'); return; }
  sendToSelected('send_whatsapp_message', { recipient, message });
}

function sendTelegramMessage() {
  const recipient = document.getElementById('tgRecipient').value.trim();
  const message = document.getElementById('tgMessage').value.trim();
  if (!recipient || !message) { toast('Qabul qiluvchi va xabar kiritilishi shart', 'error'); return; }
  sendToSelected('send_telegram_message', { recipient, message });
}

// ── AI Instagram Comment ─────────────────────────────────
let aiGeneratedResults = null;

async function generateAiComments() {
  const postUrl = document.getElementById('aiPostUrl').value.trim();
  const postDescription = document.getElementById('aiPostDescription').value.trim();
  const tone = document.querySelector('input[name="aiTone"]:checked').value;

  const lang = document.getElementById('aiLang').value;

  if (!postUrl) { toast('Instagram Post URL kiriting', 'error'); return; }
  if (!postDescription) { toast('Post tavsifini yozing', 'error'); return; }
  if (!selectedIds.size) { toast('Kamida bitta online qurilma tanlang', 'error'); return; }

  const deviceIds = [...selectedIds];

  const langNames = { uz: "O'zbekcha", qq: 'Qaraqalpaqcha', kz: 'Qozaqcha', ru: 'Ruscha' };
  toast(`🤖 Gemini ${langNames[lang] || ''} commentlarni generatsiya qilmoqda...`, 'info');

  try {
    const res = await fetch('/api/commands/ai-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ postUrl, postDescription, tone, lang, deviceIds })
    });

    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Xatolik yuz berdi', 'error'); return; }

    aiGeneratedResults = data.results;

    // Preview ko'rsatish
    const previewBox = document.getElementById('aiPreviewBox');
    const previewList = document.getElementById('aiPreviewList');

    previewList.innerHTML = data.results
      .filter(r => r.success)
      .map(r => {
        const dev = devices.find(d => d.deviceId === r.deviceId);
        const devName = dev ? (dev.deviceName || dev.brand + ' ' + dev.model) : r.deviceId.slice(0, 12);
        return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;">
          <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">📱 ${devName}</div>
          <div style="font-size:14px;">${r.comment}</div>
          <div style="font-size:11px;color:${r.status === 'sent' ? 'var(--green)' : 'var(--yellow)'};margin-top:4px;">${r.status}</div>
        </div>`;
      }).join('');

    previewBox.style.display = 'block';
    document.getElementById('aiSendBtn').style.display = 'none';

    const sent = data.results.filter(r => r.success).length;
    toast(`✅ ${sent} ta comment generatsiya qilindi va yuborildi!`, 'success');

    setTimeout(loadHistory, 1500);
  } catch (e) {
    console.error(e);
    toast('Server bilan aloqa xatosi', 'error');
  }
}

function sendAiComments() {
  // Bu funksiya hozircha kerak emas, chunki generateAiComments o'zi yuboradi
  generateAiComments();
}

// ── History ───────────────────────────────────────────────
function populateHistorySelect() {
  const sel = document.getElementById('historyDevice');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Qurilma tanlang —</option>' +
    devices.map(d => `<option value="${d.deviceId}" ${d.deviceId === cur ? 'selected' : ''}>${d.deviceName || d.deviceId.slice(0, 16)}</option>`).join('');
  if (cur) loadHistory();
}

async function loadHistory() {
  const deviceId = document.getElementById('historyDevice').value;
  const container = document.getElementById('commandHistory');
  if (!deviceId) { container.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px;">Qurilma tanlanmadi</p>'; return; }
  try {
    const res = await fetch(`/api/commands/history/${deviceId}`, { headers: { Authorization: `Bearer ${token}` } });
    const cmds = await res.json();
    if (!cmds.length) { container.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px;">Buyruqlar yo\'q</p>'; return; }
    container.innerHTML = cmds.slice(0, 20).map(c => `
      <div class="history-item">
        <div>
          <div class="hi-command">${fmt(c.command)}</div>
          <div class="hi-params">${c.params ? briefParams(c.params) : ''}</div>
        </div>
        <span class="hi-status ${c.status}">${c.status}</span>
        <span class="hi-time">${fmtDate(c.createdAt)}</span>
      </div>
    `).join('');
  } catch { container.innerHTML = '<p style="color:var(--red);text-align:center;padding:20px;">Xatolik</p>'; }
}

// ── Helpers ───────────────────────────────────────────────
function fmt(cmd) {
  const map = {
    post_telegram_comment: '📬 Telegram Izoh',
    post_instagram_comment: '📷 Instagram Izoh',
    send_telegram_message: '✈️ Telegram Xabar',
    send_whatsapp_message: '💚 WhatsApp Xabar',
  };
  return map[cmd] || cmd;
}

function briefParams(p) {
  if (p.postUrl) return `🔗 ${p.postUrl.slice(0, 40)}...`;
  if (p.recipient) return `👤 ${p.recipient}`;
  return JSON.stringify(p).slice(0, 60);
}

function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleString('uz-UZ');
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// Refresh qurilmalar every 30s
setInterval(() => {
  if (token && dashboard.classList.contains('active')) loadDevices();
}, 30000);

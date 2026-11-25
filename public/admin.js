'use strict';

const $ = (id) => document.getElementById(id);
let me = null;
const editing = new Set(); // 수정 중인 링크 id

/* ---------- 공통 ---------- */
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('로그인이 필요합니다.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '요청에 실패했습니다.');
  return data;
}

let toastTimer;
function toast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

async function run(fn, successMsg) {
  try {
    me = await fn();
    render();
    if (successMsg) toast(successMsg);
  } catch (e) {
    toast(e.message, true);
  }
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

/* ---------- 렌더링 ---------- */
function pageUrl() {
  return `${location.origin}/@${me.username}`;
}

function render() {
  $('app').hidden = false;
  $('share-url').textContent = pageUrl().replace(/^https?:\/\//, '');
  $('open').href = pageUrl();
  $('stat-links').textContent = me.links.length;
  $('stat-clicks').textContent = me.totalClicks.toLocaleString('ko-KR');

  // 프로필 (입력 중인 값은 덮어쓰지 않도록 포커스 확인)
  if (document.activeElement !== $('name')) $('name').value = me.name;
  if (document.activeElement !== $('bio')) $('bio').value = me.bio;
  $('bio-count').textContent = $('bio').value.length;

  const slot = $('avatar-slot');
  slot.replaceChildren(
    me.avatarUrl
      ? el('img', { class: 'avatar', src: me.avatarUrl, alt: '프로필 사진' })
      : el('div', { class: 'avatar avatar-fallback', text: (me.name || me.username).charAt(0).toUpperCase() })
  );
  $('avatar-remove').hidden = !me.avatarUrl;

  // 링크 목록
  const maxClicks = Math.max(1, ...me.links.map((l) => l.clicks || 0));
  $('links').replaceChildren(...me.links.map((l, i) => renderLink(l, i, maxClicks)));
  $('links-empty').hidden = me.links.length > 0;
}

function renderLink(link, index, maxClicks) {
  const last = me.links.length - 1;
  const order = el('div', { class: 'order-btns' }, [
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': '위로', text: '↑', onclick: () => move(index, -1) }),
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': '아래로', text: '↓', onclick: () => move(index, 1) }),
  ]);
  order.children[0].disabled = index === 0;
  order.children[1].disabled = index === last;

  if (editing.has(link.id)) {
    const titleInput = el('input', { type: 'text', maxlength: '60', 'aria-label': '링크 이름' });
    titleInput.value = link.title;
    const urlInput = el('input', { type: 'url', 'aria-label': '주소', inputmode: 'url', autocapitalize: 'none', spellcheck: 'false' });
    urlInput.value = link.url;
    const save = () =>
      run(async () => {
        const r = await api(`/api/me/links/${link.id}`, { method: 'PUT', body: { title: titleInput.value, url: urlInput.value } });
        editing.delete(link.id);
        return r;
      }, '링크를 수정했어요.');
    const form = el('form', { class: 'edit-grid', onsubmit: (e) => { e.preventDefault(); save(); } }, [
      titleInput,
      urlInput,
      el('div', { class: 'row-actions' }, [
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '취소', onclick: () => { editing.delete(link.id); render(); } }),
        el('button', { class: 'btn btn-sm', type: 'submit', text: '저장' }),
      ]),
    ]);
    setTimeout(() => titleInput.focus(), 0);
    return el('li', { class: 'admin-link' }, [order, form]);
  }

  const clicks = link.clicks || 0;
  const bar = el('div', { class: 'click-bar', 'aria-hidden': 'true' }, [el('span')]);
  bar.firstChild.style.width = `${(clicks / maxClicks) * 100}%`;

  return el('li', { class: 'admin-link' }, [
    order,
    el('div', { class: 'admin-link-main' }, [
      el('div', { class: 'admin-link-title', text: link.title }),
      el('div', { class: 'admin-link-url', text: link.url }),
      bar,
    ]),
    el('div', { class: 'admin-link-side' }, [
      el('div', { class: 'click-count' }, [document.createTextNode(clicks.toLocaleString('ko-KR')), el('small', { text: ' 클릭' })]),
      el('div', { class: 'row-actions' }, [
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '수정', onclick: () => { editing.add(link.id); render(); } }),
        el('button', { class: 'btn btn-ghost btn-sm btn-danger', type: 'button', text: '삭제', onclick: () => removeLink(link) }),
      ]),
    ]),
  ]);
}

/* ---------- 동작 ---------- */
function move(index, delta) {
  const ids = me.links.map((l) => l.id);
  const target = index + delta;
  if (target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  run(() => api('/api/me/links/order', { method: 'PUT', body: { ids } }));
}

function removeLink(link) {
  if (!confirm(`'${link.title}' 링크를 삭제할까요?\n클릭 기록도 함께 사라집니다.`)) return;
  editing.delete(link.id);
  run(() => api(`/api/me/links/${link.id}`, { method: 'DELETE' }), '링크를 삭제했어요.');
}

$('add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  run(async () => {
    const r = await api('/api/me/links', { method: 'POST', body: { title: $('new-title').value, url: $('new-url').value } });
    $('new-title').value = '';
    $('new-url').value = '';
    $('new-title').focus();
    return r;
  }, '링크를 추가했어요.');
});

$('profile-form').addEventListener('submit', (e) => {
  e.preventDefault();
  document.activeElement.blur();
  run(() => api('/api/me/profile', { method: 'PUT', body: { name: $('name').value, bio: $('bio').value } }), '프로필을 저장했어요.');
});
$('bio').addEventListener('input', () => { $('bio-count').textContent = $('bio').value.length; });

// 프로필 사진: 브라우저에서 정사각형 320px로 잘라 압축 후 업로드
$('avatar-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const dataUrl = await resizeSquare(file, 320);
    await run(() => api('/api/me/avatar', { method: 'POST', body: { dataUrl } }), '프로필 사진을 바꿨어요.');
  } catch (err) {
    toast(err.message || '이미지를 처리하지 못했어요.', true);
  }
});
$('avatar-remove').addEventListener('click', () => {
  run(() => api('/api/me/avatar', { method: 'DELETE' }), '프로필 사진을 삭제했어요.');
});

function resizeSquare(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(
        img,
        (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
        0, 0, size, size
      );
      URL.revokeObjectURL(src);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('이미지 파일을 읽을 수 없어요.')); };
    img.src = src;
  });
}

$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(pageUrl());
    toast('주소를 복사했어요!');
  } catch {
    toast(pageUrl());
  }
});

$('logout').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  location.href = '/';
});

// 다른 탭에서 링크가 클릭됐을 수 있으니, 탭으로 돌아오면 클릭 수를 새로 고침
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && me && editing.size === 0) run(() => api('/api/me'));
});

run(() => api('/api/me'));

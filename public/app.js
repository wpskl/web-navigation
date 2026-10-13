(function () {
  'use strict';

  const COLORS = [
    { bg: '#E3F2FD', border: '#90CAF9', accent: '#1976D2' },
    { bg: '#F3E5F5', border: '#CE93D8', accent: '#7B1FA2' },
    { bg: '#E8F5E9', border: '#A5D6A7', accent: '#388E3C' },
    { bg: '#FFF3E0', border: '#FFCC80', accent: '#F57C00' },
    { bg: '#FCE4EC', border: '#F48FB1', accent: '#C2185B' },
    { bg: '#E0F7FA', border: '#80DEEA', accent: '#0097A7' },
    { bg: '#F1F8E9', border: '#C5E1A5', accent: '#689F38' },
    { bg: '#FFF8E1', border: '#FFE082', accent: '#FFA000' },
    { bg: '#EDE7F6', border: '#B39DDB', accent: '#512DA8' },
    { bg: '#E0F2F1', border: '#80CBC4', accent: '#00796B' },
  ];

  let state = { categories: [] };
  let selectedId = null;
  let searchText = '';
  let searchTags = [];
  let saveTimer = null;
  let sortableInstances = [];

  const $ = (sel) => document.querySelector(sel);
  const treeEl = $('#category-tree');
  const emptyState = $('#empty-state');
  const categoryPanel = $('#category-panel');
  const searchResults = $('#search-results');
  const linksContainer = $('#links-container');

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function getColor(index) {
    return COLORS[index % COLORS.length];
  }

  function faviconUrl(url) {
    try {
      return new URL('/favicon.ico', url).href;
    } catch {
      return '';
    }
  }

  async function loadData() {
    const res = await fetch('/api/data');
    state = await res.json();
    if (!state.categories) state.categories = [];
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
    }, 300);
  }

  function findCategory(id, list = state.categories, parent = null) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return { cat: list[i], parent, index: i, list };
      const found = findCategory(id, list[i].children || [], list[i]);
      if (found) return found;
    }
    return null;
  }

  function findCategoryPath(id, list = state.categories, path = []) {
    for (const cat of list) {
      const current = [...path, cat.name];
      if (cat.id === id) return current;
      const found = findCategoryPath(id, cat.children || [], current);
      if (found) return found;
    }
    return null;
  }

  function createCategory(name) {
    return {
      id: generateId(),
      name,
      collapsed: false,
      displayMode: 'tile',
      children: [],
      links: [],
    };
  }

  function createLink(url, title, description, favicon) {
    return {
      id: generateId(),
      url,
      title: title || url,
      description: description || '',
      favicon: favicon || faviconUrl(url),
      tags: [],
      colorIndex: Math.floor(Math.random() * COLORS.length),
    };
  }

  function destroySortables() {
    sortableInstances.forEach((s) => s.destroy());
    sortableInstances = [];
  }

  function initCategorySortable(el, list) {
    const s = Sortable.create(el, {
      group: { name: 'categories', pull: false, put: false },
      handle: '.tree-drag-handle',
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      onEnd(evt) {
        if (evt.oldIndex === evt.newIndex) return;
        const [moved] = list.splice(evt.oldIndex, 1);
        list.splice(evt.newIndex, 0, moved);
        scheduleSave();
      },
    });
    sortableInstances.push(s);
  }

  function initLinkSortable(el, category) {
    const s = Sortable.create(el, {
      group: 'links',
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      onAdd(evt) {
        const linkId = evt.item.dataset.linkId;
        const fromCatId = evt.from.dataset.categoryId;
        const toCatId = evt.to.dataset.categoryId;
        if (fromCatId === toCatId) return;

        const fromFound = findCategory(fromCatId);
        const toFound = findCategory(toCatId);
        if (!fromFound || !toFound) return;

        const linkIdx = fromFound.cat.links.findIndex((l) => l.id === linkId);
        if (linkIdx === -1) return;
        const [link] = fromFound.cat.links.splice(linkIdx, 1);
        toFound.cat.links.splice(evt.newIndex, 0, link);
        scheduleSave();
        render();
      },
      onEnd(evt) {
        if (evt.from !== evt.to) return;
        if (evt.oldIndex === evt.newIndex) return;
        const [moved] = category.links.splice(evt.oldIndex, 1);
        category.links.splice(evt.newIndex, 0, moved);
        scheduleSave();
      },
    });
    sortableInstances.push(s);
  }

  function renderTree() {
    destroySortables();
    treeEl.innerHTML = '';
    renderTreeLevel(state.categories, treeEl, 0);
  }

  function renderTreeLevel(categories, container, depth) {
    const listEl = document.createElement('div');
    listEl.className = 'tree-level';
    listEl.dataset.depth = depth;

    categories.forEach((cat) => {
      const node = document.createElement('div');
      node.className = 'tree-node';
      node.dataset.id = cat.id;

      const hasChildren = (cat.children || []).length > 0;
      const row = document.createElement('div');
      row.className = 'tree-node-row' + (cat.id === selectedId ? ' active' : '');

      const indent = document.createElement('span');
      indent.className = 'tree-indent';
      indent.style.width = depth * 16 + 'px';

      const toggle = document.createElement('button');
      toggle.className = 'tree-toggle' + (hasChildren ? '' : ' empty');
      toggle.textContent = cat.collapsed ? '▶' : '▼';
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        cat.collapsed = !cat.collapsed;
        scheduleSave();
        render();
      });

      const handle = document.createElement('span');
      handle.className = 'tree-drag-handle';
      handle.textContent = '⠿';
      handle.title = '拖拽排序';

      const name = document.createElement('span');
      name.className = 'tree-name';
      name.textContent = cat.name;
      name.title = cat.name;

      const actions = document.createElement('div');
      actions.className = 'tree-actions';

      const btnAdd = document.createElement('button');
      btnAdd.className = 'tree-action-btn';
      btnAdd.textContent = '+';
      btnAdd.title = '添加子分类';
      btnAdd.addEventListener('click', (e) => {
        e.stopPropagation();
        showModal('新建子分类', '子分类名称', (val) => {
          if (!val.trim()) return;
          if (!cat.children) cat.children = [];
          cat.children.push(createCategory(val.trim()));
          cat.collapsed = false;
          scheduleSave();
          render();
        });
      });

      const btnRename = document.createElement('button');
      btnRename.className = 'tree-action-btn';
      btnRename.textContent = '✎';
      btnRename.title = '重命名';
      btnRename.addEventListener('click', (e) => {
        e.stopPropagation();
        showModal('重命名分类', cat.name, (val) => {
          if (!val.trim()) return;
          cat.name = val.trim();
          scheduleSave();
          render();
        });
      });

      const btnDelete = document.createElement('button');
      btnDelete.className = 'tree-action-btn danger';
      btnDelete.textContent = '×';
      btnDelete.title = '删除';
      btnDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm(`确定删除分类「${cat.name}」及其所有内容？`)) return;
        const found = findCategory(cat.id);
        if (found) {
          found.list.splice(found.index, 1);
          if (selectedId === cat.id) selectedId = null;
          scheduleSave();
          render();
        }
      });

      actions.append(btnAdd, btnRename, btnDelete);
      row.append(indent, toggle, handle, name, actions);

      row.addEventListener('click', () => {
        selectedId = cat.id;
        searchText = '';
        searchTags = [];
        $('#search-input').value = '';
        renderSearchTags();
        render();
      });

      node.appendChild(row);

      if (hasChildren) {
        const childrenWrap = document.createElement('div');
        childrenWrap.className = 'tree-children' + (cat.collapsed ? ' collapsed' : '');
        renderTreeLevel(cat.children, childrenWrap, depth + 1);
        node.appendChild(childrenWrap);
      }

      listEl.appendChild(node);
    });

    container.appendChild(listEl);
    initCategorySortable(listEl, categories);
  }

  function renderLinks(category) {
    linksContainer.innerHTML = '';
    linksContainer.className = 'links-container ' + (category.displayMode === 'card' ? 'card-mode' : 'tile-mode');
    linksContainer.dataset.categoryId = category.id;

    category.links.forEach((link, idx) => {
      const color = getColor(link.colorIndex ?? idx);
      if (category.displayMode === 'card') {
        linksContainer.appendChild(renderLinkCard(link, color, category));
      } else {
        linksContainer.appendChild(renderLinkTile(link, color, category));
      }
    });

    initLinkSortable(linksContainer, category);
  }

  function renderLinkTile(link, color, category) {
    const wrap = document.createElement('div');
    wrap.className = 'link-tile-wrap';
    wrap.dataset.linkId = link.id;

    const tile = document.createElement('a');
    tile.className = 'link-tile';
    tile.href = link.url;
    tile.target = '_blank';
    tile.rel = 'noopener noreferrer';
    tile.style.background = color.bg;
    tile.style.borderColor = color.border;
    tile.dataset.linkId = link.id;

    const img = document.createElement('img');
    img.className = 'favicon';
    img.src = link.favicon || faviconUrl(link.url);
    img.alt = '';
    img.onerror = () => { img.style.display = 'none'; };

    const title = document.createElement('span');
    title.className = 'link-title';
    title.textContent = link.title;
    title.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showModal('编辑标题', link.title, (val) => {
        if (!val.trim()) return;
        link.title = val.trim();
        scheduleSave();
        render();
      });
    });

    const editBtn = document.createElement('button');
    editBtn.className = 'link-edit';
    editBtn.textContent = '✎';
    editBtn.title = '编辑标签';
    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      wrap.classList.toggle('expanded');
    });

    tile.append(img, title, editBtn);
    wrap.appendChild(tile);

    const tagsArea = document.createElement('div');
    tagsArea.className = 'link-tile-tags';
    tagsArea.appendChild(buildTagsEditor(link, category));

    const tileActions = document.createElement('div');
    tileActions.style.cssText = 'display:flex;gap:6px;margin-top:8px;justify-content:flex-end';
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm';
    delBtn.textContent = '删除链接';
    delBtn.style.color = 'var(--danger)';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('确定删除此链接？')) return;
      const idx = category.links.indexOf(link);
      if (idx !== -1) category.links.splice(idx, 1);
      scheduleSave();
      render();
    });
    tileActions.appendChild(delBtn);
    tagsArea.appendChild(tileActions);
    wrap.appendChild(tagsArea);

    return wrap;
  }

  function renderLinkCard(link, color, category) {
    const card = document.createElement('div');
    card.className = 'link-card';
    card.dataset.linkId = link.id;

    const bar = document.createElement('div');
    bar.className = 'link-card-color-bar';
    bar.style.background = color.accent;

    const body = document.createElement('div');
    body.className = 'link-card-body';

    const header = document.createElement('div');
    header.className = 'link-card-header';

    const img = document.createElement('img');
    img.className = 'favicon';
    img.src = link.favicon || faviconUrl(link.url);
    img.alt = '';
    img.onerror = () => { img.style.display = 'none'; };

    const a = document.createElement('a');
    a.href = link.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = link.title;

    header.append(img, a);

    const desc = document.createElement('div');
    desc.className = 'link-card-desc';
    desc.textContent = link.description || link.url;

    const footer = document.createElement('div');
    footer.className = 'link-card-footer';

    const tagsWrap = buildTagsEditor(link, category);
    tagsWrap.style.marginTop = '0';

    const actions = document.createElement('div');
    actions.className = 'link-card-actions';

    const editTitle = document.createElement('button');
    editTitle.textContent = '编辑';
    editTitle.addEventListener('click', () => {
      showModal('编辑标题', link.title, (val) => {
        if (!val.trim()) return;
        link.title = val.trim();
        scheduleSave();
        render();
      });
    });

    const delBtn = document.createElement('button');
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => {
      if (!confirm('确定删除此链接？')) return;
      const idx = category.links.indexOf(link);
      if (idx !== -1) category.links.splice(idx, 1);
      scheduleSave();
      render();
    });

    actions.append(editTitle, delBtn);
    footer.append(tagsWrap, actions);
    body.append(header, desc, footer);
    card.append(bar, body);
    return card;
  }

  function buildTagsEditor(link, category) {
    const wrap = document.createElement('div');
    wrap.className = 'tags-input-wrap';

    (link.tags || []).forEach((tag, i) => {
      const el = document.createElement('span');
      el.className = 'tag';
      el.textContent = tag;
      const rm = document.createElement('button');
      rm.textContent = '×';
      rm.addEventListener('click', (e) => {
        e.stopPropagation();
        link.tags.splice(i, 1);
        scheduleSave();
        render();
      });
      el.appendChild(rm);
      wrap.appendChild(el);
    });

    const input = document.createElement('input');
    input.className = 'tag-input';
    input.placeholder = '+ 标签';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(link, input);
      }
    });
    input.addEventListener('blur', () => addTag(link, input));
    wrap.appendChild(input);
    return wrap;
  }

  function addTag(link, input) {
    const val = input.value.replace(/,/g, '').trim();
    if (!val) return;
    if (!link.tags) link.tags = [];
    if (!link.tags.includes(val)) {
      link.tags.push(val);
      scheduleSave();
      render();
    }
    input.value = '';
  }

  function renderSearchResults() {
    const query = searchText.toLowerCase().trim();
    const results = [];

    function walk(cats, path) {
      cats.forEach((cat) => {
        const currentPath = [...path, cat.name];
        (cat.links || []).forEach((link) => {
          const tags = (link.tags || []).join(' ').toLowerCase();
          const titleMatch = !query || link.title.toLowerCase().includes(query)
            || link.url.toLowerCase().includes(query) || tags.includes(query);
          const tagMatch = searchTags.length === 0 || searchTags.every((t) => (link.tags || []).includes(t));
          if (titleMatch && tagMatch) {
            results.push({ link, path: currentPath, category: cat });
          }
        });
        walk(cat.children || [], currentPath);
      });
    }
    walk(state.categories, []);

    searchResults.innerHTML = '';
    if (results.length === 0) {
      searchResults.innerHTML = '<p style="color:var(--text-muted)">未找到匹配的链接</p>';
      return;
    }

    const heading = document.createElement('h3');
    heading.textContent = `找到 ${results.length} 个结果`;
    searchResults.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'links-container tile-mode';

    results.forEach(({ link, path, category }, idx) => {
      const group = document.createElement('div');
      group.className = 'search-group';
      if (idx === 0 || results[idx - 1].path.join('/') !== path.join('/')) {
        const title = document.createElement('div');
        title.className = 'search-group-title';
        title.textContent = path.join(' / ');
        searchResults.appendChild(title);
      }
      const color = getColor(link.colorIndex ?? idx);
      const tile = renderLinkTile(link, color, category);
      const tileLink = tile.querySelector('.link-tile');
      if (tileLink) tileLink.style.maxWidth = 'none';
      grid.appendChild(tile);
    });

    if (grid.children.length > 0) searchResults.appendChild(grid);
  }

  function renderSearchTags() {
    const el = $('#search-tags');
    el.innerHTML = '';
    searchTags.forEach((tag, i) => {
      const span = document.createElement('span');
      span.className = 'search-tag';
      span.textContent = tag;
      const btn = document.createElement('button');
      btn.textContent = '×';
      btn.addEventListener('click', () => {
        searchTags.splice(i, 1);
        renderSearchTags();
        render();
      });
      span.appendChild(btn);
      el.appendChild(span);
    });
  }

  function render() {
    renderTree();

    const isSearching = searchText.trim() || searchTags.length > 0;

    if (isSearching) {
      emptyState.classList.add('hidden');
      categoryPanel.classList.add('hidden');
      searchResults.classList.remove('hidden');
      renderSearchResults();
      return;
    }

    searchResults.classList.add('hidden');

    if (!selectedId) {
      emptyState.classList.remove('hidden');
      categoryPanel.classList.add('hidden');
      return;
    }

    const found = findCategory(selectedId);
    if (!found) {
      selectedId = null;
      emptyState.classList.remove('hidden');
      categoryPanel.classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    categoryPanel.classList.remove('hidden');

    const cat = found.cat;
    $('#panel-title').textContent = cat.name;

    document.querySelectorAll('.view-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === (cat.displayMode || 'tile'));
    });

    renderLinks(cat);
  }

  function showModal(title, defaultValue, onConfirm) {
    const modal = $('#modal');
    $('#modal-title').textContent = title;
    const input = $('#modal-input');
    input.value = defaultValue;
    modal.classList.remove('hidden');
    input.focus();
    input.select();

    function close() {
      modal.classList.add('hidden');
      $('#modal-confirm').onclick = null;
      $('#modal-cancel').onclick = null;
      $('.modal-backdrop').onclick = null;
      input.onkeydown = null;
    }

    $('#modal-confirm').onclick = () => {
      onConfirm(input.value);
      close();
    };
    $('#modal-cancel').onclick = close;
    $('.modal-backdrop').onclick = close;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') { onConfirm(input.value); close(); }
      if (e.key === 'Escape') close();
    };
  }

  async function addLink() {
    const urlInput = $('#link-url');
    let url = urlInput.value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    const found = findCategory(selectedId);
    if (!found) return;

    const btn = $('#btn-add-link');
    btn.disabled = true;
    btn.textContent = '获取中...';

    let meta = { title: url, description: '', favicon: '' };
    try {
      const res = await fetch('/api/fetch-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (res.ok) meta = await res.json();
    } catch { /* use defaults */ }

    const link = createLink(url, meta.title, meta.description, meta.favicon);
    link.colorIndex = found.cat.links.length % COLORS.length;
    found.cat.links.push(link);
    scheduleSave();
    urlInput.value = '';
    btn.disabled = false;
    btn.textContent = '添加';
    render();
  }

  function bindEvents() {
    $('#btn-add-root').addEventListener('click', () => {
      showModal('新建分类', '分类名称', (val) => {
        if (!val.trim()) return;
        const cat = createCategory(val.trim());
        state.categories.push(cat);
        selectedId = cat.id;
        scheduleSave();
        render();
      });
    });

    $('#btn-add-link').addEventListener('click', addLink);
    $('#link-url').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addLink();
    });

    document.querySelectorAll('.view-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const found = findCategory(selectedId);
        if (!found) return;
        found.cat.displayMode = btn.dataset.mode;
        scheduleSave();
        render();
      });
    });

    $('#search-input').addEventListener('input', (e) => {
      searchText = e.target.value;
      render();
    });

    $('#search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        const val = e.target.value.trim();
        if (val.startsWith('#') || val.includes(':')) {
          const tag = val.replace(/^#/, '').replace(/,$/, '').trim();
          if (tag && !searchTags.includes(tag)) {
            searchTags.push(tag);
            e.target.value = searchText.replace(/#?\S+$/, '').trim();
            searchText = e.target.value;
            renderSearchTags();
            render();
            e.preventDefault();
          }
        }
      }
    });
  }

  async function init() {
    await loadData();
    bindEvents();
    render();
  }

  init();
})();

(() => {
  'use strict';

  const API_KEY_STORAGE = 'etsy-signal-lab-api-key';
  const viewMeta = {
    overview: ['Рабочее пространство', 'Обзор исследований'],
    research: ['Новый запуск', 'Создать исследование'],
    runs: ['Архив данных', 'Запуски и отчёты'],
  };

  const state = {
    apiKey: sessionStorage.getItem(API_KEY_STORAGE) || '',
    health: null,
    jobs: [],
    runs: [],
    runMode: 'jobs',
    selectedId: '',
    currentJobId: '',
    pollTimer: null,
    currentView: 'overview',
  };

  const $ = (id) => document.getElementById(id);
  const elements = {
    pageEyebrow: $('pageEyebrow'),
    pageTitle: $('pageTitle'),
    liveState: $('liveState'),
    sidebarStatusDot: $('sidebarStatusDot'),
    sidebarStatusText: $('sidebarStatusText'),
    refreshButton: $('refreshButton'),
    accessButton: $('accessButton'),
    accessDialog: $('accessDialog'),
    accessForm: $('accessForm'),
    apiKeyInput: $('apiKeyInput'),
    accessError: $('accessError'),
    toggleKeyButton: $('toggleKeyButton'),
    readOnlyButton: $('readOnlyButton'),
    connectButton: $('connectButton'),
    researchForm: $('researchForm'),
    queryInput: $('queryInput'),
    queryError: $('queryError'),
    pagesInput: $('pagesInput'),
    pagesOutput: $('pagesOutput'),
    listingsInput: $('listingsInput'),
    listingsOutput: $('listingsOutput'),
    currencyInput: $('currencyInput'),
    countryInput: $('countryInput'),
    languageInput: $('languageInput'),
    useLlmInput: $('useLlmInput'),
    providerInput: $('providerInput'),
    modelInput: $('modelInput'),
    llmFields: $('llmFields'),
    submitResearchButton: $('submitResearchButton'),
    summaryQuery: $('summaryQuery'),
    summaryPages: $('summaryPages'),
    summaryListings: $('summaryListings'),
    summaryAi: $('summaryAi'),
    effortBar: $('effortBar'),
    effortLabel: $('effortLabel'),
    currentJobPanel: $('currentJobPanel'),
    currentJobQuery: $('currentJobQuery'),
    currentJobStatus: $('currentJobStatus'),
    currentJobId: $('currentJobId'),
    currentJobElapsed: $('currentJobElapsed'),
    currentJobMessage: $('currentJobMessage'),
    jobProgressTrack: $('jobProgressTrack'),
    openJobButton: $('openJobButton'),
    overviewJobsBody: $('overviewJobsBody'),
    overviewEmpty: $('overviewEmpty'),
    runsList: $('runsList'),
    runsEmpty: $('runsEmpty'),
    runSearch: $('runSearch'),
    jobsCount: $('jobsCount'),
    runsCount: $('runsCount'),
    detailEmpty: $('detailEmpty'),
    detailContent: $('detailContent'),
    detailQuery: $('detailQuery'),
    detailStatus: $('detailStatus'),
    detailError: $('detailError'),
    detailFound: $('detailFound'),
    detailSuccess: $('detailSuccess'),
    detailPartial: $('detailPartial'),
    detailBlocked: $('detailBlocked'),
    detailAverage: $('detailAverage'),
    detailMedian: $('detailMedian'),
    detailDuration: $('detailDuration'),
    detailCompleted: $('detailCompleted'),
    runFiles: $('runFiles'),
    filesEmpty: $('filesEmpty'),
    toastRegion: $('toastRegion'),
  };

  class ApiError extends Error {
    constructor(message, status, payload) {
      super(message);
      this.status = status;
      this.payload = payload;
    }
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } });
  }

  function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setStatusBadge(node, status) {
    node.className = `status-badge status-${status || 'unknown'}`;
    node.textContent = statusLabel(status);
  }

  function statusLabel(status) {
    return ({ queued: 'В очереди', running: 'Выполняется', completed: 'Готово', failed: 'Ошибка' })[status] || 'Нет данных';
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
  }

  function formatDuration(milliseconds) {
    if (milliseconds === null || milliseconds === undefined || Number.isNaN(Number(milliseconds))) return '—';
    const seconds = Math.max(0, Math.floor(Number(milliseconds) / 1000));
    if (seconds < 60) return `${seconds} сек`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} мин ${seconds % 60} сек`;
    return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
  }

  function formatUptime(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    const hours = Math.floor(seconds / 3600);
    if (hours < 24) return `${hours} ч`;
    return `${Math.floor(hours / 24)} д ${hours % 24} ч`;
  }

  function formatMoney(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value));
  }

  function formatBytes(value) {
    if (!Number.isFinite(value)) return '—';
    if (value < 1024) return `${value} Б`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} КБ`;
    return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
  }

  function runIdFromPath(runDir) {
    if (!runDir) return '';
    return String(runDir).split(/[\\/]/).filter(Boolean).pop() || '';
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const apiKey = options.apiKeyOverride !== undefined ? options.apiKeyOverride : state.apiKey;
    if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    const response = await fetch(path, { ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const message = typeof payload === 'object' && payload && payload.error ? payload.error : `HTTP ${response.status}`;
      throw new ApiError(message, response.status, payload);
    }
    return payload;
  }

  function showToast(title, message, type = 'success') {
    const toast = createElement('div', `toast${type === 'error' ? ' is-error' : ''}`);
    const icon = createElement('i');
    icon.dataset.lucide = type === 'error' ? 'circle-alert' : 'circle-check';
    const copy = createElement('div');
    copy.append(createElement('strong', '', title), createElement('span', '', message));
    toast.append(icon, copy);
    elements.toastRegion.append(toast);
    refreshIcons();
    window.setTimeout(() => toast.remove(), 5200);
  }

  function showView(viewName) {
    if (!viewMeta[viewName]) return;
    state.currentView = viewName;
    document.querySelectorAll('[data-view]').forEach((view) => {
      const active = view.dataset.view === viewName;
      view.hidden = !active;
      view.classList.toggle('is-active', active);
    });
    document.querySelectorAll('.nav-item[data-view-target]').forEach((button) => {
      const active = button.dataset.viewTarget === viewName;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    elements.pageEyebrow.textContent = viewMeta[viewName][0];
    elements.pageTitle.textContent = viewMeta[viewName][1];
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (viewName === 'runs' && state.apiKey) void refreshProtectedData();
  }

  function updateConnectionUi(online, message) {
    const dot = elements.liveState.querySelector('.status-dot');
    const liveText = elements.liveState.querySelector('span:last-child');
    [dot, elements.sidebarStatusDot].forEach((item) => {
      item.classList.toggle('is-online', online);
      item.classList.toggle('is-error', !online);
    });
    liveText.textContent = message;
    elements.sidebarStatusText.textContent = online ? (state.apiKey ? 'API подключён' : 'Сервер доступен') : 'Сервер недоступен';
  }

  async function refreshHealth() {
    try {
      const health = await api('/health', { apiKeyOverride: '' });
      state.health = health;
      updateConnectionUi(true, 'Production онлайн');
      $('metricActive').textContent = String(health.activeJobs ?? 0);
      $('metricQueued').textContent = String(health.queuedJobs ?? 0);
      $('metricRetained').textContent = String(health.retainedJobs ?? 0);
      $('metricMaxConcurrent').textContent = String(health.maxConcurrent ?? 0);
      $('metricUptime').textContent = formatUptime(Number(health.uptime));
      $('orbitValue').textContent = String(health.activeJobs ?? 0);
      return true;
    } catch (error) {
      updateConnectionUi(false, 'Нет соединения');
      return false;
    }
  }

  function normalizeJob(job) {
    return {
      source: 'job',
      id: job.id,
      runId: runIdFromPath(job.result?.runDir),
      query: job.query || 'Без названия',
      status: job.status,
      createdAt: job.queuedAt,
      completedAt: job.completedAt,
      result: job.result || null,
      error: job.error || job.result?.error || '',
      raw: job,
    };
  }

  function normalizeRun(run) {
    return {
      source: 'run',
      id: run.id,
      runId: run.id,
      query: run.query || run.id,
      status: run.status || 'failed',
      createdAt: run.id?.slice(0, 19).replace('T', ' ') || '',
      completedAt: '',
      result: run.status ? run : null,
      error: run.error || '',
      raw: run,
    };
  }

  async function refreshProtectedData() {
    if (!state.apiKey) {
      renderOverviewJobs();
      renderRunsList();
      return;
    }
    try {
      const [jobsPayload, runsPayload] = await Promise.all([api('/jobs'), api('/runs')]);
      state.jobs = Array.isArray(jobsPayload.jobs) ? jobsPayload.jobs : [];
      state.runs = Array.isArray(runsPayload.runs) ? runsPayload.runs : [];
      elements.jobsCount.textContent = String(state.jobs.length);
      elements.runsCount.textContent = String(state.runs.length);
      renderOverviewJobs();
      renderRunsList();

      const active = [...state.jobs].reverse().find((job) => job.status === 'running' || job.status === 'queued');
      if (active && !state.currentJobId) {
        state.currentJobId = active.id;
        updateCurrentJob(active);
        startPolling();
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearApiKey(false);
        openAccessDialog('Срок действия ключа истёк или ключ неверный.');
      } else {
        showToast('Не удалось обновить данные', error.message, 'error');
      }
    }
  }

  async function refreshAll() {
    elements.refreshButton.classList.add('is-spinning');
    await refreshHealth();
    await refreshProtectedData();
    elements.refreshButton.classList.remove('is-spinning');
  }

  function renderOverviewJobs() {
    elements.overviewJobsBody.replaceChildren();
    const entries = state.jobs.slice(-5).reverse().map(normalizeJob);
    elements.overviewEmpty.hidden = entries.length > 0;
    for (const entry of entries) {
      const row = document.createElement('tr');
      const queryCell = document.createElement('td');
      queryCell.append(createElement('strong', '', entry.query), createElement('span', '', entry.id.slice(0, 8)));
      const statusCell = document.createElement('td');
      const badge = createElement('span');
      setStatusBadge(badge, entry.status);
      statusCell.append(badge);
      const dateCell = createElement('td', '', formatDate(entry.createdAt));
      const resultCell = createElement('td', 'align-right', entry.result ? `${entry.result.totalFound ?? 0} позиций` : '—');
      row.append(queryCell, statusCell, dateCell, resultCell);
      elements.overviewJobsBody.append(row);
    }
  }

  function getVisibleEntries() {
    const source = state.runMode === 'jobs' ? state.jobs.map(normalizeJob) : state.runs.map(normalizeRun);
    const search = elements.runSearch.value.trim().toLocaleLowerCase('ru-RU');
    return source
      .filter((entry) => !search || entry.query.toLocaleLowerCase('ru-RU').includes(search))
      .sort((a, b) => String(b.createdAt || b.id).localeCompare(String(a.createdAt || a.id)));
  }

  function renderRunsList() {
    elements.runsList.replaceChildren();
    const entries = getVisibleEntries();
    elements.runsEmpty.hidden = entries.length > 0;
    for (const entry of entries) {
      const button = createElement('button', `run-row${state.selectedId === entry.id ? ' is-selected' : ''}`);
      button.type = 'button';
      button.dataset.entryId = entry.id;
      const main = createElement('span', 'run-main');
      main.append(createElement('strong', '', entry.query), createElement('small', '', `${formatDate(entry.createdAt)} · ${entry.id.slice(0, 12)}`));
      const status = createElement('span');
      setStatusBadge(status, entry.status);
      const signals = createElement('span', 'run-signals', entry.result ? `${entry.result.totalFound ?? 0} найдено · ${entry.result.blockedCount ?? 0} блок.` : 'Результат формируется');
      const arrow = createElement('span', 'run-arrow');
      const icon = createElement('i');
      icon.dataset.lucide = 'chevron-right';
      arrow.append(icon);
      button.append(main, status, signals, arrow);
      button.addEventListener('click', () => void selectEntry(entry));
      elements.runsList.append(button);
    }
    refreshIcons();
  }

  async function selectEntry(entry) {
    state.selectedId = entry.id;
    renderRunsList();
    elements.detailEmpty.hidden = true;
    elements.detailContent.hidden = false;
    elements.detailQuery.textContent = entry.query;
    setStatusBadge(elements.detailStatus, entry.status);
    const result = entry.result || {};
    elements.detailFound.textContent = result.totalFound ?? '—';
    elements.detailSuccess.textContent = result.successCount ?? '—';
    elements.detailPartial.textContent = result.partialCount ?? '—';
    elements.detailBlocked.textContent = result.blockedCount ?? '—';
    elements.detailAverage.textContent = formatMoney(result.averagePriceUsd);
    elements.detailMedian.textContent = formatMoney(result.medianPriceUsd);
    elements.detailDuration.textContent = formatDuration(result.durationMs);
    elements.detailCompleted.textContent = formatDate(entry.completedAt);
    const error = entry.error || result.error || '';
    elements.detailError.hidden = !error;
    elements.detailError.textContent = error;
    await loadRunFiles(entry.runId);
  }

  async function loadRunFiles(runId) {
    elements.runFiles.replaceChildren();
    elements.filesEmpty.hidden = false;
    if (!runId || !state.apiKey) return;
    try {
      const payload = await api(`/runs/${encodeURIComponent(runId)}/files`);
      const files = Array.isArray(payload.files) ? payload.files : [];
      elements.filesEmpty.hidden = files.length > 0;
      for (const file of files) {
        const button = createElement('button', 'file-button');
        button.type = 'button';
        const iconWrap = createElement('span', 'file-icon');
        const icon = createElement('i');
        icon.dataset.lucide = file.name.endsWith('.csv') ? 'sheet' : 'braces';
        iconWrap.append(icon);
        const copy = createElement('span');
        copy.append(createElement('strong', '', file.label), createElement('small', '', `${file.name} · ${formatBytes(file.sizeBytes)}`));
        const download = createElement('i');
        download.dataset.lucide = 'download';
        button.append(iconWrap, copy, download);
        button.addEventListener('click', () => void downloadRunFile(file));
        elements.runFiles.append(button);
      }
      refreshIcons();
    } catch (error) {
      elements.filesEmpty.textContent = 'Файлы пока недоступны.';
      elements.filesEmpty.hidden = false;
    }
  }

  async function downloadRunFile(file) {
    try {
      const response = await fetch(file.downloadPath, { headers: { Authorization: `Bearer ${state.apiKey}` } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      showToast('Файл подготовлен', file.name);
    } catch (error) {
      showToast('Не удалось скачать файл', error.message, 'error');
    }
  }

  function updateResearchSummary() {
    const query = elements.queryInput.value.trim();
    const pages = Number(elements.pagesInput.value);
    const listings = Number(elements.listingsInput.value);
    elements.pagesOutput.value = String(pages);
    elements.pagesOutput.textContent = String(pages);
    elements.listingsOutput.value = String(listings);
    elements.listingsOutput.textContent = String(listings);
    elements.summaryQuery.textContent = query || 'Новый поисковый сигнал';
    elements.summaryPages.textContent = String(pages);
    elements.summaryListings.textContent = `${listings} товаров`;
    elements.summaryAi.textContent = elements.useLlmInput.checked ? elements.providerInput.value : 'Выключен';
    elements.llmFields.hidden = !elements.useLlmInput.checked;
    const effort = Math.min(100, Math.max(8, Math.round(((pages / 10) * .45 + (listings / 500) * .55) * 100)));
    const effortClass = effort < 30 ? 'low' : effort < 65 ? 'medium' : 'high';
    elements.effortBar.className = `effort-${effortClass}`;
    elements.effortLabel.textContent = effortClass === 'low' ? 'Низкая' : effortClass === 'medium' ? 'Средняя' : 'Высокая';
  }

  function updateCurrentJob(job) {
    elements.currentJobPanel.hidden = false;
    elements.currentJobQuery.textContent = job.query || 'Исследование';
    elements.currentJobId.textContent = job.id;
    setStatusBadge(elements.currentJobStatus, job.status);
    const startedAt = job.startedAt ? new Date(job.startedAt).getTime() : new Date(job.queuedAt).getTime();
    const endedAt = job.completedAt ? new Date(job.completedAt).getTime() : Date.now();
    elements.currentJobElapsed.textContent = formatDuration(Math.max(0, endedAt - startedAt));
    elements.jobProgressTrack.className = 'indeterminate-track';
    if (job.status === 'completed') elements.jobProgressTrack.classList.add('is-complete');
    if (job.status === 'failed') elements.jobProgressTrack.classList.add('is-failed');
    elements.currentJobMessage.textContent = job.status === 'queued'
      ? 'Задание ожидает свободного рабочего потока.'
      : job.status === 'running'
        ? 'Собираем и нормализуем рыночные сигналы…'
        : job.status === 'completed'
          ? `Готово: найдено ${job.result?.totalFound ?? 0} позиций.`
          : job.error || job.result?.error || 'Исследование завершилось с ошибкой.';
  }

  function startPolling() {
    if (state.pollTimer) window.clearInterval(state.pollTimer);
    if (!state.currentJobId) return;
    void pollCurrentJob();
    state.pollTimer = window.setInterval(() => void pollCurrentJob(), 4000);
  }

  async function pollCurrentJob() {
    if (!state.currentJobId || !state.apiKey) return;
    try {
      const job = await api(`/jobs/${encodeURIComponent(state.currentJobId)}`);
      updateCurrentJob(job);
      if (job.status === 'completed' || job.status === 'failed') {
        window.clearInterval(state.pollTimer);
        state.pollTimer = null;
        showToast(job.status === 'completed' ? 'Исследование завершено' : 'Исследование остановлено', job.status === 'completed' ? 'Отчёт готов к просмотру.' : (job.error || job.result?.error || 'Проверьте детали запуска.'), job.status === 'completed' ? 'success' : 'error');
        await refreshProtectedData();
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        window.clearInterval(state.pollTimer);
        state.pollTimer = null;
      }
    }
  }

  async function submitResearch(event) {
    event.preventDefault();
    const query = elements.queryInput.value.trim();
    elements.queryError.hidden = Boolean(query);
    if (!query) {
      elements.queryInput.focus();
      return;
    }
    if (!state.apiKey) {
      openAccessDialog('Подключите API-ключ перед запуском исследования.');
      return;
    }

    const payload = {
      query,
      pages: Number(elements.pagesInput.value),
      maxListings: Number(elements.listingsInput.value),
      currency: elements.currencyInput.value,
      country: elements.countryInput.value,
      language: elements.languageInput.value,
      useLlm: elements.useLlmInput.checked,
      llmProvider: elements.providerInput.value,
      llmModel: elements.modelInput.value.trim(),
    };

    elements.submitResearchButton.disabled = true;
    try {
      const created = await api('/jobs', { method: 'POST', body: JSON.stringify(payload) });
      state.currentJobId = created.jobId;
      updateCurrentJob({ id: created.jobId, query, status: created.status, queuedAt: new Date().toISOString() });
      startPolling();
      showToast('Исследование принято', created.queuePosition ? `Позиция в очереди: ${created.queuePosition}` : 'Запуск начался.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) openAccessDialog('API-ключ не принят сервером.');
      else showToast('Не удалось запустить исследование', error.message, 'error');
    } finally {
      elements.submitResearchButton.disabled = false;
    }
  }

  function openAccessDialog(message = '') {
    elements.accessError.hidden = !message;
    elements.accessError.textContent = message;
    elements.apiKeyInput.value = state.apiKey;
    elements.readOnlyButton.textContent = state.apiKey ? 'Отключить ключ' : 'Только статус';
    if (!elements.accessDialog.open) elements.accessDialog.showModal();
    window.setTimeout(() => elements.apiKeyInput.focus(), 50);
  }

  function clearApiKey(showMessage = true) {
    state.apiKey = '';
    sessionStorage.removeItem(API_KEY_STORAGE);
    state.jobs = [];
    state.runs = [];
    state.selectedId = '';
    renderOverviewJobs();
    renderRunsList();
    updateConnectionUi(Boolean(state.health), state.health ? 'Production онлайн' : 'Нет соединения');
    if (showMessage) showToast('API-ключ отключён', 'Панель оставлена в режиме просмотра статуса.');
  }

  async function connectAccess(event) {
    event.preventDefault();
    const candidate = elements.apiKeyInput.value.trim();
    if (candidate.length < 24) {
      elements.accessError.textContent = 'Ключ должен содержать не менее 24 символов.';
      elements.accessError.hidden = false;
      return;
    }
    elements.connectButton.disabled = true;
    elements.accessError.hidden = true;
    try {
      await api('/jobs', { apiKeyOverride: candidate });
      state.apiKey = candidate;
      sessionStorage.setItem(API_KEY_STORAGE, candidate);
      elements.accessDialog.close();
      updateConnectionUi(true, 'API подключён');
      showToast('Доступ подтверждён', 'Можно запускать исследования и скачивать отчёты.');
      await refreshProtectedData();
    } catch (error) {
      elements.accessError.textContent = error instanceof ApiError && error.status === 401 ? 'Сервер не принял этот API-ключ.' : `Не удалось подключиться: ${error.message}`;
      elements.accessError.hidden = false;
    } finally {
      elements.connectButton.disabled = false;
    }
  }

  function setupEvents() {
    document.querySelectorAll('[data-view-target]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.viewTarget)));
    document.querySelectorAll('[data-query-preset]').forEach((button) => button.addEventListener('click', () => {
      elements.queryInput.value = button.dataset.queryPreset;
      updateResearchSummary();
      elements.queryInput.focus();
    }));
    [elements.queryInput, elements.pagesInput, elements.listingsInput, elements.useLlmInput, elements.providerInput].forEach((input) => input.addEventListener('input', updateResearchSummary));
    elements.researchForm.addEventListener('submit', submitResearch);
    elements.refreshButton.addEventListener('click', () => void refreshAll());
    elements.accessButton.addEventListener('click', () => openAccessDialog());
    elements.accessForm.addEventListener('submit', connectAccess);
    elements.toggleKeyButton.addEventListener('click', () => {
      const showing = elements.apiKeyInput.type === 'text';
      elements.apiKeyInput.type = showing ? 'password' : 'text';
      elements.toggleKeyButton.setAttribute('aria-label', showing ? 'Показать ключ' : 'Скрыть ключ');
      const icon = elements.toggleKeyButton.querySelector('svg');
      if (icon) icon.outerHTML = `<i data-lucide="${showing ? 'eye' : 'eye-off'}" aria-hidden="true"></i>`;
      refreshIcons();
    });
    elements.readOnlyButton.addEventListener('click', () => {
      if (state.apiKey) clearApiKey();
      elements.accessDialog.close();
    });
    document.querySelectorAll('[data-run-mode]').forEach((button) => button.addEventListener('click', () => {
      state.runMode = button.dataset.runMode;
      state.selectedId = '';
      document.querySelectorAll('[data-run-mode]').forEach((item) => item.classList.toggle('is-active', item === button));
      elements.detailEmpty.hidden = false;
      elements.detailContent.hidden = true;
      renderRunsList();
    }));
    elements.runSearch.addEventListener('input', renderRunsList);
    elements.openJobButton.addEventListener('click', () => {
      showView('runs');
      const job = state.jobs.find((item) => item.id === state.currentJobId);
      if (job) void selectEntry(normalizeJob(job));
    });
  }

  async function init() {
    refreshIcons();
    setupEvents();
    updateResearchSummary();
    await refreshHealth();
    if (state.apiKey) await refreshProtectedData();
    else window.setTimeout(() => openAccessDialog(), 250);
    window.setInterval(() => void refreshHealth(), 30000);
  }

  void init();
})();

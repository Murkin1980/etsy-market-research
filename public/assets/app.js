(() => {
  'use strict';

  const API_KEY_STORAGE = 'etsy-signal-lab-api-key';
  const viewMeta = {
    overview: ['Рабочее пространство', 'Обзор исследований'],
    research: ['Новый запуск', 'Создать исследование'],
    runs: ['Архив данных', 'Запуски и отчёты'],
    billing: ['Аккаунт и доступ', 'Тариф и лимиты'],
  };

  const state = {
    apiKey: sessionStorage.getItem(API_KEY_STORAGE) || '',
    csrfToken: '',
    user: null,
    authType: '',
    health: null,
    jobs: [],
    runs: [],
    runMode: 'jobs',
    selectedId: '',
    selectedRunId: '',
    currentJobId: '',
    pollTimer: null,
    currentView: 'overview',
    etsyApiStatus: 'missing',
    billing: null,
    billingAccounts: [],
    comparisonMode: false,
    comparisonRunIds: new Set(),
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
    authTabs: $('authTabs'),
    accessLead: $('accessLead'),
    loginForm: $('loginForm'),
    loginEmailInput: $('loginEmailInput'),
    loginPasswordInput: $('loginPasswordInput'),
    loginError: $('loginError'),
    loginButton: $('loginButton'),
    registerForm: $('registerForm'),
    registerNameInput: $('registerNameInput'),
    registerEmailInput: $('registerEmailInput'),
    registerPasswordInput: $('registerPasswordInput'),
    inviteCodeInput: $('inviteCodeInput'),
    registerError: $('registerError'),
    registerButton: $('registerButton'),
    accessForm: $('accessForm'),
    apiKeyInput: $('apiKeyInput'),
    accessError: $('accessError'),
    toggleKeyButton: $('toggleKeyButton'),
    readOnlyButton: $('readOnlyButton'),
    connectButton: $('connectButton'),
    accountButtonText: $('accountButtonText'),
    accountSession: $('accountSession'),
    accountAvatar: $('accountAvatar'),
    accountName: $('accountName'),
    accountEmail: $('accountEmail'),
    accountRole: $('accountRole'),
    inviteTool: $('inviteTool'),
    inviteRoleInput: $('inviteRoleInput'),
    createInviteButton: $('createInviteButton'),
    createdInviteOutput: $('createdInviteOutput'),
    closeAccountButton: $('closeAccountButton'),
    logoutButton: $('logoutButton'),
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
    etsyApiPanel: $('etsyApiPanel'),
    etsyApiStatusMark: $('etsyApiStatusMark'),
    etsyApiStatusText: $('etsyApiStatusText'),
    etsyApiSettingsButton: $('etsyApiSettingsButton'),
    etsyApiDialog: $('etsyApiDialog'),
    etsyApiForm: $('etsyApiForm'),
    etsyKeystringInput: $('etsyKeystringInput'),
    etsySharedSecretInput: $('etsySharedSecretInput'),
    etsyApiError: $('etsyApiError'),
    toggleEtsySecretButton: $('toggleEtsySecretButton'),
    cancelEtsyApiButton: $('cancelEtsyApiButton'),
    saveEtsyApiButton: $('saveEtsyApiButton'),
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
    aiAnalysisStatus: $('aiAnalysisStatus'),
    aiAnalysisEmpty: $('aiAnalysisEmpty'),
    aiAnalysisLoading: $('aiAnalysisLoading'),
    aiAnalysisError: $('aiAnalysisError'),
    aiAnalysisContent: $('aiAnalysisContent'),
    analyzeReportButton: $('analyzeReportButton'),
    runFiles: $('runFiles'),
    filesEmpty: $('filesEmpty'),
    billingStatusBadge: $('billingStatusBadge'),
    currentPlanName: $('currentPlanName'),
    currentPlanPrice: $('currentPlanPrice'),
    researchUsageText: $('researchUsageText'),
    researchUsageBar: $('researchUsageBar'),
    aiUsageText: $('aiUsageText'),
    aiUsageBar: $('aiUsageBar'),
    billingPeriod: $('billingPeriod'),
    quotaList: $('quotaList'),
    checkoutReadiness: $('checkoutReadiness'),
    pricingGrid: $('pricingGrid'),
    billingAdmin: $('billingAdmin'),
    billingAccountsBody: $('billingAccountsBody'),
    toastRegion: $('toastRegion'),
    compareModeButton: $('compareModeButton'),
    compareButton: $('compareButton'),
    compareCount: $('compareCount'),
    comparisonPanel: $('comparisonPanel'),
    comparisonLoading: $('comparisonLoading'),
    comparisonError: $('comparisonError'),
    comparisonContent: $('comparisonContent'),
    closeComparisonButton: $('closeComparisonButton'),
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

  function isSafeEtsyUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && (url.hostname === 'etsy.com' || url.hostname.endsWith('.etsy.com'));
    } catch {
      return false;
    }
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

  function hasAccess() {
    return Boolean(state.user || state.apiKey);
  }

  function isAdmin() {
    return state.user?.role === 'admin' || state.authType === 'api-key';
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const apiKey = options.apiKeyOverride !== undefined ? options.apiKeyOverride : state.apiKey;
    if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (state.csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(options.method || 'GET').toUpperCase())) {
      headers.set('X-CSRF-Token', state.csrfToken);
    }

    const response = await fetch(path, { credentials: 'same-origin', ...options, headers });
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
    if ((viewName === 'runs' || viewName === 'billing') && hasAccess()) void refreshProtectedData();
    if (viewName === 'billing' && !hasAccess()) openAccessDialog('Войдите, чтобы увидеть тариф и лимиты.');
  }

  function updateConnectionUi(online, message) {
    const dot = elements.liveState.querySelector('.status-dot');
    const liveText = elements.liveState.querySelector('span:last-child');
    [dot, elements.sidebarStatusDot].forEach((item) => {
      item.classList.toggle('is-online', online);
      item.classList.toggle('is-error', !online);
    });
    liveText.textContent = message;
    elements.sidebarStatusText.textContent = online ? (hasAccess() ? 'Рабочее пространство подключено' : 'Сервер доступен') : 'Сервер недоступен';
  }

  function canLaunchResearch() {
    const quotaAvailable = !state.billing || state.billing.unlimited || state.billing.remaining?.research > 0;
    return Boolean(state.health) && quotaAvailable && (
      state.health.dataSource !== 'etsy-api' || state.etsyApiStatus === 'verified'
    );
  }

  function updateEtsyApiUi(health) {
    const status = health.etsyApiStatus || (health.etsyApiConfigured ? 'configured' : 'missing');
    state.etsyApiStatus = status;
    const labels = {
      verified: 'Подключён и проверен официальным API',
      checking: 'Проверяем сохранённый ключ…',
      invalid: 'Ключ отклонён Etsy — замените его',
      configured: 'Ключ сохранён, ожидается проверка',
      missing: 'Добавьте keystring и shared secret',
    };
    elements.etsyApiStatusText.textContent = labels[status] || labels.missing;
    elements.etsyApiPanel.classList.toggle('is-verified', status === 'verified');
    elements.etsyApiPanel.classList.toggle('is-checking', status === 'checking' || status === 'configured');
    elements.etsyApiPanel.classList.toggle('is-invalid', status === 'invalid');
    elements.etsyApiSettingsButton.querySelector('span').textContent = status === 'verified' ? 'Заменить ключ' : 'Настроить';
    elements.submitResearchButton.disabled = !canLaunchResearch();
    elements.submitResearchButton.title = elements.submitResearchButton.disabled
      ? 'Сначала подключите и проверьте Etsy Open API'
      : '';
  }

  async function refreshHealth() {
    try {
      const health = await api('/health', { apiKeyOverride: '' });
      state.health = health;
      updateEtsyApiUi(health);
      updateConnectionUi(true, state.etsyApiStatus === 'verified' ? 'Etsy API подключён' : 'Требуется настройка Etsy API');
      elements.sidebarStatusText.textContent = state.etsyApiStatus === 'verified' ? 'Etsy API подключён' : 'Настройте Etsy API';
      $('metricActive').textContent = String(health.activeJobs ?? 0);
      $('metricQueued').textContent = String(health.queuedJobs ?? 0);
      $('metricRetained').textContent = String(health.retainedJobs ?? 0);
      $('metricMaxConcurrent').textContent = String(health.maxConcurrent ?? 0);
      $('metricUptime').textContent = formatUptime(Number(health.uptime));
      $('orbitValue').textContent = String(health.activeJobs ?? 0);
      return true;
    } catch (error) {
      updateConnectionUi(false, 'Нет соединения');
      elements.submitResearchButton.disabled = true;
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
    if (!hasAccess()) {
      renderOverviewJobs();
      renderRunsList();
      return;
    }
    try {
      const [jobsPayload, runsPayload, billingPayload, accountsPayload] = await Promise.all([
        api('/jobs'),
        api('/runs'),
        api('/billing/status'),
        isAdmin() ? api('/admin/accounts') : Promise.resolve({ accounts: [] }),
      ]);
      state.jobs = Array.isArray(jobsPayload.jobs) ? jobsPayload.jobs : [];
      state.runs = Array.isArray(runsPayload.runs) ? runsPayload.runs : [];
      state.billing = billingPayload;
      state.billingAccounts = Array.isArray(accountsPayload.accounts) ? accountsPayload.accounts : [];
      elements.jobsCount.textContent = String(state.jobs.length);
      elements.runsCount.textContent = String(state.runs.length);
      renderOverviewJobs();
      renderRunsList();
      renderBilling();

      const active = [...state.jobs].reverse().find((job) => job.status === 'running' || job.status === 'queued');
      if (active && !state.currentJobId) {
        state.currentJobId = active.id;
        updateCurrentJob(active);
        startPolling();
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearAccess(false);
        openAccessDialog('Сессия завершена. Войдите снова.');
      } else {
        showToast('Не удалось обновить данные', error.message, 'error');
      }
    }
  }

  function usagePercent(used, limit) {
    if (!Number.isFinite(limit) || limit <= 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  }

  function billingStatusLabel(status) {
    return ({ trialing: 'Пробный', active: 'Активен', past_due: 'Нужна оплата', canceled: 'Завершён' })[status] || 'Активен';
  }

  function renderBilling() {
    const billing = state.billing;
    if (!billing) return;
    const plan = billing.plan;
    const unlimited = Boolean(billing.unlimited);
    elements.currentPlanName.textContent = plan.name;
    elements.currentPlanPrice.textContent = unlimited || plan.monthlyPriceUsd === 0 ? 'Без оплаты' : `$${plan.monthlyPriceUsd} / месяц`;
    elements.billingStatusBadge.textContent = unlimited ? 'Без лимита' : billingStatusLabel(billing.subscription?.status);
    elements.checkoutReadiness.textContent = billing.checkoutConfigured ? 'Paddle подключён' : 'Ожидает настройки Paddle';
    elements.checkoutReadiness.classList.toggle('is-warning', !billing.checkoutConfigured);
    elements.quotaList.hidden = unlimited;
    if (!unlimited) {
      const researchLimit = plan.limits.research;
      const aiLimit = plan.limits.aiAnalysis;
      elements.researchUsageText.textContent = `${billing.usage.research} из ${researchLimit}`;
      elements.aiUsageText.textContent = `${billing.usage.aiAnalysis} из ${aiLimit}`;
      elements.researchUsageBar.style.width = `${usagePercent(billing.usage.research, researchLimit)}%`;
      elements.aiUsageBar.style.width = `${usagePercent(billing.usage.aiAnalysis, aiLimit)}%`;
      elements.billingPeriod.textContent = `Период ${billing.usage.period} · осталось исследований: ${billing.remaining.research}, AI-анализов: ${billing.remaining.aiAnalysis}`;
      elements.listingsInput.max = String(plan.limits.maxListings);
      if (Number(elements.listingsInput.value) > plan.limits.maxListings) elements.listingsInput.value = String(plan.limits.maxListings);
    } else {
      elements.billingPeriod.textContent = 'Служебный доступ владельца не расходует пользовательские квоты.';
      elements.listingsInput.max = '500';
    }
    updateResearchSummary();
    elements.submitResearchButton.disabled = !canLaunchResearch();
    renderPricingPlans(billing.plans || []);
    renderBillingAccounts();
  }

  function renderPricingPlans(plans) {
    elements.pricingGrid.replaceChildren();
    for (const plan of plans) {
      const card = createElement('article', `pricing-card${state.billing?.plan?.id === plan.id ? ' is-current' : ''}`);
      const head = createElement('div', 'pricing-card-head');
      head.append(createElement('h3', '', plan.name));
      if (state.billing?.plan?.id === plan.id) head.append(createElement('span', 'mini-badge', 'Текущий'));
      const price = createElement('div', 'pricing-price');
      price.textContent = plan.monthlyPriceUsd === 0 ? '$0' : `$${plan.monthlyPriceUsd}`;
      price.append(createElement('small', '', ' / месяц'));
      const features = createElement('ul', 'pricing-features');
      [
        `${plan.limits.research} исследований в месяц`,
        `${plan.limits.aiAnalysis} AI-анализов в месяц`,
        `до ${plan.limits.maxListings} листингов за запуск`,
      ].forEach((label) => {
        const item = createElement('li');
        const icon = createElement('i');
        icon.dataset.lucide = 'check';
        item.append(icon, document.createTextNode(label));
        features.append(item);
      });
      const button = createElement('button', plan.id === 'trial' ? 'secondary-button' : 'primary-button');
      button.type = 'button';
      const isCurrent = state.billing?.plan?.id === plan.id;
      button.disabled = isCurrent || plan.id === 'trial' || !state.billing?.checkoutConfigured || state.billing?.unlimited;
      button.textContent = isCurrent ? 'Текущий тариф' : plan.id === 'trial' ? 'Включён при регистрации' : state.billing?.checkoutConfigured ? `Выбрать ${plan.name}` : 'Скоро доступно';
      if (!button.disabled) button.addEventListener('click', () => void startCheckout(plan.id, button));
      card.append(head, price, features, button);
      elements.pricingGrid.append(card);
    }
    refreshIcons();
  }

  function renderBillingAccounts() {
    elements.billingAdmin.hidden = !isAdmin();
    elements.billingAccountsBody.replaceChildren();
    if (!isAdmin()) return;
    for (const account of state.billingAccounts) {
      const row = document.createElement('tr');
      const userCell = document.createElement('td');
      userCell.append(createElement('strong', '', account.name), createElement('span', '', account.email));
      const roleCell = createElement('td', '', account.role === 'admin' ? 'Администратор' : 'Участник');
      const planCell = document.createElement('td');
      const select = document.createElement('select');
      select.setAttribute('aria-label', `Тариф ${account.name}`);
      for (const plan of state.billing.plans || []) {
        const option = document.createElement('option');
        option.value = plan.id;
        option.textContent = plan.name;
        option.selected = plan.id === account.billing.plan.id;
        select.append(option);
      }
      select.addEventListener('change', () => void updateAccountPlan(account.id, select.value, select));
      planCell.append(select);
      const usageCell = createElement('td', '', `${account.billing.usage.research} исследований · ${account.billing.usage.aiAnalysis} AI`);
      row.append(userCell, roleCell, planCell, usageCell);
      elements.billingAccountsBody.append(row);
    }
  }

  async function startCheckout(planId, button) {
    button.disabled = true;
    try {
      const payload = await api('/billing/checkout', { method: 'POST', body: JSON.stringify({ planId }) });
      const checkoutUrl = new URL(payload.checkoutUrl);
      if (checkoutUrl.protocol !== 'https:' || (checkoutUrl.hostname !== 'paddle.com' && !checkoutUrl.hostname.endsWith('.paddle.com'))) throw new Error('Некорректная ссылка оплаты');
      window.location.assign(checkoutUrl.toString());
    } catch (error) {
      showToast('Не удалось открыть оплату', error.message, 'error');
      button.disabled = false;
    }
  }

  async function updateAccountPlan(accountId, planId, select) {
    select.disabled = true;
    try {
      await api(`/admin/accounts/${encodeURIComponent(accountId)}/plan`, { method: 'PUT', body: JSON.stringify({ planId }) });
      showToast('Тариф обновлён', 'Новые лимиты применены сразу.');
      await refreshProtectedData();
    } catch (error) {
      showToast('Не удалось обновить тариф', error.message, 'error');
      await refreshProtectedData();
    } finally {
      select.disabled = false;
    }
  }

  function handleQuotaError(error) {
    if (!(error instanceof ApiError) || error.status !== 402) return false;
    const isListingLimit = error.payload?.quota === 'maxListings';
    showToast(
      'Лимит тарифа',
      isListingLimit ? `Этот тариф поддерживает до ${error.payload.limit} листингов за запуск.` : 'Месячный лимит исчерпан. Откройте тарифы, чтобы увеличить объём.',
      'error',
    );
    showView('billing');
    void refreshProtectedData();
    return true;
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
      const selectedForComparison = state.comparisonRunIds.has(entry.id);
      const button = createElement('button', `run-row${state.selectedId === entry.id ? ' is-selected' : ''}${selectedForComparison ? ' is-compare-selected' : ''}`);
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
      button.addEventListener('click', () => {
        if (!state.comparisonMode) {
          void selectEntry(entry);
          return;
        }
        if (entry.status !== 'completed') {
          showToast('Сравнивать можно только готовые отчёты.', 'error');
          return;
        }
        if (selectedForComparison) state.comparisonRunIds.delete(entry.id);
        else if (state.comparisonRunIds.size < 5) state.comparisonRunIds.add(entry.id);
        else showToast('Можно выбрать не больше пяти ниш.', 'error');
        updateComparisonControls();
        renderRunsList();
      });
      elements.runsList.append(button);
    }
    refreshIcons();
  }

  function updateComparisonControls() {
    const count = state.comparisonRunIds.size;
    elements.compareModeButton.classList.toggle('is-active', state.comparisonMode);
    elements.compareModeButton.querySelector('span').textContent = state.comparisonMode ? 'Отменить выбор' : 'Выбрать для сравнения';
    elements.compareButton.hidden = !state.comparisonMode;
    elements.compareButton.disabled = count < 2;
    elements.compareCount.textContent = `${count} из 5 · Сравнить`;
  }

  function metricRow(label, niches, formatter, source) {
    const row = document.createElement('tr');
    const heading = document.createElement('th');
    heading.scope = 'row';
    heading.append(createElement('strong', '', label), createElement('small', `data-source source-${source}`, source === 'etsy' ? 'Данные Etsy' : 'Расчёт Signal Lab'));
    row.append(heading);
    for (const niche of niches) row.append(createElement('td', '', formatter(niche)));
    return row;
  }

  function renderComparison(payload) {
    const niches = payload?.comparison?.niches || [];
    const table = createElement('table', 'comparison-table');
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.append(document.createElement('th'));
    for (const niche of niches) headRow.append(createElement('th', '', niche.query));
    head.append(headRow);
    const body = document.createElement('tbody');
    body.append(
      metricRow('Товаров в выборке', niches, (n) => String(n.listings), 'calculation'),
      metricRow('Уникальных магазинов', niches, (n) => String(n.uniqueShops), 'calculation'),
      metricRow('Медианная цена', niches, (n) => formatMoney(n.medianPriceUsd), 'calculation'),
      metricRow('Диапазон цены', niches, (n) => `${formatMoney(n.priceMinUsd)} — ${formatMoney(n.priceMaxUsd)}`, 'calculation'),
      metricRow('Цифровые товары', niches, (n) => `${n.digitalSharePercent}%`, 'calculation'),
      metricRow('Покрытие favorites', niches, (n) => `${n.favoritesCoveragePercent}%`, 'calculation'),
      metricRow('Медиана favorites', niches, (n) => n.medianFavorites === null ? '—' : String(n.medianFavorites), 'calculation'),
      metricRow('Сильные сигналы', niches, (n) => `${n.highDemandSignals} high · ${n.mediumDemandSignals} medium`, 'calculation'),
      metricRow('Уверенность данных', niches, (n) => `${n.evidenceConfidencePercent}%`, 'calculation'),
      metricRow('Частые слова', niches, (n) => n.topKeywords.slice(0, 5).join(', ') || '—', 'calculation'),
    );
    table.append(head, body);
    elements.comparisonContent.replaceChildren(table);
    elements.comparisonContent.hidden = false;
  }

  async function compareSelectedRuns() {
    elements.comparisonPanel.hidden = false;
    elements.comparisonLoading.hidden = false;
    elements.comparisonError.hidden = true;
    elements.comparisonContent.hidden = true;
    try {
      const payload = await api('/comparisons', { method: 'POST', body: JSON.stringify({ runIds: [...state.comparisonRunIds] }) });
      renderComparison(payload);
      state.comparisonMode = false;
      state.comparisonRunIds.clear();
      updateComparisonControls();
      renderRunsList();
      elements.comparisonPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      elements.comparisonError.textContent = error.message || 'Не удалось сравнить отчёты.';
      elements.comparisonError.hidden = false;
    } finally {
      elements.comparisonLoading.hidden = true;
    }
  }

  async function selectEntry(entry) {
    state.selectedId = entry.id;
    state.selectedRunId = entry.runId || '';
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
    setReportTab('summary');
    const error = entry.error || result.error || '';
    elements.detailError.hidden = !error;
    elements.detailError.textContent = error;
    await Promise.all([loadRunFiles(entry.runId), loadAiAnalysis(entry.runId)]);
  }

  function setReportTab(tabName) {
    document.querySelectorAll('[data-report-tab]').forEach((button) => {
      const active = button.dataset.reportTab === tabName;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-report-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.reportPanel !== tabName;
    });
  }

  function setAiAnalysisState(mode, message = '') {
    elements.aiAnalysisEmpty.hidden = mode !== 'empty';
    elements.aiAnalysisLoading.hidden = mode !== 'loading';
    elements.aiAnalysisContent.hidden = mode !== 'ready';
    elements.aiAnalysisError.hidden = mode !== 'error';
    elements.aiAnalysisStatus.className = `ai-status ai-status-${mode}`;
    elements.aiAnalysisStatus.textContent = ({
      empty: 'Не создан',
      loading: 'Анализируем',
      ready: 'Готов',
      error: 'Ошибка',
    })[mode] || 'Нет данных';
    if (mode === 'error') elements.aiAnalysisError.textContent = message;
  }

  function appendStringList(parent, title, items, className = '') {
    if (!Array.isArray(items) || items.length === 0) return;
    const section = createElement('section', `ai-analysis-block${className ? ` ${className}` : ''}`);
    section.append(createElement('h4', '', title));
    const list = createElement('ul');
    for (const item of items) list.append(createElement('li', '', item));
    section.append(list);
    parent.append(section);
  }

  function renderAiAnalysis(payload) {
    const analysis = payload.analysis;
    if (!analysis) {
      setAiAnalysisState('empty');
      elements.analyzeReportButton.disabled = !payload.configured;
      elements.analyzeReportButton.title = payload.configured ? '' : 'OpenAI API не настроен на сервере';
      return;
    }

    elements.aiAnalysisContent.replaceChildren();
    const summary = payload.summary || {};
    const market = analysis.marketSummary || {};
    const quality = summary.signalCoverage || {};
    const metrics = createElement('div', 'ai-metric-grid');
    [
      ['Объявления', summary.listingCount ?? market.analyzedListings ?? '—'],
      ['Магазины', summary.uniqueShops ?? '—'],
      ['Медиана', formatMoney(summary.pricesUsd?.median ?? market.medianPriceUsd)],
      ['Уверенность', Number.isFinite(quality.averageConfidence) ? `${Math.round(quality.averageConfidence * 100)}%` : '—'],
    ].forEach(([label, value]) => {
      const item = createElement('div');
      item.append(createElement('span', '', String(label)), createElement('strong', '', String(value)));
      metrics.append(item);
    });
    elements.aiAnalysisContent.append(metrics);

    if (Array.isArray(summary.warnings) && summary.warnings.length > 0) {
      const warning = createElement('div', 'ai-quality-warning');
      const icon = createElement('i');
      icon.dataset.lucide = 'triangle-alert';
      const copy = createElement('div');
      copy.append(createElement('strong', '', 'Ограничения данных'));
      const list = createElement('ul');
      for (const item of summary.warnings) list.append(createElement('li', '', item));
      copy.append(list);
      warning.append(icon, copy);
      elements.aiAnalysisContent.append(warning);
    }

    const concept = analysis.newProductConcept;
    if (concept) {
      const conceptSection = createElement('section', 'ai-concept');
      const head = createElement('div', 'ai-concept-head');
      const copy = createElement('div');
      copy.append(createElement('span', 'eyebrow', 'Рекомендуемый продукт'), createElement('h4', '', concept.name));
      const price = concept.recommendedPriceMinUsd === null || concept.recommendedPriceMaxUsd === null
        ? 'Цена требует дополнительной проверки'
        : `${formatMoney(concept.recommendedPriceMinUsd)}–${formatMoney(concept.recommendedPriceMaxUsd)}`;
      head.append(copy, createElement('strong', 'ai-price', price));
      conceptSection.append(head, createElement('p', 'ai-positioning', concept.positioning), createElement('p', 'ai-usp', concept.mainUSP));
      appendStringList(conceptSection, 'Целевая аудитория', concept.targetAudience, 'compact');
      appendStringList(conceptSection, 'Комплектация', concept.includedItems);
      appendStringList(conceptSection, 'Бонусы', concept.bonuses);
      appendStringList(conceptSection, 'План изображений', concept.imagePlan);
      elements.aiAnalysisContent.append(conceptSection);
    }

    appendStringList(elements.aiAnalysisContent, 'Пробелы рынка', market.marketGaps);
    appendStringList(elements.aiAnalysisContent, 'Повторяющиеся функции', market.commonFeatures, 'compact');

    if (Array.isArray(analysis.recommendedFeatures) && analysis.recommendedFeatures.length > 0) {
      const features = createElement('section', 'ai-analysis-block');
      features.append(createElement('h4', '', 'Функции нового продукта'));
      const list = createElement('div', 'ai-feature-list');
      for (const feature of analysis.recommendedFeatures) {
        const item = createElement('div');
        item.append(createElement('span', `priority priority-${feature.priority}`, feature.priority.replace('_', ' ')));
        const copy = createElement('div');
        copy.append(createElement('strong', '', feature.name), createElement('p', '', feature.reason));
        item.append(copy);
        list.append(item);
      }
      features.append(list);
      elements.aiAnalysisContent.append(features);
    }

    if (Array.isArray(analysis.topProducts) && analysis.topProducts.length > 0) {
      const competitors = createElement('section', 'ai-analysis-block');
      competitors.append(createElement('h4', '', 'Наиболее доказательные конкуренты'));
      const list = createElement('div', 'ai-competitor-list');
      for (const product of analysis.topProducts) {
        const item = createElement('article');
        const title = product.url.startsWith('https://www.etsy.com/')
          ? createElement('a', '', product.title)
          : createElement('strong', '', product.title);
        if (title.tagName === 'A') {
          title.href = product.url;
          title.target = '_blank';
          title.rel = 'noopener noreferrer';
        }
        item.append(createElement('span', 'rank', `#${product.rank}`), title, createElement('p', '', product.mainUSP));
        list.append(item);
      }
      competitors.append(list);
      elements.aiAnalysisContent.append(competitors);
    }

    if (Array.isArray(payload.topShopLinks) && payload.topShopLinks.length > 0) {
      const shops = createElement('section', 'ai-analysis-block');
      shops.append(createElement('h4', '', 'Магазины сильных конкурентов'));
      const note = createElement('p', 'ai-shop-note', 'Ссылки взяты из исходных объявлений. Продажи магазина — косвенный сигнал, а не продажи конкретной карточки.');
      const list = createElement('div', 'ai-shop-list');
      for (const shop of payload.topShopLinks) {
        if (!isSafeEtsyUrl(shop.shopUrl) || !isSafeEtsyUrl(shop.listingUrl)) continue;
        const item = createElement('article');
        const shopLink = createElement('a', 'ai-shop-name', shop.shopName);
        shopLink.href = shop.shopUrl;
        shopLink.target = '_blank';
        shopLink.rel = 'noopener noreferrer';
        const listingLink = createElement('a', 'ai-shop-listing', 'Открыть карточку');
        listingLink.href = shop.listingUrl;
        listingLink.target = '_blank';
        listingLink.rel = 'noopener noreferrer';
        const signal = shop.shopSalesSignal === null
          ? 'Сигнал продаж магазина недоступен'
          : `${new Intl.NumberFormat('ru-RU').format(shop.shopSalesSignal)} продаж магазина`;
        item.append(shopLink, createElement('p', '', shop.listingTitle), createElement('span', 'ai-shop-signal', signal), listingLink);
        list.append(item);
      }
      if (list.childElementCount > 0) {
        shops.append(note, list);
        elements.aiAnalysisContent.append(shops);
      }
    }

    appendStringList(elements.aiAnalysisContent, 'Риски и следующие проверки', analysis.risks, 'risks');
    const actions = createElement('div', 'ai-analysis-actions');
    const refreshButton = createElement('button', 'secondary-button');
    refreshButton.type = 'button';
    refreshButton.append(createElement('i'), createElement('span', '', 'Обновить AI-анализ'));
    refreshButton.querySelector('i').dataset.lucide = 'refresh-cw';
    refreshButton.addEventListener('click', () => void analyzeSelectedReport(true));
    actions.append(refreshButton, createElement('small', '', `Модель: ${payload.model}`));
    elements.aiAnalysisContent.append(actions);
    setAiAnalysisState('ready');
    refreshIcons();
  }

  async function loadAiAnalysis(runId) {
    elements.aiAnalysisContent.replaceChildren();
    elements.analyzeReportButton.disabled = true;
    setAiAnalysisState('empty');
    if (!runId || !hasAccess()) return;
    try {
      const payload = await api(`/runs/${encodeURIComponent(runId)}/ai-analysis`);
      renderAiAnalysis(payload);
    } catch (error) {
      setAiAnalysisState('error', error.message);
    }
  }

  async function analyzeSelectedReport(force = false) {
    if (!state.selectedRunId) return;
    setAiAnalysisState('loading');
    try {
      const payload = await api(`/runs/${encodeURIComponent(state.selectedRunId)}/ai-analysis`, {
        method: 'POST',
        body: JSON.stringify({ force }),
      });
      renderAiAnalysis(payload);
      await loadRunFiles(state.selectedRunId);
      showToast('AI-анализ готов', 'Рекомендации сохранены вместе с файлами отчёта.');
    } catch (error) {
      setAiAnalysisState('error', error.message);
      if (!handleQuotaError(error)) showToast('Не удалось выполнить AI-анализ', error.message, 'error');
    }
  }

  async function loadRunFiles(runId) {
    elements.runFiles.replaceChildren();
    elements.filesEmpty.hidden = false;
    if (!runId || !hasAccess()) return;
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
      const headers = state.apiKey ? { Authorization: `Bearer ${state.apiKey}` } : {};
      const response = await fetch(file.downloadPath, { credentials: 'same-origin', headers });
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
    state.pollTimer = window.setInterval(() => void pollCurrentJob(), 10000);
  }

  async function pollCurrentJob() {
    if (!state.currentJobId || !hasAccess()) return;
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
    if (!hasAccess()) {
      openAccessDialog('Войдите в аккаунт перед запуском исследования.');
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
      if (error instanceof ApiError && error.status === 401) openAccessDialog('Сессия завершена. Войдите снова.');
      else if (!handleQuotaError(error)) showToast('Не удалось запустить исследование', error.message, 'error');
    } finally {
      elements.submitResearchButton.disabled = !canLaunchResearch();
    }
  }

  function openEtsyApiDialog() {
    if (!hasAccess()) {
      openAccessDialog('Сначала войдите в аккаунт.');
      return;
    }
    if (!isAdmin()) {
      showToast('Недостаточно прав', 'Настройки Etsy API доступны только администратору.', 'error');
      return;
    }
    elements.etsyApiError.hidden = true;
    elements.etsyKeystringInput.value = '';
    elements.etsySharedSecretInput.value = '';
    elements.etsySharedSecretInput.type = 'password';
    if (!elements.etsyApiDialog.open) elements.etsyApiDialog.showModal();
    window.setTimeout(() => elements.etsyKeystringInput.focus(), 50);
  }

  async function saveEtsyApiSettings(event) {
    event.preventDefault();
    const keystring = elements.etsyKeystringInput.value.trim();
    const sharedSecret = elements.etsySharedSecretInput.value.trim();
    if (!/^[^:\s]{8,128}$/.test(keystring) || !/^[^:\s]{8,128}$/.test(sharedSecret)) {
      elements.etsyApiError.textContent = 'Оба поля должны содержать не менее 8 символов, без пробелов и двоеточий.';
      elements.etsyApiError.hidden = false;
      return;
    }

    elements.saveEtsyApiButton.disabled = true;
    elements.etsyApiError.hidden = true;
    try {
      await api('/settings/etsy-api', {
        method: 'PUT',
        body: JSON.stringify({ keystring, sharedSecret }),
      });
      elements.etsyApiForm.reset();
      elements.etsyApiDialog.close();
      await refreshHealth();
      showToast('Etsy API подключён', 'Ключ проверен и сохранён на сервере в зашифрованном виде.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        elements.etsyApiDialog.close();
        openAccessDialog('Сессия завершена. Войдите снова.');
      } else {
        elements.etsyApiError.textContent = error.message;
        elements.etsyApiError.hidden = false;
      }
    } finally {
      elements.saveEtsyApiButton.disabled = false;
    }
  }

  function openAccessDialog(message = '') {
    renderAccountState();
    if (message) {
      setAuthMode('login');
      elements.loginError.textContent = message;
      elements.loginError.hidden = false;
    }
    if (!elements.accessDialog.open) elements.accessDialog.showModal();
    window.setTimeout(() => (hasAccess() ? elements.closeAccountButton : elements.loginEmailInput).focus(), 50);
  }

  function setAuthMode(mode) {
    document.querySelectorAll('[data-auth-panel]').forEach((panel) => { panel.hidden = panel.dataset.authPanel !== mode; });
    document.querySelectorAll('[data-auth-mode]').forEach((button) => {
      const active = button.dataset.authMode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
  }

  function renderAccountState() {
    const authenticated = hasAccess();
    elements.authTabs.hidden = authenticated;
    elements.accessLead.hidden = authenticated;
    elements.readOnlyButton.hidden = authenticated;
    document.querySelectorAll('[data-auth-panel]').forEach((panel) => { panel.hidden = authenticated || panel.dataset.authPanel !== 'login'; });
    elements.accountSession.hidden = !authenticated;
    elements.accountButtonText.textContent = authenticated ? (state.user?.name || 'Администратор') : 'Войти';
    elements.etsyApiSettingsButton.hidden = authenticated && !isAdmin();
    if (!authenticated) return;
    const user = state.user || { name: 'Production administrator', email: 'admin@local', role: 'admin' };
    elements.accountName.textContent = user.name;
    elements.accountEmail.textContent = user.email;
    elements.accountAvatar.textContent = user.name.trim().charAt(0).toUpperCase() || 'S';
    elements.accountRole.textContent = user.role === 'admin' ? 'Администратор' : 'Участник';
    elements.inviteTool.hidden = !isAdmin();
    elements.createdInviteOutput.hidden = true;
    elements.sidebarStatusText.textContent = 'Персональное пространство';
  }

  function applyAuthPayload(payload) {
    state.user = payload.user || null;
    state.authType = payload.authType || '';
    state.csrfToken = payload.csrfToken || '';
    renderAccountState();
  }

  function clearAccess(showMessage = true) {
    state.apiKey = '';
    state.user = null;
    state.authType = '';
    state.csrfToken = '';
    sessionStorage.removeItem(API_KEY_STORAGE);
    state.jobs = [];
    state.runs = [];
    state.selectedId = '';
    state.selectedRunId = '';
    renderOverviewJobs();
    renderRunsList();
    updateConnectionUi(Boolean(state.health), state.health ? 'Production онлайн' : 'Нет соединения');
    renderAccountState();
    if (showMessage) showToast('Вы вышли', 'Персональные данные скрыты до следующего входа.');
  }

  async function loginAccount(event) {
    event.preventDefault();
    elements.loginButton.disabled = true;
    elements.loginError.hidden = true;
    try {
      const payload = await api('/auth/login', {
        method: 'POST', apiKeyOverride: '',
        body: JSON.stringify({ email: elements.loginEmailInput.value.trim(), password: elements.loginPasswordInput.value }),
      });
      state.apiKey = '';
      sessionStorage.removeItem(API_KEY_STORAGE);
      applyAuthPayload(payload);
      elements.loginPasswordInput.value = '';
      elements.accessDialog.close();
      showToast('Вход выполнен', 'Открыто ваше персональное рабочее пространство.');
      await refreshProtectedData();
    } catch (error) {
      elements.loginError.textContent = error.message;
      elements.loginError.hidden = false;
    } finally {
      elements.loginButton.disabled = false;
    }
  }

  async function registerAccount(event) {
    event.preventDefault();
    elements.registerButton.disabled = true;
    elements.registerError.hidden = true;
    try {
      const payload = await api('/auth/register', {
        method: 'POST', apiKeyOverride: '',
        body: JSON.stringify({
          name: elements.registerNameInput.value.trim(), email: elements.registerEmailInput.value.trim(),
          password: elements.registerPasswordInput.value, inviteCode: elements.inviteCodeInput.value.trim(),
        }),
      });
      applyAuthPayload(payload);
      elements.registerPasswordInput.value = '';
      elements.inviteCodeInput.value = '';
      elements.accessDialog.close();
      showToast('Аккаунт создан', 'Ваше персональное рабочее пространство готово.');
      await refreshProtectedData();
    } catch (error) {
      elements.registerError.textContent = error.message;
      elements.registerError.hidden = false;
    } finally {
      elements.registerButton.disabled = false;
    }
  }

  async function logoutAccount() {
    try {
      if (state.authType === 'session') await api('/auth/logout', { method: 'POST', body: '{}' });
    } catch {
      // Local state is cleared even when the server session already expired.
    }
    clearAccess();
    elements.accessDialog.close();
  }

  async function createInvite() {
    elements.createInviteButton.disabled = true;
    try {
      const invite = await api('/admin/invites', {
        method: 'POST', body: JSON.stringify({ role: elements.inviteRoleInput.value }),
      });
      elements.createdInviteOutput.textContent = invite.code;
      elements.createdInviteOutput.hidden = false;
      showToast('Приглашение создано', 'Передайте код нужному пользователю по защищённому каналу.');
    } catch (error) {
      showToast('Не удалось создать приглашение', error.message, 'error');
    } finally {
      elements.createInviteButton.disabled = false;
    }
  }

  async function restoreAccess() {
    try {
      const payload = await api('/auth/me');
      if (!payload.authenticated) {
        clearAccess(false);
        return false;
      }
      applyAuthPayload(payload);
      return true;
    } catch {
      clearAccess(false);
      return false;
    }
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
      const authPayload = await api('/auth/me', { apiKeyOverride: candidate });
      applyAuthPayload(authPayload);
      elements.accessDialog.close();
      updateConnectionUi(true, 'Администратор подключён');
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
    elements.etsyApiSettingsButton.addEventListener('click', openEtsyApiDialog);
    elements.etsyApiForm.addEventListener('submit', saveEtsyApiSettings);
    elements.cancelEtsyApiButton.addEventListener('click', () => elements.etsyApiDialog.close());
    elements.toggleEtsySecretButton.addEventListener('click', () => {
      const showing = elements.etsySharedSecretInput.type === 'text';
      elements.etsySharedSecretInput.type = showing ? 'password' : 'text';
      elements.toggleEtsySecretButton.setAttribute('aria-label', showing ? 'Показать shared secret' : 'Скрыть shared secret');
      const icon = elements.toggleEtsySecretButton.querySelector('svg');
      if (icon) icon.outerHTML = `<i data-lucide="${showing ? 'eye' : 'eye-off'}" aria-hidden="true"></i>`;
      refreshIcons();
    });
    elements.refreshButton.addEventListener('click', () => void refreshAll());
    elements.accessButton.addEventListener('click', () => openAccessDialog());
    document.querySelectorAll('[data-auth-mode]').forEach((button) => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));
    elements.loginForm.addEventListener('submit', loginAccount);
    elements.registerForm.addEventListener('submit', registerAccount);
    elements.accessForm.addEventListener('submit', connectAccess);
    elements.logoutButton.addEventListener('click', () => void logoutAccount());
    elements.closeAccountButton.addEventListener('click', () => elements.accessDialog.close());
    elements.createInviteButton.addEventListener('click', () => void createInvite());
    elements.toggleKeyButton.addEventListener('click', () => {
      const showing = elements.apiKeyInput.type === 'text';
      elements.apiKeyInput.type = showing ? 'password' : 'text';
      elements.toggleKeyButton.setAttribute('aria-label', showing ? 'Показать ключ' : 'Скрыть ключ');
      const icon = elements.toggleKeyButton.querySelector('svg');
      if (icon) icon.outerHTML = `<i data-lucide="${showing ? 'eye' : 'eye-off'}" aria-hidden="true"></i>`;
      refreshIcons();
    });
    elements.readOnlyButton.addEventListener('click', () => {
      elements.accessDialog.close();
    });
    document.querySelectorAll('[data-run-mode]').forEach((button) => button.addEventListener('click', () => {
      state.runMode = button.dataset.runMode;
      state.selectedId = '';
      state.selectedRunId = '';
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
    elements.analyzeReportButton.addEventListener('click', () => void analyzeSelectedReport(false));
    elements.compareModeButton.addEventListener('click', () => {
      state.comparisonMode = !state.comparisonMode;
      state.comparisonRunIds.clear();
      updateComparisonControls();
      renderRunsList();
    });
    elements.compareButton.addEventListener('click', () => void compareSelectedRuns());
    elements.closeComparisonButton.addEventListener('click', () => { elements.comparisonPanel.hidden = true; });
    document.querySelectorAll('[data-report-tab]').forEach((button) => button.addEventListener('click', () => setReportTab(button.dataset.reportTab)));
  }

  async function init() {
    refreshIcons();
    setupEvents();
    updateResearchSummary();
    updateComparisonControls();
    await refreshHealth();
    const restored = await restoreAccess();
    if (restored) await refreshProtectedData();
    else window.setTimeout(() => openAccessDialog(), 250);
    window.setInterval(() => void refreshHealth(), 30000);
  }

  void init();
})();

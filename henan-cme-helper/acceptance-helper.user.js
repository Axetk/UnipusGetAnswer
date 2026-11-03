// ==UserScript==
// @name         河南省继续医学教育学习平台[AI答题][一键启动][最小化运行]
// @namespace    my-study-site-controlled-payment-acceptance
// @version      5.5.56.1017
// @updateURL    https://api.axetk.icu/payment-test/portal/acceptance-helper.user.js
// @downloadURL  https://api.axetk.icu/payment-test/portal/acceptance-helper.user.js
// @description  当前支持河南省继续医学教育学习平台视频+考试，脚本一键启动、全自动运行、可最小化运行不会中断；不占网速、不费流量，开热点也能用
// @author  清风徐来
// @match        https://yuancheng.henanyixue.com/*
// @run-at       document-start
// @grant        none
// @icon         data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACL0lEQVR4AexVPUtDQRDcd/BqP36AhQg2YiXYWCqo2NpYK0LEWKnpxC7RSkVBtLaxFRW0tBGs1EYQC3+AH62BxJmLG44zCfeSGBUiN7m3e7sz475wMeL8da2mezqW07mOlfQd8AEUmwRy3ZGbGo6klA3gcLZQlEeJZAUFA0AMNGuRa4Dc1KCWElsDNhHJAZIsxPajK4aRA6sJGWNHEskenlu7oEltUyjIApRjINHKjI6Li0TNpeKY2gbjmCzFyT4zYxPiIln3V3UkkwaP/cBvrX4aSDz+JrqNaSCIj+/7LbclCr9J89xZ659Xi4MNVCNoNN82EDyB7OW5dK4uleGP3j1jrX9eLQ42UI2g0fz/NZC9OBMX9U6i7gnwPbtouYF6Bf2+ihPgTXYyv2hvvdvMmij2pmdkpLfP5yjHPV3dor3s4a3InVzsLRc6D5UN4JdOhUiqmBkaFpKRVM/JxXPN8xeSZ8zpGWP2MvZR0YBf5Mckp6DmfUOaD9nrMhBCHFrTNvAnJpD339fz64tcPT3am+7o5loIxn5dpVh72cObknuN3jwn8OATDWbXZWp/R3jTpY6PhGCseZL6PRRxa9ij/czz19LvQfxgpCineAha+t+RnGa0iQIETWguaIe2MUZ2UfztNSBXc9GMFiQWLjXmqW1ec9vPmEKqlGvhZ1FS1OZ3QN43tw9hYg7yiSeBnqQrTy2riU5rALs1YSLpw+EG4nugKWbAw0Wue3JTQ8V58AkAAP//QnN1AQAAAAZJREFUAwA3IhTYRvG0SwAAAABJRU5ErkJggg==
// @antifeature payment  脚本会请求第三方收费题库进行答题，您可以选择付费或停用答题功能
// @antifeature:zh-TW payment  腳本會請求第三方收費題庫進行答題，您可以選擇付費或停用答案功能
// @tag          继续医学教育
// @tag          河南省继续医学教育学习平台
// @tag          学习辅助
// ==/UserScript==

// 使用：完整替换旧脚本，只启用一份；刷新后正常点击播放。
// 5.5.38：固定RTC＋标题；修复播放竞态与继续按钮异常，新增独立关联诊断。浏览器原生省电暂停仍需实测。
// 后台切课与考试返回沿用原流程；手动暂停、异常保护、全部完成或离页时清理保活。
// 诊断日志：页面前台按Ctrl＋Alt＋L导出；不显示保活面板。
// RTC依据本机对照结果保留；长期运行仍需实际验证，无法阻止系统睡眠。

(() => {
  const VIDEO_MARK = 'data-course-helper-ready';
  const API_PATH = '/xxpt/api/exam/getCoursesExamList';
  const SCRIPT_VERSION = '5.5.56.1017';
  // BILLING CORE START — independent of DOM; transport and billing contract unchanged.
  function createBillingClient(fetcher, uuid, now = Date.now) {
    let busy = false;
    let cooldownUntil = 0;
    const endpoint = 'https://api.axetk.icu/payment-test';
    async function post(path, payload) {
      if (busy) throw new Error('CLIENT_BUSY');
      if (now() < cooldownUntil) throw new Error('RATE_LIMITED');
      const body = JSON.stringify(payload);
      if (new TextEncoder().encode(body).length > 16384) throw new Error('PAYLOAD_TOO_LARGE');
      busy = true;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 65000);
      try {
        const response = await fetcher(endpoint + path, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'omit', cache: 'no-store', redirect: 'error', body, signal: controller.signal
        });
        if (response.status === 429) {
          const header = response.headers.get('Retry-After');
          const seconds = /^\d+$/.test(header || '') ? Number(header) :
            Math.ceil((Date.parse(header) - now()) / 1000);
          cooldownUntil = now() + Math.max(60, Number.isFinite(seconds) ? seconds : 60) * 1000;
        }
        let data;
        try { data = await response.json(); }
        catch { throw new Error('RESULT_UNCERTAIN'); }
        if (!response.ok || data?.ok !== true) {
          const allowed = ['INVALID_REQUEST', 'INVALID_LICENSE', 'LICENSE_DISABLED', 'INSUFFICIENT_BALANCE',
            'RATE_LIMITED', 'IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_KEY_EXPIRED', 'REQUEST_IN_PROGRESS',
            'PREVIOUS_REQUEST_FAILED', 'UPSTREAM_TIMEOUT', 'UPSTREAM_NETWORK_ERROR', 'UPSTREAM_HTTP_ERROR',
            'UPSTREAM_NON_JSON', 'UPSTREAM_DATA_INVALID', 'NO_VALID_QUESTIONS', 'QUESTION_BANK_MISS', 'PAYLOAD_TOO_LARGE', 'REQUEST_TIMEOUT'];
          const error = new Error(allowed.includes(data?.code) ? data.code : 'RESULT_UNCERTAIN');
          if (data?.code === 'QUESTION_BANK_MISS' && Array.isArray(data.missingIndices) && data.missingIndices.length > 0 &&
              data.missingIndices.length <= 200 && data.missingIndices.every(i => Number.isInteger(i) && i >= 0 && i < 200) &&
              new Set(data.missingIndices).size === data.missingIndices.length) error.missingIndices = data.missingIndices;
          throw error;
        }
        return data;
      } finally { clearTimeout(timer); busy = false; }
    }
    function makeJob(context, licenseKey) {
      if (!licenseKey.trim()) throw new Error('INVALID_LICENSE');
      return { requestId: uuid(), licenseKey: licenseKey.trim(), context: { ...context }, result: null, attempted: false };
    }
    function validResult(data, requestId) {
      return data?.requestId === requestId && Number.isSafeInteger(data.remaining) && data.remaining >= 0 &&
        Number.isSafeInteger(data.questionCount) && data.questionCount > 0 && Array.isArray(data.questions) &&
        data.questions.length === data.questionCount &&
        (data.charged === data.questionCount || (data.charged === 0 && data.originalCharged === data.questionCount)) &&
        data.questions.every(q => typeof q.title === 'string' && q.title.trim() && typeof q.type === 'string' &&
          Array.isArray(q.answer_values) && q.answer_values.length > 0 && q.answer_values.every(v => typeof v === 'string' && v.trim()) &&
          Array.isArray(q.answer_labels) && q.answer_labels.every(v => typeof v === 'string'));
    }
    return {
      makeJob,
      async receipts(licenseKey, requestId = null, beforeId = null) {
        const payload = { licenseKey, limit: 20 };
        if (requestId) payload.requestId = requestId;
        if (beforeId) payload.beforeId = Number(beforeId);
        const data = await post('/api/license/receipts', payload);
        if (!validReceiptResponse(data)) throw new Error('RESULT_UNCERTAIN');
        return data;
      },
      async balance(licenseKey) {
        if (!licenseKey.trim()) throw new Error('INVALID_LICENSE');
        const data = await post('/api/license/balance', { licenseKey: licenseKey.trim() });
        if (!Number.isSafeInteger(data.remaining) || data.remaining < 0) throw new Error('RESULT_UNCERTAIN');
        return data;
      },
      async query(job, retryConfirmed = false) {
        if (job.result) return job.result; // reuse received paid answers without another HTTP call
        if (job.attempted && !retryConfirmed) throw new Error('RETRY_CONFIRM_REQUIRED');
        if (busy) throw new Error('CLIENT_BUSY');
        if (now() < cooldownUntil) throw new Error('RATE_LIMITED');
        job.attempted = true;
        const { memberId, coursesId } = job.context;
        const payload = { requestId: job.requestId, licenseKey: job.licenseKey,
          memberId, coursesId, operation: 0, bankFirst: true };
        payload.questions = collectionQuestions(job.context, job.frontendAnswers);
        let data;
        try { data = await post('/api/query', payload); }
        catch (error) {
          if (error.message !== 'QUESTION_BANK_MISS' || job.frontendAnswers || !error.missingIndices ||
              typeof job.context.readFrontendAnswers !== 'function') throw error;
          const answers = job.context.readFrontendAnswers(error.missingIndices);
          if (!answers) throw new Error('NO_VALID_QUESTIONS');
          job.frontendAnswers = answers;
          payload.questions = collectionQuestions(job.context, answers);
          data = await post('/api/query', payload); // Same ID: one logical query, at most one debit.
        }
        if (!validResult(data, job.requestId)) throw new Error('RESULT_UNCERTAIN');
        job.result = data;
        return data;
      }
    };
  }
  function collectionQuestions(context, answers) {
    if (!Array.isArray(context?.questionHints) || !context.questionHints.length || context.questionHints.length > 200 ||
        typeof context.sourcePlatform !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(context.sourcePlatform)) throw new Error('NO_VALID_QUESTIONS');
    const platform = context.sourcePlatform === 'huayi' ? 'huayi_cme' : context.sourcePlatform === 'juming' ? 'jumingedu' : context.sourcePlatform;
    const byIndex = new Map();
    if (answers !== undefined && answers !== null) {
      if (!Array.isArray(answers) || !answers.length || answers.length > 200) throw new Error('NO_VALID_QUESTIONS');
      for (const item of answers) {
        if (!Number.isInteger(item?.index) || item.index < 0 || item.index >= context.questionHints.length || byIndex.has(item.index) ||
            !Array.isArray(item.answerLabels) || !item.answerLabels.length || item.answerLabels.length > 50 || new Set(item.answerLabels).size !== item.answerLabels.length) throw new Error('NO_VALID_QUESTIONS');
        byIndex.set(item.index, item.answerLabels);
      }
    }
    return context.questionHints.map((hint,index) => {
      if (!hint || typeof hint.title !== 'string' || !hint.title.trim() || typeof hint.type !== 'string' || !hint.type.trim() ||
          !Array.isArray(hint.option) || hint.option.length < 2) throw new Error('NO_VALID_QUESTIONS');
      const labels = new Set();
      const options = hint.option.map(option => {
        if (!option || typeof option !== 'object' || Array.isArray(option) || Object.keys(option).length !== 1) throw new Error('NO_VALID_QUESTIONS');
        const key = Object.keys(option)[0], label = key.toUpperCase(), text = option[key];
        if (!/^[A-Za-z]{1,8}$/.test(key) || labels.has(label) || typeof text !== 'string' || !text.trim()) throw new Error('NO_VALID_QUESTIONS');
        labels.add(label);return {label,text};
      });
      const record = {title:hint.title,type:hint.type,options,source_platform:platform};
      if (byIndex.has(index)) {
        const answer = byIndex.get(index);
        if (answer.some(label => typeof label !== 'string' || !/^[A-Z]{1,8}$/.test(label) || !labels.has(label))) throw new Error('NO_VALID_QUESTIONS');
        record.answer_labels = [...answer];
      }
      return record;
    });
  }
  function parseExamQuestionHints(document) {
    const list = document?.data?.list;
    if (!Array.isArray(list) || !list.length || list.length > 200) return null;
    const hints = [];
    for (const item of list) {
      const title = typeof item?.title === 'string' ? item.title.trim() : '';
      const type = ['string', 'number'].includes(typeof item?.type) ? String(item.type).trim() : '';
      if (!title || title.length > 4000 || !type || type.length > 32 || !Array.isArray(item.option) || item.option.length < 2 || item.option.length > 50) return null;
      const option = [], labels = new Set();
      for (const raw of item.option) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 1) return null;
        const label = Object.keys(raw)[0];
        const text = raw[label];
        if (!/^[A-Za-z]{1,8}$/.test(label) || labels.has(label.toUpperCase()) || typeof text !== 'string' || !text.trim() || text.length > 4000) return null;
        labels.add(label.toUpperCase()); option.push({ [label]: text });
      }
      // Explicit allowlist: no upstream answers/analysis or user fields enter billing context.
      hints.push({ title, type, option });
    }
    return hints;
  }
  function readFrontendAnswerLabels(rawQuestions, hints, indices) {
    if (!Array.isArray(rawQuestions) || !Array.isArray(indices) || !indices.length || indices.length > 200) return null;
    const result = [];
    for (const index of indices) {
      if (!Number.isInteger(index) || !hints[index] || typeof rawQuestions[index]?.analysis !== 'string') return null;
      const text = rawQuestions[index].analysis.trim();
      if (!text || text.length > 500) return null;
      const labels = [...new Set(text.toUpperCase().split(/[,，;；\s]+/).filter(Boolean))];
      const options = new Set(hints[index].option.flatMap(option => Object.keys(option).map(label => label.toUpperCase())));
      if (!labels.length || labels.length > 50 || labels.some(label => !/^[A-Z]{1,8}$/.test(label) || !options.has(label))) return null;
      result.push({ index, answerLabels: labels });
    }
    return result;
  }
  function enrichBillingContext(context, hints, rawQuestions) {
    if (!context || !hints) return null;
    const payload = { requestId: '0'.repeat(36), licenseKey: '0'.repeat(49),
      memberId: context.memberId, coursesId: context.coursesId, operation: 0, bankFirst: true,
      questions: collectionQuestions({...context, sourcePlatform:'henan_cme', questionHints:hints}) };
    // Missing or oversized question metadata must never fall back to platform credentials.
    if (new TextEncoder().encode(JSON.stringify(payload)).length > 16384) return null;
    return { ...context, sourcePlatform: 'henan_cme', questionHints: hints,
      readFrontendAnswers: indices => readFrontendAnswerLabels(rawQuestions, hints, indices) };
  }
  function parseBillingContext(body) {
    try {
      let data = null;
      if (typeof body === 'string') {
        try { data = JSON.parse(body); } catch { data = Object.fromEntries(new URLSearchParams(body)); }
      } else if (body instanceof URLSearchParams || body instanceof FormData) data = Object.fromEntries(body);
      const memberId = String(data?.memberId ?? '').trim();
      const coursesId = String(data?.coursesId ?? '').trim();
      if (!memberId || memberId.length > 200 || !coursesId || coursesId.length > 128 ||
          (data.operation !== 0 && data.operation !== '0')) return null;
      return { memberId, coursesId };
    } catch { return null; }
  }
  // BILLING CORE END
  // RECEIPT TRACKING START — only identifiers/safe summaries survive a same-tab reload.
  const receiptUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function validReceiptResponse(data) {
    const count = value => Number.isSafeInteger(value) && value >= 0;
    return data?.ok === true && count(data.remaining) && Number.isFinite(Date.parse(data.serverTime)) && Array.isArray(data.items) && data.items.length <= 20 &&
      (data.nextCursor === null || /^[1-9]\d{0,18}$/.test(data.nextCursor)) &&
      data.items.every(row => /^[1-9]\d{0,18}$/.test(row.entryId) && receiptUUID.test(row.requestId) &&
        typeof row.archived === 'boolean' && ['success', 'failed', 'processing', 'unknown'].includes(row.status) &&
        count(row.questionCount) && count(row.charged) && (row.remainingAfter === null || count(row.remainingAfter)) &&
        Number.isFinite(Date.parse(row.createdAt)) && (row.completedAt === null || Number.isFinite(Date.parse(row.completedAt))));
  }
  function safeCourseLabel(value) {
    return String(value || '本场考试').replace(/https?:\/\/\S+/gi, '[链接已隐藏]')
      .replace(/(?:[0-9A-F]{4}-){9}[0-9A-F]{4}/gi, '[Token已隐藏]').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 60);
  }
  class QueryJournal {
    constructor(storage, now = Date.now) { this.storage = storage; this.now = now; this.key = 'course-helper.acceptance.requests.v1'; this.unavailable = false; this.memory = []; this.memoryOnly = false; }
    clean(items) {
      const now = this.now();
      return items.filter(row => row && /^[a-f0-9]{64}$/.test(row.scope) && /^[a-f0-9]{64}$/.test(row.owner) &&
        receiptUUID.test(row.requestId) && Number.isSafeInteger(row.at) && row.at <= now && now - row.at < 86400000 &&
        ['processing', 'uncertain', 'success', 'failed'].includes(row.state)).slice(0, 30).map(row => ({
          scope: row.scope, owner: row.owner, requestId: row.requestId, at: row.at, state: row.state,
          title: safeCourseLabel(row.title), count: Number.isSafeInteger(row.count) && row.count >= 0 ? row.count : 0,
          cost: Number.isSafeInteger(row.cost) && row.cost >= 0 ? row.cost : null
        }));
    }
    read() {
      if (!this.memoryOnly) {
        let raw;
        try { raw = this.storage().getItem(this.key); }
        catch { this.unavailable = this.memoryOnly = true; }
        if (!this.memoryOnly) {
          try {
            if (raw && raw.length > 40000) throw Error();
            const doc = raw ? JSON.parse(raw) : { version: 1, items: [] };
            if (doc?.version !== 1 || !Array.isArray(doc.items) || doc.items.length > 30) throw Error();
            this.memory = doc.items;
          } catch {
            this.unavailable = this.memoryOnly = true;
            try { this.storage().removeItem(this.key); } catch (_) {}
          }
        }
      }
      this.memory = this.clean(this.memory);
      return this.memory;
    }
    find(scope) { return this.read().find(row => row.scope === scope); }
    put(row) {
      const items = this.read().filter(old => old.requestId !== row.requestId || old.owner !== row.owner);
      this.memory = this.clean([{ ...row, at: this.now() }, ...items]);
      try {
        this.storage().setItem(this.key, JSON.stringify({ version: 1, items: this.memory }));
        this.memoryOnly = false; // Only a saved full snapshot makes storage authoritative again.
      } catch { this.unavailable = this.memoryOnly = true; }
    }
  }
  const queryJournal = new QueryJournal(() => window.sessionStorage);
  const paidAnswerMemory = new Map();
  let receiptView = { key: null, rows: [], nextCursor: null, busy: false, nextReadAt: 0, message: '' };
  let billingLastDetail = '';
  let latestSafeError = null;
  async function billingIdentity(candidate, license) {
    const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
      .map(byte => byte.toString(16).padStart(2, '0')).join('');
    const owner = await digest(license);
    const identity = [owner, candidate.context.memberId, candidate.context.coursesId, candidate.request?.route || location.hash];
    identity.push('bank-first'); // Separate the new mode from historical upstream-enabled requests.
    if (candidate.context.questionHints) identity.push(candidate.context.sourcePlatform, candidate.context.questionHints);
    const scope = await digest(JSON.stringify(identity));
    return { owner, scope, title: safeCourseLabel(typeof currentCourseTitle === 'string' ? currentCourseTitle : '本场考试') };
  }
  function rememberedAnswers(scope) {
    const saved = paidAnswerMemory.get(scope);
    if (!saved || Date.now() - saved.at > 1800000) { paidAnswerMemory.delete(scope); return null; }
    return saved;
  }
  function rememberPaidAnswers(scope, job) {
    paidAnswerMemory.delete(scope);
    paidAnswerMemory.set(scope, { at: Date.now(), requestId: job.requestId, result: job.result });
    while (paidAnswerMemory.size > 20) paidAnswerMemory.delete(paidAnswerMemory.keys().next().value);
  }
  function receiptOutcome(data, requestId) {
    const current = data.items.find(row => row.requestId === requestId && !row.archived);
    return current?.status || 'unknown'; // no row is NOT proof of no charge
  }
  function renderReceiptRows() {
    const list = billingPanel?.querySelector('[data-receipt-list]');
    if (!list) return;
    if (receiptView.key !== licenseState.key) {
      receiptView = { key: licenseState.key, rows: [], nextCursor: null, busy: false, nextReadAt: 0, message: '' };
      list.replaceChildren();
      billingLastDetail = '';
      billingPanel.querySelector('[data-billing-detail]').textContent = '';
      billingPanel.querySelector('[data-billing-status]').textContent = isExamPage() ? '等待本场查询。' : '等待进入考试。';
    }
    billingPanel.querySelector('[data-receipt-note]').textContent = receiptView.message || '服务端账务记录；核对不扣费。';
    billingPanel.querySelector('[data-receipt-more]').hidden = !receiptView.nextCursor;
    const fragment = document.createDocumentFragment();
    const labels = { success: '成功', failed: '失败（本次未扣费）', processing: '处理中 · 待确认', unknown: '结果待确认' };
    for (const row of receiptView.rows) {
      const item = document.createElement('div'); item.className = 'helper-receipt';
      const local = queryJournal.read().find(record => record.requestId === row.requestId);
      const title = document.createElement('strong'); title.textContent = local?.title || '其他页面的查询';
      const text = document.createElement('div');
      text.textContent = `${new Date(row.createdAt).toLocaleString('zh-CN', { hour12: false })} · ${labels[row.status]}${row.archived ? '（历史扣费）' : ''}\n返回 ${row.questionCount} 题 · 扣 ${row.charged} 次`;
      const id = document.createElement('small'); id.textContent = `请求编号：${row.requestId}`;
      item.append(title, text, id); fragment.append(item);
    }
    list.replaceChildren(fragment);
  }
  async function refreshReceipts(more = false) {
    if (receiptView.busy || billingBusy || licenseManager.busy) return;
    if (!checkLicenseStatus()) return;
    if (Date.now() < receiptView.nextReadAt) {
      receiptView.message = '记录刚刚读取过，请稍后再刷新。'; renderReceiptRows(); return;
    }
    const key = licenseState.key;
    receiptView.busy = true; receiptView.message = '正在读取服务端账务…'; renderReceiptRows();
    try {
      const data = await getBillingClient().receipts(key, null, more ? receiptView.nextCursor : null);
      if (licenseState.key !== key) return;
      receiptView.rows = more ? [...receiptView.rows, ...data.items].slice(-100) : data.items;
      receiptView.nextCursor = data.nextCursor;
      receiptView.message = data.items.length ? '以下为服务端账务；余额已同步。' : '暂未查到记录，不代表进行中的请求未扣费。';
      licenseManager.updateBalance(data);
    } catch (error) {
      if (licenseState.key !== key) return;
      receiptView.message = error.message === 'RATE_LIMITED' ? '请求较频繁，请一分钟后再核对。' : '账务暂时无法确认，请稍后核对，不要重复购买。';
      latestSafeError = 'RECEIPT_CHECK_FAILED';
    } finally {
      if (licenseState.key === key) { receiptView.busy = false; receiptView.nextReadAt = Date.now() + 30000; renderReceiptRows(); }
    }
  }
  function safeSupportSnapshot() {
    const video = typeof currentVideo !== 'undefined' ? currentVideo : null;
    return { version: SCRIPT_VERSION, time: new Date().toISOString(), page: isExamPage() ? 'exam' : document.querySelector('video') ? 'video' : 'other',
      paused: typeof manualPaused === 'boolean' ? manualPaused : null,
      licensed: licenseState.verified, remainingSnapshot: licenseState.verified ? licenseState.remaining : null,
      queryPending: billingBusy, latestError: latestSafeError,
      trackingAvailable: !queryJournal.unavailable,
      mediaIssue: typeof courseVideoLoad !== 'undefined' && courseVideoLoad ? describeCourseLoad(courseVideoLoad, video, navigator.onLine).code : null,
      media: video ? { readyState: video.readyState, networkState: video.networkState, paused: video.paused, ended: video.ended, errorCode: video.error?.code || null } : null };
  }
  function exportSupportSnapshot() {
    let url = null, link = null;
    try {
      const snapshot = safeSupportSnapshot();
      url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'text/plain;charset=utf-8' }));
      link = document.createElement('a');
      link.href = url;
      link.download = 'course-helper-diagnostic-v' + SCRIPT_VERSION + '-' + snapshot.time.replace(/[:.]/g, '-') + '.txt';
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      const releaseURL = url;
      setTimeout(() => URL.revokeObjectURL(releaseURL), 10000);
      billingMessage('已发起脱敏诊断下载，请查看浏览器下载列表；文件不包含Token、登录凭据和题目内容。');
    } catch {
      if (url) URL.revokeObjectURL(url);
      billingMessage('诊断导出未完成，请检查浏览器下载权限后重试。');
    } finally { link?.remove(); }
  }
  // RECEIPT TRACKING END
  // LICENSE MODULE START
  function validLicenseFormat(key) {
    return typeof key === 'string' && key.length === 49 && /^(?:[0-9A-F]{4}-){9}[0-9A-F]{4}$/.test(key);
  }
  const LICENSE_FORMAT_MESSAGE = '格式错误';
  let licenseState = { key: null, remaining: 0, status: null, verified: false };
  function maskLicense(value) {
    const key = String(value || '');
    if (key.length <= 8) return key ? '****' : '未设置';
    return key.slice(0, 4) + '-****-****-' + key.slice(-4);
  }
  class LicenseManager {
    constructor(state, options) {
      this.state = state;
      this.options = options;
      this.storageKey = 'course-helper.acceptance.license.v1';
      this.lastVerifyTime = 0;
      this.initialized = false;
      this.guidePending = false;
      this.busy = false;
      this.generation = 0;
      this.message = '';
    }
    notify() { this.options.onChange?.(); }
    mask() { return maskLicense(this.state.key); }
    reset() {
      Object.assign(this.state, { key: null, remaining: 0, status: null, verified: false });
      this.lastVerifyTime = 0;
    }
    load() {
      this.generation++;
      this.reset();
      try {
        const raw = this.options.storage().getItem(this.storageKey);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (data?.version !== 1 || !validLicenseFormat(data.licenseKey) ||
            !Number.isSafeInteger(data.remaining) || data.remaining < 0 ||
            !Number.isSafeInteger(data.lastVerifyTime) || data.lastVerifyTime <= 0 || data.status !== 'active') throw Error();
        Object.assign(this.state, { key: data.licenseKey, remaining: data.remaining, status: 'active', verified: true });
        this.lastVerifyTime = data.lastVerifyTime;
        return true;
      } catch {
        try { this.options.storage().removeItem(this.storageKey); } catch {}
        this.message = '本地授权缓存不可用，请重新验证 Token。';
        return false;
      }
    }
    save() {
      try {
        this.options.storage().setItem(this.storageKey, JSON.stringify({ version: 1, licenseKey: this.state.key,
          remaining: this.state.remaining, status: this.state.status, lastVerifyTime: this.lastVerifyTime }));
        return true;
      } catch {
        this.message = '授权有效，但浏览器无法保存；仅本页有效，刷新后需重新验证。';
        return false;
      }
    }
    clear() {
      this.generation++;
      this.reset();
      this.message = '';
      try { this.options.storage().removeItem(this.storageKey); }
      catch { this.message = '本页授权已清除，但本地存储无法访问；请在浏览器中清理本站授权缓存。'; }
      this.notify();
    }
    errorMessage(code) {
      return ({ INVALID_LICENSE: 'Token无效，请检查输入。', LICENSE_DISABLED: 'Token已停用，请联系客服。',
        INSUFFICIENT_BALANCE: '授权次数不足，请充值。', RATE_LIMITED: '操作过于频繁，请稍后重试。',
        CLIENT_BUSY: '当前请求正在处理中，请稍后重试。' })[code] || '服务器连接失败，请稍后重试。';
    }
    handleError(error) {
      const code = error?.message;
      this.message = this.errorMessage(code);
      if (code === 'INVALID_LICENSE' || code === 'LICENSE_DISABLED') {
        this.state.verified = false;
        this.state.status = code === 'LICENSE_DISABLED' ? 'disabled' : 'invalid';
        try { this.options.storage().removeItem(this.storageKey); } catch {}
      } else if (code === 'INSUFFICIENT_BALANCE') {
        this.state.remaining = 0;
      }
      this.notify();
    }
    async verify(value) {
      if (this.busy) return false;
      const key = String(value || '').trim();
      if (!validLicenseFormat(key)) { this.message = LICENSE_FORMAT_MESSAGE; this.notify(); return false; }
      const generation = this.generation;
      this.busy = true;
      this.message = '正在验证 Token…';
      this.notify();
      try {
        const data = await this.options.balance(key);
        if (generation !== this.generation) return false;
        if (data?.ok !== true || data.status !== 'active' || !Number.isSafeInteger(data.remaining) || data.remaining < 0) throw Error('RESULT_UNCERTAIN');
        Object.assign(this.state, { key, remaining: data.remaining, status: 'active', verified: true });
        this.guidePending = false;
        this.lastVerifyTime = Date.now();
        this.message = data.remaining === 0 ? '授权次数不足，请充值。' : '';
        this.save();
        this.options.onVerified?.();
        return true;
      } catch (error) {
        if (generation === this.generation) this.handleError(error);
        return false;
      } finally {
        this.busy = false;
        this.notify();
      }
    }
    refreshBalance() {
      if (!this.state.key) { this.options.open?.(); return Promise.resolve(false); }
      return this.verify(this.state.key);
    }
    init() {
      if (this.initialized) return;
      this.initialized = true;
      const restored = this.load();
      this.notify();
      if (restored) void this.refreshBalance(); // one non-blocking refresh; never auto-charge or auto-retry
      else { this.guidePending = true; this.maybeShowGuide(); }
    }
    maybeShowGuide() {
      if (!this.guidePending || this.busy) return;
      if (this.state.verified) { this.guidePending = false; return; }
      if (this.options.deferGuide()) return;
      this.guidePending = false;
      this.options.open?.();
    }
    checkLicenseStatus() {
      if (this.busy) { this.message = '正在验证 Token，请稍后查题。'; this.notify(); return false; }
      if (this.state.key && !validLicenseFormat(this.state.key)) {
        this.clear();
        this.message = LICENSE_FORMAT_MESSAGE;
        this.notify();
      }
      if (!this.state.key || !this.state.verified || this.state.status !== 'active') {
        this.options.open?.(); return false;
      }
      // The server remains authoritative for funds; a cached zero must not block a recharge/free retry.
      return true;
    }
    updateBalance(data) {
      if (!this.state.verified || !Number.isSafeInteger(data?.remaining) || data.remaining < 0) return;
      this.state.remaining = data.remaining;
      this.message = data.remaining === 0 ? '授权次数不足，请充值。' : '';
      this.save();
      this.notify();
    }
  }
  // LICENSE MODULE END
  let licenseDialog = null;
  let licenseDialogReturnFocus = null;
  let licenseDialogScroll = null;
  function tokenServiceLinks(className) {
    return `<nav class="${className}" aria-label="Token 服务"><a data-token-service="new" href="https://api.axetk.icu/payment-test/portal/#new" target="_blank" rel="noopener noreferrer">获取 Token</a><a data-token-service="topup" href="https://api.axetk.icu/payment-test/portal/#topup" target="_blank" rel="noopener noreferrer" title="自动填入当前 Token，付款前请核对">Token 充值</a></nav>`;
  }
  function bindTokenServiceLinks(container) {
    container.querySelector('[data-token-service="topup"]').onclick = event => {
      const entered = container.querySelector('[data-license-entry], [data-license-inline-entry]')?.value.trim();
      const key = entered || licenseState.key;
      if (!validLicenseFormat(key)) return;
      event.preventDefault();
      // Fragment only: never put the Token in the HTTP query or retain an opener.
      window.open('https://api.axetk.icu/payment-test/portal/#topup?token=' + encodeURIComponent(key), '_blank', 'noopener,noreferrer');
    };
  }
  function getBillingClient() {
    if (!billingClient) billingClient = createBillingClient((...args) => nativeFetch.call(window, ...args), () => crypto.randomUUID());
    return billingClient;
  }
  const licenseManager = new LicenseManager(licenseState, {
    storage: () => window.localStorage,
    balance: key => getBillingClient().balance(key),
    onChange: () => renderLicenseUI(),
    onVerified: () => closeLicenseGuide(),
    open: () => openLicenseGuide(),
    deferGuide: () => [...document.querySelectorAll('video')].some(video => !video.paused && !video.ended)
  });
  function checkLicenseStatus() { return licenseManager.checkLicenseStatus(); }
  function renderLicenseUI() {
    syncBillingPageVisibility();
    renderReceiptRows();
    const set = (selector, text) => {
      const node = billingPanel?.querySelector(selector);
      if (node && node.textContent !== text) node.textContent = text;
    };
    set('[data-license-state]', licenseState.status === 'disabled' ? '已停用' : licenseState.verified ? '正常' : '未授权');
    set('[data-license-remaining]', licenseState.verified ? String(licenseState.remaining) : '—');
    set('[data-license-mask]', licenseManager.mask());
    set('[data-license-note]', licenseManager.message);
    const inlineForm = billingPanel?.querySelector('[data-license-inline]');
    const authorized = licenseState.verified && licenseState.status === 'active';
    if (inlineForm && inlineForm.hidden !== authorized) inlineForm.hidden = authorized;
    billingPanel?.querySelectorAll('[data-license-inline] input').forEach(input => {
      if (authorized && input.value) input.value = '';
    });
    const busy = licenseManager.busy || billingBusy;
    billingPanel?.querySelectorAll('button, input').forEach(button => { if (button.disabled !== busy) button.disabled = busy; });
    const dialogMessage = licenseDialog?.querySelector('[data-license-feedback]');
    if (dialogMessage && dialogMessage.textContent !== licenseManager.message) dialogMessage.textContent = licenseManager.message;
    licenseDialog?.querySelectorAll('input, [data-license-verify]').forEach(el => { if (el.disabled !== busy) el.disabled = busy; });
  }
  function isHelperPage() {
    return /^#\/remoteProject\/(?:studyInterface|examine)\/[^/?#]+/.test(location.hash);
  }
  function syncGuideDockVisibility() {
    if (helperDock) helperDock.hidden = !!licenseDialog || !isHelperPage();
  }
  function closeLicenseGuide() {
    if (!licenseDialog) return;
    const dialog = licenseDialog;
    licenseDialog = null;
    dialog.querySelector('input').value = '';
    if (dialog.open) dialog.close();
    dialog.remove();
    if (licenseDialogScroll) {
      for (const [node, properties] of licenseDialogScroll.styles) {
        for (const [name, value, priority] of properties) {
          if (value) node.style.setProperty(name, value, priority);
          else node.style.removeProperty(name);
        }
      }
      window.scrollTo(licenseDialogScroll.x, licenseDialogScroll.y);
      licenseDialogScroll = null;
    }
    syncGuideDockVisibility();
    if (licenseDialogReturnFocus?.isConnected) licenseDialogReturnFocus.focus({ preventScroll: true });
    licenseDialogReturnFocus = null;
  }
  function openLicenseGuide() {
    if (!isHelperPage()) { licenseManager.guidePending = true; return; }
    if (!document.body || licenseDialog) return;
    licenseManager.guidePending = false;
    licenseDialogReturnFocus = document.activeElement;
    licenseDialog = document.createElement('dialog');
    licenseDialog.id = 'course-helper-license-guide';
    licenseDialog.setAttribute('translate', 'no');
    licenseDialog.classList.add('notranslate');
    licenseDialog.setAttribute('aria-label', 'Token');
    // Native modal blocks background input/focus; restore the existing scroll state on dismissal.
    licenseDialog.innerHTML = `
      <style>
        #course-helper-license-guide { position:fixed;left:50%;top:50%;margin:0;transform:translate(-50%,-50%);width:360px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto;overscroll-behavior:contain;box-sizing:border-box;z-index:2147483647;padding:28px;background:#fff;color:#1e293b;border:1px solid #e2e8f0;border-radius:20px;box-shadow:0 24px 80px #0f172a29;font:14px/1.65 "Microsoft YaHei","PingFang SC",system-ui,sans-serif;text-align:left;letter-spacing:0;color-scheme:light; }
        #course-helper-license-guide::backdrop { background:#0f172a66;overflow:hidden;overscroll-behavior:contain;touch-action:none; }
        #course-helper-license-guide * { box-sizing:border-box; }
        #course-helper-license-guide .guide-eyebrow { margin:0 32px 6px 0;color:#64748b;font-size:12px;font-weight:500; }
        #course-helper-license-guide h3 { margin:0 0 6px;color:#0f172a;font-size:28px;font-weight:700;line-height:1.3;letter-spacing:-.5px; }
        #course-helper-license-guide p { margin:0;color:#64748b;font-size:12px;line-height:1.8; }
        #course-helper-license-guide .guide-benefits { display:flex;flex-wrap:wrap;gap:4px 12px;margin:16px 0 22px;padding-bottom:18px;border-bottom:1px solid #eef2f6;color:#64748b;font-size:11px; }
        #course-helper-license-guide form { margin:0; }
        #course-helper-license-guide label { display:block;color:#1e293b;font-size:13px;font-weight:600; }
        #course-helper-license-guide input { display:block;width:100%;min-width:0;height:48px;margin:8px 0 6px;padding:0 12px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;color:#1e293b;font:14px/1.5 "Microsoft YaHei","PingFang SC",system-ui,sans-serif; }
        #course-helper-license-guide input::placeholder { color:#94a3b8;font-size:12px; }
        #course-helper-license-guide input:focus { border-color:#315fee;background:#fff; }
        #course-helper-license-guide .guide-hint { margin:0 0 16px;color:#64748b;font-size:11px; }
        #course-helper-license-guide .guide-service-hint { margin:0 0 10px;color:#64748b;font-size:11px; }
        #course-helper-license-guide button { appearance:none;font:inherit;cursor:pointer; }
        #course-helper-license-guide .guide-payment-links { display:flex;gap:10px;margin:0 0 12px;padding:0; }
        #course-helper-license-guide .guide-payment-links a { display:flex;align-items:center;justify-content:center;flex:1;min-width:0;min-height:46px;padding:10px 6px;border:1px solid #c9d8ff;border-radius:10px;color:#2452d2;background:#eef3ff;text-align:center;text-decoration:none;font-size:14px;font-weight:700;white-space:nowrap; }
        #course-helper-license-guide .guide-payment-links a:hover { border-color:#315fee;background:#e2ebff; }
        #course-helper-license-guide [data-license-verify] { display:block;width:100%;min-height:48px;padding:10px 14px;border:1px solid #2759db;border-radius:10px;background:#2759db;color:#fff;font-size:14px;font-weight:700; }
        #course-helper-license-guide [data-license-verify]:hover { background:#1f49bc; }
        #course-helper-license-guide [data-license-later] { display:block;width:100%;margin:12px auto 0;padding:6px 8px;border:0;background:transparent;color:#64748b;font-size:12px; }
        #course-helper-license-guide [data-license-later]:hover { color:#1e293b; }
        #course-helper-license-guide [data-license-close] { position:absolute;right:16px;top:16px;width:30px;height:30px;padding:0;border:0;border-radius:8px;background:transparent;color:#64748b;font:22px/30px system-ui,sans-serif; }
        #course-helper-license-guide [data-license-close]:hover { background:#f1f5f9; }
        #course-helper-license-guide button:focus-visible, #course-helper-license-guide input:focus-visible, #course-helper-license-guide a:focus-visible { outline:2px solid #315fee;outline-offset:3px; }
        #course-helper-license-guide [data-license-feedback] { margin-top:12px;padding:9px 11px;border:1px solid #fde4c4;border-radius:8px;background:#fff8eb;color:#975d17;font-size:12px;line-height:1.65;overflow-wrap:anywhere; }
        #course-helper-license-guide [data-license-feedback]:empty { display:none; }
        #course-helper-license-guide button:disabled, #course-helper-license-guide input:disabled { opacity:.55;cursor:wait; }
        @media(max-width:400px) { #course-helper-license-guide { padding:24px 20px; } }
      </style>
      <button type="button" data-license-close aria-label="关闭 Token 弹窗">×</button>
      <div class="guide-eyebrow">课程助手</div>
      <h3>Token</h3>
      <p>验证 Token，即可使用查题服务。</p>
      <div class="guide-benefits"><span>验证使用权限</span><span>查询剩余次数</span><span>记录购买次数</span></div>
      <form>
        <label>你的 Token<input type="password" data-license-entry autofocus autocomplete="off" spellcheck="false" placeholder="请粘贴完整的 Token" aria-label="请输入 Token" aria-describedby="course-helper-license-hint"></label>
        <p class="guide-hint" id="course-helper-license-hint">验证后保存在本机浏览器，无需每次输入。</p>
        <p class="guide-service-hint">购买后回来验证 Token，充值后点击“刷新余额”。</p>
        ${tokenServiceLinks('guide-payment-links')}
        <button type="submit" data-license-verify>验证 Token</button>
        <button type="button" data-license-later>稍后再说，继续浏览</button>
      </form>
      <div data-license-feedback role="status" aria-live="polite"></div>`;
    licenseDialog.querySelector('form').onsubmit = event => {
      event.preventDefault();
      if (!billingBusy) void licenseManager.verify(licenseDialog.querySelector('input').value);
    };
    licenseDialog.querySelector('[data-license-later]').onclick = closeLicenseGuide;
    licenseDialog.querySelector('[data-license-close]').onclick = closeLicenseGuide;
    bindTokenServiceLinks(licenseDialog);
    const dialog = licenseDialog;
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeLicenseGuide(); });
    dialog.addEventListener('close', () => { if (licenseDialog === dialog) closeLicenseGuide(); });
    for (const type of ['click', 'input', 'change', 'keydown']) licenseDialog.addEventListener(type, event => event.stopPropagation());
    document.body.appendChild(licenseDialog);
    syncGuideDockVisibility();
    renderLicenseUI();
    licenseDialogScroll = { x: window.scrollX, y: window.scrollY,
      styles: [document.documentElement, document.body].map(node => [node,
        ['overflow-x', 'overflow-y'].map(name => [name, node.style.getPropertyValue(name), node.style.getPropertyPriority(name)])]) };
    for (const [node] of licenseDialogScroll.styles) node.style.setProperty('overflow', 'hidden', 'important');
    dialog.showModal();
    licenseDialog.querySelector('input').focus({ preventScroll: true });
  }
  function changeLicense() {
    if (billingBusy || licenseManager.busy || !window.confirm('确认更换Token？')) return;
    licenseManager.clear();
    // Keep old query id/result for audit; existing mismatch guard prevents billing it to another key.
    openLicenseGuide();
  }
  window.addEventListener('storage', event => {
    if (!licenseManager.initialized || (event.key !== null && event.key !== licenseManager.storageKey)) return;
    licenseManager.load();
    renderLicenseUI(); // no unsolicited dialog, no auto-charge, no interference with playback
  });
  let billingCandidate = null;
  let billingJob = null;
  let billingPanel = null;
  let billingBusy = false;
  let billingClient = null;
  let billingPrefetch = null;
  function maybeAutoQuery() {
    const candidate = billingCandidate;
    if (!candidate || !isExamPage() || manualPaused || billingBusy || licenseManager.busy ||
        candidate.autoAttempted || !isCurrentExamResponse(candidate.request)) return;
    // Manual attempts also consume the automatic opportunity, including ambiguous failures.
    if (billingJob) { candidate.autoAttempted = true; return; }
    if (!licenseState.key || !licenseState.verified || licenseState.status !== 'active') {
      if (!candidate.guideOffered) {
        candidate.guideOffered = true;
        checkLicenseStatus();
        billingMessage('请先验证 Token，验证成功后将自动按余额查题：一道答案扣1次。');
      }
      return;
    }
    candidate.autoAttempted = true; // synchronous latch before HTTP; no timer-driven retries
    void runBillingAction('auto');
  }
  let helperDock = null;
  function ensureHelperDock() {
    if (helperDock?.isConnected) return helperDock;
    if (!document.body) return null;
    const style = document.createElement('style');
    style.textContent = `
      #course-helper-dock { position:fixed;right:16px;top:72px;width:300px;max-width:calc(100vw - 24px);z-index:2147483647;color:#24334b;background:#f8fafc;border:1px solid #dce4ee;border-radius:18px;box-shadow:0 12px 40px #172b4d24;font:13px/1.6 system-ui,"Microsoft YaHei",sans-serif;overflow:hidden;text-align:left;color-scheme:light; }
      #course-helper-dock, #course-helper-dock * { box-sizing:border-box; }
      #course-helper-dock[hidden] { display:none!important; }
      #course-helper-dock .helper-head { display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#fff;border-bottom:1px solid #e8edf4; }
      #course-helper-dock .helper-title { font-size:15px;font-weight:750;color:#14253f; }
      #course-helper-dock .helper-subtitle { font-size:11px;color:#77869b;letter-spacing:.5px; }
      #course-helper-dock button { font:inherit;cursor:pointer;transition:filter .15s; }
      #course-helper-dock button:hover { filter:brightness(.95); }
      #course-helper-dock button:focus-visible, #course-helper-dock input:focus-visible, #course-helper-dock summary:focus-visible { outline:2px solid #4f7cff;outline-offset:2px; }
      #course-helper-dock [data-dock-toggle] { padding:5px 10px;background:#eef3fb;color:#466080;border:0;border-radius:8px;font-size:12px; }
      #course-helper-dock .helper-body { padding:12px;max-height:calc(100dvh - 230px);overflow:auto;overscroll-behavior:contain; }
      #course-helper-dock .helper-body[hidden] { display:none; }
      #course-helper-dock .helper-status-slot:empty { display:none; }
      #course-helper-dock .helper-status-slot:not(:empty)::before { content:'运行状态';display:block;font-size:11px;font-weight:650;color:#75839a;margin:0 0 7px 2px; }
      #course-helper-dock .helper-status { position:static!important;transform:none!important;min-width:0!important;max-width:none!important;width:100%!important;margin:0 0 10px!important;padding:11px 13px!important;box-shadow:none!important;border:0!important;border-radius:10px!important;font-size:12px!important;line-height:1.7!important;white-space:pre-wrap!important;text-align:left!important;overflow-wrap:anywhere; }
      #course-helper-dock .helper-pause-slot { padding:0 12px 12px;background:#f8fafc; }
      #course-helper-dock .helper-pause-slot:empty { display:none; }
      #course-helper-dock .helper-pause { position:static!important;min-width:0!important;width:100%!important;padding:10px 12px!important;border-radius:10px!important;font-size:13px!important;box-shadow:none!important; }
      #course-helper-dock .helper-billing { position:static!important;width:auto!important;max-height:none!important;overflow:visible!important;background:#fff!important;color:#24334b!important;padding:12px!important;border:1px solid #e3eaf3!important;border-radius:12px!important;font:inherit!important; }
      #course-helper-dock .helper-billing summary { cursor:pointer;font-weight:700;color:#264772;margin-bottom:10px; }
      #course-helper-dock .helper-billing label { display:block;font-size:12px;color:#697a92; }
      #course-helper-dock .helper-billing input { display:block;width:100%!important;margin:5px 0 10px;padding:9px 10px;background:#f8fafc;border:1px solid #dce4ef;border-radius:8px;color:#172b4d;font:inherit; }
      #course-helper-dock .helper-billing div:has(>button) { display:flex;gap:7px;margin:7px 0; }
      #course-helper-dock .helper-billing button { flex:1;padding:8px 5px;border:1px solid #dfe7f2;border-radius:8px;background:#f5f8fd;color:#425b7c;font-size:12px; }
      #course-helper-dock [data-license-inline][hidden] { display:none!important; }
      #course-helper-dock [data-exam-retry][hidden] { display:none!important; }
      #course-helper-dock [data-receipt-more][hidden] { display:none!important; }
      #course-helper-dock .helper-receipt { border-bottom:1px solid #edf0f5;padding:8px 0;font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere; }
      #course-helper-dock [data-receipt-list] { max-height:210px;overflow:auto; }
      #course-helper-dock [data-billing-detail] { font-size:11px;color:#66758a;margin-top:8px; }
      #course-helper-dock .helper-billing [data-new] { color:#a66825; }
      #course-helper-dock .helper-billing button:disabled { opacity:.45;cursor:wait; }
      #course-helper-dock small { display:block;color:#8995a8;font-size:11px;line-height:1.65;margin-top:10px; }
      #course-helper-dock [data-billing-status] { background:#f0f5ff;border-radius:8px;padding:10px;margin-top:10px;font-size:12px;color:#416087;line-height:1.7; }
      @media(max-width:600px) { #course-helper-dock { right:8px;top:12px;width:280px; } #course-helper-dock .helper-body { max-height:calc(100dvh - 160px); } }
      /* Compact edition: open by default, manual collapse stays respected. */
      #course-helper-dock { top:auto;bottom:16px;right:12px;width:260px;border-radius:12px;box-shadow:0 4px 18px #172b4d1a; }
      #course-helper-dock[data-collapsed] { width:180px; }
      #course-helper-dock .helper-head { padding:7px 9px;gap:7px;min-height:42px;border-bottom:0; }
      #course-helper-dock .helper-title { font-size:12px;font-weight:650;white-space:nowrap; }
      #course-helper-dock [data-dock-toggle] { padding:4px 7px;white-space:nowrap;font-size:11px; }
      #course-helper-dock [data-dock-toggle][data-notice]::after { content:'';display:inline-block;width:5px;height:5px;background:#315fee;border-radius:50%;margin-left:3px;vertical-align:middle; }
      #course-helper-dock .helper-pause-slot { padding:0;background:none;margin-left:auto; }
      #course-helper-dock .helper-pause { padding:4px 8px!important;font-size:11px!important;border-radius:6px!important;white-space:nowrap;line-height:1.6!important;font-weight:500!important; }
      #course-helper-dock .helper-body { padding:0 9px 9px;max-height:min(360px,calc(100dvh - 224px)); }
      #course-helper-dock .helper-status-slot:not(:empty)::before { display:none; }
      #course-helper-dock .helper-status { margin:0 0 7px!important;padding:7px 9px!important;font-size:11px!important;line-height:1.5!important;border-radius:7px!important;max-height:100px;overflow:auto; }
      #course-helper-dock .helper-billing { padding:9px!important;border-radius:8px!important; }
      #course-helper-dock .helper-billing summary { margin-bottom:6px;font-size:12px; }
      #course-helper-dock .helper-billing input { padding:6px 8px;margin:4px 0 7px; }
      #course-helper-dock .helper-billing button { padding:6px 4px; }
      #course-helper-dock .helper-advanced { margin-top:7px;border-top:1px solid #edf0f5;padding-top:5px; }
      #course-helper-dock .helper-advanced summary { color:#8995a8;font-size:11px;font-weight:400;margin:0; }
      #course-helper-dock [data-billing-status] { background:transparent;padding:0;margin-top:7px;font-size:11px;max-height:110px;overflow:auto; }
      #course-helper-dock small { margin-top:6px; }
      @media(max-width:600px) { #course-helper-dock { right:8px;bottom:8px;top:auto; } }
      #course-helper-dock > .helper-status-slot:not(:empty) { padding:0 9px 7px; }
      #course-helper-dock .helper-status { cursor:pointer!important;margin-bottom:0!important; }
      #course-helper-dock .helper-status::after { content:attr(data-action);display:block;font-size:10px;opacity:.8;margin-top:3px; }
      #course-helper-dock .helper-payment-links { display:flex;gap:8px;margin:5px 9px 9px;padding:8px 0 0;border-top:1px solid #dce5f5; }
      #course-helper-dock .helper-payment-links a { display:flex;align-items:center;justify-content:center;flex:1;min-width:0;min-height:42px;padding:9px 4px;border:1px solid #2759db;border-radius:8px;color:#fff;background:#2759db;box-shadow:0 2px 6px #2759db26;text-align:center;text-decoration:none;font-size:12px;font-weight:700;white-space:nowrap; }
      #course-helper-dock .helper-payment-links a:hover { background:#1f49bc;box-shadow:0 3px 8px #2759db38; }
      #course-helper-dock .helper-payment-links a:focus-visible { outline:2px solid #4f7cff;outline-offset:2px; }
    `;
    helperDock = document.createElement('section');
    helperDock.id = 'course-helper-dock';
    helperDock.setAttribute('translate', 'no');
    helperDock.classList.add('notranslate');
    helperDock.setAttribute('aria-label', '课程助手控制台');
    helperDock.innerHTML = '<header class="helper-head"><span class="helper-title">学习助手</span><button type="button" data-dock-toggle aria-expanded="true" aria-controls="course-helper-body">收起</button></header><div class="helper-status-slot"></div>'+tokenServiceLinks('helper-payment-links')+'<div id="course-helper-body" class="helper-body"><div class="helper-billing-slot"></div></div>';
    helperDock.prepend(style);
    bindTokenServiceLinks(helperDock);
    const toggle = helperDock.querySelector('[data-dock-toggle]');
    toggle.onclick = () => {
      const body = helperDock.querySelector('.helper-body');
      body.hidden = !body.hidden;
      toggle.textContent = body.hidden ? '展开' : '收起';
      toggle.setAttribute('aria-expanded', String(!body.hidden));
      helperDock.toggleAttribute('data-collapsed', body.hidden);
      if (!body.hidden) toggle.removeAttribute('data-notice');
    };
    for (const name of ['click', 'input', 'change', 'keydown']) helperDock.addEventListener(name, event => event.stopPropagation());
    document.body.appendChild(helperDock);
    syncGuideDockVisibility();
    return helperDock;
  }
  function mountHelperControl(element, slot, className) {
    const dock = ensureHelperDock();
    if (!dock) return;
    element.classList.add(className);
    dock.querySelector(slot).appendChild(element);
  }

  function billingMessage(message) {
    billingLastDetail = message;
    const output = billingPanel?.querySelector('[data-billing-status]');
    const detail = billingPanel?.querySelector('[data-billing-detail]');
    if (detail) detail.textContent = message;
    const brief = message.split('\n').filter(line => !/^requestId:|^余额快照：/.test(line)).slice(0, 2).join('\n');
    if (output && output.textContent !== brief) {
      output.textContent = brief;
      if (helperDock?.hasAttribute('data-collapsed')) helperDock.querySelector('[data-dock-toggle]').setAttribute('data-notice', '');
    }
  }
  function syncBillingPageVisibility() {
    if (!isHelperPage() && licenseDialog) { closeLicenseGuide(); if (!licenseState.verified) licenseManager.guidePending = true; }
    syncGuideDockVisibility();
    const details = billingPanel?.querySelector('[data-exam-retry]');
    if (!details) return;
    const hidden = !isExamPage();
    if (details.hidden !== hidden) details.hidden = hidden;
    if (hidden && details.open) details.open = false;
  }
  function ensureBillingPanel() {
    if (!document.body) return;
    if (!isHelperPage()) { syncBillingPageVisibility(); return; }
    if (billingPanel) { syncBillingPageVisibility(); licenseManager.maybeShowGuide(); maybeAutoQuery(); return; }
    billingPanel = document.createElement('div');
    billingPanel.style.cssText = 'position:fixed;left:12px;top:70px;z-index:2147483647;background:white;color:#222;padding:12px;border:1px solid #bbb;border-radius:8px;width:270px;font:13px/1.6 sans-serif;max-height:70vh;overflow:auto';
    billingPanel.innerHTML = '<div>授权状态：<strong data-license-state>未授权</strong></div><div>剩余次数：<strong data-license-remaining>—</strong></div><div data-license-note style="font-size:11px;color:#a36020"></div><div>Token：<span data-license-mask>未设置</span></div><div><button type="button" data-balance>刷新余额</button><button type="button" data-license-change>更换Token</button></div><div data-billing-status style="white-space:pre-wrap;overflow-wrap:anywhere">等待进入考试。</div><details class="helper-advanced" data-exam-retry hidden><summary>重试与说明</summary><div><button type="button" data-retry>原请求重试</button><button type="button" data-new>新建收费请求</button></div><small>一道有效答案扣1次。答案不足时暂停，不自动重试。重试缓存丢失可能再次收费；新请求可能重复购买。</small></details><details class="helper-advanced" data-general-details><summary>查询记录与详情</summary><div><button type="button" data-receipt-refresh>核对账务 / 刷新记录</button><button type="button" data-receipt-more hidden>更早记录</button></div><small data-receipt-note></small><div data-receipt-list></div><div data-billing-detail style="white-space:pre-wrap;overflow-wrap:anywhere"></div><div><span>v5.5.56</span><button type="button" data-export-diagnostic>导出脱敏诊断</button></div></details>';
    // Isolate helper controls from the site's delegated exam input handlers.
    for (const name of ['click', 'input', 'change', 'keydown']) billingPanel.addEventListener(name, event => event.stopPropagation());
    billingPanel.querySelector('[data-balance]').onclick = () => runBillingAction('balance');
    billingPanel.querySelector('[data-retry]').onclick = () => runBillingAction('retry');
    billingPanel.querySelector('[data-new]').onclick = () => runBillingAction('new');
    billingPanel.querySelector('[data-license-change]').onclick = changeLicense;
    mountHelperControl(billingPanel, '.helper-billing-slot', 'helper-billing');
    const autoNotice = document.createElement('small');
    autoNotice.textContent = '进入考试自动查题，一题扣1次。刷新或重新进入可能再次扣费。';
    billingPanel.querySelector('[data-general-details]').append(autoNotice);
    billingPanel.querySelector('[data-license-mask]').parentElement.remove();
    const masked = document.createElement('div'); masked.innerHTML = 'Token：<span data-license-mask>未设置</span>';
    billingPanel.querySelector('[data-general-details]').prepend(masked);
    // Keep summary first even after adding the masked code.
    billingPanel.querySelector('[data-general-details]').prepend(billingPanel.querySelector('[data-general-details] summary'));
    billingPanel.querySelector('[data-receipt-refresh]').onclick = () => refreshReceipts();
    billingPanel.querySelector('[data-receipt-more]').onclick = () => refreshReceipts(true);
    billingPanel.querySelector('[data-export-diagnostic]').onclick = exportSupportSnapshot;
    const inlineForm = document.createElement('form');
    inlineForm.setAttribute('data-license-inline', '');
    inlineForm.style.marginTop = '8px';
    inlineForm.innerHTML = '<label>Token<input type="password" data-license-inline-entry autocomplete="off" spellcheck="false" placeholder="请粘贴完整的 Token" aria-label="面板Token"></label><div><button type="submit" data-license-save>保存</button></div>';
    billingPanel.querySelector('[data-license-note]').after(inlineForm);
    inlineForm.onsubmit = event => {
      event.preventDefault();
      if (!billingBusy && !licenseManager.busy) void licenseManager.verify(inlineForm.querySelector('input').value);
    };
    licenseManager.init();
    renderLicenseUI();
  }
  function acceptBillingContext(context, request) {
    if (!isCurrentExamResponse(request)) {
      if (request && !request.route && request.sessionId === examSessionId) billingPrefetch = { context, request };
      return;
    }
    ensureBillingPanel();
    if (!context) { billingMessage('未获取到完整题目信息，未发起收费。请重新进入考试。'); return; }
    const key = JSON.stringify([examSessionId, context.memberId, context.coursesId, context.sourcePlatform || null, context.questionHints || null]);
    if (billingCandidate?.key === key) { billingCandidate.context = context; maybeAutoQuery(); return; }
    const changedAfterQuery = billingCandidate?.autoAttempted && billingCandidate.request?.sessionId === examSessionId &&
      billingCandidate.context?.memberId === context.memberId && billingCandidate.context?.coursesId === context.coursesId;
    billingCandidate = { key, context, request: captureExamRequest() };
    if (changedAfterQuery) billingCandidate.autoAttempted = true;
    billingJob = null;
    questions = [];
    billingMessage(changedAfterQuery ? '本场题目已变化，已停止自动查题；请核对原请求后再重新购买。' :
      context.questionHints ? '优先查题库，缺失答案从本页面补充；每道有效答案扣1次。' : '正在等待本场题目信息，未发起收费。');
    maybeAutoQuery();
  }
  async function runBillingAction(action) {
    if (billingBusy || licenseManager.busy || receiptView.busy) return;
    if (action === 'balance') { await licenseManager.refreshBalance(); return; }
    if (!checkLicenseStatus()) return;
    const license = licenseState.key;
    const candidate = billingCandidate;
    const current = () => licenseState.key === license && candidate === billingCandidate && isCurrentExamResponse(candidate?.request);
    if (!candidate || !current()) { billingMessage('未捕获当前考试请求，请进入考试后再查题。'); return; }
    if (billingJob && billingJob.licenseKey !== license && action !== 'new') {
      billingMessage('Token已更换，请先核对原账户账务。'); return;
    }
    candidate.autoAttempted = true;
    billingBusy = true;
    renderLicenseUI();
    let identity = null, job = null, stage = 'prepare', serverRetry = false;
    try {
      identity = await billingIdentity(candidate, license);
      if (!current()) return;
      const client = getBillingClient();
      const previous = queryJournal.find(identity.scope);
      const cached = rememberedAnswers(identity.scope);
      const memory = cached && (!previous || (previous.requestId === cached.requestId && previous.state === 'success')) ? cached : null;
      if (action === 'new') billingJob = null;
      if (!billingJob && memory && action !== 'new') {
        billingJob = { ...client.makeJob(candidate.context, license), requestId: memory.requestId, result: memory.result, attempted: true };
      }
      if (previous && ((!billingJob && !memory) || (billingJob?.attempted && !billingJob.result))) {
        stage = 'reconcile';
        billingMessage('正在核对原请求账务，不会重复发送收费请求。');
        const receipt = await client.receipts(license, previous.requestId);
        if (!current()) return;
        licenseManager.updateBalance(receipt);
        let outcome = receiptOutcome(receipt, previous.requestId);
        // A received explicit rejection (e.g. rate limit) may precede ledger creation.
        // A missing row alone still never settles a processing/uncertain request.
        if (outcome === 'unknown' && !receipt.items.length && previous.state === 'failed' && previous.cost === 0) outcome = 'failed';
        if (!['success', 'failed'].includes(outcome)) {
          billingMessage(outcome === 'processing' ? '原请求仍在处理中，扣费结果待确认。请稍后在详情中核对账务。' :
            '原请求结果待确认，可能已扣费。请先核对账务，本次未复购。');
          latestSafeError = 'RECEIPT_UNCERTAIN'; return;
        }
        const execution = receipt.items.find(row => row.requestId === previous.requestId && !row.archived);
        const age = Date.parse(receipt.serverTime) - Date.parse(execution?.completedAt);
        // Preserve the server's free same-ID/cache-hit retry window. Cache misses may
        // recharge under the existing policy; after expiry use one new request ID.
        serverRetry = outcome === 'success' && action !== 'new' && age >= 0 && age <= 30000;
        if (action === 'retry' || serverRetry) {
          billingJob = { ...client.makeJob(candidate.context, license), requestId: previous.requestId, attempted: true };
        } else {
          billingMessage(outcome === 'success' ? '已确认原请求成功，答案已丢失；正在按当前余额重新购买。' :
            '已确认上次请求失败，本次重新查询；成功返回答案才扣费。');
        }
      }
      if (!current()) return;
      if (action === 'retry' && !billingJob) { billingMessage('没有可重试的请求。'); return; }
      if (!billingJob) {
        billingJob = client.makeJob(candidate.context, license);
        questions = []; answeredPages.clear();
      }
      job = billingJob;
      const reusedLocally = !!job.result;
      // No answers or platform credentials are written to browser storage.
      if (!reusedLocally) queryJournal.put({ ...identity, requestId: job.requestId, state: 'processing' });
      stage = 'query';
      billingMessage(reusedLocally ? '正在恢复本场已购答案，不新增扣费。' : '正在查询，请勿刷新；按实际返回题数扣费。');
      const data = await client.query(job, action === 'retry' || serverRetry);
      queryJournal.put({ ...identity, requestId: job.requestId, state: 'success', count: data.questionCount,
        cost: reusedLocally ? (queryJournal.find(identity.scope)?.cost ?? data.charged) : data.charged });
      rememberPaidAnswers(identity.scope, job);
      latestSafeError = null;
      if (licenseState.key !== license) { billingMessage('授权已切换，本次结果未应用，请核对原账户账务。'); return; }
      // A reused result contains an old balance snapshot; never overwrite a newer balance with it.
      if (!reusedLocally && data.charged > 0) licenseManager.updateBalance(data);
      if (!current()) {
        billingMessage(`请求已完成，页面已切换，未填入答案。本次扣费 ${reusedLocally ? 0 : data.charged} 次。\nrequestId: ${job.requestId}`); return;
      }
      loadAnswers(data);
      billingMessage(`本场已获得 ${data.questionCount} 道答案 · ${reusedLocally ? '复用已购答案，新增扣费 0 次' : '本次扣费 ' + data.charged + ' 次'}。\n未获得答案的题目暂停，不自动补购。\nrequestId: ${job.requestId}` +
        (queryJournal.unavailable ? '\n浏览器无法保存请求追踪；刷新后可能无法核对原请求。' : ''));
    } catch (error) {
      const safeCodes = ['INVALID_LICENSE', 'LICENSE_DISABLED', 'INSUFFICIENT_BALANCE', 'RATE_LIMITED', 'CLIENT_BUSY',
        'UPSTREAM_TIMEOUT', 'UPSTREAM_NETWORK_ERROR', 'UPSTREAM_HTTP_ERROR', 'UPSTREAM_NON_JSON', 'UPSTREAM_DATA_INVALID',
        'NO_VALID_QUESTIONS', 'QUESTION_BANK_MISS', 'INVALID_REQUEST', 'PAYLOAD_TOO_LARGE', 'PREVIOUS_REQUEST_FAILED', 'IDEMPOTENCY_KEY_EXPIRED'];
      const known = safeCodes.includes(error.message);
      latestSafeError = known ? error.message : 'RESULT_UNCERTAIN';
      if (stage === 'query' && job && identity) queryJournal.put({ ...identity, requestId: job.requestId,
        state: known ? 'failed' : 'uncertain', cost: known ? 0 : null });
      if (licenseState.key !== license) return;
      if (['INVALID_LICENSE', 'LICENSE_DISABLED', 'INSUFFICIENT_BALANCE'].includes(error.message)) licenseManager.handleError(error);
      const messages = {
        INVALID_LICENSE: 'Token无效，请检查输入。', LICENSE_DISABLED: 'Token已停用，请联系客服。',
        INSUFFICIENT_BALANCE: '授权次数不足，请充值。本次未新增扣费。',
        RATE_LIMITED: '请求较频繁，请一分钟后再试；不会自动重试。', CLIENT_BUSY: '已有请求处理中，请稍候。',
        IDEMPOTENCY_KEY_EXPIRED: '原请求已过期，请先核对账务；重新进入考试将按余额复购。',
        REQUEST_IN_PROGRESS: '原请求仍在处理中，扣费结果待确认，请勿重复购买。',
        PREVIOUS_REQUEST_FAILED: '原请求已失败，本次未新增扣费。',
        UPSTREAM_TIMEOUT: '题库响应超时，本次未新增扣费。', UPSTREAM_NETWORK_ERROR: '题库连接失败，本次未新增扣费。',
        UPSTREAM_HTTP_ERROR: '题库请求未成功，请检查平台登录状态；本次未新增扣费。',
        UPSTREAM_NON_JSON: '题库响应异常，本次未新增扣费。', UPSTREAM_DATA_INVALID: '题目数据异常，本次未新增扣费。',
        NO_VALID_QUESTIONS: '未获得有效答案，本次未新增扣费。',
        QUESTION_BANK_MISS: '题库未命中且页面未提供完整答案，本次未扣费。',
        INVALID_REQUEST: '查题参数不完整，请重新进入考试。', PAYLOAD_TOO_LARGE: '查题参数过多，本次未新增扣费。'
      };
      billingMessage(stage === 'prepare' ? '请求准备未完成，本次未发起收费查询，请稍后再试。' :
        stage === 'reconcile' ? '原请求账务暂时无法确认，可能已扣费。本次未复购，请稍后核对。' :
        (messages[error.message] || '查询结果待确认，可能已扣费。请在详情中核对账务，不要重复购买。') +
        (job ? `\nrequestId: ${job.requestId}` : ''));
    } finally {
      billingBusy = false;
      renderLicenseUI();
    }
  }
  const AUTO_SUBMIT = true;
  const COURSE_TEST_VOLUME = 0; // 0%，通过滑块事件调整，不直接设置媒体属性。
  const DISABLE_FAST_FORWARD_RESPONSE_TEST = false; // 对照测试恢复原网页快进处理；不伪造学习进度。
  const progressReportDiagnostic = { requests: 0, responses: 0, networkFailures: 0, httpFailures: 0, lastRequestAt: null, lastResponseAt: null };
  let progressRequestId = 0;
  const progressXHRContexts = new WeakMap();
  const progressXHRObserved = new WeakSet();
  const fastForwardRollbackBlocks = new WeakMap();
  const courseVolumeUISync = new WeakMap();
  const STATUS_WORDS = ['待考试', '学习中', '未学习', '已学习'];
  const STATUS_WORD_SET = new Set(STATUS_WORDS);
  const STATUS_NODE_SELECTOR = 'span, div, p, label, em, i';
  const ACTION_SELECTOR = 'button, a, [role="button"], .el-button, .ant-btn';
  const continuableVideos = new WeakSet();
  const manualPlaybackRequests = new WeakMap();
  const backgroundPausedVideos = new WeakSet();
  const backgroundPlayPending = new WeakMap();
  const backgroundLastAttempt = new WeakMap();
  let backgroundResumeTimer = null;

  // 保存原生读取方式：网页看到的状态与恢复、音量、诊断使用的真实状态分开。
  function findDocumentGetter(name) {
    for (let owner = document; owner; owner = Object.getPrototypeOf(owner)) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, name);
      if (descriptor) return descriptor.get || null;
    }
    return null;
  }
  const nativeHiddenGetter = findDocumentGetter('hidden');
  const nativeVisibilityGetter = findDocumentGetter('visibilityState');
  const nativeDocumentHasFocus = document.hasFocus;
  const visibilityProtectionHooks = { hidden: false, visibilityState: false, hasFocus: false };
  function realDocumentHidden() {
    return nativeHiddenGetter ? Reflect.apply(nativeHiddenGetter, document, []) : document.hidden;
  }
  function realDocumentVisibility() {
    return nativeVisibilityGetter ? Reflect.apply(nativeVisibilityGetter, document, []) : document.visibilityState;
  }
  function realDocumentHasFocus() {
    return Reflect.apply(nativeDocumentHasFocus, document, []);
  }
  function protectCourseVisibility() {
    if (isExamPage()) return automationStarted && !manualPaused;
    return !!(canContinueCourseFlow(currentVideo, true) && currentVideo.readyState >= 2 && !currentVideo.error);
  }
  function installCourseVisibilityProtection() {
    for (const [name, getter, protectedValue] of [
      ['hidden', nativeHiddenGetter, false], ['visibilityState', nativeVisibilityGetter, 'visible']
    ]) {
      if (!getter) continue;
      try {
        Object.defineProperty(document, name, {
          configurable: true, enumerable: true,
          get() {
            // 保留原生 receiver 检查；不为其他 Document 或非法调用伪造结果。
            const realValue = Reflect.apply(getter, this, []);
            return this === document && protectCourseVisibility() ? protectedValue : realValue;
          }
        });
        visibilityProtectionHooks[name] = true;
      } catch (error) {
        console.warn('[课程助手] 可见性保护未安装', name, String(error));
      }
    }
    try {
      Object.defineProperty(document, 'hasFocus', {
        configurable: true, writable: true,
        value: function(...args) {
          const realValue = Reflect.apply(nativeDocumentHasFocus, this, args);
          return this === document && protectCourseVisibility() ? true : realValue;
        }
      });
      visibilityProtectionHooks.hasFocus = true;
    } catch (error) {
      console.warn('[课程助手] 焦点保护未安装', String(error));
    }
  }

  let automationStarted = false;
  let currentVideo = null;
  let courseStatusBox = null;
  let courseStatusColor = '';
  let courseStatusClickable = null;
  let examStatusBox = null;
  let examStatusColor = '';
  let enteringExam = false;
  let submitted = false;
  let advancing = false;
  let lastPage = '';
  let questions = [];
  const answeredPages = new Set();
  let examStartConfirmedButtons = new WeakSet();
  const examStartDialogStates = new WeakMap();
  let examSubmitConfirmedButtons = new WeakSet();
  const examInputAttempts = new WeakMap();
  const examAnswerPlans = new WeakMap();
  const examXHRObserved = new WeakSet();
  let lastAdvanceAt = 0;
  let activeExamRoute = '';
  let examSessionId = 0;
  let examConfirmTimer = null;
  let examFlowQueued = false;
  let examFlowLastState = '';
  let popupRecoveryObserverInstalled = false;
  const examFlowDiagnostic = { answerResponses: 0, loadedQuestions: 0, selectedOptions: 0, nextClicks: 0, submitClicks: 0, submitConfirms: 0, lastState: null };

  // 3.5：记录是否刚从考试页返回。
  let wasExamPage = false;

  // 3.6：课程列表状态测试。
  // 当前节若为“已学习”，自动向后寻找，直到遇到“学习中”或“未学习”。
  let courseStateChecking = false;

  // 3.8：直接控制右侧课程列表自身的 scrollTop。
  let courseScrollTimer = null;
  let courseScrollRounds = 0;
  let courseScanGeneration = 0;
  let courseVideoLoad = null;
  const COURSE_LOAD_TIMEOUT = 30000;
  const COURSE_LOAD_MAX_ATTEMPTS = 3;

  // 4.5：完整扫描课程列表后判断是否全部“已学习”。
  let courseScanSawRows = false;
  let courseScanFoundPending = false;
  let courseScanFoundExam = false;
  let courseCompletionNotified = false;

  // 4.6：点击“立即播放”后，不再直接播放页面当前 video。
  // 必须先扫描课程状态，确认是“学习中/未学习”后才允许播放。
  let startupCourseCheckPending = false;

  // 4.0：手动暂停整个自动测试流程。
  let manualPaused = false;

  // 4.2：完整合并“滑块弹窗调试 1.2”的状态变化检测。
  let sliderWasVisible = false;
  let sliderResumeTimer = null;

  // 4.3：统一管理异步动作，避免“暂停/滑块/切课/考试”互相抢状态。
  const pendingFlowTimers = new Set();
  let sliderRecoveryUntil = 0;
  let videoEndedAt = 0;
  let examEnterResetTimer = null;

  // 4.4：视频完成后进入“考试锁定”状态。
  // 在真正进入并完成考试之前，禁止课程扫描跳到下一节。
  let awaitingExamAfterVideo = false;
  let examWaitStartedAt = 0;
  let currentCourseRow = null;
  let currentCourseTitle = '';
  let playingCourseBindings = new WeakMap(); // 仅用于显示，独立于课程扫描/考试定位状态。
  let completedCourseDoneSince = 0;

  // 当前课身份跟随实际媒体源保存，不把页面显示标题当作完成凭证。
  let courseFlowBindings = new WeakMap();
  const courseEndDiagnostic = {
    rowRebinds: 0, unresolvedChecks: 0, prolongedWaits: 0,
    firstSnapshot: null, lastSnapshot: null, lastTransition: null,
    records: [], recordsDropped: 0
  };
  const courseEndLongWaitVideos = new WeakSet();
  let courseEndLastSignature = '', courseEndLastRecordAt = -Infinity;
  const progressReportHistory = { records: [], recordsDropped: 0, limit: 120 };

  // COURSE SCOPE START: chapter numbers are meaningful only inside one studyInterface course.
  function readCoursePageKey(hash = location.hash) {
    return /^#\/remoteProject\/studyInterface\/([^/?#]+)(?:[/?#]|$)/.exec(hash)?.[1] || '';
  }
  let activeCoursePageKey = readCoursePageKey();
  let courseScopeEpoch = 0;
  let courseChangePending = false;
  const COURSE_CHANGE_MESSAGE = '已离开或更换整门课程，旧课程状态已清除\n请等待新课程加载完成，再点击此状态重新识别';
  function syncCourseScope() {
    // A normal exam round-trip belongs to the existing course until a new study page is seen.
    if (isExamPage()) return false;
    const next = readCoursePageKey();
    if (next === activeCoursePageKey) return false;
    const hadCourse = !!activeCoursePageKey || !!currentCourseRow || !!currentVideo || automationStarted;
    activeCoursePageKey = next;
    courseScopeEpoch++;
    invalidatePlaybackAttempts('整门课程身份变化');
    clearPendingFlowTimers();
    clearExamConfirmTimer();
    stopCourseScrollTest();
    if (courseVideoLoad) { courseVideoLoad.cancelled = true; courseVideoLoad.generation++; }
    courseVideoLoad = null;
    if (sliderResumeTimer !== null) clearTimeout(sliderResumeTimer);
    if (examEnterResetTimer !== null) clearTimeout(examEnterResetTimer);
    sliderResumeTimer = examEnterResetTimer = null;
    sliderRecoveryUntil = 0;
    sliderWasVisible = false;
    currentVideo = null;
    currentCourseRow = null;
    currentCourseTitle = '';
    courseFlowBindings = new WeakMap();
    playingCourseBindings = new WeakMap();
    awaitingExamAfterVideo = false;
    enteringExam = wasExamPage = false;
    videoEndedAt = examWaitStartedAt = completedCourseDoneSince = 0;
    startupCourseCheckPending = false;
    courseCompletionNotified = courseScanSawRows = courseScanFoundPending = courseScanFoundExam = false;
    courseEndLastSignature = ''; courseEndLastRecordAt = -Infinity;
    courseEndDiagnostic.firstSnapshot = courseEndDiagnostic.lastSnapshot = courseEndDiagnostic.lastTransition = null;
    submitted = advancing = false;
    lastPage = ''; lastAdvanceAt = 0;
    questions = []; answeredPages.clear();
    examStartConfirmedButtons = new WeakSet(); examSubmitConfirmedButtons = new WeakSet();
    activeExamRoute = ''; examSessionId++;
    examFlowQueued = false; examFlowLastState = '';
    billingCandidate = billingPrefetch = billingJob = null;
    // Keep an in-flight HTTP request busy until its original finally block runs. Never retry it.
    courseChangePending = hadCourse;
    if (hadCourse) manualPaused = true;
    recordPlaybackDiagnostic('整门课程状态已重置', null, { courseScopeEpoch, requiresConfirmation: hadCourse });
    if (hadCourse) {
      showCourseStatus(COURSE_CHANGE_MESSAGE, '#e85d04');
      billingMessage('已切换课程；未自动发起查题。旧请求若仍在处理中，请等待其账务结果。');
    }
    syncBackgroundKeepalive('整门课程身份变化');
    return true;
  }
  // COURSE SCOPE END

  function courseStateLabelHiddenReason(node, rect) {
    if (rect && (rect.width <= 0 || rect.height <= 0)) return 'zero-size';
    for (let current = node; current; current = current.parentElement) {
      const prefix = current === node ? '' : 'ancestor-';
      if (current.hidden) return prefix + 'hidden-attribute';
      if (current.getAttribute?.('aria-hidden') === 'true') return prefix + 'aria-hidden';
      const style = window.getComputedStyle?.(current);
      if (style?.display === 'none') return prefix + 'display-none';
      if (style?.visibility === 'hidden' || style?.visibility === 'collapse') return prefix + 'visibility-hidden';
    }
    return '';
  }
  function courseRowRendered(row) {
    return !!row?.isConnected && !courseStateLabelHiddenReason(row, row.getBoundingClientRect?.());
  }
  function readCourseEndStateLabels(row) {
    const labels = [];
    for (const node of row?.querySelectorAll(STATUS_NODE_SELECTOR) || []) {
      const state = String(node.textContent || '').replace(/\s+/g, '');
      if (!STATUS_WORD_SET.has(state)) continue;
      const hiddenReason = courseStateLabelHiddenReason(node, node.getBoundingClientRect());
      labels.push({ state, visible: !hiddenReason, hiddenReason });
      if (labels.length >= 12) break;
    }
    return labels;
  }

  function courseIdentityKey(title) {
    return String(title || '').normalize('NFKC').replace(/\s+/g, '').slice(0, 200);
  }
  function getCourseSequence(row) {
    if (!row?.querySelectorAll) return null;
    const numbers = new Set();
    for (const node of row.querySelectorAll('span, div, em, i')) {
      const text = String(node.textContent || '').trim();
      if (/^[1-9]\d{0,3}$/.test(text)) numbers.add(Number(text));
      if (numbers.size > 1) return null;
    }
    return numbers.size === 1 ? [...numbers][0] : null;
  }
  function makeCourseFlowBinding(video, row) {
    const title = getCourseTitle(row);
    return { source: diagnosticSource(video), row, title, key: courseIdentityKey(title), sequence: getCourseSequence(row),
      courseKey: activeCoursePageKey, courseEpoch: courseScopeEpoch };
  }
  function rememberCourseFlowBinding(video, explicitRow = null) {
    if (syncCourseScope() || !activeCoursePageKey || courseChangePending) return;
    if (!video || video !== currentVideo || isExamPage() || manualPaused) return;
    const previous = courseFlowBindings.get(video), source = diagnosticSource(video);
    if (!explicitRow && previous?.source === source) return;
    if (!explicitRow && courseVideoLoad) return;
    const display = playingCourseBindings.get(video);
    const row = explicitRow || (display?.source === source && display.row?.isConnected ? display.row : null) ||
      (!previous && currentCourseRow?.isConnected ? currentCourseRow : null);
    if (!row) return;
    courseFlowBindings.set(video, makeCourseFlowBinding(video, row));
  }
  function resolveEndedCourseContext(video = currentVideo) {
    syncCourseScope();
    const originalRow = currentCourseRow, source = diagnosticSource(video);
    let binding = video && courseFlowBindings.get(video);
    const result = { row: null, state: '', bindingMode: 'missing-course-identity',
      expectedTitle: binding?.title || currentCourseTitle || '', expectedSequence: binding?.sequence ?? null,
      originalRowConnected: !!originalRow?.isConnected, originalRowRendered: courseRowRendered(originalRow),
      candidateCount: 0, rebound: false };
    if (!activeCoursePageKey || courseChangePending || !binding || binding.courseKey !== activeCoursePageKey ||
        binding.courseEpoch !== courseScopeEpoch) {
      result.bindingMode = 'course-identity-unconfirmed'; return result;
    }
    const matches = row => {
      if (!courseRowRendered(row)) return false;
      const sequence = getCourseSequence(row);
      if (binding.sequence !== null && sequence !== null && binding.sequence !== sequence) return false;
      return binding.key ? courseIdentityKey(getCourseTitle(row)) === binding.key : row === binding.row;
    };
    if (binding?.source !== source) result.bindingMode = binding ? 'media-source-changed' : 'missing-course-identity';
    else if (matches(originalRow)) {
      result.row = originalRow; result.bindingMode = 'original-row-matched'; result.candidateCount = 1;
    } else if (binding && (binding.key || binding.sequence !== null)) {
      const rows = findCourseRows().filter(courseRowRendered);
      let candidates = rows.filter(matches);
      result.candidateCount = candidates.length;
      if (candidates.length === 1) { result.row = candidates[0]; result.bindingMode = 'unique-title-match'; }
      else if (candidates.length > 1) {
        const selected = candidates.filter(row => row.matches?.(
          '[aria-current="true"], [aria-current="page"], [aria-selected="true"], .is-active'));
        if (selected.length === 1) { result.row = selected[0]; result.bindingMode = 'selected-matching-title'; }
        else result.bindingMode = 'ambiguous-course-title';
      } else result.bindingMode = 'course-row-not-found'; // Never guess by chapter number alone.
    }
    if (result.row) {
      result.state = getCourseState(result.row);
      if (result.row !== originalRow) {
        result.rebound = true; courseEndDiagnostic.rowRebinds++;
        currentCourseRow = result.row; currentCourseTitle = getCourseTitle(result.row);
        completedCourseDoneSince = 0;
        courseFlowBindings.set(video, { ...binding, row: result.row });
        recordPlaybackDiagnostic('当前课程节点重新定位', video, {
          bindingMode: result.bindingMode, expectedSequence: result.expectedSequence,
          originalRowConnected: result.originalRowConnected, originalRowRendered: result.originalRowRendered,
          candidateCount: result.candidateCount,
          resolvedCourseState: result.state
        });
      }
    }
    return result;
  }
  function observeEndedCourseContext(context, reason = '结束后复查') {
    const video = currentVideo;
    if (!video || (!video.ended && !videoEndedAt && !awaitingExamAfterVideo)) return;
    const now = diagnosticNow();
    const waitedMs = Math.max(0, Date.now() - (examWaitStartedAt || videoEndedAt || Date.now()));
    const actions = context.row ? [...context.row.querySelectorAll(ACTION_SELECTOR)]
      .filter(isExamButton).slice(0, 6).map(button => ({ label: textOf(button).slice(0, 80), enabled: isEnabled(button) })) : [];
    const snapshot = { time: new Date().toISOString(), reason,
      videoId: diagnosticVideoIds.get(video) || null, waitedMs,
      expectedTitle: context.expectedTitle.slice(0, 180), expectedSequence: context.expectedSequence,
      bindingMode: context.bindingMode, originalRowConnected: context.originalRowConnected,
      originalRowRendered: context.originalRowRendered,
      resolvedRowConnected: !!context.row?.isConnected, candidateCount: context.candidateCount,
      recognizedState: context.state, stateLabels: readCourseEndStateLabels(context.row), examButtons: actions,
      lastProgressResponseAt: progressReportDiagnostic.lastResponseAt,
      lastProgressResponse: progressReportHistory.records.at(-1) || null,
      manualPaused, anomalyGuard: anomalyDiagnostic.guardActive };
    courseEndDiagnostic.lastSnapshot = snapshot;
    if (!courseEndDiagnostic.firstSnapshot) courseEndDiagnostic.firstSnapshot = snapshot;
    if (!context.row) courseEndDiagnostic.unresolvedChecks++;
    const signature = JSON.stringify([snapshot.videoId, snapshot.bindingMode, snapshot.recognizedState,
      snapshot.expectedSequence, snapshot.originalRowConnected, snapshot.resolvedRowConnected,
      snapshot.originalRowRendered, snapshot.candidateCount, snapshot.stateLabels, snapshot.examButtons,
      snapshot.lastProgressResponseAt]);
    const changed = signature !== courseEndLastSignature;
    const prolonged = waitedMs >= 60000 && !courseEndLongWaitVideos.has(video);
    if (prolonged) { courseEndLongWaitVideos.add(video); courseEndDiagnostic.prolongedWaits++; }
    if (changed || prolonged || now - courseEndLastRecordAt >= 30000) {
      courseEndDiagnostic.records.push(snapshot);
      if (courseEndDiagnostic.records.length > 120) {
        courseEndDiagnostic.records.shift(); courseEndDiagnostic.recordsDropped++;
      }
      courseEndLastRecordAt = now;
    }
    if (changed || prolonged) recordPlaybackDiagnostic(prolonged ? '视频结束等待超时诊断' : '视频结束状态诊断', video, snapshot);
    courseEndLastSignature = signature;
  }


  // 保留播放诊断，核对零音量下是否发生真实暂停。
  const playbackDiagnosticRecords = [];
  // 关键记录独立保留；普通采样达到2000条后仍能查看最近200条关键事件。
  const criticalDiagnosticRecords = [];
  const criticalDiagnosticTypes = new Set([
    '视频进度写入', 'timeupdate进度变化', 'video.ratechange', 'video.waiting',
    'video.stalled', 'video.error', 'video.emptied', 'pause调用',
    '暂停相关弹窗变化', '页面freeze', '页面resume', '页面pagehide',
    '页面pageshow缓存恢复', '本节加载重试用尽', '本节已就绪但播放重试用尽',
    '课程恢复失败', '本节加载播放失败', '异常警告自动暂停',
    'video.enterpictureinpicture', 'video.leavepictureinpicture', 'fullscreenchange',
    '异常暂停继续被拒绝', '人工确认异常后继续', '保活冻结组合快照', '保活资格变化', 'video.ended',
    '当前课程节点重新定位', '视频结束状态诊断', '视频结束等待超时诊断', '本节结束推进', '结束后进入考试'
  ]);
  const recentForwardSeeks = new WeakMap();
  const anomalyDiagnostic = {
    guardActive: false, guardReason: '', guardAt: null, guardTriggers: 0,
    acknowledgements: 0, lastAcknowledgedAt: null,
    forwardSeekCalls: 0, fragmentRecoverySeeks: 0, progressRollbacks: 0,
    warningAppearances: 0, restrictionAppearances: 0,
    ordinaryRecordsDropped: 0, criticalRecordsDropped: 0,
    criticalRecordLimit: 200, lastForwardSeek: null, lastWarningAt: null
  };
  const diagnosticVideoIds = new WeakMap();
  let nextDiagnosticVideoId = 1;
  const diagnosticSamples = new WeakMap();
  const diagnosticTimeupdates = new WeakMap();
  const diagnosticPauseCalls = new WeakMap();
  const playbackPauseDiagnostic = { events: 0, endedEvents: 0, recentForwardedPauseCalls: 0,
    noRecentForwardedPauseCalls: 0, lastAt: null, lastObservedCallAgeMs: null };
  const diagnosticSeekCalls = new WeakMap();
  const diagnosticHookStatus = { currentTime: false, fastSeek: false };
  let diagnosticPopupSignature = '';
  let diagnosticPopupLastState = null;
  let diagnosticLifecycleFreezeAt = null;

  // 5.5.25：只协调恢复后的检查；不会试图在 Frozen 状态运行页面 JS。
  // 不恢复过期的计时器、不模拟时长/进度，不将冻结自动解释成课程完成。
  const LIFECYCLE_CHECKPOINT_KEY = 'course-helper-lifecycle-v1';
  const lifecycleDiagnostic = {
    freezeCount: 0, resumeCount: 0, longTickCount: 0,
    lastTickGapMs: null, maxTickGapMs: 0,
    lastRecoveryReason: '', lastRecoveryAt: null,
    lastFreezeAt: null, lastResumeAt: null,
    wasDiscarded: !!document.wasDiscarded, lastCheckpoint: null
  };
  let lifecycleRecheckQueued = false;
  let lifecycleRecheckLastAt = -Infinity;
  let lifecycleRecheckNeedsCourseScan = false;

  function saveLifecycleCheckpoint(reason) {
    const checkpoint = {
      version: '5.5.38', reason, at: Date.now(),
      automationStarted: !!automationStarted, manualPaused: !!manualPaused,
      routeType: isExamPage() ? 'exam' : 'course',
      videoPlaying: !!currentVideo && !currentVideo.paused && !currentVideo.ended
    };
    lifecycleDiagnostic.lastCheckpoint = checkpoint; // 诊断快照；不会据此恢复旧课或模拟进度。
    try { sessionStorage.setItem(LIFECYCLE_CHECKPOINT_KEY, JSON.stringify(checkpoint)); }
    catch (error) { lifecycleDiagnostic.checkpointError = String(error); }
  }

  try {
    const saved = sessionStorage.getItem(LIFECYCLE_CHECKPOINT_KEY);
    if (saved) {
      const checkpoint = JSON.parse(saved);
      if (['5.5.25', '5.5.26', '5.5.27', '5.5.28', '5.5.29', '5.5.30', '5.5.31', '5.5.32', '5.5.33', '5.5.34', '5.5.35', '5.5.36', '5.5.37', '5.5.38'].includes(checkpoint?.version)) lifecycleDiagnostic.lastCheckpoint = checkpoint;
    }
  } catch (error) { lifecycleDiagnostic.checkpointError = String(error); }

  // 唯一的恢复协调入口。仅重用已有扫描/考试逻辑，避免创建第二套状态机。
  function scheduleLifecycleRecheck(reason, courseScanAlreadyDone = false) {
    if (manualPaused || (!automationStarted && !isExamPage())) return;
    if (lifecycleRecheckQueued) {
      lifecycleRecheckNeedsCourseScan ||= !courseScanAlreadyDone;
      return;
    }
    const now = diagnosticNow();
    // visibilitychange/focus/resume/pageshow 可能在同一秒密集出现。
    if (now - lifecycleRecheckLastAt < 750) return;
    lifecycleRecheckQueued = true;
    lifecycleRecheckNeedsCourseScan = !courseScanAlreadyDone;
    Promise.resolve().then(() => {
      lifecycleRecheckQueued = false;
      const needsScan = lifecycleRecheckNeedsCourseScan;
      lifecycleRecheckNeedsCourseScan = false;
      lifecycleRecheckLastAt = diagnosticNow();
      if (manualPaused || (!automationStarted && !isExamPage())) return;
      lifecycleDiagnostic.lastRecoveryReason = reason;
      lifecycleDiagnostic.lastRecoveryAt = new Date().toISOString();
      try {
        if (isExamPage()) {
          syncExamSession();
          requestExamFlow('生命周期恢复：' + reason);
        } else {
          // 扫描逻辑自身保持“先当前课程、再结束/考试、最后列表”的优先级。
          if (needsScan) scanCoursePage();
          const video = currentVideo;
          if (video?.paused && continuableVideos.has(video)) {
            backgroundPausedVideos.add(video);
            // 只交给现有恢复机制判断，不直接 video.play()。
            recoverBackgroundVideo(video);
          }
        }
      } catch (error) {
        recordPlaybackDiagnostic('生命周期恢复复查异常', currentVideo, {
          recoveryReason: reason, error: String(error)
        });
      }
    });
  }

  const diagnosticNow = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
  const diagnosticSource = video => video?.currentSrc || video?.getAttribute?.('src') || '';

  // 5.5.38：播放协调与独立诊断。每个video/媒体代次只有一个未完成请求。
  const PLAY_REQUEST_TIMEOUT_MS = 30000;
  const playbackMediaStates = new WeakMap();
  const activePlaybackAttempts = new Set();
  let playbackFlowEpoch = 0, nextPlaybackSourceId = 1, nextPlaybackAttemptId = 1, nextPlaybackPauseId = 1;
  const playbackAttemptDiagnostic = {
    schemaVersion: 1, attempts: 0, coalesced: 0, fulfilled: 0, rejected: 0, cancelled: 0, timedOut: 0,
    pauseCounts: {}, attemptErrorCounts: {}, attemptsDropped: 0, pausesDropped: 0, sourcesDropped: 0,
    firstFailure: null, firstPauses: [], recentAttempts: [], recentPauses: [], sources: [],
    limits: { attempts: 160, pauses: 240, firstPauses: 20, sources: 80 },
    attribution: '错误文本为明确证据；近时调用、freeze和人工状态仅表示关联；其余保留unknown。',
    mediaMeasurement: '仅累计相邻后台观测中无seek且间隔≤6秒的合理媒体增量；不是全部实际播放时长。'
  };
  let playbackLastVisibilityAt = null, playbackLastTrustedFreezeAt = null;

  function boundedPlaybackPush(list, value, limit, droppedKey) {
    list.push(value);
    if (list.length > limit) { list.shift(); playbackAttemptDiagnostic[droppedKey]++; }
  }
  function playbackContext(video, state) {
    const binding = courseFlowBindings.get(video);
    return { at: diagnosticNow(), time: new Date().toISOString(), videoId: diagnosticVideoIds.get(video) || null,
      sourceId: state.id, sourceGeneration: state.generation, flowEpoch: playbackFlowEpoch,
      realVisibility: realDocumentVisibility(), readyState: video.readyState, networkState: video.networkState,
      currentTime: video.currentTime, paused: video.paused, ended: video.ended,
      muted: video.muted, volume: video.volume, connected: !!video.isConnected,
      manualPaused, anomalyGuard: anomalyDiagnostic.guardActive, inExam: isExamPage(), enteringExam,
      pageHiddenByNavigation: backgroundPageHidden, sliderPending: sliderRecoveryPending(),
      courseTitle: (binding?.source === state.source ? binding.title : currentCourseTitle || '').slice(0, 180),
      courseSequence: binding?.source === state.source ? binding.sequence : null,
      sinceVisibilityMs: playbackLastVisibilityAt === null ? null : diagnosticNow() - playbackLastVisibilityAt };
  }
  function playbackMediaState(video, forceNew = false) {
    let state = playbackMediaStates.get(video);
    const source = diagnosticSource(video);
    if (!state || state.source !== source || forceNew) {
      const old = state;
      const summary = { sourceId: nextPlaybackSourceId++, videoId: diagnosticVideoIds.get(video) || null,
        sourceGeneration: (old?.generation || 0) + 1, attempts: 0, pauses: 0,
        observedBackgroundMediaSeconds: 0, measuredIntervals: 0, excludedIntervals: 0,
        startedAt: new Date().toISOString() };
      state = { id: summary.sourceId, generation: summary.sourceGeneration, source, summary,
        pending: null, lastAttempt: null, lastPause: null, sample: null };
      playbackMediaStates.set(video, state);
      backgroundPlayPending.delete(video); backgroundLastAttempt.delete(video);
      boundedPlaybackPush(playbackAttemptDiagnostic.sources, summary, 80, 'sourcesDropped');
      if (old?.pending) old.pending.cancel('媒体源代次变化');
    }
    state.summary.videoId = diagnosticVideoIds.get(video) || state.summary.videoId;
    return state;
  }
  function playbackCancellation(message) {
    const error = new Error(message); error.name = 'CoursePlayCancelledError'; return error;
  }
  function invalidatePlaybackAttempts(reason) {
    playbackFlowEpoch++;
    for (const token of [...activePlaybackAttempts]) token.cancel(reason);
    if (currentVideo) {
      backgroundPlayPending.delete(currentVideo); backgroundLastAttempt.delete(currentVideo);
      courseVolumeUISync.get(currentVideo)?.cancel?.();
    }
  }
  function playbackErrorKind(error) {
    const message = String(error?.message || error || '');
    if (/video-only background media was paused to save power|autoplaying background media was paused to save power/i.test(message)) return 'explicit-power-saving-error';
    if (/containing page was frozen/i.test(message)) return 'explicit-freeze-error';
    if (error?.name === 'CoursePlayCancelledError') return 'cancelled';
    if (error?.name === 'CoursePlayTimeoutError') return 'timeout';
    return 'other-play-error';
  }
  function setPlaybackPauseCategory(record, category, evidence) {
    const counts = playbackAttemptDiagnostic.pauseCounts;
    if (record.category) counts[record.category] = Math.max(0, (counts[record.category] || 0) - 1);
    record.category = category; record.evidence = evidence;
    counts[category] = (counts[category] || 0) + 1;
  }
  function observePlaybackEvent(video, name) {
    if (!diagnosticVideoIds.has(video)) diagnosticVideoIds.set(video, nextDiagnosticVideoId++);
    const state = playbackMediaState(video, name === 'emptied' || name === 'loadstart');
    const now = diagnosticNow(), token = state.lastAttempt;
    if (name === 'pause') {
      const call = diagnosticPauseCalls.get(video);
      const recentCall = call && !call.blocked && call.mediaSource === state.source &&
        call.mediaGeneration === state.generation && now - call.at >= 0 && now - call.at <= 1000;
      const linked = token && now >= token.record.at &&
        (state.pending === token || now - (token.record.finishedAtMs ?? token.record.at) <= 1000);
      const previous = state.lastPause;
      if (previous?.playingAtMs != null) previous.repausedAfterPlayingMs = Math.max(0, now - previous.playingAtMs);
      const record = { pauseId: nextPlaybackPauseId++, ...playbackContext(video, state),
        attemptId: linked ? token.record.attemptId : null,
        nearPauseCall: recentCall ? { ageMs: now - call.at, source: call.source } : null,
        nearFreezeMs: playbackLastTrustedFreezeAt === null ? null : now - playbackLastTrustedFreezeAt,
        playAfterMs: null, playingAfterMs: null, repausedAfterPlayingMs: null };
      let category = video.ended ? 'ended' : manualPaused ? 'manual-or-guard-stop' :
        recentCall ? 'near-forwarded-pause-call' : record.nearFreezeMs !== null &&
        record.nearFreezeMs >= 0 && record.nearFreezeMs <= 1000 ? 'near-trusted-freeze' : 'unknown';
      if (!video.ended && linked && !token.record.errorPauseId && /^explicit-/.test(token.record.errorKind || '')) {
        category = token.record.errorKind; token.record.errorPauseId = record.pauseId;
      }
      setPlaybackPauseCategory(record, category, /^explicit-/.test(category) ? '同源近时play错误文本' : '事件发生时状态及近时关联');
      state.lastPause = record; state.summary.pauses++;
      if (playbackAttemptDiagnostic.firstPauses.length < 20) playbackAttemptDiagnostic.firstPauses.push(record);
      boundedPlaybackPush(playbackAttemptDiagnostic.recentPauses, record, 240, 'pausesDropped');
    } else if (name === 'play' || name === 'playing') {
      const pause = state.lastPause;
      if (pause) {
        if (name === 'play' && pause.playAfterMs === null) pause.playAfterMs = Math.max(0, now - pause.at);
        if (name === 'playing' && pause.playingAfterMs === null) {
          pause.playingAfterMs = Math.max(0, now - pause.at); pause.playingAtMs = now;
        }
      }
      if (token) {
        const key = name === 'play' ? 'playEventAtMs' : 'playingEventAtMs';
        if (token.record[key] == null) token.record[key] = now;
      }
    }
    if (name === 'timeupdate' || name === 'pause' || name === 'playing' || name === 'seeking' || name === 'seeked') {
      const prev = state.sample, media = video.currentTime, hidden = realDocumentHidden();
      if (prev) {
        const elapsed = (now - prev.at) / 1000, delta = media - prev.media;
        if (prev.hidden && hidden && !prev.seeking && !video.seeking && name !== 'seeking' &&
            elapsed > 0 && elapsed <= 6 && delta >= 0 && delta <= elapsed * Math.max(1, video.playbackRate || 1) + 0.5) {
          state.summary.observedBackgroundMediaSeconds += delta; state.summary.measuredIntervals++;
        } else state.summary.excludedIntervals++;
      }
      state.sample = { at: now, media, hidden, seeking: !!video.seeking || name === 'seeking' };
    }
  }

  // 正式版配置固定，不受旧实验配置或localStorage开关影响。
  const KEEPALIVE_CONFIG = Object.freeze({ title: true, webRTC: true });
  const KEEPALIVE_RUN_KEY = 'course-helper-rtc-title-run-v1';
  const keepaliveRun = {
    id: 'KA-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    startedAt: new Date().toISOString(), profile: 'rtc_title', label: 'RTC＋标题交替正式版',
    config: { ...KEEPALIVE_CONFIG }, previousRun: null, checkpointError: null
  };
  try {
    const raw = sessionStorage.getItem(KEEPALIVE_RUN_KEY);
    if (raw && raw.length <= 60000) {
      const saved = JSON.parse(raw);
      if (['5.5.37', '5.5.38'].includes(saved?.version) && typeof saved.runId === 'string') keepaliveRun.previousRun = saved;
    }
  } catch (error) { keepaliveRun.checkpointError = String(error?.name || 'StorageError'); }

  // 标题独立交替，与RTC共用后台流程资格。
  const BACKGROUND_TITLE_INTERVAL_MS = 1300;
  const backgroundTitleDiagnostic = {
    enabled: KEEPALIVE_CONFIG.title, titleUpdates: 0,
    titleIntervalMs: BACKGROUND_TITLE_INTERVAL_MS, lastTitleUpdateAt: null,
    lastTitleTickGapMs: null, maxTitleTickGapMs: 0
  };
  let backgroundPageHidden = false;
  let backgroundTitleBase = null, backgroundTitleOwned = null;
  let backgroundTitleTimer = null, backgroundTitleFlip = false, backgroundTitleTickAt = null;

  function backgroundEffectsShouldRun() {
    // 同一资格入口覆盖切课、等待扫描、考试返回等暂时没有视频的阶段。
    return antiFreezeBackgroundEligible();
  }

  function updateBackgroundTitle() {
    // 标题仅受自身配置和流程资格控制。
    if (KEEPALIVE_CONFIG.title && backgroundEffectsShouldRun()) {
      if (backgroundTitleTimer !== null) return; // 密集可见性、路由和主调度事件不重复创建。
      backgroundTitleBase = document.title || '';
      backgroundTitleOwned = null;
      backgroundTitleFlip = false;
      backgroundTitleTickAt = diagnosticNow();
      const timer = setInterval(() => {
        // 已清理但排队中的旧回调不得干扰下一次后台测试。
        if (backgroundTitleTimer !== timer) return;
        if (!KEEPALIVE_CONFIG.title || !backgroundEffectsShouldRun()) {
          updateBackgroundTitle(); return;
        }
        const now = diagnosticNow(), gap = Math.max(0, now - backgroundTitleTickAt);
        backgroundTitleTickAt = now;
        backgroundTitleDiagnostic.lastTitleTickGapMs = gap;
        backgroundTitleDiagnostic.maxTitleTickGapMs = Math.max(backgroundTitleDiagnostic.maxTitleTickGapMs, gap);
        // SPA切课若自行设置了新标题，保存它，以便返回前台时恢复。
        if (document.title !== (backgroundTitleOwned ?? backgroundTitleBase)) backgroundTitleBase = document.title || '';
        backgroundTitleOwned = backgroundTitleFlip ? '🙈挂机中' : '🙉挂机中';
        backgroundTitleFlip = !backgroundTitleFlip;
        document.title = backgroundTitleOwned;
        backgroundTitleDiagnostic.titleUpdates++;
        backgroundTitleDiagnostic.lastTitleUpdateAt = new Date().toISOString();
      }, BACKGROUND_TITLE_INTERVAL_MS);
      backgroundTitleTimer = timer;
      return;
    }
    if (backgroundTitleTimer !== null) {
      clearInterval(backgroundTitleTimer);
      backgroundTitleTimer = null;
    }
    backgroundTitleTickAt = null;
    if (backgroundTitleBase !== null) {
      // 页面路由若已自行更改标题，不能再用旧标题覆盖它。
      if (document.title === backgroundTitleOwned) {
        document.title = backgroundTitleBase;
        backgroundTitleDiagnostic.titleUpdates++;
      }
      backgroundTitleBase = backgroundTitleOwned = null;
    }
  }

  function syncBackgroundKeepalive(reason) {
    syncAntiFreezeModules(reason);
    updateBackgroundTitle();
  }

  const ANTI_FREEZE_OPTIONS = Object.freeze({ webRTC: KEEPALIVE_CONFIG.webRTC });
  const RTC_CONNECT_TIMEOUT_MS = 12000;
  const RTC_DISCONNECTED_GRACE_MS = 10000;
  const RTC_RETRY_BASE_MS = 2000, RTC_RETRY_MAX_MS = 30000;
  const antiFreezeModules = Object.fromEntries(Object.entries(ANTI_FREEZE_OPTIONS).map(([name, enabled]) =>
    [name, { enabled, supported: null, active: false, pending: false, starts: 0, stops: 0,
      failures: 0, attempts: 0, consecutiveFailures: 0, nextRetryAt: 0, reconnects: 0,
      lastError: null, lastAttemptAt: 0, status: '尚未尝试' }]));
  const antiFreezeDiagnostic = {
    version: '5.5.38', mode: 'fixed-rtc-title', runId: keepaliveRun.id,
    profile: keepaliveRun.profile, fullConfig: { ...KEEPALIVE_CONFIG }, options: { ...ANTI_FREEZE_OPTIONS },
    attribution: 'RTC依据本机短时对照结果保留；标题作为辅助，长期防冻结效果仍需验证',
    browserFrozen: '通过真实freeze/resume事件观测', browserSettingsReadable: false,
    freezePreventionVerified: false,
    confirmedFreezeEvents: [], confirmedFreezeEventsDropped: 0, confirmedFrozenMs: 0,
    activeBackgroundFreezeCount: 0, outsideActiveBackgroundFreezeCount: 0,
    scopes: { title: '后台1300ms交替标题，作用仍未单独证实',
      webRTC: '本页两端开放数据通道；断线限频重连，无外部STUN/TURN服务器' },
    rtcPolicy: { connectTimeoutMs: RTC_CONNECT_TIMEOUT_MS, disconnectedGraceMs: RTC_DISCONNECTED_GRACE_MS,
      retryBaseMs: RTC_RETRY_BASE_MS, retryMaxMs: RTC_RETRY_MAX_MS },
    maintenanceRuns: 0, maintenanceCoalesced: 0,
    events: [], eventsDropped: 0, windows: [], windowsDropped: 0,
    checkpointError: null, previousCheckpoint: null
  };
  const ANTI_FREEZE_CHECKPOINT_KEY = 'course-helper-rtc-title-checkpoint-v1';
  let antiFreezeWindow = null, antiFreezeNextWindowId = 0;
  let antiFreezePendingFreeze = null, antiFreezeLastPersistAt = -Infinity;
  let antiFreezeRTC = null;
  let antiFreezeLastEffectiveTickAt = -Infinity;

  function hasActiveBackgroundAutomationStage() {
    // currentVideo=null是正常切课中间态，不等于整个流程停止。
    return isExamPage() || enteringExam || !!courseVideoLoad || !!currentVideo?.isConnected ||
      startupCourseCheckPending || courseStateChecking || !!courseScrollTimer ||
      awaitingExamAfterVideo || !!videoEndedAt || wasExamPage;
  }
  function antiFreezeFlowEligible() {
    return !backgroundPageHidden && automationStarted &&
      !manualPaused && !anomalyDiagnostic.guardActive && !courseCompletionNotified &&
      hasActiveBackgroundAutomationStage();
  }
  function readBackgroundEligibilityState() {
    const stage = isExamPage() ? 'exam' : enteringExam ? 'entering-exam' :
      courseVideoLoad ? 'loading-course' : startupCourseCheckPending ? 'selecting-next-course' :
      courseStateChecking || courseScrollTimer ? 'scanning-courses' :
      awaitingExamAfterVideo || videoEndedAt ? 'waiting-after-ended' :
      wasExamPage ? 'returning-from-exam' : currentVideo?.isConnected ? 'current-video' : 'no-active-stage';
    const stopReason = backgroundPageHidden ? 'pagehide' : !automationStarted ? 'not-started' :
      manualPaused ? 'manual-or-overall-pause' : anomalyDiagnostic.guardActive ? 'anomaly-guard' :
      courseCompletionNotified ? 'all-courses-complete' : !hasActiveBackgroundAutomationStage() ? 'no-active-stage' : null;
    return { eligible: stopReason === null, stage, stopReason, realHidden: realDocumentHidden(),
      automationStarted, manualPaused, anomalyGuard: anomalyDiagnostic.guardActive,
      pageHiddenByNavigation: backgroundPageHidden, allCoursesComplete: courseCompletionNotified,
      currentVideoConnected: !!currentVideo?.isConnected,
      startupCourseCheckPending, courseStateChecking, courseScrollActive: !!courseScrollTimer,
      courseLoading: !!courseVideoLoad, enteringExam, awaitingExamAfterVideo,
      videoEndedPending: !!videoEndedAt, returningFromExam: wasExamPage };
  }
  let backgroundEligibilitySignature = '';
  function recordBackgroundEligibilityChange(reason) {
    const flow = readBackgroundEligibilityState(), signature = JSON.stringify(flow);
    if (signature === backgroundEligibilitySignature) return;
    backgroundEligibilitySignature = signature;
    antiFreezeEvent('eligibility', 'changed', { reason, flow });
    recordPlaybackDiagnostic('保活资格变化', currentVideo, { eligibility: flow, eligibilityReason: reason });
  }
  function antiFreezeBackgroundEligible() { return antiFreezeFlowEligible() && realDocumentHidden(); }
  function antiFreezeError(error) {
    // 不导出SDP、ICE地址、URL或浏览器扩展标识；只保留受控长度的错误名称和说明。
    return String(error?.name || 'Error') + ': ' + String(error?.message || error || 'unknown')
      .replace(/(?:https?|chrome-extension):\/\/\S+/g, '[address]').slice(0, 180);
  }
  function antiFreezeSnapshot() {
    return {
      background: realDocumentHidden(), eligible: antiFreezeFlowEligible(),
      eligibility: readBackgroundEligibilityState(),
      websiteVisibilityProtected: protectCourseVisibility(),
      titleTimer: backgroundTitleTimer !== null,
      rtcConnectionStates: antiFreezeRTC ? [antiFreezeRTC.a?.connectionState || 'absent', antiFreezeRTC.b?.connectionState || 'absent'] : [],
      rtcDisconnectedAgeMs: antiFreezeRTC?.disconnectedAt == null ? null : Math.max(0, Date.now() - antiFreezeRTC.disconnectedAt),
      rtcRetryInMs: Math.max(0, antiFreezeModules.webRTC.nextRetryAt - Date.now()),
      rtcChannelStates: antiFreezeRTC ? [antiFreezeRTC.channelA?.readyState || 'absent', antiFreezeRTC.channelB?.readyState || 'absent'] : [],
      rtcOpen: !!antiFreezeRTC && antiFreezeRTC.channelA?.readyState === 'open' && antiFreezeRTC.channelB?.readyState === 'open',
      modules: Object.fromEntries(Object.entries(antiFreezeModules).map(([name, m]) =>
        [name, { enabled: m.enabled, supported: m.supported, active: m.active, pending: m.pending, status: m.status }]))
    };
  }
  function antiFreezeEvent(module, action, detail = {}) {
    const event = { time: new Date().toISOString(), monotonicMs: diagnosticNow(),
      module, action, runId: keepaliveRun.id, profile: keepaliveRun.profile,
      windowId: antiFreezeWindow?.id || null, ...detail };
    antiFreezeDiagnostic.events.push(event);
    if (antiFreezeDiagnostic.events.length > 300) {
      antiFreezeDiagnostic.events.shift(); antiFreezeDiagnostic.eventsDropped++;
    }
  }
  function antiFreezeSetState(name, status, active = false, pending = false) {
    const m = antiFreezeModules[name];
    if (m.status === status && m.active === active && m.pending === pending) return;
    if (!m.active && active) m.starts++;
    if (m.active && !active) m.stops++;
    m.status = status; m.active = active; m.pending = pending;
    antiFreezeEvent(name, status, { active, pending });
  }
  function antiFreezeFail(name, error) {
    const m = antiFreezeModules[name]; m.failures++; m.lastError = antiFreezeError(error);
    antiFreezeSetState(name, '失败或被拒绝');
    antiFreezeEvent(name, 'error', { error: m.lastError });
  }
  function persistAntiFreezeCheckpoint(reason, force = false) {
    const now = diagnosticNow();
    if (!force && now - antiFreezeLastPersistAt < 30000) return;
    antiFreezeLastPersistAt = now;
    try {
      const w = antiFreezeWindow || antiFreezeDiagnostic.windows.at(-1);
      const summary = w ? { id: w.id, startedAt: w.startedAt, endAt: w.endAt,
        endReason: w.endReason, wallElapsedMs: w.wallElapsedMs, freezes: w.freezes,
        confirmedFrozenMs: w.confirmedFrozenMs, startMediaTime: w.startMediaTime,
        endMediaTime: w.endMediaTime, mediaDeltaComparable: w.mediaDeltaComparable,
        reportRequestsDelta: w.reportRequestsDelta, freezeSnapshots: w.freezeSnapshots.slice(-2),
        combinations: w.combinations.slice(-2) } : null;
      sessionStorage.setItem(ANTI_FREEZE_CHECKPOINT_KEY, JSON.stringify({ version: '5.5.38', runId: keepaliveRun.id, profile: keepaliveRun.profile,
        at: new Date().toISOString(), reason, window: summary,
        snapshot: antiFreezeSnapshot(), recentEvents: antiFreezeDiagnostic.events.slice(-12) }));
    } catch (error) { antiFreezeDiagnostic.checkpointError = antiFreezeError(error); }
  }
  try {
    const saved = sessionStorage.getItem(ANTI_FREEZE_CHECKPOINT_KEY);
    if (saved && saved.length <= 25000) {
      const parsed = JSON.parse(saved);
      if (['5.5.37', '5.5.38'].includes(parsed?.version)) antiFreezeDiagnostic.previousCheckpoint = parsed;
    }
  } catch (error) { antiFreezeDiagnostic.checkpointError = antiFreezeError(error); }

  function syncAntiFreezeWindow(reason) {
    if (antiFreezeBackgroundEligible() && !antiFreezeWindow) {
      antiFreezeModules.webRTC.consecutiveFailures = 0;
      antiFreezeModules.webRTC.nextRetryAt = 0;
      antiFreezeModules.webRTC.openedInWindow = false;
      antiFreezeWindow = { id: ++antiFreezeNextWindowId, startedAt: new Date().toISOString(),
        startWallMs: Date.now(), endAt: null, endReason: null, wallElapsedMs: 0,
        startVideoId: currentVideo ? diagnosticVideoIds.get(currentVideo) || null : null,
        startMediaTime: currentVideo?.currentTime ?? null, endMediaTime: null,
        startReports: progressReportDiagnostic.requests, reportRequestsDelta: 0,
        freezes: 0, confirmedFrozenMs: 0, freezeSnapshots: [],
        combinations: [], combinationChangesDropped: 0, lastCombination: '' };
      initializeKeepaliveWindow(antiFreezeWindow);
      antiFreezeDiagnostic.windows.push(antiFreezeWindow);
      if (antiFreezeDiagnostic.windows.length > 40) {
        antiFreezeDiagnostic.windows.shift(); antiFreezeDiagnostic.windowsDropped++;
      }
      antiFreezeEvent('combined', 'background-start', { snapshot: antiFreezeSnapshot() });
    } else if (!antiFreezeBackgroundEligible() && antiFreezeWindow) {
      antiFreezeWindow.endAt = new Date().toISOString(); antiFreezeWindow.endReason = reason;
      updateAntiFreezeWindow();
      observeKeepaliveWindow(antiFreezeWindow, antiFreezeSnapshot(), true);
      persistKeepaliveRound(reason, true);
      antiFreezeEvent('combined', 'background-end', { snapshot: antiFreezeSnapshot() });
      antiFreezeWindow = null;
      persistAntiFreezeCheckpoint(reason, true);
    }
    updateAntiFreezeWindow();
  }
  function updateAntiFreezeWindow() {
    const w = antiFreezeWindow;
    if (!w) return;
    w.wallElapsedMs = Math.max(0, Date.now() - w.startWallMs);
    if (currentVideo) {
      w.lastObservedMediaTime = currentVideo.currentTime;
      w.lastObservedVideoId = diagnosticVideoIds.get(currentVideo) || null;
    }
    // 视频在切课时清空，保留最后实际观测值，不把null当作已播放进度。
    w.endMediaTime = currentVideo?.currentTime ?? w.lastObservedMediaTime ?? null;
    w.endVideoId = currentVideo ? diagnosticVideoIds.get(currentVideo) || null : w.lastObservedVideoId ?? null;
    w.endMediaMeasurement = currentVideo ? 'current-video' : 'last-observed-before-clear';
    w.mediaDeltaComparable = w.startVideoId !== null && w.startVideoId === w.endVideoId;
    w.reportRequestsDelta = Math.max(0, progressReportDiagnostic.requests - w.startReports);
    const snapshot = antiFreezeSnapshot();
    const combination = JSON.stringify([snapshot.titleTimer, snapshot.rtcOpen]);
    if (combination !== w.lastCombination) {
      w.lastCombination = combination;
      w.combinations.push({ at: new Date().toISOString(), elapsedMs: w.wallElapsedMs, snapshot });
      if (w.combinations.length > 60) { w.combinations.shift(); w.combinationChangesDropped++; }
    }
  }

  function stopAntiFreezeRTC(reason = '清理') {
    const rtc = antiFreezeRTC; antiFreezeRTC = null;
    if (rtc) {
      clearTimeout(rtc.timeout);
      try { rtc.channelA?.close(); } catch (_) {}
      try { rtc.channelB?.close(); } catch (_) {}
      try { rtc.a?.close(); } catch (_) {}
      try { rtc.b?.close(); } catch (_) {}
    }
    if (rtc || antiFreezeModules.webRTC.pending) antiFreezeSetState('webRTC', '停止:' + reason);
  }
  function startAntiFreezeRTC() {
    const m = antiFreezeModules.webRTC;
    if (!m.enabled || !antiFreezeBackgroundEligible()) return;
    if (antiFreezeRTC) {
      const rtc = antiFreezeRTC;
      if (rtc.disconnectedAt !== null && Date.now() - rtc.disconnectedAt >= RTC_DISCONNECTED_GRACE_MS) {
        rtc.fail(new Error('本地连接disconnected超过10秒'));
      }
      return;
    }
    if (Date.now() < m.nextRetryAt) return;
    m.supported = typeof window.RTCPeerConnection === 'function';
    if (!m.supported) { antiFreezeSetState('webRTC', '浏览器不支持'); return; }
    m.attempts++; m.lastAttemptAt = Date.now();
    const rtc = { a: null, b: null, channelA: null, channelB: null, timeout: null,
      startedWallAt: Date.now(), disconnectedAt: null, opened: false,
      queues: [[], []], chains: [Promise.resolve(), Promise.resolve()] };
    antiFreezeRTC = rtc;
    const valid = () => antiFreezeRTC === rtc && antiFreezeBackgroundEligible();
    const fail = error => {
      if (antiFreezeRTC !== rtc) return;
      stopAntiFreezeRTC('连接失败'); antiFreezeFail('webRTC', error);
      m.consecutiveFailures++;
      const delayMs = Math.min(RTC_RETRY_MAX_MS,
        RTC_RETRY_BASE_MS * 2 ** Math.min(4, m.consecutiveFailures - 1));
      m.nextRetryAt = Date.now() + delayMs;
      antiFreezeEvent('webRTC', 'scheduled-reconnect', { delayMs,
        consecutiveFailures: m.consecutiveFailures, nextRetryAt: m.nextRetryAt });
    };
    rtc.fail = fail;
    const candidate = (index, value) => {
      if (!value || !valid()) return;
      const target = index === 0 ? rtc.b : rtc.a;
      if (!target.remoteDescription) { if (rtc.queues[index].length < 32) rtc.queues[index].push(value); return; }
      rtc.chains[index] = rtc.chains[index].then(() => {
        if (valid()) return target.addIceCandidate(value);
      }).catch(fail);
    };
    const opened = () => {
      if (!valid()) return;
      if (Date.now() - rtc.startedWallAt > RTC_CONNECT_TIMEOUT_MS && !m.active) { fail(new Error('连接在冻结或长延迟后才完成，废弃本轮')); return; }
      if (!rtc.opened && rtc.channelA?.readyState === 'open' && rtc.channelB?.readyState === 'open') {
        rtc.opened = true;
        if (m.openedInWindow) m.reconnects++;
        m.openedInWindow = true;
        m.consecutiveFailures = 0; m.nextRetryAt = 0;
        clearTimeout(rtc.timeout); m.lastError = null;
        antiFreezeSetState('webRTC', '本地数据通道open（不保证防冻结）', true);
        updateAntiFreezeWindow();
      }
    };
    const bind = channel => {
      channel.onopen = opened;
      channel.onerror = () => fail(new Error('本地数据通道错误'));
      channel.onclose = () => { if (antiFreezeRTC === rtc) fail(new Error('本地数据通道关闭')); };
    };
    try {
      // 仅两端本页环回；无STUN/TURN服务器，不传输业务内容、不申请媒体权限。
      rtc.a = new window.RTCPeerConnection({ iceServers: [] });
      rtc.b = new window.RTCPeerConnection({ iceServers: [] });
      rtc.a.onicecandidate = event => candidate(0, event.candidate);
      rtc.b.onicecandidate = event => candidate(1, event.candidate);
      rtc.b.ondatachannel = event => { if (!valid()) { try { event.channel.close(); } catch (_) {} return; }
        rtc.channelB = event.channel; bind(rtc.channelB); opened(); };
      rtc.channelA = rtc.a.createDataChannel('local-background-scheduler'); bind(rtc.channelA);
      for (const pc of [rtc.a, rtc.b]) pc.onconnectionstatechange = () => {
        if (!valid()) return;
        if (['failed', 'closed'].includes(pc.connectionState)) {
          fail(new Error('本地PeerConnection:' + pc.connectionState)); return;
        }
        if ([rtc.a, rtc.b].some(peer => peer.connectionState === 'disconnected')) {
          if (rtc.disconnectedAt === null) {
            rtc.disconnectedAt = Date.now();
            antiFreezeEvent('webRTC', 'disconnected-grace-start', { graceMs: RTC_DISCONNECTED_GRACE_MS });
          }
          antiFreezeSetState('webRTC', '连接临时disconnected，等待恢复');
        } else if (rtc.disconnectedAt !== null) {
          rtc.disconnectedAt = null;
          antiFreezeEvent('webRTC', 'disconnected-recovered');
          if (rtc.opened) antiFreezeSetState('webRTC', '本地数据通道open（不保证防冻结）', true);
        }
      };
      antiFreezeSetState('webRTC', '等待本地通道连接', false, true);
      rtc.timeout = setTimeout(() => fail(new Error('本地通道12秒连接超时')), RTC_CONNECT_TIMEOUT_MS);
      (async () => {
        const offer = await rtc.a.createOffer(); if (!valid()) return;
        await rtc.a.setLocalDescription(offer); if (!valid()) return;
        await rtc.b.setRemoteDescription(rtc.a.localDescription); if (!valid()) return;
        for (const item of rtc.queues[0].splice(0)) candidate(0, item);
        const answer = await rtc.b.createAnswer(); if (!valid()) return;
        await rtc.b.setLocalDescription(answer); if (!valid()) return;
        await rtc.a.setRemoteDescription(rtc.b.localDescription); if (!valid()) return;
        for (const item of rtc.queues[1].splice(0)) candidate(1, item);
        opened();
      })().catch(fail);
    } catch (error) { fail(error); }
  }

  function syncAntiFreezeModules(reason) {
    recordBackgroundEligibilityChange(reason);
    syncAntiFreezeWindow(reason);
    if (antiFreezeBackgroundEligible()) {
      startAntiFreezeRTC();
    } else {
      // 已停止模块不会反复写日志；延迟完成的异步申请也必须重新检查资格。
      stopAntiFreezeRTC(reason);
    }
    updateAntiFreezeWindow();
    if (antiFreezeBackgroundEligible()) persistAntiFreezeCheckpoint(reason);
  }
  function disposeAntiFreezeModules(reason) {
    syncAntiFreezeWindow(reason);
    stopAntiFreezeRTC(reason);
    persistAntiFreezeCheckpoint(reason, true);
  }
  function handleAntiFreezeLifecycle(name, event) {
    // isTrusted缺失也按未确认处理；用于标记测试派发的同名事件，不能伪称真实冻结。
    const trusted = event?.isTrusted === true;
    const snapshot = antiFreezeSnapshot();
    if (antiFreezeWindow && name === 'freeze' && trusted) {
      updateAntiFreezeWindow(); observeKeepaliveWindow(antiFreezeWindow, snapshot);
    }
    antiFreezeEvent('lifecycle', name, { trusted, snapshot });
    if (name === 'freeze') {
      if (trusted) {
        const flow = readBackgroundEligibilityState();
        const classification = flow.eligible && flow.realHidden ? 'active-background' :
          flow.pageHiddenByNavigation ? 'pagehide-or-cache' : 'outside-active-background';
        antiFreezeDiagnostic.confirmedFreezeEvents.push({ at: new Date().toISOString(),
          windowId: antiFreezeWindow?.id || null, classification, eligibility: flow, snapshot });
        if (antiFreezeDiagnostic.confirmedFreezeEvents.length > 40) {
          antiFreezeDiagnostic.confirmedFreezeEvents.shift(); antiFreezeDiagnostic.confirmedFreezeEventsDropped++;
        }
        if (classification === 'active-background') antiFreezeDiagnostic.activeBackgroundFreezeCount++;
        else antiFreezeDiagnostic.outsideActiveBackgroundFreezeCount++;
        antiFreezePendingFreeze = { at: Date.now(), window: antiFreezeWindow };
        if (antiFreezeWindow) {
          antiFreezeWindow.freezes++;
          antiFreezeWindow.freezeSnapshots.push({ at: new Date().toISOString(), snapshot });
          if (antiFreezeWindow.freezeSnapshots.length > 10) antiFreezeWindow.freezeSnapshots.shift();
        }
      }
      if (antiFreezeWindow && trusted) observeKeepaliveWindow(antiFreezeWindow, snapshot, true);
      persistAntiFreezeCheckpoint(trusted ? '真实freeze' : '未确认freeze事件', true);
      persistKeepaliveRound(trusted ? '真实freeze' : '未确认freeze事件', true);
    } else if (trusted && antiFreezePendingFreeze !== null) {
      const frozen = antiFreezePendingFreeze;
      const elapsedMs = Math.max(0, Date.now() - frozen.at);
      antiFreezePendingFreeze = null;
      antiFreezeDiagnostic.confirmedFrozenMs += elapsedMs;
      if (frozen.window) {
        frozen.window.confirmedFrozenMs += elapsedMs;
        observeKeepaliveWindow(frozen.window, snapshot, true);
      }
      antiFreezeEvent('lifecycle', 'confirmed-frozen-gap', { elapsedMs, frozenWindowId: frozen.window?.id || null });
      persistAntiFreezeCheckpoint('真实resume', true); persistKeepaliveRound('真实resume', true);
    }
  }
  function antiFreezeExport() {
    updateAntiFreezeWindow();
    const freezes = antiFreezeDiagnostic.confirmedFreezeEvents;
    const candidates = {
      title: snapshot => snapshot.titleTimer,
      visibility: snapshot => snapshot.websiteVisibilityProtected,
      webRTC: snapshot => snapshot.rtcOpen && snapshot.modules.webRTC.active
    };
    const evidence = Object.fromEntries(Object.entries(candidates).map(([name, running]) => [name, {
      observedAtRetainedConfirmedFreezes: freezes.filter(x => running(x.snapshot)).length,
      retainedConfirmedFreezeSnapshots: freezes.length,
      conclusion: '仅表示冻结时的实际状态；短时对照之外的稳定性仍需实际验证'
    }]));
    return { ...antiFreezeDiagnostic, modules: Object.fromEntries(Object.entries(antiFreezeModules).map(([name, m]) => [name, { ...m }])),
      candidateEvidence: evidence, currentSnapshot: antiFreezeSnapshot(), generatedAt: new Date().toISOString() };
  }
  // 沿用原有2秒调度和可见性事件，不为诊断增加后台轮询、音频或网络请求。
  let keepaliveLastCheckpointAt = -Infinity;
  let keepaliveRecoverySuccesses = 0;
  function keepaliveActual(snapshot = antiFreezeSnapshot()) {
    return { title: snapshot.titleTimer, webRTC: snapshot.rtcOpen && snapshot.modules.webRTC.active };
  }
  function keepaliveExpectedBackground() { return Object.keys(KEEPALIVE_CONFIG); }
  function keepaliveCounters() {
    return { pauses: playbackPauseDiagnostic.events,
      nonEndedPauses: Math.max(0, playbackPauseDiagnostic.events - playbackPauseDiagnostic.endedEvents),
      recoveries: keepaliveRecoverySuccesses,
      requests: progressReportDiagnostic.requests, responses: progressReportDiagnostic.responses,
      networkFailures: progressReportDiagnostic.networkFailures, httpFailures: progressReportDiagnostic.httpFailures };
  }
  function initializeKeepaliveWindow(w) {
    w.observation = {
      runId: keepaliveRun.id, profile: keepaliveRun.profile, config: { ...KEEPALIVE_CONFIG },
      firstReadyAt: null, readyObservedMs: 0,
      maxObservationGapMs: 0, observations: 0, moduleNotReadyObservations: 0,
      unreadyAfterReady: 0, unexpectedModules: [], failuresAtStart: Object.fromEntries(
        Object.entries(antiFreezeModules).map(([name, m]) => [name, m.failures])),
      failureDeltas: {}, unsupportedModules: [], startupIncompleteModules: [],
      startCounters: keepaliveCounters(), counterDeltas: {},
      mediaStallEpisodes: 0, maxMediaNoAdvanceMs: 0,
      outcome: '尚未采样', mediaNoAdvanceObservationLimited: false
    };
  }
  function observeKeepaliveWindow(w, snapshot, ending = false) {
    if (!w.observation) initializeKeepaliveWindow(w);
    const x = w.observation, now = Date.now(), actual = keepaliveActual(snapshot);
    const expected = keepaliveExpectedBackground();
    const unexpected = Object.keys(actual).filter(name => !KEEPALIVE_CONFIG[name] && actual[name]);
    for (const name of unexpected) if (!x.unexpectedModules.includes(name)) x.unexpectedModules.push(name);
    x.failureDeltas = Object.fromEntries(Object.entries(antiFreezeModules)
      .map(([name, m]) => [name, Math.max(0, m.failures - (x.failuresAtStart[name] || 0))]));
    x.unsupportedModules = expected.filter(name => antiFreezeModules[name]?.supported === false);
    const ready = expected.every(name => actual[name]) && unexpected.length === 0;
    // 结束或恢复事件也计算采样间隙，防止前台先到而漏记冻结期间的大间隔。
    const gap = x.lastObservedAt === undefined ? 0 : Math.max(0, now - x.lastObservedAt);
    x.maxObservationGapMs = Math.max(x.maxObservationGapMs, gap);
    x.mediaNoAdvanceObservationLimited ||= gap > 6000;
    if (!ending) {
      // 只累计相邻采样均就绪且间隔正常的时长；大间隙不伪称持续运行。
      if (ready && x.lastReady && gap <= 6000) x.readyObservedMs += gap;
      if (ready && x.firstReadyAt === null) x.firstReadyAt = new Date(now).toISOString();
      if (!ready) {
        x.moduleNotReadyObservations++;
        if (x.firstReadyAt !== null) x.unreadyAfterReady++;
      }
      x.lastObservedAt = now; x.lastReady = ready; x.observations++;
      if (currentVideo?.isConnected && !currentVideo.ended && !currentVideo.seeking) {
        const id = diagnosticVideoIds.get(currentVideo) || null;
        const time = currentVideo.currentTime;
        if (id !== x.lastMediaId || !Number.isFinite(time) || time !== x.lastMediaTime) {
          x.mediaUnchangedSince = now; x.mediaStallMarked = false;
        } else {
          const stalledMs = Math.max(0, now - x.mediaUnchangedSince);
          x.maxMediaNoAdvanceMs = Math.max(x.maxMediaNoAdvanceMs, stalledMs);
          if (stalledMs >= 15000 && !x.mediaStallMarked) {
            x.mediaStallMarked = true; x.mediaStallEpisodes++;
            antiFreezeEvent('observation', 'media-no-advance', { videoId: id, stalledMs,
              paused: currentVideo.paused, readyState: currentVideo.readyState });
          }
        }
        x.lastMediaId = id; x.lastMediaTime = time;
      } else {
        x.lastMediaId = null; x.lastMediaTime = null;
        x.mediaUnchangedSince = now; x.mediaStallMarked = false;
      }
    }
    // 结束事件发生在模块已清理之后，不把正常清理计为中途失活。
    x.startupIncompleteModules = x.firstReadyAt === null && w.wallElapsedMs >= 15000 ?
      expected.filter(name => !actual[name]) : [];
    const counters = keepaliveCounters();
    x.counterDeltas = Object.fromEntries(Object.entries(counters)
      .map(([key, value]) => [key, Math.max(0, value - (x.startCounters[key] || 0))]));
    const failures = expected.some(name => (x.failureDeltas[name] || 0) > 0);
    if (w.freezes > 0) x.outcome = '观察到真实冻结：查看冻结时模块快照';
    else if (x.unsupportedModules.length || x.startupIncompleteModules.length) x.outcome = '保活模块未就绪或不支持';
    else if (failures || x.unreadyAfterReady > 0) x.outcome = '曾发生模块失活或重连，未记录真实冻结';
    else if (x.maxObservationGapMs > 6000) x.outcome = '存在采样大间隙，未记录真实冻结';
    else x.outcome = x.firstReadyAt === null ? '保活模块启动中' : '已观察区间内未记录真实冻结';
  }
  function keepaliveWindowSummary(w) {
    const x = w.observation;
    return { id: w.id, startedAt: w.startedAt, endAt: w.endAt, endReason: w.endReason,
      wallElapsedMs: w.wallElapsedMs, freezes: w.freezes, confirmedFrozenMs: w.confirmedFrozenMs,
      profile: x?.profile, outcome: x?.outcome, firstReadyAt: x?.firstReadyAt,
      readyObservedMs: x?.readyObservedMs, maxObservationGapMs: x?.maxObservationGapMs,
      failureDeltas: x?.failureDeltas, unsupportedModules: x?.unsupportedModules,
      unexpectedModules: x?.unexpectedModules, startupIncompleteModules: x?.startupIncompleteModules,
      unreadyAfterReady: x?.unreadyAfterReady, counterDeltas: x?.counterDeltas,
      maxMediaNoAdvanceMs: x?.maxMediaNoAdvanceMs, mediaStallEpisodes: x?.mediaStallEpisodes,
      mediaNoAdvanceObservationLimited: x?.mediaNoAdvanceObservationLimited };
  }
  function keepaliveRoundSummary(reason) {
    return { version: '5.5.38', runId: keepaliveRun.id, profile: keepaliveRun.profile,
      config: { ...KEEPALIVE_CONFIG }, startedAt: keepaliveRun.startedAt,
      savedAt: new Date().toISOString(), reason,
      activeBackgroundFreezeCount: antiFreezeDiagnostic.activeBackgroundFreezeCount,
      outsideActiveBackgroundFreezeCount: antiFreezeDiagnostic.outsideActiveBackgroundFreezeCount,
      wasDiscarded: !!document.wasDiscarded,
      windows: antiFreezeDiagnostic.windows.slice(-8).map(keepaliveWindowSummary),
      freezeEvidence: antiFreezeDiagnostic.confirmedFreezeEvents.slice(-3).map(e => ({
        at: e.at, classification: e.classification, windowId: e.windowId,
        actual: keepaliveActual(e.snapshot), eligibility: e.eligibility
      })) };
  }
  function persistKeepaliveRound(reason, force = false) {
    const now = diagnosticNow();
    if (!force && now - keepaliveLastCheckpointAt < 30000) return;
    keepaliveLastCheckpointAt = now;
    try { sessionStorage.setItem(KEEPALIVE_RUN_KEY, JSON.stringify(keepaliveRoundSummary(reason))); }
    catch (error) { keepaliveRun.checkpointError = antiFreezeError(error); }
  }
  function keepaliveDiagnosticMaintenance() {
    if (antiFreezeWindow) {
      updateAntiFreezeWindow();
      observeKeepaliveWindow(antiFreezeWindow, antiFreezeSnapshot());
      persistKeepaliveRound('观察检查点');
    }
  }
  function keepaliveExportData() {
    updateAntiFreezeWindow();
    return {
      scriptVersion: SCRIPT_VERSION,
      courseScope: { generation: courseScopeEpoch, hasCourseIdentity: !!activeCoursePageKey, awaitingConfirmation: courseChangePending },
      version: '5.5.38', baseVersion: '5.5.37',
      keepalive: { ...keepaliveRun, summary: keepaliveRoundSummary('导出'),
        limits: '短时对照支持RTC；标题独立作用和长时间稳定性尚未证实' },
      antiFreezeDiagnostic: antiFreezeExport(), lifecycleDiagnostic,
      backgroundTitleDiagnostic: { ...backgroundTitleDiagnostic, titleTimerActive: backgroundTitleTimer !== null },
      courseEndDiagnostic, progressReportHistory, playbackAttemptDiagnostic,
      examFlowDiagnostic, playbackPauseDiagnostic: { ...playbackPauseDiagnostic },
      anomalyDiagnostic: { ...anomalyDiagnostic }, criticalRecords: criticalDiagnosticRecords,
      visibilityProtectionHooks, progressReportDiagnostic, diagnosticHooks: diagnosticHookStatus,
      wasDiscarded: !!document.wasDiscarded, targetVolume: COURSE_TEST_VOLUME,
      generatedAt: new Date().toISOString(), userAgent: navigator.userAgent,
      records: playbackDiagnosticRecords
    };
  }
  function keepaliveExportJSON(data) {
    return JSON.stringify(data, (key, value) => {
      if (/^(authorization|licenseKey|password|token|accessToken|refreshToken|memberId|coursesId)$/i.test(key)) return '[redacted]';
      if (typeof value !== 'string') return value;
      return value
        .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]')
        .replace(/\b(token|accessToken|refreshToken|password|memberId|coursesId)\s*[:=]\s*([^\s,;]+)/gi, '$1=[redacted]')
        .replace(/https?:\/\/[^\s"'<>]+/g, raw => {
        try { const u = new URL(raw); return u.origin + u.pathname; } catch (_) { return '[address]'; }
      });
    }, 2);
  }
  function downloadKeepaliveDiagnostic() {
    let url = null, link = null;
    try {
      recordPlaybackDiagnostic('诊断日志导出'); persistKeepaliveRound('导出', true);
      url = URL.createObjectURL(new Blob([keepaliveExportJSON(keepaliveExportData())], { type: 'text/plain;charset=utf-8' }));
      link = document.createElement('a'); link.href = url;
      link.download = 'course-keepalive-' + keepaliveRun.profile + '-' + keepaliveRun.id + '.txt';
      document.body.appendChild(link); link.click(); link.remove();
      const releaseURL = url; setTimeout(() => URL.revokeObjectURL(releaseURL), 10000);
      return true;
    } catch (error) {
      try { link?.remove(); if (url) URL.revokeObjectURL(url); } catch (_) {}
      keepaliveRun.checkpointError = antiFreezeError(error);
      console.warn('[课程助手] 诊断导出失败', keepaliveRun.checkpointError); return false;
    }
  }
  // 保留按需日志，不增加前台状态面板；只响应真实用户快捷键。
  document.addEventListener('keydown', event => {
    if (event.isTrusted !== true || event.repeat || realDocumentHidden() ||
        !event.ctrlKey || !event.altKey || event.shiftKey || event.metaKey ||
        String(event.key).toLowerCase() !== 'l') return;
    if (downloadKeepaliveDiagnostic()) event.preventDefault();
  }, true);

  function diagnosticStackSource(stack) {
    const frames = String(stack || '').split('\n');
    const site = 'https://yuancheng.henanyixue.com/static/1.1.20/js/playVideo-B59Q9S1Y.js:';
    if (frames.some(line => line.includes(site) && line.includes('at HTMLDocument.N ('))) return '网站页面隐藏回调 N';
    if (frames.some(line => line.includes(site) && /at x \(/.test(line))) return '网站进度检查 x（分支待核对）';
    if (frames.some(line => line.includes('at startCourseAutomation ('))) return '脚本启动课程检查';
    if (frames.some(line => line.includes(site))) {
      return frames.some(line => line.includes('handleFragLoadError')) ?
        '网站播放器分片加载错误处理' : '网站播放器代码（分支待核对）';
    }
    return '其他脚本调用';
  }

  function readDiagnosticPopupState() {
    let checkinPopupPresent = false, checkinPopupVisible = false;
    let fastForwardWarningPresent = false, fastForwardWarningVisible = false;
    let learningRestrictionPresent = false, learningRestrictionVisible = false;
    const isVisible = node => {
      const overlay = node.closest?.('.el-overlay') || node;
      return !!node.isConnected && !!overlay.getClientRects?.().length &&
        (typeof getComputedStyle !== 'function' || getComputedStyle(overlay).visibility !== 'hidden');
    };
    for (const dialog of document.querySelectorAll('.el-dialog.myDialogClass')) {
      if ((dialog.textContent || '').includes('打卡') && dialog.querySelector('.vertifyWrap')) {
        checkinPopupPresent = true;
        checkinPopupVisible ||= isVisible(dialog);
      }
    }
    for (const node of [...document.querySelectorAll('.el-message, .el-message-box, .van-toast'),
      ...document.querySelectorAll('.el-dialog, [role="alert"], [role="dialog"]')]) {
      const text = (node.textContent || '').replace(/\s+/g, '');
      if (text.includes('课程学习存在异常') && /账号(?:会|已)?封禁/.test(text)) {
        learningRestrictionPresent = true;
        learningRestrictionVisible ||= isVisible(node);
      }
      if (text.includes('请勿尝试快进视频')) {
        fastForwardWarningPresent = true;
        fastForwardWarningVisible ||= isVisible(node);
      }
    }
    return { checkinPopupPresent, checkinPopupVisible, fastForwardWarningPresent, fastForwardWarningVisible, learningRestrictionPresent, learningRestrictionVisible };
  }

  function observeDiagnosticPopupState() {
    const state = readDiagnosticPopupState();
    const signature = JSON.stringify(state);
    if (signature === diagnosticPopupSignature) return;
    const initial = !diagnosticPopupSignature;
    const previous = diagnosticPopupLastState || {};
    if (state.fastForwardWarningPresent && !previous.fastForwardWarningPresent) anomalyDiagnostic.warningAppearances++;
    if (state.learningRestrictionPresent && !previous.learningRestrictionPresent) anomalyDiagnostic.restrictionAppearances++;
    diagnosticPopupSignature = signature;
    diagnosticPopupLastState = state;
    if (!initial || state.checkinPopupPresent || state.fastForwardWarningPresent || state.learningRestrictionPresent) {
      if (state.fastForwardWarningPresent || state.learningRestrictionPresent) anomalyDiagnostic.lastWarningAt = new Date().toISOString();
      recordPlaybackDiagnostic('暂停相关弹窗变化', currentVideo, { ...state, ...recentForwardSeekContext(currentVideo) });
    }
    ensureCourseWarningPaused(state);
    hideConfirmedFastForwardWarning();
  }

  function observeDiagnosticTimeupdate(video) {
    const now = diagnosticNow(), source = diagnosticSource(video);
    const previous = diagnosticTimeupdates.get(video);
    const observation = {
      at: now, currentTime: video.currentTime, rate: video.playbackRate,
      paused: video.paused, source, lastLoggedAt: previous?.lastLoggedAt ?? now
    };
    diagnosticTimeupdates.set(video, observation);
    if (!previous || previous.source !== source) return;
    const elapsed = (now - previous.at) / 1000;
    const mediaDelta = video.currentTime - previous.currentTime;
    const expected = previous.paused ? 0 : elapsed * previous.rate;
    const difference = mediaDelta - expected;
    observation.intervalSeconds = elapsed;
    observation.mediaDeltaSeconds = mediaDelta;
    observation.expectedSeconds = expected;
    observation.differenceSeconds = difference;
    const gap = elapsed > 2.5;
    const jump = mediaDelta < -0.5 || difference > 2;
    if (!gap && !jump && now - observation.lastLoggedAt < 10000) return;
    observation.lastLoggedAt = now;
    recordPlaybackDiagnostic(jump ? 'timeupdate进度变化' : gap ? 'timeupdate间隔增大' : 'timeupdate观测', video, {
      timeupdateIntervalSeconds: elapsed, timeupdateMediaDeltaSeconds: mediaDelta,
      timeupdateExpectedSeconds: expected, timeupdateDifferenceSeconds: difference
    });
  }

  function recordDiagnosticSeekCall(video, value, method) {
    if (video?.tagName !== 'VIDEO') return;
    const stack = new Error('进度写入来源').stack;
    const detail = {
      previousTime: video.currentTime, requestedTime: typeof value === 'number' ? value : null,
      requestedValueType: typeof value, seekMethod: method,
      seekCallSource: diagnosticStackSource(stack), stack
    };
    const now = diagnosticNow();
    detail.seekDeltaSeconds = detail.requestedTime === null ? null : detail.requestedTime - detail.previousTime;
    detail.fragmentLoadErrorRecovery = detail.seekCallSource === '网站播放器分片加载错误处理';
    if (Number.isFinite(detail.seekDeltaSeconds) && detail.seekDeltaSeconds > 0) {
      const recent = { at: now, time: new Date().toISOString(), source: diagnosticSource(video),
        deltaSeconds: detail.seekDeltaSeconds, origin: detail.seekCallSource,
        fragmentLoadErrorRecovery: detail.fragmentLoadErrorRecovery, readyState: video.readyState };
      recentForwardSeeks.set(video, recent);
      anomalyDiagnostic.forwardSeekCalls++;
      if (detail.fragmentLoadErrorRecovery) anomalyDiagnostic.fragmentRecoverySeeks++;
      anomalyDiagnostic.lastForwardSeek = { time: recent.time, deltaSeconds: recent.deltaSeconds,
        origin: recent.origin, fragmentLoadErrorRecovery: recent.fragmentLoadErrorRecovery, readyState: recent.readyState };
    }
    diagnosticSeekCalls.set(video, { at: now, ...detail });
    recordPlaybackDiagnostic('视频进度写入', video, { ...detail, ...recentForwardSeekContext(video) });
    return detail;
  }

  function recentForwardSeekContext(video) {
    const seek = video && recentForwardSeeks.get(video);
    const age = seek ? diagnosticNow() - seek.at : -1;
    // 仅关联同一媒体源且两分钟内的写入；不把相关性当作封禁原因。
    if (!seek || seek.source !== diagnosticSource(video) || age < 0 || age > 120000) return {};
    return { recentForwardSeekAgeMs: age, recentForwardSeekDeltaSeconds: seek.deltaSeconds,
      recentForwardSeekOrigin: seek.origin, recentForwardSeekWasFragmentRecovery: seek.fragmentLoadErrorRecovery,
      recentForwardSeekReadyState: seek.readyState };
  }

  function noteForwardedProgressRollback(video, value, detail) {
    if (video !== currentVideo || !video?.isConnected || video.ended || isExamPage() || enteringExam ||
        !detail || !Number.isFinite(value) ||
        !Number.isFinite(detail.previousTime) || value < 0 || value >= detail.previousTime ||
        !matchesKnownProgressCheck(detail.stack)) return;
    anomalyDiagnostic.progressRollbacks++;
    pauseForCourseWarning('网页进度异常回退', video);
  }

  function matchesKnownProgressCheck(stack) {
    return String(stack || '').split('\n').some(line =>
      /^at x \(https:\/\/yuancheng\.henanyixue\.com\/static\/1\.1\.20\/js\/playVideo-B59Q9S1Y\.js:89:\d+\)$/.test(line.trim()));
  }

  function shouldBlockFastForwardRollback(video, value, detail) {
    if (!DISABLE_FAST_FORWARD_RESPONSE_TEST || !canContinueCourseFlow(video, true) ||
        video.readyState < 2 || video.error || typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
        !detail || !matchesKnownProgressCheck(detail.stack) || value >= detail.previousTime) return false;
    // 用户上传源码中 x() 唯一的 seek() 是快进检测后的回退。只拦截该构建、该课程的倒退写入。
    fastForwardRollbackBlocks.set(video, { at: diagnosticNow(), source: diagnosticSource(video) });
    recordPlaybackDiagnostic('已屏蔽快进检测回退', video, detail);
    return true;
  }

  function hasRecentFastForwardRollback(video) {
    const blocked = video && fastForwardRollbackBlocks.get(video);
    return !!(DISABLE_FAST_FORWARD_RESPONSE_TEST && canContinueCourseFlow(video, true) && blocked &&
      blocked.source === diagnosticSource(video) && diagnosticNow() - blocked.at >= 0 && diagnosticNow() - blocked.at <= 1000);
  }

  function hideConfirmedFastForwardWarning() {
    if (!hasRecentFastForwardRollback(currentVideo)) return;
    const warning = '请勿尝试快进视频，否则将判定为违规学习';
    for (const node of document.querySelectorAll('.el-message, .van-toast')) {
      if ((node.textContent || '').replace(/\s+/g, '') !== warning || !node.style ||
          node.style.getPropertyValue('display') === 'none') continue;
      node.style.setProperty('display', 'none', 'important');
      recordPlaybackDiagnostic('已屏蔽快进检测警告', currentVideo);
    }
  }

  // 普通进度写入原样转发；测试开关仅阻止已确认 x() 分支回退当前课程，不修改时间 getter。
  try {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
    if (descriptor?.configurable && descriptor.get && descriptor.set) {
      Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
        ...descriptor,
        set(value) {
          let detail;
          try { detail = recordDiagnosticSeekCall(this, value, 'currentTime'); } catch {}
          if (shouldBlockFastForwardRollback(this, value, detail)) return;
          const result = Reflect.apply(descriptor.set, this, [value]);
          try { noteForwardedProgressRollback(this, value, detail); } catch (error) {
            console.warn('[课程助手] 异常回退诊断失败', String(error));
          }
          return result;
        }
      });
      diagnosticHookStatus.currentTime = true;
    }
    const fastSeekDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'fastSeek');
    if (fastSeekDescriptor?.configurable && typeof fastSeekDescriptor.value === 'function') {
      Object.defineProperty(HTMLMediaElement.prototype, 'fastSeek', {
        ...fastSeekDescriptor,
        value: function(...args) {
          let detail;
          try { detail = recordDiagnosticSeekCall(this, args[0], 'fastSeek'); } catch {}
          if (shouldBlockFastForwardRollback(this, args[0], detail)) return;
          const result = Reflect.apply(fastSeekDescriptor.value, this, args);
          try { noteForwardedProgressRollback(this, args[0], detail); } catch (error) {
            console.warn('[课程助手] 异常回退诊断失败', String(error));
          }
          return result;
        }
      });
      diagnosticHookStatus.fastSeek = true;
    }
  } catch (error) {
    recordPlaybackDiagnostic('进度写入诊断安装失败', null, { error: String(error) });
  }

  function canSetCourseAudio(video) {
    return automationStarted && !manualPaused && !backgroundPageHidden && !isExamPage() && !enteringExam &&
      !!video && video === currentVideo && video.tagName === 'VIDEO' && video.isConnected && !video.ended;
  }

  function readCourseVolumeUI(video) {
    const root = video?.closest?.('.by-player');
    return {
      displayedVolume: root?.querySelector('.by-player__volume-pct')?.textContent?.trim(),
      volumeFill: root?.querySelector('.by-player__volume-fill')?.style?.height,
      volumeThumb: root?.querySelector('.by-player__volume-thumb')?.style?.bottom
    };
  }

  function courseVolumeMatchesTarget(video) {
    return Number.isFinite(video?.volume) && Math.abs(video.volume - COURSE_TEST_VOLUME) <= 1e-9 &&
      (COURSE_TEST_VOLUME === 0 || video.muted === false);
  }

  function courseVolumeUIIsTarget(ui) {
    // 原网页数字 Math.round，轨道 toFixed(1)；同时核验真实媒体音量，避免仅看文字。
    const displayed = String(Math.round(COURSE_TEST_VOLUME * 100));
    const position = Number((COURSE_TEST_VOLUME * 100).toFixed(1));
    return ui.displayedVolume === displayed && parseFloat(ui.volumeFill) === position && parseFloat(ui.volumeThumb) === position;
  }

  function courseVolumeUIHasMismatch(ui) {
    const displayed = String(Math.round(COURSE_TEST_VOLUME * 100));
    const position = Number((COURSE_TEST_VOLUME * 100).toFixed(1));
    return (ui.displayedVolume != null && ui.displayedVolume !== displayed) ||
      (ui.volumeFill != null && parseFloat(ui.volumeFill) !== position) ||
      (ui.volumeThumb != null && parseFloat(ui.volumeThumb) !== position);
  }

  function makeCourseVolumeSliderEvent(type, rect) {
    const targetY = rect.top + rect.height * (1 - COURSE_TEST_VOLUME);
    const event = new MouseEvent(type, {
      view: window, bubbles: true, cancelable: true, button: 0,
      clientX: rect.left + rect.width / 2, clientY: targetY
    });
    // 部分浏览器的 MouseEventInit 把坐标取整。只在合成事件上补足亚像素坐标，
    // 仍由原网页 n()->setVolume() 更新播放器，不直接写媒体属性或组件内部状态。
    if (event.clientY !== targetY) Object.defineProperty(event, 'clientY', { value: targetY });
    const actualTarget = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    if (!Number.isFinite(actualTarget) || Math.abs(actualTarget - COURSE_TEST_VOLUME) > 1e-9) {
      throw new Error('音量事件坐标无法表达目标音量');
    }
    return event;
  }

  function syncCourseVolumeBySlider(video = currentVideo) {
    if (!canSetCourseAudio(video)) return Promise.resolve(false);
    const root = video.closest?.('.by-player');
    const panel = root?.querySelector('.by-player__volume');
    if (!panel) return Promise.resolve(false);
    const source = diagnosticSource(video);
    let sync = courseVolumeUISync.get(video);
    if (!sync || sync.root !== root || sync.source !== source) {
      sync?.cancel?.();
      sync = { pending: false, verified: false, lastAttempt: -Infinity, root, source, token: 0 };
      courseVolumeUISync.set(video, sync);
    }
    if (!courseVolumeMatchesTarget(video)) sync.verified = false;
    const ui = readCourseVolumeUI(video);
    if (courseVolumeMatchesTarget(video) && courseVolumeUIIsTarget(ui)) {
      sync.verified = true;
      return Promise.resolve(true);
    }
    const mismatch = courseVolumeUIHasMismatch(ui);
    if (!mismatch && sync.verified) return Promise.resolve(courseVolumeMatchesTarget(video));
    if (sync.pending) return sync.promise;
    if (Date.now() - sync.lastAttempt < 5000) return Promise.resolve(courseVolumeMatchesTarget(video));
    sync.pending = true;
    sync.lastAttempt = Date.now();
    const token = ++sync.token;
    let resolveReady, finished = false, applied = false, fallbackTimer = null;
    sync.promise = new Promise(resolve => { resolveReady = resolve; });
    const active = () => canSetCourseAudio(video) && video.closest?.('.by-player') === root &&
      diagnosticSource(video) === source && courseVolumeUISync.get(video) === sync && sync.token === token;
    const openedByScript = !panel.querySelector('.by-player__volume-track');
    const closePanel = () => {
      if (openedByScript && panel.isConnected && !panel.matches?.(':hover')) {
        panel.dispatchEvent(new MouseEvent('mouseleave', { view: window }));
      }
    };
    const finish = (success, reason) => {
      if (finished) return;
      finished = true;
      if (fallbackTimer !== null) clearTimeout(fallbackTimer);
      sync.pending = false;
      sync.cancel = null;
      resolveReady(success);
      if (!success) {
        closePanel();
        if (active()) recordPlaybackDiagnostic('音量滑块同步未完成', video, { reason });
        return;
      }
      // 播放只等待真实媒体音量；界面文字/轨道在后续渲染后单独核验。
      recordPlaybackDiagnostic('播放前音量已就绪', video, {
        targetVolume: COURSE_TEST_VOLUME, targetVolumePercent: COURSE_TEST_VOLUME * 100
      });
      setTimeout(() => {
        if (!active()) { closePanel(); return; }
        const after = readCourseVolumeUI(video);
        sync.verified = courseVolumeMatchesTarget(video) && courseVolumeUIIsTarget(after);
        recordPlaybackDiagnostic(sync.verified ? '音量滑块同步成功' : '音量滑块同步未完成', video, {
          volumeSyncMethod: 'slider-mousedown', targetVolume: COURSE_TEST_VOLUME,
          targetVolumePercent: COURSE_TEST_VOLUME * 100, volumeUISynced: sync.verified, ...after
        });
        closePanel();
      }, 50);
    };
    sync.cancel = () => finish(false, '播放器或媒体源已切换');
    try {
      if (openedByScript) panel.dispatchEvent(new MouseEvent('mouseenter', { view: window }));
    } catch (error) { finish(false, String(error)); return sync.promise; }
    const attempt = () => {
      if (finished) return;
      if (!active()) { finish(false, '流程已暂停或播放器已切换'); return; }
      if (applied) {
        if (courseVolumeMatchesTarget(video)) finish(true);
        return;
      }
      const track = panel.querySelector('.by-player__volume-track');
      const rect = track?.getBoundingClientRect();
      if (!rect || !Number.isFinite(rect.height) || rect.height <= 0 || !Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)) {
        return;
      }
      let downEvent, upEvent;
      try {
        downEvent = makeCourseVolumeSliderEvent('mousedown', rect);
        upEvent = makeCourseVolumeSliderEvent('mouseup', rect);
      } catch (error) { finish(false, String(error)); return; }
      try {
        // 使用源码的 mousedown 处理函数，让播放器自身设置0%，兼容其自动静音行为。
        // 不发送 click，不触发播放/暂停或静音按钮。
        applied = true;
        track.dispatchEvent(downEvent);
      } catch (error) { finish(false, String(error)); return; }
      finally {
        // 源码会为拖动注册 document 监听器，必须配对 mouseup 解除。
        try { document.dispatchEvent(upEvent); }
        catch (error) { finish(false, String(error)); }
      }
      if (!finished && courseVolumeMatchesTarget(video)) finish(true);
    };
    // Vue的DOM挂载和音量watch通常由微任务完成，后台无需等节流后的定时器。
    // 有限三次微任务复查，加一次50ms兜底；不会建立循环或重复mousedown。
    fallbackTimer = setTimeout(() => {
      attempt();
      if (!finished) finish(false, applied ? '滑块事件未更新实际音量' : '音量轨道尚未显示');
    }, 50);
    Promise.resolve().then(attempt).then(attempt).then(attempt).catch(error => finish(false, String(error)));
    return sync.promise;
  }

  document.addEventListener('mouseover', event => {
    const panel = event.target?.closest?.('.by-player__volume');
    if (panel && panel === currentVideo?.closest?.('.by-player')?.querySelector('.by-player__volume')) {
      syncCourseVolumeBySlider(currentVideo);
    }
  }, true);

  function readPlaybackPresentationDiagnostic(video) {
    const rect = video?.getBoundingClientRect?.();
    return {
      pictureInPictureActive: !!document.pictureInPictureElement,
      videoInPictureInPicture: !!video && document.pictureInPictureElement === video,
      fullscreenActive: !!document.fullscreenElement,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      outerWindowWidth: window.outerWidth, outerWindowHeight: window.outerHeight,
      renderedVideoWidth: rect?.width, renderedVideoHeight: rect?.height
    };
  }

  function recordPlaybackDiagnostic(type, video = currentVideo, detail = {}) {
    if (type === '课程恢复成功') keepaliveRecoverySuccesses++;
    if (video && !diagnosticVideoIds.has(video)) diagnosticVideoIds.set(video, nextDiagnosticVideoId++);
    const now = diagnosticNow();
    const lastSample = video && diagnosticSamples.get(video);
    const lastUpdate = video && diagnosticTimeupdates.get(video);
    const lastPause = video && diagnosticPauseCalls.get(video);
    const lastSeek = video && diagnosticSeekCalls.get(video);
    const sampleDetail = {};
    if (type === '播放采样' && video) {
      const source = diagnosticSource(video);
      if (lastSample) {
        sampleDetail.sampleElapsedSeconds = (now - lastSample.at) / 1000;
        sampleDetail.sampleMediaDeltaSeconds = video.currentTime - lastSample.currentTime;
        sampleDetail.sampleSourceChanged = source !== lastSample.source;
        sampleDetail.samplePreviousPaused = lastSample.paused;
        sampleDetail.samplePreviousRate = lastSample.rate;
        sampleDetail.sampleIntervalDelayed = sampleDetail.sampleElapsedSeconds > 3;
        // 仅用于观测：期间发生暂停、跳转或变速时，差值不能直接当作快进结论。
        if (!sampleDetail.sampleSourceChanged) {
          sampleDetail.sampleExpectedSeconds = lastSample.paused ? 0 : sampleDetail.sampleElapsedSeconds * lastSample.rate;
          sampleDetail.sampleDifferenceSeconds = sampleDetail.sampleMediaDeltaSeconds - sampleDetail.sampleExpectedSeconds;
        }
      }
      diagnosticSamples.set(video, { at: now, currentTime: video.currentTime, rate: video.playbackRate, paused: video.paused, source });
    }
    const entry = {
      time: new Date().toISOString(), type, runId: keepaliveRun.id, profile: keepaliveRun.profile,
      monotonicMs: now,
      visibility: realDocumentVisibility(), focused: realDocumentHasFocus(),
      websiteVisibilityProtected: protectCourseVisibility(),
      videoId: video ? diagnosticVideoIds.get(video) : null,
      currentVideoId: currentVideo ? diagnosticVideoIds.get(currentVideo) : null,
      isCurrentVideo: !!video && video === currentVideo,
      playbackSourceId: video ? playbackMediaStates.get(video)?.id ?? null : null,
      playbackAttemptId: video ? playbackMediaStates.get(video)?.lastAttempt?.record.attemptId ?? null : null,
      connected: video?.isConnected, paused: video?.paused, ended: video?.ended,
      currentTime: video?.currentTime, readyState: video?.readyState,
      duration: video?.duration, playbackRate: video?.playbackRate, seeking: video?.seeking,
      networkState: video?.networkState, mediaErrorCode: video?.error?.code,
      lastTimeupdateAgoMs: lastUpdate ? now - lastUpdate.at : null,
      lastTimeupdateIntervalSeconds: lastUpdate?.intervalSeconds,
      lastTimeupdateMediaDeltaSeconds: lastUpdate?.mediaDeltaSeconds,
      lastTimeupdateDifferenceSeconds: lastUpdate?.differenceSeconds,
      lastPauseCallAgoMs: lastPause ? now - lastPause.at : null,
      lastPauseCallSource: lastPause?.source,
      lastPauseCallBlocked: lastPause?.blocked,
      pauseEventHasRecentForwardedCall: type === 'video.pause真实事件' ?
        !!lastPause && !lastPause.blocked && now - lastPause.at <= 1000 : undefined,
      lastSeekCallAgoMs: lastSeek ? now - lastSeek.at : null,
      lastSeekCallSource: lastSeek?.seekCallSource,
      lastSeekRequestedTime: lastSeek?.requestedTime,
      muted: video?.muted, volume: video?.volume,
      ...readCourseVolumeUI(video),
      volumeUISynced: !!video && !!courseVolumeUISync.get(video)?.verified,
      automationStarted, manualPaused, enteringExam, startupCourseCheckPending,
      anomalyGuardActive: anomalyDiagnostic.guardActive, anomalyGuardReason: anomalyDiagnostic.guardReason,
      courseStateChecking, courseScrollActive: !!courseScrollTimer,
      courseLoading: !!courseVideoLoad, courseLoadAttempts: courseVideoLoad?.attempts,
      courseLoadExhausted: !!courseVideoLoad?.exhausted,
      courseLoadSourceObserved: !!courseVideoLoad?.sourceObserved,
      sliderRecoveryPending: sliderRecoveryPending(), videoEndedAt,
      backgroundTitleTimerActive: backgroundTitleTimer !== null,
      ...readDiagnosticPopupState(), ...sampleDetail,
      ...(criticalDiagnosticTypes.has(type) ? { antiFreezeSnapshot: antiFreezeSnapshot() } : {}),
      ...(criticalDiagnosticTypes.has(type) ? readPlaybackPresentationDiagnostic(video) : {}),
      ...detail
    };
    if (type === '进度上报响应') {
      progressReportHistory.records.push({ time: entry.time, requestId: entry.requestId,
        transport: entry.transport, endpoint: entry.endpoint, reportedTime: entry.reportedTime,
        httpStatus: entry.httpStatus, businessCode: entry.businessCode, elapsedMs: entry.elapsedMs,
        networkFailure: entry.networkFailure });
      if (progressReportHistory.records.length > progressReportHistory.limit) {
        progressReportHistory.records.shift(); progressReportHistory.recordsDropped++;
      }
    }
    playbackDiagnosticRecords.push(entry);
    if (playbackDiagnosticRecords.length > 2000) {
      playbackDiagnosticRecords.shift();
      anomalyDiagnostic.ordinaryRecordsDropped++;
    }
    if (criticalDiagnosticTypes.has(type)) {
      criticalDiagnosticRecords.push(entry);
      if (criticalDiagnosticRecords.length > anomalyDiagnostic.criticalRecordLimit) {
        criticalDiagnosticRecords.shift();
        anomalyDiagnostic.criticalRecordsDropped++;
      }
    }
  }

  function scheduleFlowTimeout(fn, delay) {
    const scopeEpoch = courseScopeEpoch;
    const timer = setTimeout(() => {
      pendingFlowTimers.delete(timer);
      syncCourseScope();
      if (!backgroundPageHidden && scopeEpoch === courseScopeEpoch) fn();
    }, delay);

    pendingFlowTimers.add(timer);
    return timer;
  }

  function clearPendingFlowTimers() {
    if (backgroundResumeTimer !== null) {
      clearTimeout(backgroundResumeTimer);
      backgroundResumeTimer = null;
    }
    for (const timer of pendingFlowTimers) {
      clearTimeout(timer);
    }
    pendingFlowTimers.clear();
  }

  function matchesKnownVisibilityPause(stack) {
    // 仅匹配诊断日志和源码确认的这个构建：N -> ve -> 原生 pause。
    // 构建版本或函数名变化时不拦截，仍由后台恢复逻辑兜底。
    const source = 'https://yuancheng.henanyixue.com/static/1.1.20/js/playVideo-B59Q9S1Y.js:';
    const frames = String(stack || '').split('\n');
    return frames.some(line => line.includes('at Proxy.ve (') && line.includes(source)) &&
      frames.some(line => line.includes('at HTMLDocument.N (') && line.includes(source));
  }

  function matchesKnownCheckinPause(stack) {
    // 5.5.8 日志已确认这个位置随后创建打卡弹窗，且没有 seek 或快进警告。
    // 打卡必须精确匹配该构建行列；快进分支另由“已拦截回退”证据确认，不一概拦截 x()。
    const frame = 'at x (https://yuancheng.henanyixue.com/static/1.1.20/js/playVideo-B59Q9S1Y.js:89:2489)';
    const player = 'at Proxy.ve (https://yuancheng.henanyixue.com/static/1.1.20/js/playVideo-B59Q9S1Y.js:';
    const frames = String(stack || '').split('\n');
    return frames.some(line => line.trim() === frame) && frames.some(line => line.includes(player));
  }

  installCourseVisibilityProtection();
  const nativeVideoPause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause = function(...args) {
    const stack = this.tagName === 'VIDEO' ? new Error('暂停调用来源').stack : '';
    if (this.tagName === 'VIDEO') {
      const mediaState = playbackMediaState(this);
      diagnosticPauseCalls.set(this, { at: diagnosticNow(), source: diagnosticStackSource(stack), blocked: false,
        mediaSource: mediaState.source, mediaGeneration: mediaState.generation });
      recordPlaybackDiagnostic('pause调用', this, { stack });
      setTimeout(observeDiagnosticPopupState, 0);
    }
    if (this.tagName === 'VIDEO' && !this.paused && hasRecentFastForwardRollback(this) &&
        matchesKnownProgressCheck(stack) && !matchesKnownCheckinPause(stack) &&
        String(stack || '').includes('at Proxy.ve (https://yuancheng.henanyixue.com/static/1.1.20/js/playVideo-B59Q9S1Y.js:')) {
      diagnosticPauseCalls.get(this).blocked = true;
      recordPlaybackDiagnostic('已屏蔽快进检测暂停', this, { stack });
      return;
    }
    // 可见性保护之外，保留当前课程已知暂停调用的精准拦截。
    if (
      this === currentVideo && this.isConnected && !this.paused && !this.ended &&
      continuableVideos.has(this) && automationStarted && !manualPaused &&
      !isExamPage() && !enteringExam &&
      !startupCourseCheckPending && !courseStateChecking && !courseScrollTimer &&
      !courseVideoLoad &&
      !videoEndedAt && !awaitingExamAfterVideo &&
      ((realDocumentHidden() && matchesKnownVisibilityPause(stack)) || matchesKnownCheckinPause(stack))
    ) {
      diagnosticPauseCalls.get(this).blocked = true;
      recordPlaybackDiagnostic(matchesKnownCheckinPause(stack) ? '已拦截网页打卡暂停' : '已拦截页面隐藏暂停', this, { stack });
      return;
    }
    return Reflect.apply(nativeVideoPause, this, args);
  };

  function sliderRecoveryPending() {
    return Date.now() < sliderRecoveryUntil;
  }

  function videoIsPlaying() {
    return !!(
      currentVideo &&
      currentVideo.isConnected &&
      !currentVideo.paused &&
      !currentVideo.ended &&
      currentVideo.readyState >= 2
    );
  }

  function courseVideoNearEnd(video) {
    return !!(video && !video.ended && Number.isFinite(video.duration) && video.duration > 0 &&
      Number.isFinite(video.currentTime) && video.currentTime > 0 &&
      (video.duration - video.currentTime <= 5 || video.currentTime / video.duration >= 0.98));
  }

  const textOf = el => (el?.innerText || el?.textContent || '')
    .replace(/\s+/g, '')
    .trim();

  const normalize = value => String(value || '')
    .normalize('NFKC') // Match the backend's Unicode normalization; retain meaningful punctuation.
    .replace(/\s+/g, '')
    .replace(/[（）()]/g, '');

  function isExamPage() {
    return location.hash.includes('/remoteProject/examine/');
  }

  function clearExamConfirmTimer() {
    if (examConfirmTimer !== null) clearInterval(examConfirmTimer);
    examConfirmTimer = null;
  }

  function syncExamSession() {
    const route = isExamPage() ? location.hash : '';
    if (route === activeExamRoute) return;
    activeExamRoute = route;
    examSessionId++;
    clearExamConfirmTimer();
    submitted = false;
    advancing = false;
    lastPage = '';
    lastAdvanceAt = 0;
    questions = [];
    answeredPages.clear();
    examStartConfirmedButtons = new WeakSet();
    examSubmitConfirmedButtons = new WeakSet();
    examFlowLastState = '';
    if (route) {
      wasExamPage = true;
      enteringExam = false;
      courseVideoLoad = null;
      clearPendingFlowTimers();
      stopCourseScrollTest();
      if (examEnterResetTimer !== null) clearTimeout(examEnterResetTimer);
      examEnterResetTimer = null;
    }
  }

  function captureExamRequest() {
    syncExamSession();
    return { route: activeExamRoute, sessionId: examSessionId };
  }

  function isCurrentExamResponse(request) {
    syncExamSession();
    if (!isExamPage() || !request) return false;
    // 允许课程页预取后首次进入考试；离开又返回同一路由也属于新一场。
    return request.route ? request.route === activeExamRoute && request.sessionId === examSessionId :
      examSessionId === request.sessionId + 1;
  }

  function startAutomationFromDirectExam() {
    if (!isExamPage() || backgroundPageHidden) return false;
    syncExamSession();
    if (automationStarted) return false;

    automationStarted = true;
    manualPaused = false;
    enteringExam = false;
    submitted = false;
    advancing = false;
    lastPage = '';
    questions = [];
    answeredPages.clear();
    examStartConfirmedButtons = new WeakSet();
    examSubmitConfirmedButtons = new WeakSet();
    examFlowLastState = '';
    lastAdvanceAt = 0;
    wasExamPage = true;

    if (document.body) {
      createPauseControl();
      syncBackgroundKeepalive('人工进入考试');
      updatePauseControl();
      showExamStatus('检测到人工进入考试\n自动答题已启动', '#1677ff');
    }

    return true;
  }

  function removeCourseStatusBox() {
    if (courseStatusBox?.isConnected) courseStatusBox.remove();
    courseStatusBox = null;
    courseStatusColor = '';
    courseStatusClickable = null;
  }

  function removeExamStatusBox() {
    if (examStatusBox?.isConnected) examStatusBox.remove();
    examStatusBox = null;
    examStatusColor = '';
  }

  function isExamButton(el) {
    return /(进入|去|开始).{0,4}考试/.test(textOf(el));
  }

  function isEnabled(el) {
    return !!el && el.offsetParent !== null && !(
      el.disabled ||
      el.getAttribute('aria-disabled') === 'true' ||
      el.classList.contains('is-disabled') ||
      el.classList.contains('disabled')
    );
  }

  function findNextExamButton(context = null) {
    // 5.0：只允许当前课程的“待考试”标签触发考试，避免误点后续课程。
    const row = context ? context.row : currentCourseRow;
    if (!row?.isConnected || (context ? context.state : getCourseState(row)) !== '待考试') {
      return null;
    }

    return [...row.querySelectorAll(ACTION_SELECTOR)]
      .find(el => isExamButton(el) && isEnabled(el)) || null;
  }

  function pauseAutomaticFlow() {
    manualPaused = true;
    invalidatePlaybackAttempts('人工或异常暂停');
    // 4.3：暂停优先级最高。清掉所有已经排队但尚未执行的切课动作。
    clearPendingFlowTimers();
    clearExamConfirmTimer();
    stopCourseScrollTest();
    if (courseVideoLoad) courseVideoLoad.cancelled = true;

    if (sliderResumeTimer) {
      clearTimeout(sliderResumeTimer);
      sliderResumeTimer = null;
    }

    if (examEnterResetTimer) {
      clearTimeout(examEnterResetTimer);
      examEnterResetTimer = null;
    }
    if (!isExamPage()) enteringExam = false;

    if (currentVideo && !currentVideo.paused && !currentVideo.ended) {
      currentVideo.pause();
    }
    syncBackgroundKeepalive('自动流程暂停');
    updatePauseControl();
  }

  function showCourseWarningStatus() {
    const text = '检测到学习异常，自动流程已暂停\n请先处理网页提示，再点击此状态确认继续';
    if (isExamPage()) showExamStatus(text, '#c0392b');
    else showCourseStatus(text, '#c0392b');
  }

  function pauseForCourseWarning(reason, video = currentVideo) {
    if (!automationStarted || anomalyDiagnostic.guardActive || (video && video !== currentVideo)) return false;
    anomalyDiagnostic.guardActive = true;
    anomalyDiagnostic.guardReason = reason;
    anomalyDiagnostic.guardAt = new Date().toISOString();
    anomalyDiagnostic.guardTriggers++;
    recordPlaybackDiagnostic('异常警告自动暂停', video, { warningReason: reason, lastProgressRequestAt: progressReportDiagnostic.lastRequestAt,
      lastProgressResponseAt: progressReportDiagnostic.lastResponseAt, ...recentForwardSeekContext(video) });
    pauseAutomaticFlow();
    showCourseWarningStatus();
    return true;
  }

  function ensureCourseWarningPaused(state = readDiagnosticPopupState()) {
    if (state.learningRestrictionVisible) pauseForCourseWarning('网页学习异常或封禁提示');
    else if (state.fastForwardWarningVisible) pauseForCourseWarning('网页快进警告');
    return anomalyDiagnostic.guardActive;
  }

  function acknowledgeCourseWarning(event) {
    ensureCourseWarningPaused();
    if (!anomalyDiagnostic.guardActive) return true;
    const state = readDiagnosticPopupState();
    if (!event?.isTrusted || state.fastForwardWarningPresent || state.learningRestrictionPresent) {
      recordPlaybackDiagnostic('异常暂停继续被拒绝', currentVideo, {
        trustedUserAction: !!event?.isTrusted, warningStillPresent: state.fastForwardWarningPresent,
        restrictionStillPresent: state.learningRestrictionPresent
      });
      showCourseWarningStatus();
      return false;
    }
    anomalyDiagnostic.guardActive = false;
    anomalyDiagnostic.acknowledgements++;
    anomalyDiagnostic.lastAcknowledgedAt = new Date().toISOString();
    recordPlaybackDiagnostic('人工确认异常后继续');
    return true;
  }

  function updatePauseControl() {
    const action = anomalyDiagnostic.guardActive ? '处理后点击继续' : !automationStarted ? '点击开始' : manualPaused ? '点击继续' : '点击暂停';
    for (const box of [courseStatusBox, examStatusBox]) {
      if (!box) continue;
      if (box.dataset.action !== action) box.dataset.action = action;
      if (box.title !== action) box.title = action;
      const label = (box.textContent || '运行状态') + '，' + action;
      if (box.getAttribute('aria-label') !== label) box.setAttribute('aria-label', label);
    }
  }
  function toggleAutomationFromStatus(event) {
    if (syncCourseScope()) return;
    if (courseChangePending && !isExamPage()) {
      if (!activeCoursePageKey || !event?.isTrusted || !acknowledgeCourseWarning(event)) return;
      courseChangePending = false;
      startCourseAutomation(null);
      return;
    }
    if (!automationStarted) {
      if (!isExamPage() && acknowledgeCourseWarning(event)) startCourseAutomation(currentVideo);
      return;
    }

      if (!acknowledgeCourseWarning(event)) return;
      manualPaused = !manualPaused;

      if (manualPaused) {
        pauseAutomaticFlow();

        if (isExamPage()) {
          showExamStatus('自动测试已暂停\n点击此状态继续', '#666');
        } else {
          showCourseStatus('自动测试已暂停\n点击此状态继续', '#666');
        }
      } else {
        const wasCourseCompleted = courseCompletionNotified;
        courseCompletionNotified = false;

        if (isExamPage()) {
          showExamStatus('自动测试已恢复\n继续考试流程…', '#1677ff');
          requestExamFlow('手动恢复考试');
        } else if (courseVideoLoad) {
          retryCourseVideoLoad(courseVideoLoad, true);
        } else if (wasCourseCompleted) {
          // 4.6：课程全部完成后若用户手动点“继续”，也先重新扫描，
          // 不允许直接把最后一个已学习视频再次播放。
          startupCourseCheckPending = true;
          showCourseStatus('正在重新检查课程状态…', '#722ed1');

          scheduleFlowTimeout(() => {
            if (!manualPaused && !isExamPage()) {
              startDirectCourseScrollTest();
            }
          }, 100);
        } else if (
          currentVideo &&
          currentVideo.isConnected &&
          !currentVideo.ended
        ) {
          syncCourseVolumeBySlider(currentVideo);
          const video = currentVideo;
          requestVideoPlay(video, () => canSetCourseAudio(video), '人工继续').catch(() => {});
          showCourseStatus('自动测试已恢复\n正在继续播放…', '#1677ff');
        } else {
          startupCourseCheckPending = true;
          showCourseStatus('自动测试已恢复\n正在继续检查…', '#1677ff');
        }
      }

      syncBackgroundKeepalive('手动暂停或恢复');
      updatePauseControl();
  }
  function createPauseControl() {
    const box = isExamPage() ? createExamStatusBox() : createCourseStatusBox();
    updatePauseControl();
    return box;
  }

  function createCourseStatusBox() {
    if (courseStatusBox?.isConnected || !document.body || isExamPage()) {
      return courseStatusBox;
    }

    courseStatusBox = document.createElement('button');
    courseStatusColor = '';
    courseStatusClickable = null;
    courseStatusBox.type = 'button';

    Object.assign(courseStatusBox.style, {
      position: 'fixed',
      right: '22px',
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: '2147483647',
      minWidth: '205px',
      maxWidth: '360px',
      padding: '14px 16px',
      border: '0',
      borderRadius: '10px',
      color: '#fff',
      fontSize: '15px',
      lineHeight: '1.5',
      fontWeight: '600',
      whiteSpace: 'normal',
      boxShadow: '0 5px 18px rgba(0,0,0,.25)',
      cursor: 'pointer'
    });

    courseStatusBox.addEventListener('click', toggleAutomationFromStatus);

    mountHelperControl(courseStatusBox, '.helper-status-slot', 'helper-status');
    createPauseControl();
    return courseStatusBox;
  }

  function startCourseAutomation(video) {
    if (syncCourseScope() || courseChangePending) return;
    if (ensureCourseWarningPaused() || isExamPage()) return;
    if (courseVideoLoad) {
      automationStarted = true;
      manualPaused = false;
      createPauseControl();
      updatePauseControl();
      retryCourseVideoLoad(courseVideoLoad, true);
      return;
    }
    if (automationStarted && !manualPaused && startupCourseCheckPending) return;
    if (video?.isConnected) currentVideo = video;
    invalidatePlaybackAttempts('重新启动课程扫描');
    automationStarted = true;
    manualPaused = false;
    startupCourseCheckPending = true;
    syncCourseVolumeBySlider(currentVideo);
    courseCompletionNotified = false;
    awaitingExamAfterVideo = false;
    videoEndedAt = 0;
    examWaitStartedAt = 0;
    completedCourseDoneSince = 0;

    stopCourseScrollTest();
    clearPendingFlowTimers();
    createPauseControl();
    updatePauseControl();
    // 保留按顺序检查，防止用户启动了已完成的视频后重复学习。
    if (currentVideo && !currentVideo.paused && !currentVideo.ended) currentVideo.pause();
    showCourseStatus('自动流程已启动\n正在按顺序检查课程…', '#722ed1');
    scheduleFlowTimeout(() => {
      if (!manualPaused && !isExamPage()) startDirectCourseScrollTest();
    }, 100);
  }

  function rememberManualPlayback(event) {
    if (!event.isTrusted || automationStarted || manualPaused || isExamPage()) return;
    if (event.type === 'keydown' && ![' ', 'Enter', 'Spacebar'].includes(event.key)) return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target) return;
    const video = target.closest('video') || target.closest('.by-player')?.querySelector('video');
    if (!video) return;
    // 原生视频控件的事件可能发生在2秒播放器轮询之前，立即绑定监听。
    setupVideo(video);
    manualPlaybackRequests.set(video, Date.now());
  }

  document.addEventListener('pointerdown', rememberManualPlayback, true);
  document.addEventListener('click', rememberManualPlayback, true);
  document.addEventListener('keydown', rememberManualPlayback, true);

  function showCourseStatus(message, color, clickable = false) {
    if (isExamPage()) return;

    const box = createCourseStatusBox();
    if (!box) return;

    if (box.textContent !== message) box.textContent = message;
    if (courseStatusColor !== color) { box.style.background = color; courseStatusColor = color; }
    if (courseStatusClickable !== clickable) {
      box.style.cursor = 'pointer';
      courseStatusClickable = clickable;
    }
    updatePauseControl();
  }

  function updateCourseStatus(video) {
    if (syncCourseScope()) return;
    if (!video?.isConnected) return;
    // 结束等待期间保持当前课程身份；列表里的旧播放器或迟到事件不能接管这一节。
    if (automationStarted && video !== currentVideo && currentVideo?.isConnected && currentCourseRow &&
        (currentVideo.ended || awaitingExamAfterVideo || videoEndedAt) && !courseVideoLoad) return;
    // 隐藏或暂停的旧播放器不能覆盖当前仍在播放的视频状态。
    if (video !== currentVideo && currentVideo?.isConnected && !currentVideo.ended &&
        (!currentVideo.paused || video.paused || video.offsetParent === null)) return;
    currentVideo = video;
    syncCourseVolumeBySlider(video);
    if (isExamPage()) return;

    if (!automationStarted) {
      showCourseStatus('点击播放器播放键\n启动自动流程', '#e85d04', true);
    } else if (manualPaused) {
      if (anomalyDiagnostic.guardActive) showCourseWarningStatus();
      else showCourseStatus(courseChangePending ? COURSE_CHANGE_MESSAGE : '自动测试已暂停\n点击此状态继续', '#666');
    } else if (enteringExam) {
      showCourseStatus('正在进入考试…', '#722ed1');
    } else if (courseVideoLoad) {
      showCourseVideoLoadStatus();
    } else if (video.paused) {
      showCourseStatus('当前正在暂停\n点击立即播放', '#e85d04', true);
    } else {
      const playingTitle = getPlayingCourseTitle(video);
      showCourseStatus(
        playingTitle ? `正在播放\n${playingTitle}` : '正在播放\n课程名称待确认',
        '#1677ff'
      );
    }
  }

  function checkNextExam(context = null) {
    if (syncCourseScope() || courseChangePending) return false;
    if (
      !automationStarted ||
      manualPaused ||
      anomalyDiagnostic.guardActive ||
      enteringExam ||
      isExamPage()
    ) return false;

    // 4.4：只有当前视频已经进入“等待考试”状态，才允许触发考试。
    if (
      !awaitingExamAfterVideo &&
      !currentVideo?.ended &&
      !videoEndedAt
    ) return false;

    context ||= resolveEndedCourseContext();
    const examButton = findNextExamButton(context);
    if (!examButton) return false;

    stopCourseScrollTest();
    clearPendingFlowTimers();

    enteringExam = true;
    courseEndDiagnostic.lastTransition = { time: new Date().toISOString(), action: 'enter-exam',
      expectedSequence: context.expectedSequence, recognizedState: context.state };
    recordPlaybackDiagnostic('结束后进入考试', currentVideo, courseEndDiagnostic.lastTransition);
    showCourseStatus('视频已完成\n正在进入考试…', '#722ed1');
    try { examButton.click(); }
    catch (error) {
      enteringExam = false;
      recordPlaybackDiagnostic('进入考试点击失败', currentVideo, { error: String(error) });
      return false;
    }

    // 点击考试按钮后若页面没有跳转，自动解除 enteringExam，避免永久卡死。
    if (examEnterResetTimer) clearTimeout(examEnterResetTimer);
    examEnterResetTimer = setTimeout(() => {
      examEnterResetTimer = null;

      if (!isExamPage() && enteringExam) {
        enteringExam = false;
        showCourseStatus('考试页面未打开\n正在重新检查…', '#e85d04');
      }
    }, 8000);

    return true;
  }

  function advanceAfterCourseWithoutExam(context = null) {
    if (syncCourseScope() || courseChangePending) return false;
    // 只有刚刚播放完的这一节明确变成“已学习”，才可判定无需考试。
    if (!currentVideo?.ended && !videoEndedAt) return false;

    if (!automationStarted || manualPaused || enteringExam || isExamPage() || anomalyDiagnostic.guardActive) return false;
    context ||= resolveEndedCourseContext();
    const row = context.row, state = context.state;
    if (state !== '已学习') {
      completedCourseDoneSince = 0;
      return false;
    }

    // 给课程状态及考试入口的异步更新留出时间，避免短暂状态误判。
    if (!completedCourseDoneSince) completedCourseDoneSince = Date.now();
    if (Date.now() - completedCourseDoneSince < 3000) return false;
    if (!row?.isConnected || row !== currentCourseRow || getCourseState(row) !== '已学习') return false;
    courseEndDiagnostic.lastTransition = { time: new Date().toISOString(), action: 'advance-without-exam',
      expectedSequence: context.expectedSequence, recognizedState: state };
    recordPlaybackDiagnostic('本节结束推进', currentVideo, courseEndDiagnostic.lastTransition);

    awaitingExamAfterVideo = false;
    videoEndedAt = 0;
    examWaitStartedAt = 0;
    completedCourseDoneSince = 0;
    currentCourseRow = null;
    currentCourseTitle = '';
    currentVideo = null;
    startupCourseCheckPending = true;

    showCourseStatus('本节已学习，无需考试\n正在顺序查找下一节…', '#1677ff');
    scheduleFlowTimeout(() => {
      if (!manualPaused && !isExamPage()) startDirectCourseScrollTest();
    }, 300);
    return true;
  }

  function setupVideo(video) {
    if (!video || video.hasAttribute(VIDEO_MARK)) return;
    video.setAttribute(VIDEO_MARK, 'true');
    for (const name of ['timeupdate', 'play', 'playing', 'pause', 'emptied', 'loadstart', 'seeking', 'seeked']) {
      video.addEventListener(name, () => {
        try { observePlaybackEvent(video, name); }
        catch (error) { console.warn('[课程助手] 播放关联诊断异常', String(error)); }
      }, true);
    }
    // 捕获阶段先于播放器的普通 timeupdate 处理器观察进度，不修改事件。
    video.addEventListener('timeupdate', () => observeDiagnosticTimeupdate(video), true);
    for (const name of ['seeking', 'seeked', 'ratechange', 'waiting', 'stalled', 'suspend', 'error', 'emptied']) {
      video.addEventListener(name, () => recordPlaybackDiagnostic('video.' + name, video), true);
    }

    video.addEventListener('play', () => {
      syncCourseVolumeBySlider(video);
      recordPlaybackDiagnostic('video.play', video);
      if (!automationStarted) {
        const requestedAt = manualPlaybackRequests.get(video);
        manualPlaybackRequests.delete(video);
        if (requestedAt !== undefined && Date.now() - requestedAt <= 5000 && !manualPaused) {
          startCourseAutomation(video);
          return;
        }
        updateCourseStatus(video);
        return;
      }

      if (manualPaused || backgroundPageHidden || anomalyDiagnostic.guardActive) {
        video.pause();
        updateCourseStatus(video);
        return;
      }

      if (video !== currentVideo || !video.isConnected || isExamPage()) return;
      continuableVideos.add(video);
      backgroundPausedVideos.delete(video);

      // 新课程开始正常播放，清除上一轮残留的考试等待标记。
      if (!awaitingExamAfterVideo) {
        videoEndedAt = 0;
        examWaitStartedAt = 0;
        completedCourseDoneSince = 0;
      }

      // 3.9：已经找到目标课程并开始播放后，立即停止右侧课程列表扫描，
      // 避免播放过程中列表仍持续向下滚动。
      if (typeof stopCourseScrollTest === 'function') {
        stopCourseScrollTest();
      }

      updateCourseStatus(video);
      rememberCourseFlowBinding(video);
    });

    video.addEventListener('pause', () => {
      const call = diagnosticPauseCalls.get(video);
      const callAgeMs = call ? Math.max(0, diagnosticNow() - call.at) : null;
      const recentForwardedCall = callAgeMs !== null && callAgeMs <= 1000 && !call.blocked;
      playbackPauseDiagnostic.events++;
      if (video.ended) playbackPauseDiagnostic.endedEvents++;
      if (recentForwardedCall) playbackPauseDiagnostic.recentForwardedPauseCalls++;
      else playbackPauseDiagnostic.noRecentForwardedPauseCalls++;
      playbackPauseDiagnostic.lastAt = new Date().toISOString();
      playbackPauseDiagnostic.lastObservedCallAgeMs = callAgeMs;
      recordPlaybackDiagnostic('video.pause真实事件', video, { pauseHasRecentForwardedCall: recentForwardedCall,
        pauseObservedCallAgeMs: callAgeMs,
        pauseRecentCallSource: recentForwardedCall ? call.source : null,
        pauseCallCorrelation: recentForwardedCall ? '1秒内有转发的pause调用，仅表示关联' :
          '没有近期转发的pause调用，不能用旧调用栈确定本次原因' });
      updateCourseStatus(video);

      // 页面隐藏时播放器先执行 pause/onPause，稍后再走真实 play 事件恢复。
      if (realDocumentHidden() || document.pictureInPictureElement === video) {
        backgroundPausedVideos.add(video);
      }
      // 真实后台 pause 已发生，此时直接调用 play；不额外等待 300ms 定时器。
      // recoverBackgroundVideo 内仍核对手动暂停、切课、考试、加载和并发恢复状态。
      if (realDocumentHidden() && canRecoverBackgroundVideo(video)) {
        recoverBackgroundVideo(video);
      } else if (sliderRecoveryPending() && sliderWasVisible) {
        ensureVideoPlayingAfterSlider('滑块期间真实暂停');
      }
      scheduleBackgroundVideoRecovery(video);
    });

    video.addEventListener('ended', () => {
      rememberCourseFlowBinding(video);
      recordPlaybackDiagnostic('video.ended', video);
      if (!automationStarted || manualPaused || courseVideoLoad || video !== currentVideo ||
          !video.isConnected || !video.ended || isExamPage() || enteringExam) return;

      videoEndedAt = Date.now();
      examWaitStartedAt = videoEndedAt;
      awaitingExamAfterVideo = true;
      completedCourseDoneSince = 0;
      continuableVideos.delete(video);
      backgroundPausedVideos.delete(video);

      stopCourseScrollTest();
      clearPendingFlowTimers();
      showCourseStatus('视频播放完成\n等待进入考试…', '#722ed1');

      scheduleFlowTimeout(() => {
        if (!manualPaused && !isExamPage()) {
          checkNextExam();
        }
      }, 500);
    });

    video.addEventListener('volumechange', () => {
      syncCourseVolumeBySlider(video);
      recordPlaybackDiagnostic('volumechange', video);
    });
    video.addEventListener('playing', () => {
      syncCourseVolumeBySlider(video);
      recordPlaybackDiagnostic('video.playing', video);
      finishCourseVideoLoad(video);
      updateCourseStatus(video);
    });
    video.addEventListener('canplay', () => {
      if (courseVideoLoad?.video === video) handleCourseVideoLoad();
    });
    for (const name of ['loadstart', 'loadedmetadata']) {
      video.addEventListener(name, () => {
        const load = courseVideoLoad;
        if (load?.clickedAt && (load.video === video || load.previousVideo === video)) {
          load.sourceObserved = true;
          if (name === 'loadedmetadata' && load.video === video) handleCourseVideoLoad();
        }
      });
    }
    video.addEventListener('enterpictureinpicture', () => {
      recordPlaybackDiagnostic('video.enterpictureinpicture', video);
      scheduleBackgroundVideoRecovery(video);
    });
    video.addEventListener('leavepictureinpicture', () => {
      recordPlaybackDiagnostic('video.leavepictureinpicture', video);
      scheduleBackgroundVideoRecovery(video);
    });

    updateCourseStatus(video);
  }

  function canContinueCourseFlow(video, allowSliderRecovery = false) {
    return !!(
      automationStarted && !manualPaused && !backgroundPageHidden && !enteringExam && !isExamPage() &&
      !startupCourseCheckPending && !courseStateChecking && !courseScrollTimer &&
      !courseVideoLoad && !videoEndedAt && !awaitingExamAfterVideo &&
      (allowSliderRecovery || !sliderRecoveryPending()) &&
      video && video === currentVideo && video.tagName === 'VIDEO' && video.isConnected &&
      continuableVideos.has(video) && !video.ended
    );
  }

  function canRecoverBackgroundVideo(video) {
    return !!(
      canContinueCourseFlow(video) && video.paused &&
      (realDocumentHidden() || document.pictureInPictureElement === video || backgroundPausedVideos.has(video))
    );
  }

  async function recoverCurrentCourseVideo(video, reason, allowSliderRecovery = false) {
    if (ensureCourseWarningPaused()) return;
    if (!canContinueCourseFlow(video, allowSliderRecovery) || !video.paused || video.readyState < 2 || video.error) return;
    const state = playbackMediaState(video), epoch = playbackFlowEpoch;
    if (backgroundPlayPending.has(video)) return;
    const lastAttempt = backgroundLastAttempt.get(video);
    if (lastAttempt !== undefined && Date.now() - lastAttempt < 2000) return;
    const recovery = { state, epoch };
    backgroundPlayPending.set(video, recovery);
    const current = () => playbackMediaStates.get(video) === state && diagnosticSource(video) === state.source &&
      epoch === playbackFlowEpoch && canContinueCourseFlow(video, allowSliderRecovery);
    try {
      syncCourseVolumeBySlider(video);
      recordPlaybackDiagnostic('课程恢复尝试', video, { recoveryReason: reason, sourceId: state.id });
      await requestVideoPlay(video, current, reason);
      if (!current()) {
        recordPlaybackDiagnostic('课程恢复已取消', video, { recoveryReason: reason }); return;
      }
      if (video.isConnected && !video.paused && !video.ended) {
        backgroundLastAttempt.delete(video); backgroundPausedVideos.delete(video);
        recordPlaybackDiagnostic('课程恢复成功', video, { recoveryReason: reason });
        updateCourseStatus(video);
      } else {
        backgroundLastAttempt.set(video, Date.now());
        recordPlaybackDiagnostic('课程恢复未进入播放', video, { recoveryReason: reason });
      }
    } catch (error) {
      if (!current() || error?.name === 'CoursePlayCancelledError') {
        recordPlaybackDiagnostic('课程恢复已取消', video, { recoveryReason: reason, error: String(error) }); return;
      }
      backgroundLastAttempt.set(video, Date.now());
      recordPlaybackDiagnostic('课程恢复失败', video, { recoveryReason: reason, error: String(error), errorName: error?.name });
      showCourseStatus('播放恢复未成功\n请返回页面点击播放', '#e85d04');
      console.warn('[课程助手] 课程播放恢复失败', error);
    } finally {
      if (backgroundPlayPending.get(video) === recovery) backgroundPlayPending.delete(video);
    }
  }

  function recoverBackgroundVideo(video) {
    if (!canRecoverBackgroundVideo(video)) return;
    return recoverCurrentCourseVideo(video, '后台或页面恢复');
  }

  function scheduleBackgroundVideoRecovery(video) {
    if (!canRecoverBackgroundVideo(video) || backgroundResumeTimer !== null) return;
    backgroundResumeTimer = setTimeout(() => {
      backgroundResumeTimer = null;
      recoverBackgroundVideo(video);
    }, 300);
  }

  function handleLifecycleResume(type, event) {
    const freezeElapsedMs = diagnosticLifecycleFreezeAt === null ? null : diagnosticNow() - diagnosticLifecycleFreezeAt;
    diagnosticLifecycleFreezeAt = null;
    lifecycleDiagnostic.resumeCount++;
    lifecycleDiagnostic.lastResumeAt = new Date().toISOString();
    handleAntiFreezeLifecycle('resume', event);
    recordPlaybackDiagnostic(type, currentVideo, { freezeElapsedMs, persisted: !!event?.persisted });
    syncBackgroundKeepalive(type);
    // 不因缺少视频而跳过考试/切课恢复；统一调度由状态机决定优先级。
    scheduleLifecycleRecheck(type);
    const video = currentVideo;
    if (!video?.paused || video.ended || !continuableVideos.has(video)) return;
    // 页面恢复到可见状态时也允许检查；仍由原有函数核对手动暂停、考试、切课和加载锁。
    backgroundPausedVideos.add(video);
    recoverBackgroundVideo(video);
    scheduleBackgroundVideoRecovery(video);
  }

  document.addEventListener('freeze', event => {
    if (event.isTrusted === true) playbackLastTrustedFreezeAt = diagnosticNow();
    handleAntiFreezeLifecycle('freeze', event);
    recordPlaybackDiagnostic('保活冻结组合快照', currentVideo, { trustedLifecycleEvent: event.isTrusted === true, antiFreezeSnapshot: antiFreezeSnapshot() });
    diagnosticLifecycleFreezeAt = diagnosticNow();
    lifecycleDiagnostic.freezeCount++;
    lifecycleDiagnostic.lastFreezeAt = new Date().toISOString();
    saveLifecycleCheckpoint('freeze');
    recordPlaybackDiagnostic('页面freeze');
    // 冻结状态无法运行定时任务，不在这里创建保活循环。
  }, true);
  document.addEventListener('resume', event => handleLifecycleResume('页面resume', event), true);
  window.addEventListener('pagehide', event => {
    backgroundPageHidden = true;
    invalidatePlaybackAttempts('pagehide');
    clearPendingFlowTimers();
    stopCourseScrollTest(); clearExamConfirmTimer();
    if (sliderResumeTimer !== null) { clearTimeout(sliderResumeTimer); sliderResumeTimer = null; }
    updateBackgroundTitle();
    disposeAntiFreezeModules('离开页面');
    saveLifecycleCheckpoint('pagehide');
    recordPlaybackDiagnostic('页面pagehide', currentVideo, { persisted: !!event.persisted });
  }, true);
  window.addEventListener('pageshow', event => {
    backgroundPageHidden = false;
    syncBackgroundKeepalive('pageshow');
    if (event.persisted) handleLifecycleResume('页面pageshow缓存恢复', event);
    else recordPlaybackDiagnostic('页面pageshow', currentVideo, { persisted: false });
  }, true);

  // 捕获真实状态后再阻止网页的隐藏回调；脚本恢复不依赖伪装后的属性。
  document.addEventListener('visibilitychange', event => {
    playbackLastVisibilityAt = diagnosticNow();
    if (currentVideo) playbackMediaState(currentVideo).sample = null;
    syncBackgroundKeepalive('真实可见性变化');
    if (realDocumentHidden()) saveLifecycleCheckpoint('hidden');
    recordPlaybackDiagnostic('visibilitychange');
    if (isExamPage()) requestExamFlow('页面可见性变化');
    const video = currentVideo;
    if (video && realDocumentHidden() && continuableVideos.has(video)) {
      backgroundPausedVideos.add(video);
    } else if (video && !video.paused) {
      backgroundPausedVideos.delete(video);
    }
    scheduleBackgroundVideoRecovery(video);
    if (!realDocumentHidden()) scheduleLifecycleRecheck('visibilitychange可见');
    if (realDocumentHidden() && protectCourseVisibility() &&
        visibilityProtectionHooks.hidden && visibilityProtectionHooks.visibilityState) {
      event.stopImmediatePropagation();
      recordPlaybackDiagnostic('已保护网页可见性', video);
    }
  }, true);

  window.addEventListener('focus', event => {
    if (event.target === window || event.target === document) scheduleLifecycleRecheck('窗口重新获得焦点');
  }, true);

  window.addEventListener('blur', event => {
    // 不拦截输入框等元素失焦；课程与已启动考试保护均遵守手动暂停。
    if ((event.target === window || event.target === document) && protectCourseVisibility()) {
      recordPlaybackDiagnostic('已保护窗口失焦', currentVideo);
      event.stopImmediatePropagation();
      scheduleBackgroundVideoRecovery(currentVideo);
    }
  }, true);

  function resetExamStateAfterReturn() {
    clearExamConfirmTimer();
    examStartConfirmedButtons = new WeakSet();
    examSubmitConfirmedButtons = new WeakSet();
    examFlowLastState = '';
    lastAdvanceAt = 0;
    courseVideoLoad = null;
    enteringExam = false;
    submitted = false;
    advancing = false;
    lastPage = '';
    questions = [];
    answeredPages.clear();
    videoEndedAt = 0;
    examWaitStartedAt = 0;
    awaitingExamAfterVideo = false;
    completedCourseDoneSince = 0;
    currentCourseRow = null;
    currentCourseTitle = '';
    courseCompletionNotified = false;
    startupCourseCheckPending = false;

    if (examEnterResetTimer) {
      clearTimeout(examEnterResetTimer);
      examEnterResetTimer = null;
    }

    clearPendingFlowTimers();
    stopCourseScrollTest();
  }

  function getSequentialCourseAction(row) {
    if (!row) return null;

    const state = getCourseState(row);

    if (state === '待考试') {
      return { type: 'exam', row, state };
    }

    if (state === '学习中' || state === '未学习') {
      return { type: 'study', row, state };
    }

    if (state === '已学习') {
      return { type: 'done', row, state };
    }

    // 无法准确识别就停住，绝不越过这一节。
    return { type: 'unknown', row, state };
  }


  function enterExamFromCourseRow(row) {
    if (syncCourseScope() || courseChangePending || !activeCoursePageKey) return false;
    if (!row || manualPaused || backgroundPageHidden || isExamPage()) return false;
    if (getCourseState(row) !== '待考试') return false;

    const selector = 'button, a, [role="button"], .el-button, .ant-btn';
    const button = [...row.querySelectorAll(selector)]
      .find(el => /进入考试|去考试|开始考试/.test(textOf(el)) && isEnabled(el));

    if (!button) return false;

    currentCourseRow = row;
    completedCourseDoneSince = 0;
    startupCourseCheckPending = false;
    awaitingExamAfterVideo = true;
    videoEndedAt = Date.now();
    examWaitStartedAt = videoEndedAt;

    stopCourseScrollTest();
    clearPendingFlowTimers();

    enteringExam = true;
    showCourseStatus('当前顺序课程：待考试\n正在进入考试…', '#722ed1');
    try { button.click(); }
    catch (error) {
      enteringExam = false;
      recordPlaybackDiagnostic('进入考试点击失败', currentVideo, { error: String(error) });
      return false;
    }

    if (examEnterResetTimer) clearTimeout(examEnterResetTimer);
    examEnterResetTimer = setTimeout(() => {
      examEnterResetTimer = null;
      if (!isExamPage() && enteringExam) {
        enteringExam = false;
        awaitingExamAfterVideo = false;
        videoEndedAt = 0;
        startupCourseCheckPending = true;
        showCourseStatus('考试页面未打开\n重新从第一节顺序检查…', '#e85d04');
        scheduleFlowTimeout(() => {
          if (!manualPaused && !isExamPage()) startDirectCourseScrollTest();
        }, 500);
      }
    }, 8000);

    return true;
  }

  function cleanCourseTitle(text) {
    return String(text || '')
      .split(/\n+/)
      .map(line => line
        .replace(/待考试|学习中|未学习|已学习/g, '')
        .replace(/\d{1,2}:\d{2}:\d{2}/g, '')
        .replace(/进入考试|去考试|开始考试/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      )
      .filter(line => line.length >= 2 && line.length <= 160 && !/^\d+$/.test(line));
  }

  function getCourseTitle(row) {
    if (!row) return '';

    const preferred = [
      ...row.querySelectorAll(
        '.title, [class*="title"], [class*="course-name"], [class*="courseName"], h1, h2, h3, h4'
      )
    ];

    let longest = '';
    for (const el of preferred) {
      for (const title of cleanCourseTitle(el.textContent)) {
        if (title.length > longest.length) longest = title;
      }
    }
    if (longest) return longest;
    for (const title of cleanCourseTitle(row.innerText || row.textContent)) {
      if (title.length > longest.length) longest = title;
    }
    return longest;
  }

  function getCourseState(row) {
    if (!row) return '';

    // 单次遍历选择尺寸最小的精确状态标签，避免创建中间数组和完整排序。
    let bestState = '';
    let bestArea = Infinity;
    let exactLabels = 0, conflictingStates = false;

    for (const el of row.querySelectorAll(STATUS_NODE_SELECTOR)) {
      const text = (el.textContent || '').replace(/\s+/g, '');
      if (!STATUS_WORD_SET.has(text)) continue;

      exactLabels++;
      const rect = el.getBoundingClientRect();
      if (courseStateLabelHiddenReason(el, rect)) continue;
      if (bestState && bestState !== text) conflictingStates = true;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        bestArea = area;
        bestState = text;
      }
    }

    if (conflictingStates) return '';
    if (bestState) return bestState;
    if (exactLabels) return ''; // 不用隐藏旧标签的文本作为兜底完成依据。

    // 兜底只允许整行出现单一明确状态；避免父容器同时包含多节课程时误判。
    const text = (row.textContent || '').replace(/\s+/g, '');
    const states = STATUS_WORDS.filter(x => text.includes(x));
    return states.length === 1 ? states[0] : '';
  }

  function getPlayingCourseTitle(video) {
    if (!video?.isConnected || isExamPage() || courseVideoLoad) return '';
    const source = diagnosticSource(video);
    const binding = playingCourseBindings.get(video);
    if (binding && binding.source !== source) playingCourseBindings.delete(video);

    const rows = findCourseRows().filter(row => row.isConnected);
    // 优先页面明确选中的独立课程卡片，其次是唯一“学习中”的卡片。
    const selected = rows.filter(row => row.matches?.(
      '[aria-current="true"], [aria-current="page"], [aria-selected="true"], .is-active'
    ));
    const learning = selected.length === 1 ? selected : rows.filter(row => getCourseState(row) === '学习中');
    const actualRow = selected.length === 1 ? selected[0] : learning.length === 1 ? learning[0] : null;
    let row = actualRow;
    if (!row && binding?.source === source && binding.row?.isConnected && rows.includes(binding.row)) {
      row = binding.row;
    }
    if (!row) return '';
    // 每次读取当前 DOM 文本，避免同一节点被重用时继续显示旧标题。
    const title = getCourseTitle(row);
    if (title) playingCourseBindings.set(video, { source, row });
    return title;
  }

  function findCourseRows(root = document) {
    const rows = [];
    const rowSet = new Set();
    // 缓存只存在于本次同步扫描；不跨事件保存DOM文本或尺寸。
    const texts = new Map();
    const rects = new Map();
    const stateCounts = new Map();
    const completeCards = new Map();
    const readText = node => {
      if (!texts.has(node)) texts.set(node, (node.textContent || '').replace(/\s+/g, ''));
      return texts.get(node);
    };
    const readRect = node => {
      if (!rects.has(node)) rects.set(node, node.getBoundingClientRect());
      return rects.get(node);
    };

    for (const statusEl of root.querySelectorAll(STATUS_NODE_SELECTOR)) {
      const statusText = readText(statusEl);
      if (!STATUS_WORD_SET.has(statusText)) continue;

      let node = statusEl;
      let best = null;

      for (let depth = 0; node && node !== document.body && depth < 7; depth++, node = node.parentElement) {
        const text = readText(node);
        if (!text) continue;

        if (!stateCounts.has(node)) {
          let count = 0;
          for (const word of STATUS_WORDS) if (text.includes(word)) count++;
          stateCounts.set(node, count);
        }
        const stateCount = stateCounts.get(node);
        const rect = readRect(node);

        // 独立课程卡片应只包含一个明确状态，并且具有正常课程卡片尺寸。
        if (
          rect.width >= 220 &&
          rect.height >= 55 &&
          rect.height <= 260 &&
          (stateCount === 1 || (stateCount > 1 && !!getCourseState(node)))
        ) {
          best = node;

          // 一旦容器里同时出现时长或考试按钮，基本就是完整课程卡片。
          if (!completeCards.has(node)) {
            let complete = /\d{1,2}:\d{2}:\d{2}/.test(text);
            if (!complete) {
              for (const action of node.querySelectorAll(ACTION_SELECTOR)) {
                if (isExamButton(action)) { complete = true; break; }
              }
            }
            completeCards.set(node, complete);
          }
          if (completeCards.get(node)) break;
        }
      }

      if (best && !rowSet.has(best)) {
        rowSet.add(best);
        rows.push(best);
      }
    }

    // 按页面真实位置排序，确保第1节→最后一节。
    rows.sort((a, b) => {
      const ar = readRect(a);
      const br = readRect(b);
      if (Math.abs(ar.top - br.top) > 3) return ar.top - br.top;
      return ar.left - br.left;
    });

    return rows;
  }

  function findRightCourseScroller() {
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    let best = null;
    let bestScore = -Infinity;

    // 单次扫描并保留最高分候选，避免排序时重复读取布局和整段文本。
    for (const el of document.querySelectorAll('div, section, aside, main, ul')) {
      if (el.offsetParent === null) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width < 180 || rect.height < 180) continue;
      if (rect.right < vw * 0.55 || rect.top > vh || rect.bottom < 0) continue;
      if (el.scrollHeight <= el.clientHeight + 20) continue;

      const text = textOf(el);
      if (!STATUS_WORDS.some(word => text.includes(word)) && !text.includes('进入考试')) {
        continue;
      }

      let score = 0;
      if (rect.left > vw * 0.55) score += 100;
      if (rect.width < vw * 0.45) score += 50;
      if (el.scrollHeight > el.clientHeight + 100) score += 80;
      if (text.includes('已学习')) score += 20;
      if (text.includes('未学习')) score += 20;
      if (text.includes('进入考试')) score += 20;
      score -= Math.abs(rect.right - vw) / 20;

      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }

    return best;
  }

  function visibleStateRowsInScroller(scroller) {
    if (!scroller) return [];

    const box = scroller.getBoundingClientRect();

    return findCourseRows(scroller).filter(row => {
      const r = row.getBoundingClientRect();
      return (
        r.bottom > box.top + 4 &&
        r.top < box.bottom - 4 &&
        r.right > box.left &&
        r.left < box.right
      );
    });
  }

  function hardScrollCourseList(scroller, top) {
    if (!scroller) return;

    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const nextTop = Math.max(0, Math.min(maxTop, top));

    // 同时使用三种方式，兼容站点监听原生 scroll 事件的情况。
    scroller.scrollTop = nextTop;

    try {
      scroller.scrollTo({
        top: nextTop,
        behavior: 'auto'
      });
    } catch {}

    scroller.dispatchEvent(new Event('scroll', {
      bubbles: true
    }));
  }

  function markCurrentCourseCompleted() {
    if (courseCompletionNotified) return;

    startupCourseCheckPending = false;
    courseCompletionNotified = true;
    manualPaused = true;
    invalidatePlaybackAttempts('全部课程完成');
    syncBackgroundKeepalive('课程全部完成');

    clearPendingFlowTimers();
    stopCourseScrollTest();

    if (sliderResumeTimer) {
      clearTimeout(sliderResumeTimer);
      sliderResumeTimer = null;
    }

    if (currentVideo && !currentVideo.paused && !currentVideo.ended) {
      currentVideo.pause();
    }

    updatePauseControl();
    showCourseStatus('当前课程已学习完毕\n自动测试已暂停', '#52c41a');

    setTimeout(() => {
      alert('当前课程已学习完毕');
    }, 100);
  }

  function stopCourseScrollTest() {
    courseScanGeneration++;
    if (courseScrollTimer) {
      clearInterval(courseScrollTimer);
      courseScrollTimer = null;
    }

    courseScrollRounds = 0;
    courseStateChecking = false;
  }

  function describeCourseLoad(load, video, online = true) {
    if (online === false) return { code: 'BROWSER_OFFLINE', text: '浏览器报告离线，请检查网络连接' };
    if (load.lastPlayErrorName === 'NotAllowedError') return { code: 'AUTOPLAY_BLOCKED', text: '浏览器阻止自动播放，请点击视频播放按钮' };
    if (!video?.isConnected) return { code: 'VIDEO_NOT_READY', text: '等待页面提供播放器' };
    if (video.error?.code === 2) return { code: 'MEDIA_NETWORK_ERROR', text: '视频网络请求失败，请检查网络后重试' };
    if (video.error?.code === 3) return { code: 'MEDIA_DECODE_ERROR', text: '视频解码失败，可尝试重新打开本节' };
    if (video.error?.code === 4) return { code: 'MEDIA_UNSUPPORTED', text: '视频资源不可用或格式不支持' };
    if (!video.currentSrc && !video.src) return { code: 'SOURCE_PENDING', text: '等待页面提供视频资源' };
    if (!courseLoadSourceReady(load, video)) return { code: 'SOURCE_SWITCH_PENDING', text: '等待本节视频资源更新，原因尚未确定' };
    if (video.readyState < 2 && video.networkState === 2) return { code: 'MEDIA_BUFFERING', text: '视频正在加载，速度较慢，请稍候' };
    return { code: 'LOAD_UNCERTAIN', text: '视频尚未就绪，原因暂未确定' };
  }
  function showCourseVideoLoadStatus() {
    const load = courseVideoLoad;
    if (!load) return;
    const title = currentCourseTitle || '当前课程';
    const problem = describeCourseLoad(load, load.video || currentVideo, navigator.onLine);
    if (load.exhausted) {
      showCourseStatus(load.lastPlayErrorName === 'NotAllowedError' ? `${title}\n${problem.text}` :
        load.audioFailed ? `${title}\n播放器音量初始化未成功\n点击此处重试本节` :
        load.playExhausted ? `${title}\n视频已就绪，但启动播放未成功\n点击此处重试本节` :
        `${title}\n${problem.text}\n已停止自动重试，点击状态可重试本节`, '#e85d04', true);
    } else if (load.audioWaiting) {
      showCourseStatus(`${title}\n正在初始化播放器音量…`, '#e85d04');
    } else {
      const waited = Math.max(0, Math.floor((Date.now() - load.lastOpenAt) / 1000));
      showCourseStatus(`${title}\n${problem.text} · ${waited}s\n第 ${load.attempts}/${COURSE_LOAD_MAX_ATTEMPTS} 次尝试`, '#e85d04');
    }
  }

  function retryCourseVideoLoad(load, manual = false) {
    if (courseVideoLoad !== load || manualPaused || backgroundPageHidden || enteringExam || isExamPage()) return;
    // 连续点击两个启动入口也不能排队重复打开同一节。
    if (!load.cancelled && Date.now() - load.lastOpenAt < 1500) return;
    if (!load.row?.isConnected) {
      load.exhausted = true;
      showCourseVideoLoadStatus();
      return;
    }
    if (manual) load.attempts = 0;
    invalidatePlaybackAttempts('重新打开本节');
    load.attempts++;
    load.generation++;
    load.cancelled = false;
    load.exhausted = false;
    load.playPending = false;
    load.playAttempts = 0;
    load.playExhausted = false;
    load.audioWaiting = false;
    load.audioFailed = false;
    load.lastPlayErrorName = null;
    load.playToken = (load.playToken || 0) + 1;
    load.lastPlayAt = 0;
    load.video = null;
    load.clickedAt = 0;
    load.lastOpenAt = Date.now();
    load.notBefore = load.lastOpenAt + 1500;
    load.retryAt = load.lastOpenAt + COURSE_LOAD_TIMEOUT;
    stopCourseScrollTest();
    recordPlaybackDiagnostic('重新打开本节课程', currentVideo, { attempt: load.attempts });
    clickCourseForStateTest(load.row, load.state);
    showCourseVideoLoadStatus();
  }

  function beginCourseVideoLoad(row, state, buffering = false) {
    if (syncCourseScope() || courseChangePending || !activeCoursePageKey) return;
    invalidatePlaybackAttempts('开始本节加载');
    const previousVideo = currentVideo;
    const previousRow = currentCourseRow;
    const previousSource = previousVideo?.currentSrc || previousVideo?.src || '';
    stopCourseScrollTest();
    startupCourseCheckPending = false;
    awaitingExamAfterVideo = false;
    videoEndedAt = 0;
    examWaitStartedAt = 0;
    currentCourseRow = row;
    currentCourseTitle = getCourseTitle(row);
    const now = Date.now();
    courseVideoLoad = {
      row, state, video: buffering ? currentVideo : null, attempts: 1,
      lastOpenAt: now, notBefore: now + (buffering ? 0 : 1500),
      retryAt: now + COURSE_LOAD_TIMEOUT, lastPlayAt: 0,
      playPending: false, exhausted: false, generation: 1, cancelled: false,
      previousVideo, previousSource, clickedAt: 0, sourceObserved: buffering,
      requireNewSource: !buffering && !!previousSource && previousRow !== row &&
        (state !== '学习中' || !!previousRow)
    };
    recordPlaybackDiagnostic(buffering ? '本节等待缓冲' : '锁定本节等待加载');
    if (!buffering) clickCourseForStateTest(row, state);
    showCourseVideoLoadStatus();
  }

  function finishCourseVideoLoad(video) {
    if (syncCourseScope() || courseChangePending) return false;
    const load = courseVideoLoad;
    if (!load || video !== load.video || Date.now() < load.notBefore || manualPaused ||
        enteringExam || isExamPage() || !video.isConnected || video.error ||
        video.paused || video.ended || video.readyState < 2 || !courseLoadSourceReady(load, video)) return false;
    courseVideoLoad = null;
    currentVideo = video;
    playingCourseBindings.set(video, { source: diagnosticSource(video), row: load.row });
    rememberCourseFlowBinding(video, load.row);
    stopCourseScrollTest();
    recordPlaybackDiagnostic('本节加载成功', video, { attempts: load.attempts });
    updateCourseStatus(video);
    return true;
  }

  function courseLoadSourceReady(load, video) {
    return !load.requireNewSource || load.sourceObserved || video !== load.previousVideo ||
      (video.currentSrc || video.src || '') !== load.previousSource;
  }

  function requestVideoPlay(video, canStart = () => true, reason = '其他课程入口') {
    syncCourseScope();
    let state;
    try {
      if (ensureCourseWarningPaused() || manualPaused || backgroundPageHidden || !video?.isConnected ||
          video !== currentVideo || enteringExam || isExamPage() || !canStart()) {
        throw playbackCancellation('播放请求已失效');
      }
      if (!diagnosticVideoIds.has(video)) diagnosticVideoIds.set(video, nextDiagnosticVideoId++);
      state = playbackMediaState(video);
    } catch (error) { return Promise.reject(error); }
    if (state.pending) {
      playbackAttemptDiagnostic.coalesced++;
      const token = state.pending;
      // 不改变旧请求的锁；新入口仍单独核验自己的开始条件。
      return token.promise.then(value => {
        if (!canStart()) throw playbackCancellation('合并请求的入口已失效');
        return value;
      });
    }
    const epoch = playbackFlowEpoch;
    const scopeEpoch = courseScopeEpoch;
    const record = { attemptId: nextPlaybackAttemptId++, reason, ...playbackContext(video, state),
      status: 'pending', nativeCalled: false, playEventAtMs: null, playingEventAtMs: null };
    playbackAttemptDiagnostic.attempts++; state.summary.attempts++;
    boundedPlaybackPush(playbackAttemptDiagnostic.recentAttempts, record, 160, 'attemptsDropped');
    let resolveResult, rejectResult;
    const promise = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
    const token = { record, promise, timer: null, done: false, state, epoch };
    state.pending = state.lastAttempt = token;
    activePlaybackAttempts.add(token);
    const sameMedia = () => playbackMediaStates.get(video) === state && diagnosticSource(video) === state.source;
    const valid = () => sameMedia() && epoch === playbackFlowEpoch && scopeEpoch === courseScopeEpoch &&
      readCoursePageKey() === activeCoursePageKey && !manualPaused &&
      !backgroundPageHidden && !anomalyDiagnostic.guardActive && !enteringExam && !isExamPage() &&
      video.isConnected && currentVideo === video;
    const stopStalePlayback = () => {
      // 新请求或新媒体代次已接管时，不让旧回调暂停新播放。
      if (sameMedia() && (state.lastAttempt === token || manualPaused || backgroundPageHidden || anomalyDiagnostic.guardActive || isExamPage()) && !video.paused && !video.ended) {
        try { video.pause(); } catch (_) {}
      }
    };
    const finish = (error = null) => {
      if (token.done) return;
      token.done = true; clearTimeout(token.timer);
      if (state.pending === token) state.pending = null;
      activePlaybackAttempts.delete(token);
      record.finishedAtMs = diagnosticNow(); record.elapsedMs = Math.max(0, record.finishedAtMs - record.at);
      record.sameMediaAtResult = sameMedia();
      record.result = playbackContext(video, state);
      if (!error) {
        record.status = 'fulfilled'; playbackAttemptDiagnostic.fulfilled++; resolveResult(); return;
      }
      record.errorName = String(error?.name || 'Error');
      // 原始错误说明保留；URL去查询参数和凭据，长文本限量。
      record.errorMessage = String(error?.message || error).slice(0, 1200);
      record.errorKind = playbackErrorKind(error);
      record.status = record.errorKind === 'cancelled' ? 'cancelled' : 'rejected';
      playbackAttemptDiagnostic[record.status]++;
      if (record.errorKind === 'timeout') playbackAttemptDiagnostic.timedOut++;
      const counts = playbackAttemptDiagnostic.attemptErrorCounts;
      counts[record.errorKind] = (counts[record.errorKind] || 0) + 1;
      if (record.status !== 'cancelled' && !playbackAttemptDiagnostic.firstFailure) playbackAttemptDiagnostic.firstFailure = record;
      const pause = state.lastPause;
      if (pause && pause.attemptId === record.attemptId && !pause.ended &&
          pause.at >= record.at && record.finishedAtMs - pause.at <= 1000 && !record.errorPauseId && /^explicit-/.test(record.errorKind)) {
        record.errorPauseId = pause.pauseId;
        setPlaybackPauseCategory(pause, record.errorKind, '同attemptId的play拒绝文本；pause后1秒内');
      }
      rejectResult(error);
    };
    token.cancel = reasonText => finish(playbackCancellation(reasonText));
    token.timer = setTimeout(() => {
      if (token.done) return;
      const error = new Error('播放请求等待超过30秒，取消本次请求'); error.name = 'CoursePlayTimeoutError';
      // 先解除pending；实际浏览器pause会中止尚未完成的原生play。
      finish(error);
      if (sameMedia() && state.lastAttempt === token) {
        try { video.pause(); } catch (_) {}
      }
    }, PLAY_REQUEST_TIMEOUT_MS);
    const settleNative = result => Promise.resolve(result).then(() => {
      record.nativeSettledAtMs = diagnosticNow(); record.nativeOutcome = 'fulfilled';
      if (token.done || !valid()) {
        stopStalePlayback(); token.cancel('播放结果已失效'); return;
      }
      finish();
    }, error => {
      record.nativeSettledAtMs = diagnosticNow(); record.nativeOutcome = 'rejected';
      if (token.done) {
        record.lateNativeErrorName = String(error?.name || 'Error');
        record.lateNativeErrorMessage = String(error?.message || error).slice(0, 1200);
        return;
      }
      if (!valid()) { token.cancel('旧媒体或停止后的播放错误'); return; }
      finish(error);
    });
    const play = () => {
      try {
        if (token.done || !valid() || !canStart() || ensureCourseWarningPaused()) {
          throw playbackCancellation('播放开始前请求已失效');
        }
        record.nativeCalled = true; record.nativeStartedAtMs = diagnosticNow();
        settleNative(video.play());
      } catch (error) { finish(error); }
    };
    if (!canSetCourseAudio(video) || !video.closest?.('.by-player') || courseVolumeMatchesTarget(video)) play();
    else {
      const root = video.closest('.by-player');
      if (courseVideoLoad?.video === video) courseVideoLoad.audioWaiting = true;
      recordPlaybackDiagnostic('播放等待音量初始化', video, { attemptId: record.attemptId, targetVolumePercent: COURSE_TEST_VOLUME * 100 });
      syncCourseVolumeBySlider(video).then(ready => {
        if (token.done || !valid() || video.closest?.('.by-player') !== root || !canStart()) {
          throw playbackCancellation('音量初始化期间播放请求已取消');
        }
        if (!ready || !courseVolumeMatchesTarget(video)) {
          const error = new Error('播放器音量尚未达到目标，暂不启动播放');
          error.name = 'CourseAudioNotReadyError'; throw error;
        }
        if (courseVideoLoad?.video === video) courseVideoLoad.audioWaiting = false;
        play();
      }).catch(error => finish(error));
    }
    return promise;
  }

  // 捕获新video的就绪事件，即使轮询尚未绑定该节点，也能及时启动本节。
  for (const type of ['loadedmetadata', 'loadeddata', 'canplay']) {
    document.addEventListener(type, event => {
      if (courseVideoLoad && event.target?.tagName === 'VIDEO' && event.target.isConnected) handleCourseVideoLoad();
    }, true);
  }

  function handleCourseVideoLoad() {
    if (syncCourseScope() || courseChangePending) return true;
    if (ensureCourseWarningPaused()) return true;
    const load = courseVideoLoad;
    if (!load) return false;
    stopCourseScrollTest();
    if (!automationStarted || manualPaused || backgroundPageHidden || load.cancelled || enteringExam || isExamPage()) return true;
    const now = Date.now();
    if (now < load.notBefore) {
      showCourseVideoLoadStatus();
      return true;
    }
    const video = load.video?.isConnected ? load.video :
      [...document.querySelectorAll('video')].find(v => v.offsetParent !== null) || document.querySelector('video');
    if (video) {
      load.video = video;
      currentVideo = video;
      setupVideo(video);
      syncCourseVolumeBySlider(video);
      if (finishCourseVideoLoad(video)) return true;
      // 页面请求失败而仍保留上一节 video 时，不能把旧视频当作本节加载成功。
      if (!courseLoadSourceReady(load, video) && !video.paused) video.pause();
    }
    const sourceReady = !!(video?.isConnected && !video.error && !video.ended && courseLoadSourceReady(load, video));
    const mediaReady = sourceReady && video.readyState >= 2;
    const source = video && diagnosticSource(video);
    if (video && (load.playVideo !== video || load.playSource !== source)) {
      load.playVideo = video;
      load.playSource = source;
      load.playAttempts = 0;
      load.playPending = false;
      load.playExhausted = false;
      load.audioWaiting = false;
      load.audioFailed = false;
      load.playToken = (load.playToken || 0) + 1;
    }
    if (load.playPending && now - load.lastPlayAt >= COURSE_LOAD_TIMEOUT) {
      load.playPending = false;
      load.playToken = (load.playToken || 0) + 1;
      recordPlaybackDiagnostic('本节播放请求等待超时', video, { playAttempts: load.playAttempts });
    }
    // 后台轮询可能被延迟到一分钟一次：先处理已就绪视频，再判加载超时。
    // 加载重试已耗尽后若网络恢复，也给就绪视频有限的启动机会。
    if (sourceReady && video.readyState >= 1 && (!load.exhausted || mediaReady) &&
        !load.playExhausted && video.paused && !load.playPending &&
        (load.playAttempts || 0) < 3 && now - load.lastPlayAt >= 2000) {
      load.playPending = true;
      load.exhausted = false;
      load.playAttempts = (load.playAttempts || 0) + 1;
      load.lastPlayAt = now;
      const generation = load.generation;
      const playToken = load.playToken = (load.playToken || 0) + 1;
      const sourceAtStart = diagnosticSource(video);
      recordPlaybackDiagnostic('本节启动播放请求', video, { playAttempts: load.playAttempts });
      requestVideoPlay(video, () => courseVideoLoad === load && load.generation === generation &&
        load.playToken === playToken && !load.cancelled && !manualPaused && !enteringExam && !isExamPage() &&
        currentVideo === video && diagnosticSource(video) === sourceAtStart, '初始加载').then(() => {
        if (courseVideoLoad === load && load.generation === generation && load.playToken === playToken &&
            diagnosticSource(video) === sourceAtStart) finishCourseVideoLoad(video);
      }).catch(error => {
        if (error?.name === 'CoursePlayCancelledError') return;
        if (courseVideoLoad === load && load.generation === generation && load.playToken === playToken) {
          load.audioWaiting = false;
          load.audioFailed = error?.name === 'CourseAudioNotReadyError';
          load.lastPlayErrorName = error?.name === 'NotAllowedError' ? 'NotAllowedError' : 'Other';
          // 音量同步有5秒失败限频，重试须错开该窗口，避免2秒轮询耗尽次数。
          if (load.audioFailed) load.lastPlayAt = Date.now() + 3000;
          recordPlaybackDiagnostic('本节加载播放失败', video, { error: String(error), errorName: error?.name, playAttempts: load.playAttempts });
        }
      }).finally(() => {
        if (courseVideoLoad === load && load.generation === generation && load.playToken === playToken) load.playPending = false;
      });
      if (courseVideoLoad === load) showCourseVideoLoadStatus();
      return true;
    }
    if (mediaReady) {
      if (!load.playPending && (load.playAttempts || 0) >= 3 && !load.playExhausted) {
        load.exhausted = true;
        load.playExhausted = true;
        recordPlaybackDiagnostic('本节已就绪但播放重试用尽', video, { playAttempts: load.playAttempts });
      }
      showCourseVideoLoadStatus();
      return true;
    }
    if (!load.exhausted && now >= load.retryAt) {
      if (load.attempts < COURSE_LOAD_MAX_ATTEMPTS) retryCourseVideoLoad(load);
      else {
        load.exhausted = true;
        recordPlaybackDiagnostic('本节加载重试用尽', video);
      }
    }
    showCourseVideoLoadStatus();
    return true;
  }

  function startDirectCourseScrollTest() {
    if (syncCourseScope() || courseChangePending || !activeCoursePageKey) return;
    if (
      !automationStarted ||
      manualPaused ||
      awaitingExamAfterVideo ||
      isExamPage() ||
      enteringExam ||
      courseScrollTimer ||
      courseVideoLoad
    ) return;

    // 4.6：正常运行时，视频播放中不扫描。
    // 但“刚点击立即播放”的首次状态检查必须优先执行，
    // 不能被页面原本正在播放的已学习视频挡住。
    if (
      !startupCourseCheckPending &&
      currentVideo &&
      currentVideo.isConnected &&
      !currentVideo.paused &&
      !currentVideo.ended &&
      currentVideo.readyState >= 2
    ) {
      stopCourseScrollTest();
      return;
    }

    const scroller = findRightCourseScroller();
    if (!scroller) {
      showCourseStatus('未识别到右侧课程滚动区\n等待页面加载…', '#e85d04');
      return;
    }

    const scanGeneration = ++courseScanGeneration;
    courseStateChecking = true;
    courseScrollRounds = 0;
    courseScanSawRows = false;
    courseScanFoundPending = false;
    courseScanFoundExam = false;

    // 4.8：从第一节到最后一节严格按顺序扫描。
    // 只处理第一节未完成课程；同一节内部：待考试 > 学习中 > 未学习。
    hardScrollCourseList(scroller, 0);

    showCourseStatus(
      '正在按顺序检查课程\n待考试→学习中→未学习，绝不跳节…',
      '#722ed1'
    );

    const runOneRound = () => {
      if (syncCourseScope() || courseChangePending) return;
      if (scanGeneration !== courseScanGeneration) return;
      if (
        !automationStarted ||
        manualPaused ||
        isExamPage() ||
        enteringExam ||
        courseVideoLoad
      ) {
        stopCourseScrollTest();
        return;
      }

      // 找到目标课程并真正开始播放后才停止扫描。
      // 首次启动检查期间，不允许旧的已学习视频阻止课程状态判断。
      if (
        !startupCourseCheckPending &&
        currentVideo &&
        currentVideo.isConnected &&
        !currentVideo.paused &&
        !currentVideo.ended &&
        currentVideo.readyState >= 2
      ) {
        stopCourseScrollTest();
        return;
      }

      courseScrollRounds++;

      const rows = visibleStateRowsInScroller(scroller);

      if (rows.length) courseScanSawRows = true;

      // 4.8：严格按照页面课程顺序逐行检查。
      // 当前可见区域中，前面的“已学习且无需考试”可以越过；
      // 一旦遇到第一节未完成课程，就立即停止，绝不检查后面的课程。
      let target = null;
      let targetAction = null;

      for (const row of rows) {
        const action = getSequentialCourseAction(row);

        if (!action) continue;

        if (action.type === 'done') {
          continue;
        }

        if (action.type === 'unknown') {
          showCourseStatus(
            '前方课程状态无法识别\n为防止跳节已停止推进',
            '#e85d04'
          );
          stopCourseScrollTest();
          return;
        }

        target = row;
        targetAction = action;
        break;
      }

      if (targetAction?.type === 'exam') {
        courseScanFoundExam = true;
        courseCompletionNotified = false;
        startupCourseCheckPending = false;

        scrollCourseRowIntoView(target);

        scheduleFlowTimeout(() => {
          if (manualPaused || isExamPage()) {
            stopCourseScrollTest();
            return;
          }

          if (!enterExamFromCourseRow(target)) {
            showCourseStatus(
              '当前顺序课程待考试\n等待考试按钮可用…',
              '#e85d04'
            );
            stopCourseScrollTest();
          }
        }, 300);

        return;
      }

      if (targetAction?.type === 'study') {
        courseScanFoundPending = true;
        courseCompletionNotified = false;
        // 找到第一节待学习课程就停止扫描，加载失败也保持本节锁定。
        beginCourseVideoLoad(target, targetAction.state);
        return;
      }

      // 当前可见课程全是“已学习”：直接改变右侧列表自己的 scrollTop。
      const before = scroller.scrollTop;
      const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const step = Math.max(120, Math.floor(scroller.clientHeight * 0.65));
      const after = Math.min(maxTop, before + step);

      if (after > before + 2) {
        hardScrollCourseList(scroller, after);
        showCourseStatus(
          `当前可见课程均已学习\n正在向下滚动查找… ${courseScrollRounds}`,
          '#722ed1'
        );
        return;
      }

      // 4.5：从顶部扫描到底，整轮都没有“学习中/未学习”，
      // 才确认所有节均为“已学习”。
      if (
        courseScanSawRows &&
        !courseScanFoundPending &&
        !courseScanFoundExam
      ) {
        markCurrentCourseCompleted();
        return;
      }

      showCourseStatus('已扫描到课程列表底部\n未能确认课程全部完成', '#e85d04');
      stopCourseScrollTest();
    };

    runOneRound();

    if (!courseScrollTimer && courseStateChecking) {
      courseScrollTimer = setInterval(runOneRound, 700);
    }
  }

  function findScrollableParent(el) {
    let parent = el?.parentElement;

    while (parent && parent !== document.body) {
      const style = getComputedStyle(parent);
      const overflowY = style.overflowY;

      if (
        /(auto|scroll|overlay)/.test(overflowY) &&
        parent.scrollHeight > parent.clientHeight + 5
      ) {
        return parent;
      }

      parent = parent.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  function scrollCourseRowIntoView(row) {
    if (!row) return;

    const scroller = findScrollableParent(row);

    if (
      scroller === document.scrollingElement ||
      scroller === document.documentElement ||
      scroller === document.body
    ) {
      row.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
      return;
    }

    const rowRect = row.getBoundingClientRect();
    const boxRect = scroller.getBoundingClientRect();

    const targetTop =
      scroller.scrollTop +
      (rowRect.top - boxRect.top) -
      (scroller.clientHeight / 2) +
      (rowRect.height / 2);

    scroller.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth'
    });
  }

  function clickCourseForStateTest(row, state) {
    if (!row) return false;

    // 4.4：记住本次实际打开的课程，视频结束后优先点击这一行的“进入考试”。
    currentCourseRow = row;
    currentCourseTitle = getCourseTitle(row);
    completedCourseDoneSince = 0;

    // 3.7：右侧课程区本身是独立滚动区域。
    // 先滚动这个容器，而不是只调用页面级 scrollIntoView。
    scrollCourseRowIntoView(row);

    showCourseStatus(
      `课程状态：${state}\n正在定位本节课程…`,
      state === '学习中' ? '#1677ff' : '#722ed1'
    );

    scheduleFlowTimeout(() => {
      if (manualPaused || enteringExam || isExamPage()) return;
      if (courseVideoLoad && courseVideoLoad.row !== row) return;

      const candidates = [
        ...row.querySelectorAll(
          'a, [role="button"], img, .title, [class*="title"], [class*="name"]'
        )
      ].filter(el => {
        const text = textOf(el);
        return (
          el.offsetParent !== null &&
          !isExamButton(el) &&
          text !== '进入考试' &&
          text !== '已学习' &&
          text !== '学习中' &&
          text !== '未学习'
        );
      });

      const target =
        candidates.find(el => {
          const text = textOf(el);
          return text && text.length > 2;
        }) ||
        candidates[0] ||
        row;

      if (courseVideoLoad?.row === row) courseVideoLoad.clickedAt = Date.now();
      target.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      }));

      showCourseStatus(
        `已到达课程：${state}\n正在打开视频…`,
        state === '学习中' ? '#1677ff' : '#722ed1'
      );
    }, 450);

    return true;
  }

  // 4.3：已移除 3.6/3.7 的旧课程推进状态机，统一使用右侧列表直接扫描逻辑。

  function scanCoursePage() {
    if (syncCourseScope()) return;
    if (backgroundPageHidden) return;
    ensureCourseWarningPaused();
    syncExamSession();
    // 4.3 优先级：
    // 手动暂停 > 考试页 > 考试返回 > 视频结束/进入考试 >
    // 滑块临时恢复 > 正常播放 > 课程列表扫描。

    if (isExamPage()) {
      if (courseVideoLoad) {
        courseVideoLoad = null;
        clearPendingFlowTimers();
        stopCourseScrollTest();
      }
      wasExamPage = true;
      removeCourseStatusBox();

      // 5.2：人工直接进入考试时自动开启考试流程。
      startAutomationFromDirectExam();
      requestExamFlow('考试页面扫描');

      // 4.3：考试页也保留暂停按钮，允许暂停自动答题/翻页/交卷。
      if (automationStarted) createPauseControl();
      return;
    }

    removeExamStatusBox();
    if (automationStarted) createPauseControl();
    document.querySelectorAll('video').forEach(setupVideo);

    if (automationStarted && manualPaused) {
      stopCourseScrollTest();

      if (currentVideo && !currentVideo.paused && !currentVideo.ended) {
        currentVideo.pause();
      }

      if (anomalyDiagnostic.guardActive) showCourseWarningStatus();
      else showCourseStatus(courseChangePending ? COURSE_CHANGE_MESSAGE : '自动测试已暂停\n点击此状态继续', '#666');
      return;
    }

    // 考试完成返回课程页：先彻底清理考试状态，再找下一节。
    if (automationStarted && wasExamPage) {
      wasExamPage = false;
      resetExamStateAfterReturn();
      // 刚返回时旧视频可能已断开；立即保持选课阶段，而非等500ms后才设置。
      startupCourseCheckPending = true;

      scheduleFlowTimeout(() => {
        if (!manualPaused && !isExamPage()) {
          // 4.8：考试完成后重新从第一节开始确认顺序，
          // 不直接跳到“下一节未学习”。
          startupCourseCheckPending = true;
          startDirectCourseScrollTest();
        }
      }, 500);

      return;
    }

    if (!automationStarted) return;

    // 选中的视频尚未加载完成时，只等待/重试本节，不重新滚动课程列表。
    if (handleCourseVideoLoad()) return;

    // 4.6：点击“立即播放”后的首次任务不是播放当前 video，
    // 而是先确认课程状态。此阶段忽略页面旧 video 的播放/结束状态。
    if (startupCourseCheckPending) {
      awaitingExamAfterVideo = false;
      videoEndedAt = 0;
      examWaitStartedAt = 0;

      if (currentVideo && !currentVideo.paused && !currentVideo.ended) {
        currentVideo.pause();
      }

      if (!courseScrollTimer && !courseStateChecking) {
        startDirectCourseScrollTest();
      }
      return;
    }

    // 已选中课程播放中发生网络错误或数据不足，也先留在本节恢复。
    if (currentCourseRow && currentVideo && !currentVideo.ended &&
        !awaitingExamAfterVideo && !videoEndedAt &&
        (currentVideo.error || currentVideo.readyState < 2)) {
      beginCourseVideoLoad(currentCourseRow, getCourseState(currentCourseRow), true);
      return;
    }

    // 视频正在正常播放：不滚动、不切课、不找考试。
    if (videoIsPlaying()) {
      stopCourseScrollTest();
      updateCourseStatus(currentVideo);
      return;
    }

    // 接近结尾只防止扫描切课，不能设置完成/考试锁；98%仍有未播放内容。
    // 前台或后台的末尾暂停均恢复本节，结束事件才进入下方完成处理。
    if (courseVideoNearEnd(currentVideo) && canContinueCourseFlow(currentVideo, true)) {
      stopCourseScrollTest();
      updateCourseStatus(currentVideo);
      recoverCurrentCourseVideo(currentVideo, '课程末尾尚未结束');
      return;
    }

    // 5.0：视频结束后先确认本节状态；待考试则考试，已学习且稳定则推进。
    if (currentVideo?.ended || videoEndedAt || awaitingExamAfterVideo) {
      awaitingExamAfterVideo = true;

      if (!videoEndedAt && currentVideo?.ended) videoEndedAt = Date.now();
      if (!examWaitStartedAt) examWaitStartedAt = videoEndedAt;

      stopCourseScrollTest();
      clearPendingFlowTimers();

      const endContext = resolveEndedCourseContext();
      observeEndedCourseContext(endContext);
      if (checkNextExam(endContext)) return;

      if (advanceAfterCourseWithoutExam(endContext)) return;

      const waited = Math.floor((Date.now() - examWaitStartedAt) / 1000);

      if (waited < 30) {
        showCourseStatus(
          `视频播放完成\n正在确认本节状态… ${waited}s`,
          '#722ed1'
        );
      } else {
        showCourseStatus(
          endContext.row ?
            `视频播放完成\n本节状态：${endContext.state || '尚未识别'}，等待更新或考试入口` :
            '视频播放完成\n当前课程暂未定位，已记录诊断',
          '#e85d04'
        );
      }

      return;
    }

    // 滑块刚出现/消失后的恢复窗口内，不把临时 pause 误判成“需要切课”。
    if (sliderRecoveryPending()) {
      stopCourseScrollTest();
      return;
    }

    // 没有正常播放的视频时，才允许扫描右侧课程列表。
    // 后台暂停仍属于本节课，先恢复，不能误触发切课扫描。
    if (canRecoverBackgroundVideo(currentVideo)) {
      scheduleBackgroundVideoRecovery(currentVideo);
      return;
    }

    if (
      !courseScrollTimer &&
      !courseStateChecking
    ) {
      startDirectCourseScrollTest();
    }
  }

  // 3.4：弹窗/遮罩层出现或消失后，再检查一次视频是否被暂停。
  // 4.2：完整合并“河南继续医学教育 - 滑块弹窗调试 1.2”。
  // 当前课程立即检查，保留一次 500ms 复查以覆盖稍晚到达的页面 pause。
  function ensureVideoPlayingAfterSlider(reason = '') {
    return recoverCurrentCourseVideo(currentVideo, reason || '课程滑块变化', true);
  }

  function scheduleSliderVideoCheck(reason) {
    clearTimeout(sliderResumeTimer);

    // 4.3：在这段时间内禁止课程扫描把滑块造成的临时暂停误判成切课条件。
    sliderRecoveryUntil = Date.now() + 1400;
    ensureVideoPlayingAfterSlider(reason);

    sliderResumeTimer = setTimeout(() => {
      sliderResumeTimer = null;

      if (!manualPaused) {
        ensureVideoPlayingAfterSlider(reason);
      }
    }, 500);
  }

  function checkSliderPopup() {
    observeDiagnosticPopupState();
    let sliderVisible = false;

    document
      .querySelectorAll('.el-dialog.myDialogClass')
      .forEach(dialog => {
        const text = dialog.textContent || '';
        const slider = dialog.querySelector('.vertifyWrap');

        if (text.includes('打卡') && slider) {
          sliderVisible = true;

          const overlay = dialog.closest('.el-overlay');

          if (overlay) {
            overlay.style.setProperty(
              'display',
              'none',
              'important'
            );
          } else {
            dialog.style.setProperty(
              'display',
              'none',
              'important'
            );
          }

          if (document.body) {
            document.body.style.removeProperty('overflow');
            document.body.style.removeProperty('padding-right');
          }
        }
      });

    // 第一次检测到滑块出现
    if (sliderVisible && !sliderWasVisible) {
      sliderWasVisible = true;
      recordPlaybackDiagnostic('课程滑块弹窗出现');
      scheduleSliderVideoCheck('滑块弹窗出现');
    }

    // 滑块从 DOM 中消失
    if (!sliderVisible && sliderWasVisible) {
      sliderWasVisible = false;
      recordPlaybackDiagnostic('课程滑块弹窗消失');
      scheduleSliderVideoCheck('滑块弹窗消失');
    }
    observeDiagnosticPopupState();
  }

  function setupCheckinSliderHider() {
    if (!document.documentElement) return;


    const observer = new MutationObserver(() => {
      // MutationObserver 自身合并本轮 DOM 更新，直接检查，避免后台 50ms 定时器拖延至一分钟。
      checkSliderPopup();
    });

    checkSliderPopup();

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    // 与 1.2 一致：页面第一次加载完成后也延迟检查一次。
    window.addEventListener('load', () => {
      scheduleSliderVideoCheck('页面加载完成');
    });
  }

  function isCheckinSliderPopupNode(node) {
    if (!(node instanceof Element)) return false;

    const dialogs = [];

    if (node.matches?.('.el-dialog.myDialogClass')) {
      dialogs.push(node);
    }

    dialogs.push(
      ...node.querySelectorAll?.('.el-dialog.myDialogClass') || []
    );

    // node 可能本身就是包含弹窗的 overlay。
    const closestDialog = node.closest?.('.el-dialog.myDialogClass');
    if (closestDialog) dialogs.push(closestDialog);

    return dialogs.some(dialog => {
      const text = dialog.textContent || '';
      return text.includes('打卡') && !!dialog.querySelector('.vertifyWrap');
    });
  }

  function isRelevantPopupNode(node) {
    if (!(node instanceof Element)) return false;

    // 4.3：打卡滑块只交给 500ms 专用恢复逻辑处理，
    // 避免旧的 150ms 通用弹窗恢复机制提前 play()。
    if (isCheckinSliderPopupNode(node)) return false;

    const selector = [
      '.el-dialog__wrapper',
      '.el-message-box__wrapper',
      '.el-message-box',
      '.v-modal',
      '.el-overlay',
      '[role="dialog"]',
      '[class*="captcha"]',
      '[class*="verify"]',
      '[class*="slider"]'
    ].join(',');

    if (node.matches(selector) || node.querySelector(selector)) return true;

    const text = textOf(node);
    return /滑块|拖动|验证|验证码|请确认是否交卷|温馨提示|请勿尝试快进视频|课程学习存在异常/.test(text);
  }

  function resumeVideoAfterPopupChange() {
    return recoverCurrentCourseVideo(currentVideo, '通用弹窗变化');
  }

  function setupPopupVideoRecovery() {
    if (!document.documentElement || popupRecoveryObserverInstalled) return;
    popupRecoveryObserverInstalled = true;

    let timer = null;

    const observer = new MutationObserver(mutations => {
      if (isExamPage()) {
        requestExamFlow('试卷DOM变化');
        return;
      }
      let popupChanged = false;

      for (const mutation of mutations) {
        if (mutation.type === 'attributes' || mutation.type === 'characterData') {
          popupChanged = isRelevantPopupNode(mutation.target?.nodeType === 3 ? mutation.target.parentElement : mutation.target);
        }
        for (const node of mutation.addedNodes || []) {
          if (isRelevantPopupNode(node)) {
            popupChanged = true;
            break;
          }
        }

        if (!popupChanged) {
          for (const node of mutation.removedNodes || []) {
            if (isRelevantPopupNode(node)) {
              popupChanged = true;
              break;
            }
          }
        }

        if (popupChanged) break;
      }

      if (!popupChanged) return;

      observeDiagnosticPopupState();
      resumeVideoAfterPopupChange();
      clearTimeout(timer);
      timer = setTimeout(resumeVideoAfterPopupChange, 150);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'disabled', 'aria-disabled', 'aria-hidden', 'hidden', 'inert']
    });
  }

  function createExamStatusBox() {
    if (isExamPage()) wasExamPage = true;

    if (examStatusBox || !document.body || !isExamPage()) {
      return examStatusBox;
    }

    examStatusBox = document.createElement('button');
    examStatusBox.type = 'button';
    examStatusBox.addEventListener('click', toggleAutomationFromStatus);
    examStatusColor = '';

    Object.assign(examStatusBox.style, {
      position: 'fixed',
      right: '18px',
      bottom: '18px',
      zIndex: '2147483647',
      padding: '10px 14px',
      color: '#fff',
      background: '#1677ff',
      borderRadius: '8px',
      fontSize: '14px',
      lineHeight: '1.5',
      boxShadow: '0 4px 14px rgba(0,0,0,.25)'
    });

    mountHelperControl(examStatusBox, '.helper-status-slot', 'helper-status');
    updatePauseControl();
    return examStatusBox;
  }

  function showExamStatus(message, color = '#1677ff') {
    if (!automationStarted || !isExamPage()) return;

    const box = createExamStatusBox();
    if (!box) return;

    // 相同状态不重复写DOM，避免考试观察器被自己的状态框不断唤醒。
    if (examStatusColor !== color) { box.style.background = color; examStatusColor = color; }
    if (box.textContent !== message) box.textContent = message;
    updatePauseControl();
  }

  function requestExamFlow(reason) {
    if (!isExamPage() || manualPaused || backgroundPageHidden) return;
    startAutomationFromDirectExam();
    if (!automationStarted || examFlowQueued) return;
    examFlowQueued = true;
    const sessionId = examSessionId;
    // 合并本轮事件，等网页本轮渲染提交后检查；不等待后台定时器。
    Promise.resolve().then(() => {
      examFlowQueued = false;
      if (!automationStarted || manualPaused || backgroundPageHidden || !isExamPage()) return;
      syncExamSession();
      if (sessionId !== examSessionId) { requestExamFlow('新考试重新检查'); return; }
      try { runExamFlow(reason); }
      catch (error) {
        recordPlaybackDiagnostic('考试流程检查异常', null, { error: String(error) });
      }
    });
  }

  function recordExamFlowState(reason, state) {
    const info = pageInfo();
    const detail = {
      examState: state, questionCount: questions.length,
      examCurrent: info?.current ?? null, examTotal: info?.total ?? null,
      answeredCount: answeredPages.size, submitted, advancing
    };
    const key = JSON.stringify(detail);
    if (key === examFlowLastState) return;
    examFlowLastState = key;
    examFlowDiagnostic.lastState = { ...detail, time: new Date().toISOString() };
    recordPlaybackDiagnostic('考试流程状态', null, { ...detail, triggerReason: reason });
  }

  function runExamFlow(reason) {
    if (submitted) {
      confirmSubmit();
      recordExamFlowState(reason, '等待交卷结果');
      return;
    }
    if (confirmStartExam()) { recordExamFlowState(reason, '等待开始弹窗关闭'); return; }
    if (!questions.length) { recordExamFlowState(reason, '等待题库响应'); return; }
    const question = findCurrentQuestion();
    if (!question) {
      showExamStatus('当前题未匹配到已购答案，已停止自动答题。可能未购买或题干不匹配；请勿重复购买，不会自动补查或交卷。', '#e85d04');
      recordExamFlowState(reason, '当前题无已购答案'); return;
    }
    const info = pageInfo();
    if (advancing && info && `${info.current}/${info.total}` !== lastPage) advancing = false;
    if (selectCurrentQuestion()) {
      recordExamFlowState(reason, '等待选项渲染');
      return;
    }
    autoTurnExam();
    recordExamFlowState(reason, submitted ? '等待交卷结果' : advancing ? '等待下一题渲染' :
      currentQuestionAnswered() ? '选项已选，检查翻页入口' : '等待选项就绪');
  }

  function loadAnswers(result) {
    if (!isExamPage()) return;

    // 题库响应可能早于页面轮询到达，需在这里同步启动直接考试流程。
    startAutomationFromDirectExam();

    const list = result?.ok === true ? result.questions : null;
    examFlowDiagnostic.answerResponses++;
    if (!Array.isArray(list)) {
      recordPlaybackDiagnostic('考试题库响应格式未识别', null);
      requestExamFlow('题库响应格式未识别');
      return;
    }

    questions = [];
    for (const question of list) {
      if (!question || typeof question.title !== 'string') continue;
      const titleKey = normalize(question.title);
      if (!titleKey) continue;
      questions.push({
        title: question.title, titleKey, type: String(question.type),
        answers: question.answer_labels.slice(),
        answerValues: question.answer_values.slice()
      });
    }
    examFlowDiagnostic.loadedQuestions = questions.length;
    recordPlaybackDiagnostic('考试题库已读取', null, { questionCount: questions.length });

    showExamStatus(`题库已读取：${questions.length} 题`);
    requestExamFlow('题库响应');
  }

  function findCurrentQuestion() {
    if (!document.body || !isExamPage()) return null;

    const pageText = normalize(document.body.innerText);

    const matches = questions.filter(question => question.titleKey && pageText.includes(question.titleKey));
    if (matches.length === 1) return matches[0];
    // 题干包含另一道短题干时，优先完整的长题干；同长度歧义则等待。
    let longest = null;
    let tied = false;
    for (const question of matches) {
      if (!longest || question.titleKey.length > longest.titleKey.length) { longest = question; tied = false; }
      else if (question.titleKey.length === longest.titleKey.length) tied = true;
    }
    return longest && !tied && matches.every(question => longest.titleKey.includes(question.titleKey)) ? longest : null;
  }

  function questionAnswerPlan(question) {
    if (question.answerValues) {
      // Resolve against actual option content; never trust an upstream letter after shuffling.
      const inputType = question.type === '1' ? 'checkbox' : 'radio';
      const inputs = [...document.querySelectorAll(`input[type="${inputType}"]`)];
      const optionTexts = inputs.map(input => {
        const label = input.closest('label') || input.labels?.[0];
        const content = label?.querySelector('.el-radio__label, .el-checkbox__label') || label;
        const text = (content?.innerText || content?.textContent || '').normalize('NFKC').trim();
        return [normalize(text), normalize(text.replace(/^[A-Z][.．、:：)）]\s*/i, ''))];
      });
      const indices = question.answerValues.map(value => {
        const key = normalize(value);
        const matches = optionTexts.map((texts, index) => texts.includes(key) ? index : -1).filter(index => index >= 0);
        return key && matches.length === 1 ? matches[0] : -1;
      });
      const valid = indices.length > 0 && indices.every(index => index >= 0) && new Set(indices).size === indices.length &&
        (question.type === '1' || indices.length === 1);
      return { valid, indices, wanted: new Set(indices) };
    }
    return { valid: false, indices: [], wanted: new Set() };
  }

  function selectCurrentQuestion() {
    if (!automationStarted || manualPaused || !isExamPage()) return;
    if (confirmStartExam()) return;
    if (
      !questions.length ||
      submitted
    ) return;

    const question = findCurrentQuestion();
    if (!question) return;
    const plan = questionAnswerPlan(question);
    if (!plan.valid) {
      showExamStatus('已购答案与页面选项无法唯一匹配，已暂停；不会按字母猜选或重新收费。', '#e85d04');
      return;
    }

    const inputType = question.type === '1' ? 'checkbox' : 'radio';
    const inputs = [...document.querySelectorAll(`input[type="${inputType}"]`)];
    if (!inputs.length) return;

    let selected = 0;

    // 不完整的选项渲染时不先点部分答案；无响应点击也不会造成无限微任务循环。
    if (plan.indices.some(index => !inputs[index])) return;
    const wanted = plan.wanted;
    const questionKey = `${examSessionId}:${pageInfo()?.current ?? ''}:${question.titleKey || question.title || ''}`;
    for (let index = 0; index < inputs.length; index++) {
      const input = inputs[index];
      const shouldCheck = wanted.has(index);
      if (question.type !== '1' && !shouldCheck) continue;
      const attempt = examInputAttempts.get(input);
      if (input.disabled || Boolean(input.checked) === shouldCheck ||
          (attempt && attempt.questionKey === questionKey && attempt.checked === shouldCheck && Date.now() - attempt.at < 1000)) continue;
      examInputAttempts.set(input, { checked: shouldCheck, at: Date.now(), questionKey });
      try { input.click(); selected++; }
      catch (error) { examInputAttempts.delete(input); throw error; }
      // 每轮只改一个选项，下一次微任务复查组件提交后的状态，避免批量点击覆盖多选数组。
      break;
    }

    if (selected) {
      examFlowDiagnostic.selectedOptions += selected;
      recordPlaybackDiagnostic('考试选项已点击', null, { selectedCount: selected, examCurrent: pageInfo()?.current ?? null });
      requestExamFlow('选项点选后的复查');
      showExamStatus(
        `当前答案：${question.answers.join('、')}\n已点选：${selected} 项`
      );
    }
    return selected;
  }

  function findButton(name) {
    return [...document.querySelectorAll('button')]
      .find(button => textOf(button) === name && !button.disabled);
  }

  function pageInfo() {
    if (!document.body || !isExamPage()) return null;

    const match = document.body.innerText.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match || Number(match[1]) < 1 || Number(match[2]) < Number(match[1])) return null;

    return {
      current: Number(match[1]),
      total: Number(match[2])
    };
  }

  function currentQuestionAnswered() {
    const question = findCurrentQuestion();
    if (question?.answers?.length) {
      const inputType = question.type === '1' ? 'checkbox' : 'radio';
      const inputs = [...document.querySelectorAll(`input[type="${inputType}"]`)];
      // 事件触发可能在多选组件更新途中到达，全部目标选项就绪后才翻页。
      const plan = questionAnswerPlan(question);
      return plan.valid && plan.indices.every(index => !!inputs[index]?.checked) &&
        inputs.every((input, index) => !input.checked || plan.wanted.has(index));
    }
    return false;
  }

  function inspectExamStartDialog(dialog) {
    const chain = [];
    let hiddenReason = !dialog.isConnected ? 'disconnected' :
      !dialog.getClientRects().length ? 'no-layout' : '';
    let leaving = false;
    let transparent = false;
    for (let node = dialog, depth = 0; node && depth < 16; node = node.parentElement, depth++) {
      const style = typeof getComputedStyle === 'function' ? getComputedStyle(node) : {};
      const className = String(node.getAttribute?.('class') || node.className || '');
      const hidden = !!node.hidden;
      const ariaHidden = node.getAttribute?.('aria-hidden') === 'true';
      const leaveClass = className.split(/\s+/).find(name => /-leave-(?:from|active|to)$/.test(name)) || '';
      if (leaveClass) leaving = true;
      if (style.opacity === '0') transparent = true;
      if (!hiddenReason) {
        if (hidden) hiddenReason = 'hidden-attribute';
        else if (ariaHidden) hiddenReason = 'aria-hidden';
        else if (style.display === 'none') hiddenReason = 'display-none';
        else if (style.visibility === 'hidden' || style.visibility === 'collapse') hiddenReason = 'visibility-hidden';
      }
      chain.push({ depth, className: className.slice(0, 160), display: style.display,
        visibility: style.visibility, opacity: style.opacity, pointerEvents: style.pointerEvents,
        hidden, ariaHidden, leaveClass });
      if (node === document.body) break;
    }
    return { hiddenReason, leaving, transparent, chain };
  }

  function examQuestionControlsReady() {
    const question = findCurrentQuestion();
    if (!question || !pageInfo()) return false;
    const plan = questionAnswerPlan(question);
    if (!plan.valid) return false;
    const type = question.type === '1' ? 'checkbox' : 'radio';
    const inputs = [...document.querySelectorAll(`input[type="${type}"]`)];
    return plan.indices.every(index => {
      const input = inputs[index];
      if (!input?.isConnected || input.disabled || !input.getClientRects().length || input.closest?.('[inert]')) return false;
      if (typeof getComputedStyle !== 'function') return true;
      const style = getComputedStyle(input);
      // 自定义单选框通常将原生input透明化，opacity=0不代表选项不可用。
      return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse';
    });
  }

  function recordExamStartDialogState(state, snapshot, controlsReady, decision, button) {
    const detail = { ...snapshot, confirmed: state.confirmedAt !== null,
      controlsReady, decision, confirmButtonEnabled: !!button };
    const signature = JSON.stringify(detail);
    const waitedMs = state.confirmedAt === null ? 0 : Date.now() - state.confirmedAt;
    const overdue = waitedMs >= 10000 && decision === '等待弹窗关闭' && !state.overdueLogged;
    if (signature === state.signature && !overdue) return;
    state.signature = signature;
    if (overdue) state.overdueLogged = true;
    // 只记录状态和CSS信息，不记录试卷题干、答案、账号或请求凭据。
    recordPlaybackDiagnostic(overdue ? '开始弹窗关闭等待超时' : '开始考试弹窗状态', null,
      { ...detail, confirmedElapsedMs: waitedMs });
  }

  function confirmStartExam() {
    if (!automationStarted || manualPaused || !isExamPage()) return false;
    syncExamSession();
    const dialogs = document.querySelectorAll('.el-message-box, .el-dialog, [role="dialog"]');
    for (const dialog of dialogs) {
      if (!/本场考试时间为\d+(?:\.\d+)?分钟[，,]?请(?:确定|确认)是否开始考试/.test(textOf(dialog))) continue;
      let state = examStartDialogStates.get(dialog);
      if (!state || state.sessionId !== examSessionId) {
        state = { sessionId: examSessionId, confirmedAt: null, signature: '', overdueLogged: false };
        examStartDialogStates.set(dialog, state);
      }
      const snapshot = inspectExamStartDialog(dialog);
      if (snapshot.hiddenReason) {
        recordExamStartDialogState(state, snapshot, false, '弹窗已隐藏', null);
        continue;
      }
      const button = [...dialog.querySelectorAll('button, .el-button, [role="button"]')]
        .find(node => /^(确认|确定)$/.test(textOf(node)) && isEnabled(node));
      if (button && examStartConfirmedButtons.has(button) && state.confirmedAt === null) state.confirmedAt = Date.now();
      const controlsReady = state.confirmedAt !== null && snapshot.leaving && examQuestionControlsReady();
      // 已点击确认 + 框架已进入离场状态 + 题目控件就绪，三者同时成立才放行。
      // 不删除节点、不重复确认、不强行触发动画结束；冻结本身仍由浏览器管理。
      if (state.confirmedAt !== null && snapshot.leaving && controlsReady) {
        recordExamStartDialogState(state, snapshot, true, '已确认离场且试卷就绪，继续流程', button);
        continue;
      }
      if (button && !examStartConfirmedButtons.has(button) && !snapshot.leaving) {
        examStartConfirmedButtons.add(button);
        state.confirmedAt = Date.now();
        try { button.click(); }
        catch (error) { examStartConfirmedButtons.delete(button); state.confirmedAt = null; throw error; }
        recordPlaybackDiagnostic('已确认开始考试', null);
        showExamStatus('已确认开始考试\n等待试卷就绪…', '#1677ff');
        requestExamFlow('开始考试确认后的复查');
      }
      recordExamStartDialogState(state, snapshot, controlsReady,
        state.confirmedAt === null ? '等待确认按钮可用' : '等待弹窗关闭', button);
      return true;
    }
    return false;
  }

  function confirmSubmit() {
    if (!automationStarted || manualPaused || !isExamPage()) return false;
    // 3.4：只处理“请确认是否交卷”对应的弹窗，避免误点其他确认按钮。
    const dialogs = [
      ...document.querySelectorAll(
        '.el-message-box__wrapper, .el-message-box, .el-dialog__wrapper, [role="dialog"]'
      )
    ];

    const submitDialog = dialogs.find(dialog => {
      const text = textOf(dialog);
      return (
        dialog.isConnected && dialog.getClientRects().length > 0 && (text.includes('请确认是否交卷') ||
        (text.includes('温馨提示') && text.includes('交卷'))
      ));
    });

    if (!submitDialog) return false;

    const confirmButton = [
      ...submitDialog.querySelectorAll(
        'button, .el-button, [role="button"]'
      )
    ].find(button => {
      const text = textOf(button);
      return (
        (text === '确认' || text === '确定') &&
        !button.disabled &&
        button.getAttribute('aria-disabled') !== 'true' &&
        !button.classList.contains('is-disabled') &&
        !button.classList.contains('disabled')
      );
    });

    if (!confirmButton) return false;
    if (examSubmitConfirmedButtons.has(confirmButton)) return true;

    examSubmitConfirmedButtons.add(confirmButton);
    try { confirmButton.click(); }
    catch (error) { examSubmitConfirmedButtons.delete(confirmButton); throw error; }
    examFlowDiagnostic.submitConfirms++;
    recordPlaybackDiagnostic('已确认交卷', null);
    showExamStatus('检测到交卷确认弹窗\n已自动确认交卷', '#722ed1');
    return true;
  }

  function submitExam() {
    const paidPage = pageInfo();
    if (!paidPage || questions.length < paidPage.total || !currentQuestionAnswered()) return;
    const submitButton = findButton('交卷');
    if (!submitButton || submitted) return;
    const sessionId = examSessionId;

    submitted = true;
    examFlowDiagnostic.submitClicks++;
    recordPlaybackDiagnostic('已点击交卷', null, { answeredCount: answeredPages.size });
    showExamStatus('全部题目已完成\n正在交卷…', '#722ed1');
    try { submitButton.click(); }
    catch (error) { submitted = false; throw error; }
    syncExamSession();
    if (sessionId !== examSessionId || !submitted || manualPaused) return;
    requestExamFlow('交卷按钮点击');

    clearExamConfirmTimer();
    const deadline = Date.now() + 10000;
    const confirmTimer = setInterval(() => {
      if (examConfirmTimer !== confirmTimer) return;
      syncExamSession();
      if (sessionId !== examSessionId || manualPaused || !isExamPage() || Date.now() >= deadline) {
        clearExamConfirmTimer();
        return;
      }
      try { if (confirmSubmit()) clearExamConfirmTimer(); }
      catch (error) {
        clearExamConfirmTimer();
        recordPlaybackDiagnostic('交卷确认检查异常', null, { error: String(error) });
        // DOM观察器和常规定时复查仍可重试，不留下高频异常循环。
      }
    }, 50);
    examConfirmTimer = confirmTimer;
  }

  function autoTurnExam() {
    if (
      !automationStarted ||
      manualPaused ||
      !isExamPage() ||
      submitted
    ) return;

    if (confirmStartExam()) return;

    const info = pageInfo();
    if (!info) return;

    const pageKey = `${info.current}/${info.total}`;
    if (advancing && lastPage === pageKey && Date.now() - lastAdvanceAt >= 3000) {
      advancing = false;
      lastPage = '';
    }
    // 新题目已出现就解锁，不依赖后台可能被延迟的400ms回调。
    if (advancing && lastPage !== pageKey) advancing = false;

    if (!currentQuestionAnswered()) {
      showExamStatus(`第 ${info.current} 题等待选项…`, '#e85d04');
      return;
    }

    answeredPages.add(info.current);

    if (info.current < info.total) {
      const nextButton = findButton('下一题');

      if (nextButton && !advancing && lastPage !== pageKey) {
        advancing = true;
        lastPage = pageKey;
        lastAdvanceAt = Date.now();
        showExamStatus(`第 ${info.current} 题已选\n进入下一题…`);
        examFlowDiagnostic.nextClicks++;
        recordPlaybackDiagnostic('考试下一题已点击', null, { examCurrent: info.current, examTotal: info.total });
        try { nextButton.click(); }
        catch (error) { advancing = false; lastPage = ''; throw error; }
        requestExamFlow('翻页按钮点击');

      }

      return;
    }

    if (
      AUTO_SUBMIT &&
      info.current === info.total &&
      answeredPages.size >= info.total
    ) {
      submitExam();
    } else {
      showExamStatus(
        `已到最后一题\n已记录 ${answeredPages.size}/${info.total} 题`,
        '#e85d04'
      );
    }
  }

  function isTargetRequest(url, method) {
    if (String(method || 'GET').toUpperCase() !== 'POST') return false;
    try {
      const parsed = new URL(String(url || ''), 'https://yuancheng.henanyixue.com/');
      return parsed.origin === 'https://yuancheng.henanyixue.com' && parsed.pathname === API_PATH;
    } catch { return false; }
  }

  function parseProgressRequestEndpoint(url, method) {
    if (String(method || 'GET').toUpperCase() !== 'POST') return null;
    try {
      const parsed = new URL(String(url || ''), 'https://yuancheng.henanyixue.com/');
      return parsed.origin === 'https://yuancheng.henanyixue.com' &&
        parsed.pathname.startsWith('/xxpt/api/') && !parsed.pathname.includes('/exam/') ? parsed : null;
    } catch { return null; }
  }

  function describeProgressRequest(url, method, body) {
    const parsed = parseProgressRequestEndpoint(url, method);
    if (!parsed) return null;
    try {
      let data = null;
      if (typeof body === 'string') {
        try { data = JSON.parse(body); } catch { data = Object.fromEntries(new URLSearchParams(body)); }
      } else if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
        data = Object.fromEntries(body);
      } else if (typeof FormData !== 'undefined' && body instanceof FormData) {
        data = Object.fromEntries(body);
      }
      const time = data?.time;
      if (!data || !Object.prototype.hasOwnProperty.call(data, 'coursesId') ||
          !Object.prototype.hasOwnProperty.call(data, 'memberId') ||
          !((typeof time === 'number' || (typeof time === 'string' && time.trim() !== '')) && Number.isFinite(Number(time)))) return null;
      // 只保留路径、上报秒数和 ID 是否存在；不记录 token、ID、请求头或完整请求/响应内容。
      return { endpoint: parsed.pathname, reportedTime: Number(time), hasCourseId: !!data.coursesId, hasMemberId: !!data.memberId };
    } catch { return null; }
  }

  function startProgressRequest(detail, transport) {
    const report = { ...detail, requestId: ++progressRequestId, transport, startedAt: diagnosticNow() };
    progressReportDiagnostic.requests++;
    progressReportDiagnostic.lastRequestAt = new Date().toISOString();
    recordPlaybackDiagnostic('进度上报请求', currentVideo, report);
    return report;
  }

  function recordProgressResponse(report, status, businessCode, failure = '') {
    if (!report || report.completed) return;
    report.completed = true;
    progressReportDiagnostic.responses++;
    progressReportDiagnostic.lastResponseAt = new Date().toISOString();
    if (failure || !status) progressReportDiagnostic.networkFailures++;
    else if (status < 200 || status >= 300) progressReportDiagnostic.httpFailures++;
    const code = typeof businessCode === 'number' && Number.isFinite(businessCode) ? businessCode :
      typeof businessCode === 'string' && /^-?\d{1,6}$/.test(businessCode) ? businessCode : null;
    recordPlaybackDiagnostic('进度上报响应', currentVideo, {
      requestId: report.requestId, transport: report.transport, endpoint: report.endpoint,
      reportedTime: report.reportedTime, httpStatus: status, businessCode: code,
      elapsedMs: diagnosticNow() - report.startedAt, networkFailure: failure || null
    });
  }

  const nativeFetch = window.fetch;
  window.fetch = async function(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || input?.href;
    const method = init?.method || input?.method || 'GET';
    const examRequest = isTargetRequest(url, method) ? captureExamRequest() : null;
    let billingContextPromise = null;
    if (examRequest) {
      try {
        const body = init?.body !== undefined ? Promise.resolve(init.body) :
          typeof input?.clone === 'function' ? input.clone().text() : Promise.resolve(null);
        billingContextPromise = body.then(value => parseBillingContext(value)).catch(() => null);
      } catch { billingContextPromise = Promise.resolve(null); }
    }
    let report = null;
    let reportPromise = null;
    try {
      const detail = describeProgressRequest(url, method, init?.body);
      if (detail) report = startProgressRequest(detail, 'fetch');
    } catch {}
    // Request 对象的 body 只读取副本，不消费原 body，也不推迟网页发起请求。
    if (!report && init?.body === undefined && parseProgressRequestEndpoint(url, method) &&
        typeof input?.clone === 'function') {
      try {
        reportPromise = input.clone().text().then(body => {
          const detail = describeProgressRequest(url, method, body);
          return detail ? startProgressRequest(detail, 'fetch') : null;
        }).catch(() => null);
      } catch {}
    }
    let response;
    try { response = await nativeFetch.apply(this, arguments); }
    catch (error) {
      if (report) recordProgressResponse(report, 0, null, 'fetch-rejected');
      if (reportPromise) reportPromise.then(detail => {
        if (detail) recordProgressResponse(detail, 0, null, 'fetch-rejected');
      });
      throw error;
    }
    const inspectResponse = activeReport => {
      if (!activeReport) return;
      try {
        response.clone().json().then(data => recordProgressResponse(activeReport, response.status, data?.code))
          .catch(() => recordProgressResponse(activeReport, response.status, null));
      } catch { recordProgressResponse(activeReport, response.status, null); }
    };
    if (report) inspectResponse(report);
    if (reportPromise) reportPromise.then(inspectResponse);

    if (billingContextPromise && response.ok) {
      let questionPromise = Promise.resolve(null);
      try { questionPromise = response.clone().json().catch(() => null); } catch (_) {}
      Promise.all([billingContextPromise, questionPromise]).then(([context, data]) =>
        acceptBillingContext(enrichBillingContext(context, parseExamQuestionHints(data), data?.data?.list), examRequest)).catch(() => {});
    }

    return response;
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    const result = nativeOpen.apply(this, arguments);
    this.__examMethod = method;
    this.__examUrl = url;
    progressXHRContexts.set(this, { method, url, report: null, examRequest: null });
    return result;
  };

  XMLHttpRequest.prototype.send = function() {
    const requestContext = progressXHRContexts.get(this);
    if (requestContext && isTargetRequest(requestContext.url, requestContext.method)) {
      requestContext.examRequest = captureExamRequest();
      requestContext.billingContext = parseBillingContext(arguments[0]);
    }
    try {
      const context = progressXHRContexts.get(this);
      const detail = context && describeProgressRequest(context.url, context.method, arguments[0]);
      if (detail) {
        context.report = startProgressRequest(detail, 'XHR');
        if (!progressXHRObserved.has(this)) {
          progressXHRObserved.add(this);
          this.addEventListener('loadend', () => {
            const report = progressXHRContexts.get(this)?.report;
            if (!report) return;
            let code = null;
            try {
              const data = this.responseType === 'json' ? this.response :
                !this.responseType || this.responseType === 'text' ? JSON.parse(this.responseText) : null;
              code = data?.code;
            } catch {}
            recordProgressResponse(report, this.status, code, this.status ? '' : 'xhr-network-error-or-abort');
          });
        }
      }
    } catch {}
    if (isTargetRequest(this.__examUrl, this.__examMethod) && !examXHRObserved.has(this)) {
      examXHRObserved.add(this);
      this.addEventListener('load', () => {
        const context = progressXHRContexts.get(this);
        if (!context || !isTargetRequest(context.url, context.method)) return;
        if (!isCurrentExamResponse(context.examRequest)) return;
        if (this.status >= 200 && this.status < 300) {
          let hints = null, rawQuestions = null;
          try {
            const document = this.responseType === 'json' ? this.response :
              !this.responseType || this.responseType === 'text' ? JSON.parse(this.responseText) : null;
            hints = parseExamQuestionHints(document);
            rawQuestions = document?.data?.list;
          } catch (_) {}
          acceptBillingContext(enrichBillingContext(context.billingContext, hints, rawQuestions), context.examRequest);
        }
      });
    }

    try { return nativeSend.apply(this, arguments); }
    catch (error) {
      const report = progressXHRContexts.get(this)?.report;
      if (report) recordProgressResponse(report, 0, null, 'xhr-send-threw');
      throw error;
    }
  };

  let lastMainTickAt = diagnosticNow();
  function runMainMaintenance(trigger = 'window') {
    syncCourseScope();
    ensureBillingPanel();
    if (billingPrefetch && isExamPage()) {
      const pending = billingPrefetch;
      billingPrefetch = null;
      acceptBillingContext(pending.context, pending.request);
    }
    if (backgroundPageHidden) return;
    const effectiveNow = diagnosticNow();
    if (effectiveNow - antiFreezeLastEffectiveTickAt < 1500) {
      antiFreezeDiagnostic.maintenanceCoalesced++; return;
    }
    antiFreezeLastEffectiveTickAt = effectiveNow;
    antiFreezeDiagnostic.maintenanceRuns++; 
    // 在本轮扫描可能清空当前视频前，保留实际媒体末值。
    updateAntiFreezeWindow();
    const tickNow = diagnosticNow();
    const tickGapMs = Math.max(0, tickNow - lastMainTickAt);
    lastMainTickAt = tickNow;
    if (tickGapMs > 5500) {
      lifecycleDiagnostic.longTickCount++;
      lifecycleDiagnostic.lastTickGapMs = tickGapMs;
      lifecycleDiagnostic.maxTickGapMs = Math.max(lifecycleDiagnostic.maxTickGapMs, tickGapMs);
      recordPlaybackDiagnostic('后台主调度延迟', currentVideo, { tickGapMs });
    }
    observeDiagnosticPopupState();
    syncCourseVolumeBySlider(currentVideo);
    recordPlaybackDiagnostic('播放采样');
    scanCoursePage();
    // 本轮已经扫描课程；恢复微任务只复查考试/暂停，不再重复扫描课程列表。
    if (tickGapMs > 5500) scheduleLifecycleRecheck('主调度间隔延长', true);
    scheduleBackgroundVideoRecovery(currentVideo);
    syncBackgroundKeepalive('主调度复查:' + trigger);
    keepaliveDiagnosticMaintenance();
  }
  setInterval(() => runMainMaintenance('window'), 2000);
  setInterval(() => requestExamFlow('定时复查'), 2000);

  setupPopupVideoRecovery();
  setupCheckinSliderHider();
  window.addEventListener('pagehide', () => persistKeepaliveRound('pagehide', true));
  window.addEventListener('DOMContentLoaded', scanCoursePage);
  window.addEventListener('DOMContentLoaded', setupPopupVideoRecovery);
  window.addEventListener('DOMContentLoaded', () => requestExamFlow('DOM就绪'));
  window.addEventListener('hashchange', () => {
    syncCourseScope();
    syncBillingPageVisibility();
    invalidatePlaybackAttempts('路由变化');
    syncExamSession();
    requestExamFlow('考试路由变化');
    syncBackgroundKeepalive('路由变化');
  });
  document.addEventListener('resume', () => requestExamFlow('页面恢复'), true);
  document.addEventListener('fullscreenchange', () => recordPlaybackDiagnostic('fullscreenchange', currentVideo), true);
})();

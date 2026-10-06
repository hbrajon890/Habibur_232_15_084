/**
 * Tender Document Package Builder
 * AI DevFest 2026 - Vanilla JS Implementation
 * Entirely client-side, zero backend, WebCrypto SHA-256 duplicate detection, pdf-lib compilation
 */

// Global State
const state = {
  currentLang: 'en', // 'en' | 'bn'
  tender: {
    tender_id: '',
    title: '',
    procuring_entity: '',
    bidder: '',
    submission_deadline: ''
  },
  requirements: [], // array of requirement objects
  uploadedFiles: [], // array of file items: { id, name, size, bytes, hash, pageCount, isDuplicate, matchedReqId, objectUrl }
  matches: {}, // map reqId -> { fileId, expiryDate }
  suggestedMatches: {}, // map reqId -> fileId
  dismissedSuggestions: {}, // map reqId -> Set of dismissed fileIds
};

// Official Status Constants (Exact strings per rulebook)
const STATUS = {
  MISSING: 'Missing',
  EXPIRY_NEEDED: 'Expiry date needed',
  EXPIRED: 'Expired',
  NOT_PROVIDED: 'Not provided',
  OK: 'OK'
};

// Limits per competition specification
const LIMITS = {
  MAX_FILES: 30,
  MAX_TOTAL_SIZE_BYTES: 50 * 1024 * 1024 // 50 MB
};

// Configure PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/**
 * Initialize Application
 */
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadDefaultRequirements();
});

/**
 * Set up DOM event listeners
 */
function setupEventListeners() {
  // Language Switch
  const langToggleBtn = document.getElementById('lang-toggle');
  langToggleBtn.addEventListener('click', toggleLanguage);

  // Requirements JSON Loader
  const btnLoadReq = document.getElementById('btn-load-requirements');
  const fileInputReq = document.getElementById('requirements-file-input');
  btnLoadReq.addEventListener('click', () => fileInputReq.click());
  fileInputReq.addEventListener('change', handleRequirementsFileSelect);

  // PDF File Upload Browse & Dropzone
  const btnBrowse = document.getElementById('btn-browse-trigger');
  const pdfFileInput = document.getElementById('pdf-file-input');
  const dropzone = document.getElementById('dropzone');

  btnBrowse.addEventListener('click', () => pdfFileInput.click());
  pdfFileInput.addEventListener('change', (e) => {
    handleFilesSelected(e.target.files);
    pdfFileInput.value = ''; // Reset so the same file can be re-selected if removed
  });

  // Drag and Drop
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('drag-active');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('drag-active');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      handleFilesSelected(dt.files);
    }
  });

  // Clear all files
  const btnClearAll = document.getElementById('btn-clear-all');
  btnClearAll.addEventListener('click', clearAllFiles);

  // Auto-Match Button
  const btnAutoMatch = document.getElementById('btn-auto-match');
  btnAutoMatch.addEventListener('click', runAutoMatch);

  // Generate Package Button
  const btnGenerate = document.getElementById('btn-generate-package');
  btnGenerate.addEventListener('click', generateFinalPackage);

  // Modal Close
  const btnCloseModal = document.getElementById('btn-close-modal');
  const previewModal = document.getElementById('preview-modal');
  btnCloseModal.addEventListener('click', () => {
    previewModal.classList.remove('active');
    document.getElementById('preview-iframe').src = 'about:blank';
  });
  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) {
      previewModal.classList.remove('active');
      document.getElementById('preview-iframe').src = 'about:blank';
    }
  });
}

/**
 * Centralized i18n Translation Helper
 */
function t(key, params = {}) {
  let str = (translations[state.currentLang] && translations[state.currentLang][key]) ||
            (translations['en'] && translations['en'][key]) || key;
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return str;
}

/**
 * Toggle Language between en and bn
 */
function toggleLanguage() {
  state.currentLang = state.currentLang === 'en' ? 'bn' : 'en';
  updateLanguageUI();
}

function updateLanguageUI() {
  // Update toggle button text
  const currentLangText = document.getElementById('current-lang-text');
  currentLangText.textContent = state.currentLang === 'en' ? 'English (EN)' : 'বাংলা (BN)';

  // Update elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });

  // Re-render components that contain dynamic language text
  renderTenderInfo();
  renderChecklist();
  renderUploadedFiles();
  updatePackageGeneratorStatus();
}

/**
 * Load default sample requirements.json
 */
async function loadDefaultRequirements() {
  try {
    const res = await fetch('requirements.json');
    if (res.ok) {
      const data = await res.json();
      applyRequirementsData(data);
    }
  } catch (err) {
    console.warn('Could not load local requirements.json, using fallback sample', err);
    applyRequirementsData({
      tender: {
        tender_id: "T-2026-0417",
        title: "Supply of IT Equipment and Networking Infrastructure",
        procuring_entity: "Department of Information and Communication Technology",
        bidder: "Tech Solutions Bangladesh Ltd.",
        submission_deadline: "2026-10-20"
      },
      requirements: [
        { id: "R01", order: 1, title_en: "Trade License", title_bn: "হালনাগাদ ট্রেড লাইসেন্স", mandatory: true, has_expiry: true },
        { id: "R02", order: 2, title_en: "Tax Identification Number (TIN) Certificate", title_bn: "টিআইএন সার্টিফিকেট", mandatory: true, has_expiry: false },
        { id: "R03", order: 3, title_en: "VAT Registration Certificate", title_bn: "মূসক / ভ্যাট নিবন্ধন সনদপত্র", mandatory: true, has_expiry: false },
        { id: "R04", order: 4, title_en: "Bank Solvency Certificate", title_bn: "ব্যাংক সচ্ছলতা সনদপত্র", mandatory: true, has_expiry: true },
        { id: "R05", order: 5, title_en: "ISO 9001 Quality Certificate", title_bn: "আইএসও ৯০০১ মান সনদপত্র", mandatory: false, has_expiry: true },
        { id: "R06", order: 6, title_en: "Manufacturer Authorization Form (MAF)", title_bn: "উত্পাদনকারী অনুমোদন পত্র (এমএএফ)", mandatory: false, has_expiry: false }
      ]
    });
  }
}

/**
 * Handle custom requirements.json file selection
 */
function handleRequirementsFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (!data.tender || !Array.isArray(data.requirements)) {
        showToast(t('requirementsError'), 'error');
        return;
      }
      applyRequirementsData(data);
      showToast(t('requirementsLoaded'), 'success');
    } catch (err) {
      showToast(t('requirementsError'), 'error');
    }
  };
  reader.readAsText(file);
}

/**
 * Apply loaded requirements JSON data to app state
 */
function applyRequirementsData(data) {
  state.tender = {
    tender_id: data.tender.tender_id || 'TENDER-UNKNOWN',
    title: data.tender.title || '',
    procuring_entity: data.tender.procuring_entity || '',
    bidder: data.tender.bidder || '',
    submission_deadline: data.tender.submission_deadline || ''
  };

  // Sort requirements by order ASCENDING per rulebook
  state.requirements = (data.requirements || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));

  // Initialize matches if needed
  state.requirements.forEach(req => {
    if (!state.matches[req.id]) {
      state.matches[req.id] = { fileId: null, expiryDate: '' };
    }
  });

  renderTenderInfo();
  computeSuggestedMatches();
  renderChecklist();
  updatePackageGeneratorStatus();
}

/**
 * Render Tender Metadata Dashboard
 */
function renderTenderInfo() {
  document.getElementById('meta-tender-id').textContent = state.tender.tender_id || '--';
  document.getElementById('meta-tender-title').textContent = state.tender.title || '--';
  document.getElementById('meta-procuring-entity').textContent = state.tender.procuring_entity || '--';
  document.getElementById('meta-bidder').textContent = state.tender.bidder || '--';
  document.getElementById('meta-submission-deadline').textContent = state.tender.submission_deadline || '--';
  document.getElementById('spec-filename').textContent = `${state.tender.tender_id || 'Package'}_Package.pdf`;
}

/**
 * Handle File Selection (Drag/Drop or Browse)
 */
async function handleFilesSelected(fileList) {
  const files = Array.from(fileList);
  if (files.length === 0) return;

  // Check file count limit
  if (state.uploadedFiles.length + files.length > LIMITS.MAX_FILES) {
    showToast(t('errMaxFiles'), 'error');
    return;
  }

  // Calculate projected total size
  let newBatchSize = files.reduce((acc, f) => acc + f.size, 0);
  const currentTotalSize = state.uploadedFiles.reduce((acc, f) => acc + f.size, 0);
  if (currentTotalSize + newBatchSize > LIMITS.MAX_TOTAL_SIZE_BYTES) {
    showToast(t('errMaxSize'), 'error');
    return;
  }

  for (const file of files) {
    // 1. Strict PDF verification
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      showToast(t('errNonPdf', { name: file.name }), 'error');
      continue;
    }

    try {
      // 2. Read array buffer
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // 3. Compute SHA-256 Hash using crypto.subtle per Rule 8
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const sha256Hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // 4. Count PDF Pages using pdf-lib or pdf.js
      let pageCount = 0;
      try {
        if (window.PDFLib) {
          const pdfDoc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
          pageCount = pdfDoc.getPageCount();
        } else if (window.pdfjsLib) {
          const loadingTask = pdfjsLib.getDocument({ data: bytes });
          const pdfDoc = await loadingTask.promise;
          pageCount = pdfDoc.numPages;
        }
      } catch (pdfErr) {
        console.error('PDF parsing error:', pdfErr);
        showToast(t('errCorruptedPdf', { name: file.name }), 'error');
        continue; // Reject corrupted/unreadable PDF
      }

      const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      const objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));

      state.uploadedFiles.push({
        id: fileId,
        name: file.name,
        size: file.size,
        bytes: bytes,
        hash: sha256Hex,
        pageCount: pageCount,
        isDuplicate: false,
        objectUrl: objectUrl
      });

    } catch (err) {
      console.error('Error processing file:', file.name, err);
      showToast(t('errCorruptedPdf', { name: file.name }), 'error');
    }
  }

  // Update duplicate statuses across all uploaded files
  updateDuplicateStatuses();
  computeSuggestedMatches();
  renderUploadedFiles();
  renderChecklist();
  updatePackageGeneratorStatus();
}

/**
 * Duplicate Detection (Rule 9):
 * Based on EXACT SHA-256 HASH of file content, NOT filename!
 */
function updateDuplicateStatuses() {
  const hashCounts = {};
  state.uploadedFiles.forEach(f => {
    hashCounts[f.hash] = (hashCounts[f.hash] || 0) + 1;
  });

  state.uploadedFiles.forEach(f => {
    f.isDuplicate = hashCounts[f.hash] > 1;
  });
}

/**
 * Clear All Uploaded Files
 */
function clearAllFiles() {
  state.uploadedFiles.forEach(f => {
    if (f.objectUrl) URL.revokeObjectURL(f.objectUrl);
  });
  state.uploadedFiles = [];
  // Reset matches
  Object.keys(state.matches).forEach(reqId => {
    state.matches[reqId].fileId = null;
  });
  state.suggestedMatches = {};
  state.dismissedSuggestions = {};
  
  renderUploadedFiles();
  renderChecklist();
  updatePackageGeneratorStatus();
}

/**
 * Remove Single Uploaded File
 */
function removeFile(fileId) {
  const file = state.uploadedFiles.find(f => f.id === fileId);
  if (file && file.objectUrl) {
    URL.revokeObjectURL(file.objectUrl);
  }

  state.uploadedFiles = state.uploadedFiles.filter(f => f.id !== fileId);

  // If this file was matched to any requirement, unmatch it
  for (const [reqId, matchData] of Object.entries(state.matches)) {
    if (matchData.fileId === fileId) {
      matchData.fileId = null;
    }
  }

  updateDuplicateStatuses();
  computeSuggestedMatches();
  renderUploadedFiles();
  renderChecklist();
  updatePackageGeneratorStatus();
}

/**
 * Render Uploaded Files List and Stats
 */
function renderUploadedFiles() {
  const listContainer = document.getElementById('uploaded-files-list');
  const countEl = document.getElementById('stat-file-count');
  const sizeEl = document.getElementById('stat-total-size');
  const progressFill = document.getElementById('size-progress-fill');
  const btnClearAll = document.getElementById('btn-clear-all');

  const totalFiles = state.uploadedFiles.length;
  const totalSizeBytes = state.uploadedFiles.reduce((acc, f) => acc + f.size, 0);
  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
  const sizePercentage = Math.min(100, (totalSizeBytes / LIMITS.MAX_TOTAL_SIZE_BYTES) * 100);

  countEl.textContent = `${totalFiles} / ${LIMITS.MAX_FILES}`;
  sizeEl.textContent = `${totalSizeMB} MB / 50 MB`;
  progressFill.style.width = `${sizePercentage}%`;

  btnClearAll.style.display = totalFiles > 0 ? 'inline-flex' : 'none';

  if (totalFiles === 0) {
    listContainer.innerHTML = '';
    return;
  }

  listContainer.innerHTML = state.uploadedFiles.map(file => {
    // Find if this file is matched to a requirement
    const matchedReq = state.requirements.find(r => state.matches[r.id]?.fileId === file.id);
    const matchedTitle = matchedReq
      ? (state.currentLang === 'bn' ? matchedReq.title_bn : matchedReq.title_en)
      : t('unmatchedLabel');

    const formattedSize = (file.size / 1024).toFixed(1) + ' KB';
    const shortHash = file.hash.substring(0, 8);

    return `
      <div class="file-row-card ${file.isDuplicate ? 'is-duplicate' : ''}" id="card-${file.id}">
        <div class="file-info-group">
          <span class="pdf-icon-badge">PDF</span>
          <div class="file-name-meta">
            <span class="file-name-txt" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
            <div class="file-submeta">
              <span>${file.pageCount} ${t('pagesCount')}</span>
              <span>•</span>
              <span>${formattedSize}</span>
              <span>•</span>
              <span title="SHA-256: ${file.hash}">SHA: <code>${shortHash}…</code></span>
            </div>
          </div>
        </div>

        <div class="file-status-group">
          ${file.isDuplicate
            ? `<span class="badge badge-duplicate" title="Identical file content detected!">⚠️ ${t('duplicateBadge')}</span>`
            : `<span class="badge badge-unique">✓ ${t('uniqueBadge')}</span>`
          }

          <span class="badge ${matchedReq ? 'badge-mandatory' : 'badge-optional'}" style="font-weight: 500;">
            🔗 ${escapeHtml(matchedTitle)}
          </span>

          <button class="btn btn-secondary" style="padding: 0.35rem 0.65rem; font-size: 0.78rem;" onclick="previewPdf('${file.id}')">
            👁️ ${t('previewFile')}
          </button>

          <button class="btn btn-danger-outline" onclick="removeFile('${file.id}')">
            🗑️ ${t('removeFile')}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Preview PDF in Modal
 */
function previewPdf(fileId) {
  const file = state.uploadedFiles.find(f => f.id === fileId);
  if (!file) return;

  const modal = document.getElementById('preview-modal');
  const title = document.getElementById('preview-modal-title');
  const iframe = document.getElementById('preview-iframe');

  title.textContent = `${t('previewModalTitle')} - ${file.name}`;
  iframe.src = file.objectUrl;
  modal.classList.add('active');
}

/**
 * Helper to compute suggested matches based on filename similarity (Bonus Rule 10)
 * Strict rules:
 * 1. Filter out generic contest/administrative stop-words (rulebook, problem statement, etc.)
 * 2. Require meaningful token overlap and confidence threshold.
 * 3. Never suggest a file that has been dismissed by the user for this requirement.
 * 4. Never suggest duplicates of files already matched to other requirements.
 */
function computeSuggestedMatches() {
  state.suggestedMatches = {};

  // Generic administrative and contest stop-words to strictly ignore
  const STOP_WORDS = new Set([
    'rulebook', 'rule', 'rules',
    'problem', 'statement', 'problemstatement',
    'readme', 'read', 'me',
    'instruction', 'instructions', 'guide', 'guidelines',
    'tender', 'submission', 'package', 'dossier',
    'document', 'documents', 'doc', 'docs',
    'file', 'files', 'pdf', 'attachment', 'annex', 'annexure', 'appendix',
    'ai', 'devfest', 'fest', 'vibe', 'coding', 'vibecoding', 'contest', 'hackathon',
    'sample', 'example', 'draft', 'copy', 'scan', 'scanned', 'new', 'final', 'v1', 'v2', '2026'
  ]);

  // Clean and tokenize filename or title
  const tokenize = (str) => {
    return (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  };

  state.requirements.forEach(req => {
    // If requirement already has a user-accepted match, do not suggest
    if (state.matches[req.id]?.fileId) return;

    // Requirement significant tokens (from English title)
    const reqTokens = tokenize(req.title_en);
    if (reqTokens.length === 0) return;

    let bestScore = 0;
    let bestFileId = null;

    state.uploadedFiles.forEach(file => {
      // 1. Never suggest if file is already matched to any requirement
      const isAlreadyMatched = Object.values(state.matches).some(m => m.fileId === file.id);
      if (isAlreadyMatched) return;

      // 2. Never suggest if user dismissed this file suggestion for this requirement
      if (state.dismissedSuggestions[req.id] && state.dismissedSuggestions[req.id].has(file.id)) {
        return;
      }

      // 3. Duplicate check: Never suggest if an identical file is already matched to another requirement
      if (isDuplicateConflict(file, req.id)) return;

      // Tokenize filename (strip extension)
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      const fileTokens = tokenize(baseName);
      if (fileTokens.length === 0) return;

      // Count exact and stem matches with significant tokens
      let matchedReqTokens = 0;
      reqTokens.forEach(rt => {
        const found = fileTokens.some(ft => {
          return ft === rt || (ft.length >= 4 && (ft.startsWith(rt) || rt.startsWith(ft)));
        });
        if (found) matchedReqTokens++;
      });

      // Strict confidence requirement:
      // At least 1 specific strong keyword must match,
      // and if requirement has multiple significant tokens, must match at least 50% or >= 2 tokens.
      const matchRatio = matchedReqTokens / reqTokens.length;
      const isConfident = (reqTokens.length === 1 && matchedReqTokens >= 1) ||
                          (reqTokens.length > 1 && (matchedReqTokens >= 2 || matchRatio >= 0.5));

      if (isConfident && matchedReqTokens > bestScore) {
        bestScore = matchedReqTokens;
        bestFileId = file.id;
      }
    });

    if (bestFileId) {
      state.suggestedMatches[req.id] = bestFileId;
    }
  });
}

/**
 * Auto-Match action trigger:
 * User explicitly clicks "Auto-Match by Filename" button to accept confident suggestions.
 */
function runAutoMatch() {
  computeSuggestedMatches();
  let matchedCount = 0;

  for (const [reqId, fileId] of Object.entries(state.suggestedMatches)) {
    if (!state.matches[reqId]?.fileId) {
      const file = state.uploadedFiles.find(f => f.id === fileId);
      if (file && !isDuplicateConflict(file, reqId)) {
        state.matches[reqId].fileId = fileId;
        matchedCount++;
      }
    }
  }

  computeSuggestedMatches();
  renderUploadedFiles();
  renderChecklist();
  updatePackageGeneratorStatus();

  if (matchedCount > 0) {
    showToast(t('successAutoMatched', { count: matchedCount }), 'success');
  } else {
    showToast(t('noAutoMatchesFound'), 'info');
  }
}

/**
 * Accept single auto-match suggestion
 */
function acceptSuggestion(reqId, fileId) {
  const file = state.uploadedFiles.find(f => f.id === fileId);
  if (!file) return;

  if (isDuplicateConflict(file, reqId)) {
    showToast(t('errDuplicateMatch'), 'error');
    return;
  }

  state.matches[reqId].fileId = fileId;
  computeSuggestedMatches();
  renderUploadedFiles();
  renderChecklist();
  updatePackageGeneratorStatus();
}

/**
 * Dismiss single auto-match suggestion
 */
function dismissSuggestion(reqId, fileId) {
  if (!state.dismissedSuggestions[reqId]) {
    state.dismissedSuggestions[reqId] = new Set();
  }
  state.dismissedSuggestions[reqId].add(fileId);

  delete state.suggestedMatches[reqId];
  computeSuggestedMatches();
  renderChecklist();
}

/**
 * Duplicate Rule Check:
 * "A duplicate file cannot be matched to different requirements."
 * Check if another requirement is already using a file with the EXACT same SHA-256 hash.
 */
function isDuplicateConflict(targetFile, targetReqId) {
  for (const [rId, matchData] of Object.entries(state.matches)) {
    if (rId !== targetReqId && matchData.fileId) {
      const matchedFile = state.uploadedFiles.find(f => f.id === matchData.fileId);
      if (matchedFile && matchedFile.hash === targetFile.hash) {
        return true;
      }
    }
  }
  return false;
}

/**
 * OFFICIAL STATUS CALCULATION (Strict Rule 2)
 * Every required document must have exactly ONE of these statuses:
 * A. Missing: mandatory = true, no file matched (Blocking: YES)
 * B. Expiry date needed: has_expiry = true, file is matched, expiry date has not been entered (Blocking: YES)
 * C. Expired: expiry date is BEFORE submission_deadline (Blocking: YES)
 * D. Not provided: mandatory = false, no file matched (Blocking: NO)
 * E. OK: file matched, and if has_expiry=true, expiry date is ON OR AFTER submission_deadline (Blocking: NO)
 */
function calculateDocumentStatus(requirement) {
  const match = state.matches[requirement.id] || { fileId: null, expiryDate: '' };
  const hasFile = Boolean(match.fileId);

  // If no file matched:
  if (!hasFile) {
    if (requirement.mandatory) {
      return STATUS.MISSING;
    } else {
      return STATUS.NOT_PROVIDED;
    }
  }

  // If file is matched:
  if (requirement.has_expiry) {
    if (!match.expiryDate || match.expiryDate.trim() === '') {
      return STATUS.EXPIRY_NEEDED;
    }

    const expiryDateStr = match.expiryDate;
    const deadlineStr = state.tender.submission_deadline;

    if (deadlineStr) {
      // Lexicographical comparison for YYYY-MM-DD format is mathematically exact and timezone-independent
      if (expiryDateStr < deadlineStr) {
        return STATUS.EXPIRED;
      } else {
        // expiryDate >= submissionDeadline
        return STATUS.OK;
      }
    } else {
      return STATUS.OK;
    }
  }

  return STATUS.OK;
}

/**
 * BLOCKING PROBLEMS LOGIC (Strict Rule 13)
 * Generate Package button MUST remain disabled if:
 * - any mandatory document is Missing
 * - any matched expiry-required document has no expiry date
 * - any matched document is Expired
 * Returns array of blocking error messages
 */
function hasBlockingProblems() {
  const blockingIssues = [];

  for (const req of state.requirements) {
    const status = calculateDocumentStatus(req);
    const docTitle = state.currentLang === 'bn' ? req.title_bn : req.title_en;

    if (status === STATUS.MISSING) {
      blockingIssues.push(`${docTitle}: ${status}`);
    } else if (status === STATUS.EXPIRY_NEEDED) {
      blockingIssues.push(`${docTitle}: ${status}`);
    } else if (status === STATUS.EXPIRED) {
      blockingIssues.push(`${docTitle}: ${status}`);
    }
  }

  return blockingIssues;
}

/**
 * Handle document match dropdown change
 */
function handleMatchChange(reqId, selectedFileId) {
  if (!selectedFileId) {
    // Unmatch
    state.matches[reqId].fileId = null;
  } else {
    const selectedFile = state.uploadedFiles.find(f => f.id === selectedFileId);
    if (!selectedFile) return;

    // Rule 9: Duplicate file cannot be matched to different requirements
    if (isDuplicateConflict(selectedFile, reqId)) {
      showToast(t('errDuplicateMatch'), 'error');
      renderChecklist();
      return;
    }

    // Rule 9: One file -> maximum one requirement
    for (const [otherReqId, matchData] of Object.entries(state.matches)) {
      if (otherReqId !== reqId && matchData.fileId === selectedFileId) {
        const otherReq = state.requirements.find(r => r.id === otherReqId);
        const otherTitle = otherReq ? (state.currentLang === 'bn' ? otherReq.title_bn : otherReq.title_en) : otherReqId;
        showToast(t('errFileAlreadyAssigned', { req: otherTitle }), 'error');
        renderChecklist();
        return;
      }
    }

    state.matches[reqId].fileId = selectedFileId;
  }

  computeSuggestedMatches();
  renderUploadedFiles();
  renderChecklist();
  updatePackageGeneratorStatus();
}

/**
 * Handle Expiry Date change
 */
function handleExpiryChange(reqId, newDate) {
  if (state.matches[reqId]) {
    state.matches[reqId].expiryDate = newDate;
  }
  renderChecklist();
  updatePackageGeneratorStatus();
}

/**
 * Render Checklist Table
 */
function renderChecklist() {
  const tbody = document.getElementById('checklist-tbody');
  if (!tbody) return;

  if (state.requirements.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">No requirements loaded</td></tr>`;
    return;
  }

  tbody.innerHTML = state.requirements.map(req => {
    const match = state.matches[req.id] || { fileId: null, expiryDate: '' };
    const matchedFile = state.uploadedFiles.find(f => f.id === match.fileId);
    const status = calculateDocumentStatus(req);
    const docTitle = state.currentLang === 'bn' ? req.title_bn : req.title_en;

    // Badge styling according to status
    let statusClass = 'status-missing';
    if (status === STATUS.OK) statusClass = 'status-ok';
    else if (status === STATUS.EXPIRY_NEEDED) statusClass = 'status-expiry-needed';
    else if (status === STATUS.EXPIRED) statusClass = 'status-expired';
    else if (status === STATUS.NOT_PROVIDED) statusClass = 'status-not-provided';

    // Page count
    const pagesDisplay = matchedFile ? matchedFile.pageCount : '-';

    // Expiry input (Rule 11: Only show if has_expiry === true AND file is matched)
    let expiryInputHtml = '';
    if (req.has_expiry) {
      if (matchedFile) {
        expiryInputHtml = `
          <input type="date" class="input-date" 
            value="${match.expiryDate || ''}" 
            onchange="handleExpiryChange('${req.id}', this.value)"
            title="${t('enterDate')}">
        `;
      } else {
        expiryInputHtml = `<span style="font-size: 0.78rem; color: var(--text-muted);">${t('expiryRequiredNotice')}</span>`;
      }
    } else {
      expiryInputHtml = `<span style="font-size: 0.78rem; color: var(--text-light);">${t('expiryNotRequired')}</span>`;
    }

    // Match Options
    // Filter available files: not already matched to other requirements (unless it's currently matched to THIS req)
    const optionsHtml = state.uploadedFiles.map(file => {
      const isMatchedToOther = Object.entries(state.matches).some(([rId, m]) => rId !== req.id && m.fileId === file.id);
      const isSelected = match.fileId === file.id;
      return `<option value="${file.id}" ${isSelected ? 'selected' : ''} ${isMatchedToOther ? 'disabled' : ''}>
        ${escapeHtml(file.name)} (${file.pageCount}p) ${isMatchedToOther ? ' [Matched]' : ''}
      </option>`;
    }).join('');

    // Suggested match pill (Bonus Rule 10)
    let suggestionHtml = '';
    if (!match.fileId && state.suggestedMatches[req.id]) {
      const sugFile = state.uploadedFiles.find(f => f.id === state.suggestedMatches[req.id]);
      if (sugFile) {
        suggestionHtml = `
          <div class="suggestion-pill">
            <span>💡 <strong>${t('suggestedBadge')}</strong>: ${escapeHtml(sugFile.name)}</span>
            <button type="button" class="suggestion-btn" onclick="acceptSuggestion('${req.id}', '${sugFile.id}')" title="${t('acceptSuggestion')}">
              ✓ ${t('acceptSuggestion')}
            </button>
            <button type="button" class="suggestion-dismiss-btn" onclick="dismissSuggestion('${req.id}', '${sugFile.id}')" title="${t('dismissSuggestion')}">
              ✕ ${t('dismissSuggestion')}
            </button>
          </div>
        `;
      }
    }

    return `
      <tr>
        <td style="font-weight: 700; color: var(--text-muted);">${req.order}</td>
        <td>
          <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(docTitle)}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${req.title_en !== docTitle ? escapeHtml(req.title_en) : ''}</div>
          ${suggestionHtml}
        </td>
        <td>
          <span class="badge ${req.mandatory ? 'badge-mandatory' : 'badge-optional'}">
            ${req.mandatory ? t('mandatoryBadge') : t('optionalBadge')}
          </span>
        </td>
        <td>
          <select class="select-match" onchange="handleMatchChange('${req.id}', this.value)">
            <option value="">${t('selectFileToMatch')}</option>
            ${optionsHtml}
          </select>
        </td>
        <td style="text-align: center; font-weight: 600;">${pagesDisplay}</td>
        <td>${expiryInputHtml}</td>
        <td>
          <span class="status-badge ${statusClass}">
            ${status}
          </span>
        </td>
        <td style="text-align: center;">
          ${match.fileId ? `
            <button type="button" class="btn btn-danger-outline" style="padding: 0.35rem 0.65rem; font-size: 0.78rem; font-weight: 600;" onclick="handleMatchChange('${req.id}', '')" title="${t('unmatchBtn')}">
              ✕ ${t('unmatchBtn')}
            </button>
          ` : '<span style="color: var(--text-light);">-</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Update Package Generator status banner & button disabled states
 */
function updatePackageGeneratorStatus() {
  const blockingIssues = hasBlockingProblems();
  const bannerContainer = document.getElementById('blocking-banner-container');
  const generateBtn = document.getElementById('btn-generate-package');
  const specDocCount = document.getElementById('spec-doc-count');
  const specTotalPages = document.getElementById('spec-total-pages');

  // Count included documents
  const includedDocs = state.requirements.filter(r => state.matches[r.id]?.fileId);
  specDocCount.textContent = includedDocs.length;

  // Estimated pages = 1 (Cover) + 1 (TOC bonus if checked) + sum of matched file pages
  const includeToc = document.getElementById('chk-include-toc')?.checked ?? true;
  let estimatedPages = 1 + (includeToc ? 1 : 0);
  includedDocs.forEach(r => {
    const file = state.uploadedFiles.find(f => f.id === state.matches[r.id].fileId);
    if (file) estimatedPages += file.pageCount;
  });
  specTotalPages.textContent = estimatedPages;

  if (blockingIssues.length > 0) {
    generateBtn.disabled = true;
    bannerContainer.innerHTML = `
      <div class="blocking-alert-box">
        <h4>⚠️ ${t('blockingIssuesPrefix')} ${blockingIssues.length} ${t('blockingIssuesSuffix')}</h4>
        <ul>
          ${blockingIssues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('')}
        </ul>
      </div>
    `;
  } else {
    generateBtn.disabled = false;
    bannerContainer.innerHTML = `
      <div class="ready-alert-box">
        <span>✅</span>
        <span>${t('readyToGenerate')}</span>
      </div>
    `;
  }
}

/**
 * GENERATE FINAL COMBINED PDF (Rules 12, 13, 14, 15, 16, 17, 18, 19, 20)
 * 1. Strictly in browser using pdf-lib
 * 2. Page 1: English Cover page with metadata and included documents
 * 3. Page 2 (Bonus): Table of Contents / Index with document starting pages
 * 4. Matched documents in exact order ASCENDING (rule 17)
 * 5. Add footer to every single page: "<tender_id> | Page X of Y" (rule 18)
 * 6. File download: "<tender_id>_Package.pdf" (rule 15)
 */
async function generateFinalPackage() {
  const blockingIssues = hasBlockingProblems();
  if (blockingIssues.length > 0) {
    showToast(t('blockingIssuesPrefix') + ' ' + blockingIssues.length + ' ' + t('blockingIssuesSuffix'), 'error');
    return;
  }

  const generateBtn = document.getElementById('btn-generate-package');
  const generateLabel = document.getElementById('btn-generate-label');
  const originalLabel = generateLabel.textContent;

  generateBtn.disabled = true;
  generateLabel.textContent = t('generatingBtn');

  try {
    const { PDFDocument, rgb, StandardFonts } = PDFLib;

    // Create the master merged PDF
    const masterPdf = await PDFDocument.create();
    const fontRegular = await masterPdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await masterPdf.embedFont(StandardFonts.HelveticaBold);

    const tenderId = state.tender.tender_id || 'T-PACKAGE';
    const tenderTitle = state.tender.title || 'N/A';
    const procuringEntity = state.tender.procuring_entity || 'N/A';
    const bidder = state.tender.bidder || 'N/A';
    const submissionDeadline = state.tender.submission_deadline || 'N/A';
    const creationDateStr = new Date().toISOString().split('T')[0];

    // Get included requirements in ascending order
    const includedReqs = state.requirements
      .filter(r => state.matches[r.id]?.fileId)
      .sort((a, b) => a.order - b.order);

    const includeToc = document.getElementById('chk-include-toc')?.checked ?? true;

    // Calculate document starting pages
    // Page 1 = Cover
    // Page 2 = TOC (if enabled)
    let currentDocStartPage = 1 + (includeToc ? 1 : 0) + 1;
    const docPageDirectory = [];

    for (const req of includedReqs) {
      const file = state.uploadedFiles.find(f => f.id === state.matches[r.id].fileId);
      docPageDirectory.push({
        req: req,
        file: file,
        startPage: currentDocStartPage,
        pageCount: file ? file.pageCount : 0
      });
      if (file) {
        currentDocStartPage += file.pageCount;
      }
    }

    // ----------------------------------------------------
    // 1. PAGE 1: COVER PAGE (Strictly English per Rule 16)
    // ----------------------------------------------------
    const coverPage = masterPdf.addPage([595.28, 841.89]); // A4 Size in points (72 DPI)
    const { width: pageWidth, height: pageHeight } = coverPage.getSize();

    // Top decorative bar
    coverPage.drawRectangle({
      x: 0,
      y: pageHeight - 16,
      width: pageWidth,
      height: 16,
      color: rgb(0.12, 0.23, 0.54) // Deep Indigo #1e3a8a
    });

    coverPage.drawRectangle({
      x: 0,
      y: pageHeight - 20,
      width: pageWidth,
      height: 4,
      color: rgb(0.05, 0.58, 0.53) // Teal Accent #0d9488
    });

    // Header Title
    coverPage.drawText("TENDER SUBMISSION PACKAGE", {
      x: 50,
      y: pageHeight - 75,
      size: 22,
      font: fontBold,
      color: rgb(0.12, 0.23, 0.54)
    });

    coverPage.drawText("OFFICIAL SUBMISSION DOSSIER", {
      x: 50,
      y: pageHeight - 95,
      size: 11,
      font: fontRegular,
      color: rgb(0.39, 0.45, 0.55)
    });

    // Thin separator
    coverPage.drawLine({
      start: { x: 50, y: pageHeight - 110 },
      end: { x: pageWidth - 50, y: pageHeight - 110 },
      thickness: 1,
      color: rgb(0.85, 0.88, 0.92)
    });

    // Section 1: Tender Information Box
    let yPos = pageHeight - 145;
    coverPage.drawText("TENDER INFORMATION", {
      x: 50,
      y: yPos,
      size: 13,
      font: fontBold,
      color: rgb(0.1, 0.15, 0.25)
    });

    yPos -= 25;
    const drawMetaField = (label, value) => {
      coverPage.drawText(label.padEnd(24, ' '), {
        x: 50,
        y: yPos,
        size: 10,
        font: fontBold,
        color: rgb(0.3, 0.35, 0.45)
      });
      coverPage.drawText(`:  ${value}`, {
        x: 180,
        y: yPos,
        size: 10,
        font: fontRegular,
        color: rgb(0.06, 0.09, 0.16)
      });
      yPos -= 20;
    };

    drawMetaField("Tender ID", tenderId);
    drawMetaField("Tender Title", tenderTitle.length > 55 ? tenderTitle.substring(0, 52) + '...' : tenderTitle);
    drawMetaField("Procuring Entity", procuringEntity);
    drawMetaField("Bidder Name", bidder);
    drawMetaField("Submission Deadline", submissionDeadline);
    drawMetaField("Package Made Date", creationDateStr);

    // Section 2: Included Documents in Final Order
    yPos -= 15;
    coverPage.drawText("INCLUDED DOCUMENTS", {
      x: 50,
      y: yPos,
      size: 13,
      font: fontBold,
      color: rgb(0.1, 0.15, 0.25)
    });

    yPos -= 22;
    coverPage.drawRectangle({
      x: 50,
      y: yPos - 5,
      width: pageWidth - 100,
      height: 22,
      color: rgb(0.95, 0.96, 0.98)
    });

    coverPage.drawText("#", { x: 60, y: yPos, size: 9, font: fontBold, color: rgb(0.3, 0.35, 0.45) });
    coverPage.drawText("Document Title (English)", { x: 90, y: yPos, size: 9, font: fontBold, color: rgb(0.3, 0.35, 0.45) });
    coverPage.drawText("File Name", { x: 310, y: yPos, size: 9, font: fontBold, color: rgb(0.3, 0.35, 0.45) });
    coverPage.drawText("Pages", { x: 495, y: yPos, size: 9, font: fontBold, color: rgb(0.3, 0.35, 0.45) });

    yPos -= 20;
    docPageDirectory.forEach((item, idx) => {
      if (yPos > 120) {
        coverPage.drawText(String(idx + 1), { x: 60, y: yPos, size: 9, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
        
        const titleEn = item.req.title_en;
        const displayTitle = titleEn.length > 32 ? titleEn.substring(0, 30) + '..' : titleEn;
        coverPage.drawText(displayTitle, { x: 90, y: yPos, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });

        const fileName = item.file ? item.file.name : 'N/A';
        const displayFileName = fileName.length > 28 ? fileName.substring(0, 26) + '..' : fileName;
        coverPage.drawText(displayFileName, { x: 310, y: yPos, size: 8.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

        coverPage.drawText(String(item.pageCount), { x: 505, y: yPos, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
        
        yPos -= 18;
      }
    });

    // Cover Page Note / Footer Stamp
    coverPage.drawText("Notice: This tender package is strictly compiled in sequential compliance with official procurement rules.", {
      x: 50,
      y: 80,
      size: 8,
      font: fontRegular,
      color: rgb(0.4, 0.45, 0.55)
    });

    // ----------------------------------------------------
    // 2. BONUS FEATURE 1: TABLE OF CONTENTS / INDEX PAGE
    // ----------------------------------------------------
    if (includeToc) {
      const tocPage = masterPdf.addPage([595.28, 841.89]);
      let tocY = pageHeight - 80;

      tocPage.drawText("TABLE OF CONTENTS / DOCUMENT INDEX", {
        x: 50,
        y: tocY,
        size: 16,
        font: fontBold,
        color: rgb(0.12, 0.23, 0.54)
      });

      tocY -= 20;
      tocPage.drawText("Complete sequential page navigation index for all included dossier exhibits.", {
        x: 50,
        y: tocY,
        size: 9.5,
        font: fontRegular,
        color: rgb(0.4, 0.45, 0.55)
      });

      tocY -= 20;
      tocPage.drawLine({
        start: { x: 50, y: tocY },
        end: { x: pageWidth - 50, y: tocY },
        thickness: 1,
        color: rgb(0.85, 0.88, 0.92)
      });

      tocY -= 35;
      docPageDirectory.forEach((item, idx) => {
        if (tocY > 100) {
          const itemNumber = `${idx + 1}. `;
          const itemTitle = `${item.req.title_en}`;
          
          tocPage.drawText(itemNumber + itemTitle, {
            x: 50,
            y: tocY,
            size: 10,
            font: fontBold,
            color: rgb(0.1, 0.15, 0.25)
          });

          // Draw leader dots: ".........."
          const dots = " . ".repeat(28);
          tocPage.drawText(dots, {
            x: 320,
            y: tocY,
            size: 9,
            font: fontRegular,
            color: rgb(0.65, 0.7, 0.75)
          });

          tocPage.drawText(`Page ${item.startPage}`, {
            x: pageWidth - 105,
            y: tocY,
            size: 10,
            font: fontBold,
            color: rgb(0.12, 0.23, 0.54)
          });

          tocY -= 26;
        }
      });
    }

    // ----------------------------------------------------
    // 3. MERGE MATCHED DOCUMENTS IN EXACT ORDER ASCENDING
    // ----------------------------------------------------
    for (const item of docPageDirectory) {
      if (item.file && item.file.bytes) {
        // Load the document using PDFDocument.load
        const docToCopy = await PDFDocument.load(item.file.bytes, { ignoreEncryption: true });
        const pageIndices = docToCopy.getPageIndices();
        const copiedPages = await masterPdf.copyPages(docToCopy, pageIndices);
        
        for (const copiedPage of copiedPages) {
          masterPdf.addPage(copiedPage);
        }
      }
    }

    // ----------------------------------------------------
    // 4. SEQUENTIAL FOOTER (Strict Rule 18)
    // <tender_id> | Page X of Y
    // - Every page including cover
    // - Bottom of page
    // - Readable
    // - Must not cover document content
    // - Y = TOTAL number of pages in final package
    // ----------------------------------------------------
    const totalPages = masterPdf.getPageCount();

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const page = masterPdf.getPage(pageIdx);
      const { width, height } = page.getSize();
      
      const footerText = `${tenderId} | Page ${pageIdx + 1} of ${totalPages}`;
      const footerFontSize = 9;
      const textWidth = fontRegular.widthOfTextAtSize(footerText, footerFontSize);
      
      // Calculate centered X position or right aligned
      const footerX = (width - textWidth) / 2;
      const footerY = 22; // 22 points above the absolute bottom margin

      // Background pill for 100% readability without covering document content
      page.drawRectangle({
        x: footerX - 10,
        y: footerY - 5,
        width: textWidth + 20,
        height: footerFontSize + 10,
        color: rgb(1, 1, 1),
        opacity: 0.92
      });

      // Draw footer text
      page.drawText(footerText, {
        x: footerX,
        y: footerY,
        size: footerFontSize,
        font: fontBold,
        color: rgb(0.2, 0.25, 0.35)
      });
    }

    // ----------------------------------------------------
    // 5. DOWNLOAD FINAL PACKAGE (Rule 15: <tender_id>_Package.pdf)
    // ----------------------------------------------------
    const pdfBytes = await masterPdf.save();
    const outputFilename = `${tenderId}_Package.pdf`;

    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = outputFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

    showToast(`Package successfully generated: ${outputFilename}`, 'success');

  } catch (err) {
    console.error('Error generating PDF package:', err);
    showToast(`Failed to generate package: ${err.message}`, 'error');
  } finally {
    generateBtn.disabled = false;
    generateLabel.textContent = originalLabel;
  }
}

/**
 * Toast Notification Utility
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'ℹ️';
  if (type === 'error') icon = '❌';
  if (type === 'success') icon = '✅';

  toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 4500);
}

/**
 * Helper: Escape HTML to prevent XSS
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


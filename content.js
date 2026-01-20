/**
 * ServiceNow Media & Comments Viewer
 * Content script that integrates with ServiceNow pages
 */

(function() {
  'use strict';

  // Debug logging helper
  const DEBUG = true;
  function log(...args) {
    if (DEBUG) console.log('[SNMV]', ...args);
  }
  function logError(...args) {
    console.error('[SNMV ERROR]', ...args);
  }
  function logWarn(...args) {
    console.warn('[SNMV WARN]', ...args);
  }

  log('Script loaded, starting initialization...');
  log('Current URL:', window.location.href);
  log('Document readyState:', document.readyState);

  // SVG Icons
  const Icons = {
    gallery: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    comments: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    close: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    clock: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    download: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    expand: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
    refresh: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
    empty: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`,
    record: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`
  };

  // State
  let state = {
    isOpen: false,
    activeTab: 'images',
    images: [],
    comments: [],
    recordInfo: null,
    loading: false,
    selectedImageIndex: -1,
    currentUserId: null,
    currentUserName: null
  };

  // DOM Elements
  let overlay = null;
  let triggerButton = null;
  let lightbox = null;

  /**
   * Get current user information
   */
  async function getCurrentUser() {
    log('getCurrentUser() called');

    // Try g_user if available (classic UI)
    if (typeof g_user !== 'undefined') {
      try {
        const userId = g_user.userID;
        const userName = g_user.userName || g_user.getFullName();
        log('Got user from g_user - ID:', userId, 'Name:', userName);
        state.currentUserId = userId;
        state.currentUserName = userName;
        return { userId, userName };
      } catch (e) {
        logError('Error accessing g_user:', e);
      }
    }

    // Try NOW.user (workspace/polaris)
    if (typeof NOW !== 'undefined' && NOW.user) {
      try {
        const userId = NOW.user.userID || NOW.user.sys_id;
        const userName = NOW.user.name || NOW.user.user_name;
        log('Got user from NOW.user - ID:', userId, 'Name:', userName);
        state.currentUserId = userId;
        state.currentUserName = userName;
        return { userId, userName };
      } catch (e) {
        logError('Error accessing NOW.user:', e);
      }
    }

    // Try API call as fallback
    try {
      log('Fetching current user from API...');
      const response = await fetch('/api/now/ui/user/current_user', {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      if (response.ok) {
        const data = await response.json();
        log('Current user API response:', data);
        if (data.result) {
          const userId = data.result.sys_id;
          const userName = data.result.user_name || data.result.name;
          state.currentUserId = userId;
          state.currentUserName = userName;
          log('Got user from API - ID:', userId, 'Name:', userName);
          return { userId, userName };
        }
      }
    } catch (e) {
      logError('Error fetching current user from API:', e);
    }

    log('Could not determine current user');
    return null;
  }

  /**
   * Get current record information from the page
   */
  function getRecordInfo() {
    log('getRecordInfo() called');

    // Try to get sys_id and table from URL or page
    const url = window.location.href;
    const decodedUrl = decodeURIComponent(url);
    log('Raw URL:', url);
    log('Decoded URL:', decodedUrl);

    const urlParams = new URLSearchParams(window.location.search);
    log('URL params:', Object.fromEntries(urlParams.entries()));

    let sysId = urlParams.get('sys_id');
    let table = null;
    let number = null;

    log('Initial sys_id from URL params:', sysId);

    // Try to detect table from URL patterns (check both raw and decoded URLs)
    // Only support: incident, rm_story (stories), dmn_demand (demand)
    const tablePatterns = [
      { pattern: /\/incident\.do/i, table: 'incident' },
      { pattern: /\/rm_story\.do/i, table: 'rm_story' },
      { pattern: /\/dmn_demand\.do/i, table: 'dmn_demand' }
    ];

    for (const { pattern, table: tableName } of tablePatterns) {
      if (pattern.test(url) || pattern.test(decodedUrl)) {
        table = tableName;
        log('Detected table from URL pattern:', table);
        break;
      }
    }

    // Handle ServiceNow nav shell URL with encoded params
    // Pattern: /now/nav/ui/classic/params/target/incident.do%3Fsys_id%3D...
    const navShellMatch = decodedUrl.match(/\/now\/nav\/ui\/classic\/params\/target\/([^.]+)\.do\?sys_id=([a-f0-9]{32})/i);
    if (navShellMatch) {
      table = table || navShellMatch[1];
      sysId = sysId || navShellMatch[2];
      log('Detected from nav shell URL - table:', table, 'sysId:', sysId);
    }

    // Also try extracting sys_id from encoded URL params in the path
    if (!sysId) {
      const encodedSysIdMatch = decodedUrl.match(/sys_id=([a-f0-9]{32})/i);
      if (encodedSysIdMatch) {
        sysId = encodedSysIdMatch[1];
        log('Extracted sys_id from decoded URL:', sysId);
      }
    }

    // Try workspace URL pattern
    const workspaceMatch = url.match(/\/now\/workspace\/agent\/record\/([^/]+)\/([a-f0-9]{32})/i);
    if (workspaceMatch) {
      table = workspaceMatch[1];
      sysId = workspaceMatch[2];
      log('Detected from workspace URL - table:', table, 'sysId:', sysId);
    }

    // Try CSM/FSM workspace pattern
    const csmMatch = url.match(/\/now\/cwf\/agent\/record\/([^/]+)\/([a-f0-9]{32})/i);
    if (csmMatch) {
      table = csmMatch[1];
      sysId = csmMatch[2];
      log('Detected from CSM workspace URL - table:', table, 'sysId:', sysId);
    }

    // Try to get number from page
    log('Looking for number input...');
    const numberInput = document.querySelector('input[name="number"], [data-field="number"] input');
    if (numberInput) {
      number = numberInput.value;
      log('Found number from input:', number);
    } else {
      log('No number input found');
    }

    // Alternative: Try to find it in the page title or breadcrumb
    if (!number) {
      log('Searching for number in page title/breadcrumb...');
      const pageTitle = document.querySelector('.navbar-title, .breadcrumb-text, h1');
      if (pageTitle) {
        log('Found title element:', pageTitle.textContent);
        const match = pageTitle.textContent.match(/(INC|TASK|RITM|CHG|PRB)\d+/i);
        if (match) {
          number = match[0];
          log('Extracted number from title:', number);
        }
      } else {
        log('No title/breadcrumb element found');
      }
    }

    // Try getting sys_id from form
    if (!sysId) {
      log('Looking for sys_id input...');
      const sysIdInput = document.querySelector('input[name="sys_id"], input[name="sysparm_sys_id"]');
      if (sysIdInput) {
        sysId = sysIdInput.value;
        log('Found sys_id from input:', sysId);
      } else {
        log('No sys_id input found');
      }
    }

    // Try g_form if available
    log('Checking for g_form...');
    if (typeof g_form !== 'undefined') {
      log('g_form is available');
      try {
        const gFormSysId = g_form.getUniqueValue();
        const gFormTable = g_form.getTableName();
        const gFormNumber = g_form.getValue('number');
        log('g_form values - sysId:', gFormSysId, 'table:', gFormTable, 'number:', gFormNumber);

        sysId = sysId || gFormSysId;
        table = table || gFormTable;
        number = number || gFormNumber;
      } catch (e) {
        logError('Could not access g_form:', e);
      }
    } else {
      log('g_form is NOT available');
    }

    // Try NOW object (workspace)
    log('Checking for NOW object...');
    if (typeof NOW !== 'undefined') {
      log('NOW object found:', NOW);
      try {
        if (NOW.record) {
          log('NOW.record:', NOW.record);
        }
      } catch (e) {
        logError('Error accessing NOW object:', e);
      }
    } else {
      log('NOW object is NOT available');
    }

    // Try window.g_ck (CSRF token indicates ServiceNow context)
    log('Checking for g_ck (CSRF token)...');
    if (typeof g_ck !== 'undefined') {
      log('g_ck is available (ServiceNow context confirmed)');
    } else {
      log('g_ck is NOT available');
    }

    // Try to find sys_id in any hidden input
    if (!sysId) {
      log('Searching for sys_id in any hidden input...');
      const allInputs = document.querySelectorAll('input[type="hidden"]');
      allInputs.forEach(input => {
        if (input.name && input.name.includes('sys_id') && input.value && input.value.length === 32) {
          log('Found potential sys_id in hidden input:', input.name, '=', input.value);
          if (!sysId) sysId = input.value;
        }
      });
    }

    // Try iframe context
    log('Checking if in iframe...');
    if (window.parent !== window) {
      log('Running inside an iframe, trying to access parent...');
      try {
        const parentUrl = window.parent.location.href;
        log('Parent URL:', parentUrl);
      } catch (e) {
        log('Cannot access parent frame (cross-origin)');
      }
    }

    // Try to access iframes on the page (for nav shell)
    if (!sysId || !table) {
      log('Checking for iframes containing the form...');
      const iframes = document.querySelectorAll('iframe');
      log('Found', iframes.length, 'iframes');

      iframes.forEach((iframe, index) => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            log(`Iframe ${index} accessible, checking for form data...`);

            // Try to get g_form from iframe
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && typeof iframeWindow.g_form !== 'undefined') {
              log(`Found g_form in iframe ${index}`);
              try {
                const iframeSysId = iframeWindow.g_form.getUniqueValue();
                const iframeTable = iframeWindow.g_form.getTableName();
                const iframeNumber = iframeWindow.g_form.getValue('number');
                log('Iframe g_form values - sysId:', iframeSysId, 'table:', iframeTable, 'number:', iframeNumber);

                sysId = sysId || iframeSysId;
                table = table || iframeTable;
                number = number || iframeNumber;
              } catch (e) {
                logError('Error accessing iframe g_form:', e);
              }
            }

            // Try to find sys_id input in iframe
            if (!sysId) {
              const iframeSysIdInput = iframeDoc.querySelector('input[name="sys_id"]');
              if (iframeSysIdInput && iframeSysIdInput.value) {
                sysId = iframeSysIdInput.value;
                log('Found sys_id in iframe input:', sysId);
              }
            }

            // Try to find table from iframe URL
            if (!table && iframe.src) {
              const iframeSrc = decodeURIComponent(iframe.src);
              log('Iframe src:', iframeSrc);
              for (const { pattern, table: tableName } of tablePatterns) {
                if (pattern.test(iframeSrc)) {
                  table = tableName;
                  log('Detected table from iframe src:', table);
                  break;
                }
              }
              // Extract sys_id from iframe src
              const iframeSysIdMatch = iframeSrc.match(/sys_id=([a-f0-9]{32})/i);
              if (iframeSysIdMatch && !sysId) {
                sysId = iframeSysIdMatch[1];
                log('Extracted sys_id from iframe src:', sysId);
              }
            }
          }
        } catch (e) {
          log(`Iframe ${index} not accessible (cross-origin):`, e.message);
        }
      });
    }

    // Last resort: try to extract from sysparm_record_target in URL
    if (!table) {
      const recordTargetMatch = decodedUrl.match(/sysparm_record_target=([^&]+)/i);
      if (recordTargetMatch) {
        table = recordTargetMatch[1];
        log('Extracted table from sysparm_record_target:', table);
      }
    }

    log('Final record info - sysId:', sysId, 'table:', table, 'number:', number);

    if (sysId && table) {
      const result = { sysId, table, number };
      log('getRecordInfo() returning:', result);
      return result;
    }

    logWarn('getRecordInfo() could not determine record info, returning null');
    return null;
  }

  /**
   * Fetch attachments from ServiceNow API
   */
  async function fetchAttachments(table, sysId) {
    const apiUrl = `/api/now/attachment?sysparm_query=table_name=${table}^table_sys_id=${sysId}^content_typeLIKEimage&sysparm_fields=sys_id,file_name,sys_created_on,content_type,size_bytes`;
    log('fetchAttachments() called');
    log('API URL:', apiUrl);

    try {
      log('Making fetch request...');
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      log('Response status:', response.status, response.statusText);
      log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        logError('Failed to fetch attachments - HTTP', response.status);
        const errorText = await response.text();
        logError('Error response body:', errorText);
        throw new Error(`Failed to fetch attachments: ${response.status}`);
      }

      const data = await response.json();
      log('Attachments API response:', data);
      log('Number of attachments found:', data.result ? data.result.length : 0);

      const attachments = (data.result || []).map(att => ({
        id: att.sys_id,
        name: att.file_name,
        date: att.sys_created_on,
        contentType: att.content_type,
        size: att.size_bytes,
        url: `/api/now/attachment/${att.sys_id}/file`
      })).sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first

      log('Processed attachments:', attachments);
      return attachments;
    } catch (error) {
      logError('Error fetching attachments:', error);
      return [];
    }
  }

  /**
   * Fetch journal entries (comments and work notes)
   */
  async function fetchComments(table, sysId) {
    // Fetch with both display value and actual value to get user sys_id
    const apiUrl = `/api/now/table/sys_journal_field?sysparm_query=name=${table}^element_id=${sysId}&sysparm_fields=sys_id,sys_created_on,sys_created_by,value,element&sysparm_display_value=all`;
    log('fetchComments() called');
    log('API URL:', apiUrl);

    try {
      log('Making fetch request...');
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      log('Response status:', response.status, response.statusText);

      if (!response.ok) {
        logError('Failed to fetch comments - HTTP', response.status);
        const errorText = await response.text();
        logError('Error response body:', errorText);
        throw new Error(`Failed to fetch comments: ${response.status}`);
      }

      const data = await response.json();
      log('Comments API response:', data);
      log('Number of comments found:', data.result ? data.result.length : 0);

      const comments = (data.result || []).map(entry => {
        // With sysparm_display_value=all, we get both display_value and value
        const authorDisplay = entry.sys_created_by?.display_value || entry.sys_created_by;
        const authorId = entry.sys_created_by?.value || null;

        return {
          id: entry.sys_id?.value || entry.sys_id,
          author: authorDisplay,
          authorId: authorId,
          date: entry.sys_created_on?.display_value || entry.sys_created_on,
          content: entry.value?.display_value || entry.value,
          type: (entry.element?.value || entry.element) === 'work_notes' ? 'work_note' :
                (entry.element?.value || entry.element) === 'comments' ? 'customer' : 'comment'
        };
      }).sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first

      log('Processed comments:', comments);
      return comments;
    } catch (error) {
      logError('Error fetching comments:', error);
      return [];
    }
  }

  /**
   * Format date for display
   */
  function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    // Less than 24 hours
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      if (hours < 1) {
        const mins = Math.floor(diff / 60000);
        return mins < 1 ? 'Just now' : `${mins}m ago`;
      }
      return `${hours}h ago`;
    }

    // Less than 7 days
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days}d ago`;
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }

  /**
   * Get initials from name
   */
  function getInitials(name) {
    if (!name) return '??';
    const parts = name.split(/[\s._-]+/);
    return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }

  /**
   * Create the modal HTML
   */
  function createModal() {
    log('createModal() called');

    const modalHTML = `
      <div class="snmv-overlay" id="snmv-overlay">
        <div class="snmv-modal" role="dialog" aria-modal="true" aria-labelledby="snmv-title">
          <header class="snmv-header">
            <div class="snmv-header-left">
              <div class="snmv-icon">${Icons.record}</div>
              <div class="snmv-title-group">
                <h2 class="snmv-title" id="snmv-title">Media & Comments</h2>
                <p class="snmv-subtitle" id="snmv-subtitle">Loading...</p>
              </div>
            </div>
            <button class="snmv-close-btn" id="snmv-close" aria-label="Close modal">
              ${Icons.close}
            </button>
          </header>

          <nav class="snmv-tabs" role="tablist">
            <button class="snmv-tab snmv-tab-active" data-tab="images" role="tab" aria-selected="true">
              ${Icons.gallery}
              <span>Images</span>
              <span class="snmv-tab-count" id="snmv-images-count">0</span>
            </button>
            <button class="snmv-tab" data-tab="comments" role="tab" aria-selected="false">
              ${Icons.comments}
              <span>Comments</span>
              <span class="snmv-tab-count" id="snmv-comments-count">0</span>
            </button>
          </nav>

          <div class="snmv-body">
            <div class="snmv-panel snmv-panel-active" data-panel="images" role="tabpanel">
              <div class="snmv-images-container">
                <div class="snmv-images-scroll" id="snmv-images-grid">
                  <div class="snmv-loading">
                    <div class="snmv-spinner"></div>
                    <span class="snmv-loading-text">Loading images...</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="snmv-panel" data-panel="comments" role="tabpanel">
              <div class="snmv-comments-container" id="snmv-comments-list">
                <div class="snmv-loading">
                  <div class="snmv-spinner"></div>
                  <span class="snmv-loading-text">Loading comments...</span>
                </div>
              </div>
            </div>
          </div>

          <footer class="snmv-footer">
            <div class="snmv-record-info">
              <span class="snmv-record-badge" id="snmv-record-badge">-</span>
              <span id="snmv-record-table">-</span>
            </div>
            <div class="snmv-footer-actions">
              <button class="snmv-btn" id="snmv-refresh">
                ${Icons.refresh}
                <span>Refresh</span>
              </button>
            </div>
          </footer>
        </div>
      </div>

      <div class="snmv-lightbox" id="snmv-lightbox">
        <button class="snmv-lightbox-close" id="snmv-lightbox-close">
          ${Icons.close}
        </button>
        <button class="snmv-lightbox-nav snmv-lightbox-prev" id="snmv-lightbox-prev" title="Previous (←)">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <img src="" alt="Full size image" id="snmv-lightbox-img">
        <button class="snmv-lightbox-nav snmv-lightbox-next" id="snmv-lightbox-next" title="Next (→)">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <div class="snmv-lightbox-counter" id="snmv-lightbox-counter"></div>
      </div>
    `;

    const container = document.createElement('div');
    container.id = 'snmv-container';
    container.innerHTML = modalHTML;
    document.body.appendChild(container);
    log('Modal container appended to body');

    overlay = document.getElementById('snmv-overlay');
    lightbox = document.getElementById('snmv-lightbox');

    log('overlay element:', overlay);
    log('lightbox element:', lightbox);

    // Event listeners
    document.getElementById('snmv-close').addEventListener('click', () => {
      log('Close button clicked');
      closeModal();
    });
    document.getElementById('snmv-refresh').addEventListener('click', () => {
      log('Refresh button clicked');
      loadData();
    });
    document.getElementById('snmv-lightbox-close').addEventListener('click', closeLightbox);
    document.getElementById('snmv-lightbox-prev').addEventListener('click', (e) => {
      e.stopPropagation();
      navigateLightbox(-1);
    });
    document.getElementById('snmv-lightbox-next').addEventListener('click', (e) => {
      e.stopPropagation();
      navigateLightbox(1);
    });
    document.getElementById('snmv-lightbox').addEventListener('click', (e) => {
      if (e.target.id === 'snmv-lightbox') closeLightbox();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        log('Overlay clicked, closing modal');
        closeModal();
      }
    });

    // Tab switching
    document.querySelectorAll('.snmv-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        log('Tab clicked:', tab.dataset.tab);
        switchTab(tab.dataset.tab);
      });
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!state.isOpen) return;

      if (e.key === 'Escape') {
        log('Escape key pressed');
        if (lightbox.classList.contains('snmv-active')) {
          closeLightbox();
        } else {
          closeModal();
        }
        return;
      }

      // Arrow key navigation for images
      if (state.activeTab === 'images' && state.images.length > 0) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          log('Arrow right pressed');
          selectImage(state.selectedImageIndex + 1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          log('Arrow left pressed');
          selectImage(state.selectedImageIndex - 1);
        } else if (e.key === 'Enter' && state.selectedImageIndex >= 0) {
          e.preventDefault();
          log('Enter pressed on selected image');
          openLightbox(state.images[state.selectedImageIndex].url);
        }
      }

      // Arrow key navigation in lightbox
      if (lightbox.classList.contains('snmv-active')) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          navigateLightbox(1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          navigateLightbox(-1);
        }
      }
    });

    log('createModal() completed');
  }

  /**
   * Create the trigger button
   */
  function createTriggerButton() {
    log('createTriggerButton() called');

    triggerButton = document.createElement('button');
    triggerButton.className = 'snmv-trigger';
    triggerButton.id = 'snmv-trigger-btn';
    triggerButton.innerHTML = `${Icons.gallery} <span>View Summary</span>`;
    triggerButton.addEventListener('click', () => {
      log('Trigger button clicked');
      openModal();
    });
    document.body.appendChild(triggerButton);

    log('Trigger button created and appended');
    log('Trigger button element:', triggerButton);
    log('Trigger button in DOM:', document.getElementById('snmv-trigger-btn'));
  }

  /**
   * Switch between tabs
   */
  function switchTab(tabName) {
    log('switchTab() called with:', tabName);
    state.activeTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.snmv-tab').forEach(tab => {
      const isActive = tab.dataset.tab === tabName;
      tab.classList.toggle('snmv-tab-active', isActive);
      tab.setAttribute('aria-selected', isActive);
    });

    // Update panels
    document.querySelectorAll('.snmv-panel').forEach(panel => {
      panel.classList.toggle('snmv-panel-active', panel.dataset.panel === tabName);
    });

    // Reset image selection when switching to images tab
    if (tabName === 'images' && state.images.length > 0) {
      selectImage(0);
    }
  }

  /**
   * Select an image by index
   */
  function selectImage(index) {
    if (state.images.length === 0) return;

    // Wrap around
    if (index < 0) index = state.images.length - 1;
    if (index >= state.images.length) index = 0;

    log('selectImage() index:', index);
    state.selectedImageIndex = index;

    // Update visual selection
    const cards = document.querySelectorAll('.snmv-image-card');
    cards.forEach((card, i) => {
      card.classList.toggle('snmv-image-selected', i === index);
    });

    // Scroll the selected image into view
    const selectedCard = cards[index];
    if (selectedCard) {
      selectedCard.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  /**
   * Navigate in lightbox
   */
  function navigateLightbox(direction) {
    if (state.images.length === 0) return;

    let newIndex = state.selectedImageIndex + direction;
    if (newIndex < 0) newIndex = state.images.length - 1;
    if (newIndex >= state.images.length) newIndex = 0;

    log('navigateLightbox() new index:', newIndex);
    state.selectedImageIndex = newIndex;

    // Update lightbox image
    const img = state.images[newIndex];
    if (img) {
      document.getElementById('snmv-lightbox-img').src = img.url;
    }

    // Update counter
    updateLightboxCounter();

    // Update selection in gallery too
    const cards = document.querySelectorAll('.snmv-image-card');
    cards.forEach((card, i) => {
      card.classList.toggle('snmv-image-selected', i === newIndex);
    });
  }

  /**
   * Render images
   */
  function renderImages() {
    log('renderImages() called');
    log('Number of images to render:', state.images.length);

    const container = document.getElementById('snmv-images-grid');
    document.getElementById('snmv-images-count').textContent = state.images.length;

    if (state.images.length === 0) {
      log('No images to display, showing empty state');
      container.innerHTML = `
        <div class="snmv-empty">
          <div class="snmv-empty-icon">${Icons.empty}</div>
          <h3 class="snmv-empty-title">No images found</h3>
          <p class="snmv-empty-text">This record has no image attachments</p>
        </div>
      `;
      return;
    }

    container.innerHTML = state.images.map(img => `
      <div class="snmv-image-card" data-id="${img.id}">
        <div class="snmv-image-wrapper">
          <img src="${img.url}" alt="${img.name}" loading="lazy">
          <div class="snmv-image-overlay">
            <div class="snmv-image-actions">
              <button class="snmv-image-action" data-action="expand" title="View full size">
                ${Icons.expand}
              </button>
              <a class="snmv-image-action" href="${img.url}" download="${img.name}" title="Download">
                ${Icons.download}
              </a>
            </div>
          </div>
        </div>
        <div class="snmv-image-meta">
          <p class="snmv-image-name">${img.name}</p>
          <p class="snmv-image-date">
            ${Icons.clock}
            ${formatDate(img.date)}
          </p>
        </div>
      </div>
    `).join('');

    // Add click handlers for expand
    container.querySelectorAll('[data-action="expand"]').forEach((btn, index) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.selectedImageIndex = index;
        openLightbox(state.images[index].url);
      });
    });

    container.querySelectorAll('.snmv-image-card').forEach((card, index) => {
      card.addEventListener('click', () => {
        state.selectedImageIndex = index;
        openLightbox(state.images[index].url);
      });
    });

    // Select first image by default
    if (state.images.length > 0) {
      selectImage(0);
    }

    log('renderImages() completed');
  }

  /**
   * Render comments
   */
  function renderComments() {
    log('renderComments() called');
    log('Number of comments to render:', state.comments.length);

    const container = document.getElementById('snmv-comments-list');
    document.getElementById('snmv-comments-count').textContent = state.comments.length;

    if (state.comments.length === 0) {
      log('No comments to display, showing empty state');
      container.innerHTML = `
        <div class="snmv-empty">
          <div class="snmv-empty-icon">${Icons.comments}</div>
          <h3 class="snmv-empty-title">No comments found</h3>
          <p class="snmv-empty-text">This record has no journal entries</p>
        </div>
      `;
      return;
    }

    const typeLabels = {
      'work_note': 'Work Note',
      'customer': 'Customer',
      'comment': 'Comment'
    };

    container.innerHTML = `
      <div class="snmv-timeline">
        ${state.comments.map((comment, index) => {
          // Check if this comment is from the current user
          const isCurrentUser = state.currentUserId &&
            (comment.authorId === state.currentUserId ||
             comment.author === state.currentUserName);

          return `
          <div class="snmv-comment snmv-comment-${comment.type}${isCurrentUser ? ' snmv-comment-mine' : ''}" style="animation-delay: ${index * 50}ms">
            <div class="snmv-comment-dot"></div>
            <div class="snmv-comment-card">
              <div class="snmv-comment-header">
                <div class="snmv-comment-author">
                  <div class="snmv-avatar${isCurrentUser ? ' snmv-avatar-mine' : ''}">${getInitials(comment.author)}</div>
                  <div class="snmv-author-info">
                    <span class="snmv-author-name">${comment.author || 'Unknown'}${isCurrentUser ? ' <span class="snmv-you-badge">You</span>' : ''}</span>
                    <span class="snmv-comment-time">${formatDate(comment.date)}</span>
                  </div>
                </div>
                <span class="snmv-comment-type snmv-type-${comment.type}">${typeLabels[comment.type] || 'Comment'}</span>
              </div>
              <div class="snmv-comment-body">
                <p>${comment.content}</p>
              </div>
            </div>
          </div>
        `}).join('')}
      </div>
    `;

    log('renderComments() completed');
  }

  /**
   * Load data from ServiceNow
   */
  async function loadData() {
    log('loadData() called');
    state.loading = true;
    state.recordInfo = getRecordInfo();

    if (!state.recordInfo) {
      logError('Could not detect record info');
      document.getElementById('snmv-subtitle').textContent = 'Could not detect record';
      document.getElementById('snmv-images-grid').innerHTML = `
        <div class="snmv-empty">
          <div class="snmv-empty-icon">${Icons.empty}</div>
          <h3 class="snmv-empty-title">Record not detected</h3>
          <p class="snmv-empty-text">Could not find sys_id or table name. Check console for debug info.</p>
        </div>
      `;
      document.getElementById('snmv-comments-list').innerHTML = `
        <div class="snmv-empty">
          <div class="snmv-empty-icon">${Icons.comments}</div>
          <h3 class="snmv-empty-title">Record not detected</h3>
          <p class="snmv-empty-text">Could not find sys_id or table name. Check console for debug info.</p>
        </div>
      `;
      return;
    }

    const { sysId, table, number } = state.recordInfo;
    log('Loading data for - table:', table, 'sysId:', sysId, 'number:', number);

    document.getElementById('snmv-subtitle').textContent = `${table.replace(/_/g, ' ').toUpperCase()}`;
    document.getElementById('snmv-record-badge').textContent = number || sysId.substring(0, 8);
    document.getElementById('snmv-record-table').textContent = table.replace(/_/g, ' ');

    // Show loading state
    document.getElementById('snmv-images-grid').innerHTML = `
      <div class="snmv-loading">
        <div class="snmv-spinner"></div>
        <span class="snmv-loading-text">Loading images...</span>
      </div>
    `;
    document.getElementById('snmv-comments-list').innerHTML = `
      <div class="snmv-loading">
        <div class="snmv-spinner"></div>
        <span class="snmv-loading-text">Loading comments...</span>
      </div>
    `;

    // Fetch current user and data in parallel
    log('Starting parallel fetch for user, attachments and comments...');
    try {
      const [userInfo, images, comments] = await Promise.all([
        getCurrentUser(),
        fetchAttachments(table, sysId),
        fetchComments(table, sysId)
      ]);

      log('Current user:', userInfo);

      log('Fetch completed - images:', images.length, 'comments:', comments.length);

      state.images = images;
      state.comments = comments;
      state.loading = false;

      renderImages();
      renderComments();
    } catch (error) {
      logError('Error in loadData():', error);
      state.loading = false;
    }

    log('loadData() completed');
  }

  /**
   * Open modal
   */
  function openModal() {
    log('openModal() called');
    state.isOpen = true;
    overlay.classList.add('snmv-active');
    document.body.style.overflow = 'hidden';
    log('Modal should now be visible');
    loadData();
  }

  /**
   * Close modal
   */
  function closeModal() {
    log('closeModal() called');
    state.isOpen = false;
    overlay.classList.remove('snmv-active');
    document.body.style.overflow = '';
  }

  /**
   * Open lightbox
   */
  function openLightbox(url) {
    log('openLightbox() called with URL:', url);
    document.getElementById('snmv-lightbox-img').src = url;
    lightbox.classList.add('snmv-active');

    // Update counter
    updateLightboxCounter();

    // Update selection visual
    const cards = document.querySelectorAll('.snmv-image-card');
    cards.forEach((card, i) => {
      card.classList.toggle('snmv-image-selected', i === state.selectedImageIndex);
    });
  }

  /**
   * Update lightbox counter
   */
  function updateLightboxCounter() {
    const counter = document.getElementById('snmv-lightbox-counter');
    if (counter && state.images.length > 0) {
      counter.textContent = `${state.selectedImageIndex + 1} / ${state.images.length}`;
    }
  }

  /**
   * Close lightbox
   */
  function closeLightbox() {
    log('closeLightbox() called');
    lightbox.classList.remove('snmv-active');
    document.getElementById('snmv-lightbox-img').src = '';
  }

  /**
   * Check if we're on a valid ServiceNow record page
   */
  function isValidPage() {
    const url = window.location.href;
    log('isValidPage() checking URL:', url);

    // Check for classic UI patterns
    const classicMatch = /\/(incident|sc_task|sc_req_item|change_request|problem)\.do/i.test(url);
    log('Classic UI pattern match:', classicMatch);

    // Check for workspace UI pattern
    const workspaceMatch = /\/now\/workspace\/agent\/record\//i.test(url);
    log('Workspace UI pattern match:', workspaceMatch);

    // Check for Next Experience (sn-polaris)
    const polarisMatch = /\/now\/sow\/record\//i.test(url);
    log('Polaris UI pattern match:', polarisMatch);

    // Check if on any service-now.com domain
    const isServiceNowDomain = url.includes('service-now.com');
    log('Is ServiceNow domain:', isServiceNowDomain);

    // More permissive check - if we're on ServiceNow and can potentially find record info
    if (isServiceNowDomain) {
      log('On ServiceNow domain, allowing initialization');
      return true;
    }

    const result = classicMatch || workspaceMatch || polarisMatch;
    log('isValidPage() result:', result);
    return result;
  }

  // Allowed tables for the extension
  const ALLOWED_TABLES = ['incident', 'rm_story', 'dmn_demand'];

  /**
   * Check if the table is in the allowed list
   */
  function isAllowedTable(table) {
    if (!table) return false;
    return ALLOWED_TABLES.includes(table.toLowerCase());
  }

  /**
   * Check if this is the right frame to show the trigger button
   * We want to show it in the frame that has the form, or the top frame
   * Only for allowed tables: incident, rm_story, dmn_demand
   */
  function shouldShowTrigger() {
    const url = window.location.href;
    const decodedUrl = decodeURIComponent(url);

    // Check if URL contains an allowed table
    const tableMatch = decodedUrl.match(/\/(incident|rm_story|dmn_demand)\.do/i);
    if (!tableMatch) {
      // Also check workspace URLs
      const workspaceMatch = decodedUrl.match(/\/record\/(incident|rm_story|dmn_demand)\//i);
      if (!workspaceMatch) {
        log('URL does not match allowed tables (incident, rm_story, dmn_demand)');
        return false;
      }
    }

    // If g_form is available, this is the form frame
    if (typeof g_form !== 'undefined') {
      const tableName = g_form.getTableName();
      if (isAllowedTable(tableName)) {
        log('g_form available with allowed table:', tableName);
        return true;
      }
      log('g_form available but table not allowed:', tableName);
      return false;
    }

    // If we're in the top frame and can detect record info from URL
    if (window === window.top) {
      const hasRecordInUrl = /sys_id=([a-f0-9]{32})/i.test(decodedUrl);
      log('Top frame, record in URL:', hasRecordInUrl);
      return hasRecordInUrl;
    }

    // If we're in an iframe, only show if we have the form
    if (window !== window.top) {
      // Check if this iframe has form-like content
      const hasFormContent = document.querySelector('form[name="sys_target"], .form-group, #sys_target');
      log('In iframe, has form content:', !!hasFormContent);
      return !!hasFormContent;
    }

    return false;
  }

  /**
   * Initialize the extension
   */
  function init() {
    log('init() called');
    log('document.readyState:', document.readyState);
    log('Is top frame:', window === window.top);
    log('Frame location:', window.location.href.substring(0, 100) + '...');

    // Wait for page to be ready
    if (document.readyState === 'loading') {
      log('Document still loading, adding DOMContentLoaded listener');
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    // Check if already initialized in this frame
    if (document.getElementById('snmv-container')) {
      log('Already initialized in this frame, skipping');
      return;
    }

    // Determine if we should show the trigger in this frame
    if (!shouldShowTrigger()) {
      log('Not showing trigger in this frame');
      return;
    }

    // Check if on valid page
    if (!isValidPage()) {
      log('Not a valid page, but will attempt initialization anyway for debugging');
    }

    log('Proceeding with initialization...');

    try {
      createModal();
      createTriggerButton();
      log('Initialization completed successfully');

      // Log what we can find for debugging
      log('=== Debug Info ===');
      log('g_form available:', typeof g_form !== 'undefined');
      log('NOW available:', typeof NOW !== 'undefined');
      log('g_ck available:', typeof g_ck !== 'undefined');

      // Try to get record info immediately for debugging
      const recordInfo = getRecordInfo();
      log('Initial record info:', recordInfo);

    } catch (error) {
      logError('Error during initialization:', error);
    }
  }

  // Start
  log('Starting init()...');
  init();

  // Also try init on window load as fallback
  window.addEventListener('load', () => {
    log('Window load event fired');
    if (!document.getElementById('snmv-container')) {
      log('Container not found on window load, attempting init again');
      init();
    }
  });

  // For single-page apps, watch for URL changes
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      log('URL changed from', lastUrl, 'to', window.location.href);
      lastUrl = window.location.href;
      // Remove old instance and reinitialize
      const existingContainer = document.getElementById('snmv-container');
      if (existingContainer) {
        existingContainer.remove();
        log('Removed old container');
      }
      const existingTrigger = document.getElementById('snmv-trigger-btn');
      if (existingTrigger) {
        existingTrigger.remove();
        log('Removed old trigger button');
      }
      setTimeout(() => {
        log('Reinitializing after URL change');
        init();
      }, 1000); // Wait for page to settle
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  log('MutationObserver set up for URL changes');

})();

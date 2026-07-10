window.escrowViewType = localStorage.getItem('escrowViewType') || 'grid';

// --- Theme Toggle ---
const storedTheme = localStorage.getItem('theme');
const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
let currentTheme = storedTheme || (prefersDark ? 'dark' : 'light');
document.documentElement.setAttribute('data-bs-theme', currentTheme);

document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) {
    toggleBtn.innerHTML = currentTheme === 'dark' ? '<i class="bi bi-sun-fill"></i> Theme' : '<i class="bi bi-moon-stars-fill"></i> Theme';

    toggleBtn.addEventListener('click', () => {
      currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-bs-theme', currentTheme);
      localStorage.setItem('theme', currentTheme);
      toggleBtn.innerHTML = currentTheme === 'dark' ? '<i class="bi bi-sun-fill"></i> Theme' : '<i class="bi bi-moon-stars-fill"></i> Theme';
    });
  }
});

// Cache frequently-used DOM elements to reduce lookups
const templateSelectEl = document.getElementById('templateSelect');
const templateFieldsEl = document.getElementById('templateFields');
const templateDescEl = document.getElementById('templateDesc');
const escrowDurationHoursEl = document.getElementById('escrowDurationHours');
const escrowFinishDatetimeEl = document.getElementById('escrowFinishDatetime');
const escrowCancelDatetimeEl = document.getElementById('escrowCancelDatetime');
const payloadResultEl = document.getElementById('payloadResult');
const connectXamanBtnEl = document.getElementById('connectXamanBtn');

// XRPL Alphabet for address validation
const _XRPL_ALPHABET = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";
const _XRPL_ALPHABET_MAP = {};
for (let i = 0; i < _XRPL_ALPHABET.length; i++) {
  _XRPL_ALPHABET_MAP[_XRPL_ALPHABET[i]] = i;
}

// Simple XRPL address format validation (real-time feedback)
function isValidXRPLAddressFormat(address) {
  return typeof address === 'string' && 
         address.startsWith('r') && 
         address.length >= 25 && 
         address.length <= 35 && 
         /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address);
}

// Show validation indicator and add to localStorage for address history
function recordAddressInHistory(address) {
  if (!isValidXRPLAddressFormat(address)) return;
  let history = JSON.parse(localStorage.getItem('xrplAddressHistory') || '[]');
  history = history.filter(a => a !== address);
  history.unshift(address);
  history = history.slice(0, 10);
  localStorage.setItem('xrplAddressHistory', JSON.stringify(history));
}

window.connectedUserToken = localStorage.getItem('xamanUserToken') || null;
window.connectedAccount = localStorage.getItem('xamanAccount') || null;

window.openCenteredPopup = function(url, title = 'XamanPopup', w = 500, h = 600) {
  const dualScreenLeft = window.screenLeft !== undefined ? window.screenLeft : window.screenX;
  const dualScreenTop = window.screenTop !== undefined ? window.screenTop : window.screenY;

  const width = window.innerWidth ? window.innerWidth : document.documentElement.clientWidth ? document.documentElement.clientWidth : screen.width;
  const height = window.innerHeight ? window.innerHeight : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height;

  const systemZoom = width / window.screen.availWidth;
  const left = (width - w) / 2 / systemZoom + dualScreenLeft;
  const top = (height - h) / 2 / systemZoom + dualScreenTop;

  const newWin = window.open(url, title, `width=${w},height=${h},top=${top},left=${left},noopener,scrollbars=yes`);
  window.activeXamanPopup = newWin;
  return newWin;
};

window.closeActiveXamanPopup = function() {
  if (window.activeXamanPopup && !window.activeXamanPopup.closed) {
    window.activeXamanPopup.close();
  }
  window.activeXamanPopup = null;
};

function debounce(fn, wait = 150) {
  let t;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function escapeHtml(unsafe) {
  return (unsafe || '').toString()
       .replace(/&/g, "&amp;")
       .replace(/</g, "&lt;")
       .replace(/>/g, "&gt;")
       .replace(/"/g, "&quot;")
       .replace(/'/g, "&#039;");
}

window.userTrustlines = [];
window.loadingTrustlines = false;

async function fetchUserTrustlines(account) {
  if (!account) {
    window.userTrustlines = [];
    window.loadingTrustlines = false;
    updateFormTrustlinesDropdowns();
    return;
  }
  window.loadingTrustlines = true;
  updateFormTrustlinesDropdowns();
  
  try {
    const resp = await fetch(`/account_trustlines/${account}`);
    if (resp.ok) {
      const data = await resp.json();
      window.userTrustlines = data.trustlines || [];
    } else {
      window.userTrustlines = [];
    }
  } catch (err) {
    console.error('Error fetching trustlines:', err);
    window.userTrustlines = [];
  } finally {
    window.loadingTrustlines = false;
    updateFormTrustlinesDropdowns();
  }
}

function populateTrustlinesDropdown(selectEl, curInput, issInput) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  selectEl.disabled = false;
  
  const parentContainer = selectEl.closest('.trustlines-dropdown-container');
  
  // If no wallet connected, hide the container completely
  if (!window.connectedAccount) {
    if (parentContainer) parentContainer.style.display = 'none';
    return;
  }

  if (parentContainer) parentContainer.style.display = 'block';

  // If currently loading
  if (window.loadingTrustlines) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '⏳ Loading trustlines from ledger...';
    selectEl.appendChild(opt);
    selectEl.disabled = true;
    return;
  }

  const trustlines = window.userTrustlines || [];
  if (trustlines.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '❌ No active trustlines found for this account';
    selectEl.appendChild(opt);
    selectEl.disabled = true;
    return;
  }

  // Add default option
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a token from your trustlines...';
  selectEl.appendChild(placeholder);

  trustlines.forEach(tl => {
    const opt = document.createElement('option');
    opt.value = JSON.stringify({ currency: tl.currency, issuer: tl.issuer });
    
    const currency = tl.currency;
    const decodedVal = decodeCurrencyCode(currency);
    const balanceFormatted = parseFloat(tl.balance).toLocaleString(undefined, {maximumFractionDigits: 6});
    const limitFormatted = parseFloat(tl.limit).toLocaleString(undefined, {maximumFractionDigits: 6});
    
    if (currency.startsWith('03') && currency.length === 40) {
      opt.textContent = `AMM Liquidity Pool Token (LP) (Balance: ${balanceFormatted} • Limit: ${limitFormatted})`;
    } else {
      const hasDecodedName = decodedVal !== currency;
      if (!hasDecodedName) {
        opt.textContent = `${currency} (Balance: ${balanceFormatted} • Limit: ${limitFormatted})`;
      } else {
        const tokenName = tl.name && tl.name !== decodedVal ? tl.name : decodedVal;
        opt.textContent = `${tokenName} (${decodedVal}) (Balance: ${balanceFormatted} • Limit: ${limitFormatted})`;
      }
    }
    selectEl.appendChild(opt);
  });

  // When selected, auto-fill inputs
  selectEl.addEventListener('change', () => {
    if (!selectEl.value) return;
    try {
      const { currency, issuer } = JSON.parse(selectEl.value);
      if (curInput && issInput) {
        curInput.value = currency;
        issInput.value = issuer;
        curInput.dispatchEvent(new Event('input', { bubbles: true }));
        issInput.dispatchEvent(new Event('input', { bubbles: true }));
        curInput.dispatchEvent(new Event('blur', { bubbles: true }));
        issInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    } catch (e) {
      console.error('Error selecting trustline:', e);
    }
  });
}

function updateFormTrustlinesDropdowns() {
  const dropdowns = document.querySelectorAll('.trustlines-select');
  dropdowns.forEach(selectEl => {
    const tokenGroup = selectEl.closest('.token-group');
    if (tokenGroup) {
      const curInput = tokenGroup.querySelector('#field_AMOUNT_CURRENCY');
      const issInput = tokenGroup.querySelector('#field_AMOUNT_ISSUER');
      populateTrustlinesDropdown(selectEl, curInput, issInput);
    }
  });
  populateMemeTokenSelect();
  populateVaultTrustlinesDropdown();
  populateCrowdhdlTokenSelect();
}

function populateMemeTokenSelect() {
  const selectEl = document.getElementById('memeTokenSelect');
  if (!selectEl) return;
  selectEl.innerHTML = '';
  selectEl.disabled = false;

  const btnSearch = document.getElementById('btnMemeTokenSearch');
  if (btnSearch) btnSearch.style.display = 'none';

  // If no wallet connected
  if (!window.connectedAccount) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '❌ Connect wallet to view trustlines';
    selectEl.appendChild(opt);
    selectEl.disabled = true;
    return;
  }

  // If currently loading
  if (window.loadingTrustlines) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '⏳ Loading trustlines from ledger...';
    selectEl.appendChild(opt);
    selectEl.disabled = true;
    return;
  }

  const trustlines = window.userTrustlines || [];
  if (trustlines.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '❌ No active trustlines found for this account';
    selectEl.appendChild(opt);
    
    // Still allow custom token search even if they have no trustlines
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = '-- Custom Token Search --';
    selectEl.appendChild(customOpt);
    selectEl.disabled = false;
    return;
  }

  // Add default option
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a token from your trustlines...';
  selectEl.appendChild(placeholder);

  trustlines.forEach(tl => {
    const opt = document.createElement('option');
    opt.value = JSON.stringify({ currency: tl.currency, decoded_currency: tl.decoded_currency, issuer: tl.issuer });
    
    const currency = tl.currency;
    const decodedVal = decodeCurrencyCode(currency);
    const balanceFormatted = parseFloat(tl.balance).toLocaleString(undefined, {maximumFractionDigits: 6});
    const limitFormatted = parseFloat(tl.limit).toLocaleString(undefined, {maximumFractionDigits: 6});
    
    if (currency.startsWith('03') && currency.length === 40) {
      opt.textContent = `AMM Liquidity Pool Token (LP) (Balance: ${balanceFormatted} • Limit: ${limitFormatted})`;
    } else {
      const hasDecodedName = decodedVal !== currency;
      if (!hasDecodedName) {
        opt.textContent = `${currency} (Balance: ${balanceFormatted} • Limit: ${limitFormatted})`;
      } else {
        const tokenName = tl.name && tl.name !== decodedVal ? tl.name : decodedVal;
        opt.textContent = `${tokenName} (${decodedVal}) (Balance: ${balanceFormatted} • Limit: ${limitFormatted})`;
      }
    }
    selectEl.appendChild(opt);
  });

  // Add custom search option at the end
  const customOpt = document.createElement('option');
  customOpt.value = 'custom';
  customOpt.textContent = '-- Custom Token Search --';
  selectEl.appendChild(customOpt);
}

function populateVaultTrustlinesDropdown() {
  const selectEl = document.getElementById('vaultTrustlineSelect');
  if (!selectEl) return;
  selectEl.innerHTML = '';
  selectEl.disabled = false;

  const parentContainer = selectEl.closest('.vault-trustlines-container');
  
  // If no wallet connected, hide the container completely
  if (!window.connectedAccount) {
    if (parentContainer) parentContainer.style.display = 'none';
    return;
  }

  if (parentContainer) parentContainer.style.display = 'block';

  // If currently loading
  if (window.loadingTrustlines) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '⏳ Loading trustlines from ledger...';
    selectEl.appendChild(opt);
    selectEl.disabled = true;
    return;
  }

  const trustlines = window.userTrustlines || [];
  if (trustlines.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '❌ No active trustlines found for this account';
    selectEl.appendChild(opt);
    selectEl.disabled = true;
    return;
  }

  // Add default option
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a token from your trustlines...';
  selectEl.appendChild(placeholder);

  trustlines.forEach(tl => {
    const opt = document.createElement('option');
    opt.value = JSON.stringify({ currency: tl.currency, issuer: tl.issuer });
    
    const currency = tl.currency;
    const decodedVal = decodeCurrencyCode(currency);
    const balanceFormatted = parseFloat(tl.balance).toLocaleString(undefined, {maximumFractionDigits: 6});
    const limitFormatted = parseFloat(tl.limit).toLocaleString(undefined, {maximumFractionDigits: 6});
    
    if (currency.startsWith('03') && currency.length === 40) {
      opt.textContent = `AMM Liquidity Pool Token (LP) (Balance: ${balanceFormatted} • Limit: ${limitFormatted})`;
    } else {
      const hasDecodedName = decodedVal !== currency;
      if (!hasDecodedName) {
        opt.textContent = `${currency} (Balance: ${balanceFormatted} • Limit: ${limitFormatted})`;
      } else {
        const tokenName = tl.name && tl.name !== decodedVal ? tl.name : decodedVal;
        opt.textContent = `${tokenName} (${decodedVal}) (Balance: ${balanceFormatted} • Limit: ${limitFormatted})`;
      }
    }
    selectEl.appendChild(opt);
  });

  // When selected, auto-fill inputs
  const newSelect = selectEl.cloneNode(true);
  selectEl.parentNode.replaceChild(newSelect, selectEl);
  newSelect.addEventListener('change', () => {
    if (!newSelect.value) return;
    try {
      const { currency, issuer } = JSON.parse(newSelect.value);
      const curInput = document.getElementById('vaultCurrency');
      const issInput = document.getElementById('vaultIssuer');
      if (curInput && issInput) {
        curInput.value = decodeCurrencyCode(currency);
        issInput.value = issuer;
        curInput.dispatchEvent(new Event('input', { bubbles: true }));
        issInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (e) {
      console.error('Error selecting vault trustline:', e);
    }
  });
}

function populateCrowdhdlTokenSelect() {
  const selectEl = document.getElementById('crowdhdlTokenSelect');
  if (!selectEl) return;
  selectEl.innerHTML = '';
  selectEl.disabled = false;

  const parentContainer = selectEl.closest('.crowdhdl-trustlines-container');
  
  // If no wallet connected, hide the container completely
  if (!window.connectedAccount) {
    if (parentContainer) parentContainer.style.display = 'none';
    return;
  }

  if (parentContainer) parentContainer.style.display = 'block';

  // If currently loading
  if (window.loadingTrustlines) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '⏳ Loading trustlines from ledger...';
    selectEl.appendChild(opt);
    selectEl.disabled = true;
    return;
  }

  const trustlines = window.userTrustlines || [];
  if (trustlines.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '❌ No active trustlines found for this account';
    selectEl.appendChild(opt);
    selectEl.disabled = true;
    return;
  }

  // Add default option
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a token from your trustlines...';
  selectEl.appendChild(placeholder);

  trustlines.forEach(tl => {
    const opt = document.createElement('option');
    opt.value = JSON.stringify({ currency: tl.currency, decoded_currency: tl.decoded_currency, issuer: tl.issuer });
    
    const currency = tl.currency;
    const decodedVal = decodeCurrencyCode(currency);
    const balanceFormatted = parseFloat(tl.balance).toLocaleString(undefined, {maximumFractionDigits: 6});
    const limitFormatted = parseFloat(tl.limit).toLocaleString(undefined, {maximumFractionDigits: 6});
    
    if (currency.startsWith('03') && currency.length === 40) {
      opt.textContent = `AMM Liquidity Pool Token (LP) (Balance: ${balanceFormatted} • Limit: ${limitFormatted})`;
    } else {
      const hasDecodedName = decodedVal !== currency;
      if (!hasDecodedName) {
        opt.textContent = `${currency} (Balance: ${balanceFormatted} • Limit: ${limitFormatted})`;
      } else {
        const tokenName = tl.name && tl.name !== decodedVal ? tl.name : decodedVal;
        opt.textContent = `${tokenName} (${decodedVal}) (Balance: ${balanceFormatted} • Limit: ${limitFormatted})`;
      }
    }
    selectEl.appendChild(opt);
  });
}

function updateSelectedTokenBadge(tokenGroup, name, domain, icon) {
  if (!tokenGroup) return;
  let badge = tokenGroup.querySelector('.selected-token-badge-container');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'selected-token-badge-container col-12 mt-2';
    tokenGroup.appendChild(badge);
  }
  
  if (!name && !domain && !icon) {
    badge.style.display = 'none';
    badge.innerHTML = '';
    return;
  }
  
  badge.style.display = 'block';
  const imgHtml = icon ? `<img src="${escapeHtml(icon)}" class="me-2 rounded-circle shadow-sm" style="width: 24px; height: 24px; object-fit: cover; border: 1px solid #ddd; vertical-align: middle;">` : `<i class="bi bi-coin me-2 fs-5 text-primary" style="vertical-align: middle;"></i>`;
  const domainHtml = domain && domain !== 'Unknown source' ? `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle ms-2" style="font-size: 0.7rem;">${escapeHtml(domain)}</span>` : '';
  
  badge.innerHTML = `
    <div class="d-flex align-items-center bg-light p-2 rounded border shadow-sm w-100">
      ${imgHtml}
      <div class="d-flex align-items-center flex-wrap gap-1">
        <strong class="text-dark" style="font-size: 0.85rem;">${escapeHtml(name)}</strong>
        ${domainHtml}
      </div>
    </div>
  `;
}

const fetchAndShowTokenBadge = debounce(async (tokenGroup, currency, issuer) => {
  if (!currency || !issuer || issuer.length < 25) {
    updateSelectedTokenBadge(tokenGroup, null, null, null);
    return;
  }
  
  const matched = (window.userTrustlines || []).find(tl => 
    (tl.currency === currency || tl.decoded_currency === currency) && tl.issuer === issuer
  );
  if (matched) {
    updateSelectedTokenBadge(tokenGroup, matched.name, matched.domain, matched.icon);
    return;
  }
  
  try {
    const resp = await fetch(`/search_tokens?currency=${encodeURIComponent(currency)}`);
    if (resp.ok) {
      const data = await resp.json();
      const tokens = data.tokens || [];
      const token = tokens.find(t => t.issuer === issuer);
      if (token) {
        updateSelectedTokenBadge(tokenGroup, token.name || (token.meta && token.meta.name), token.domain || (token.meta && token.meta.domain), token.meta && token.meta.token && token.meta.token.icon);
      } else {
        updateSelectedTokenBadge(tokenGroup, currency, 'Unknown issuer', null);
      }
    }
  } catch (err) {
    updateSelectedTokenBadge(tokenGroup, currency, 'Unknown issuer', null);
  }
}, 300);

async function loadTemplates() {
  try {
    const resp = await fetch('/templates');
    const templates = await resp.json();
    window.allTemplates = templates;
    updateTemplateList();
  } catch (err) {
    showAlert('Error loading templates: ' + String(err), 'error');
  }
}

function getFriendlyTemplateName(name, tmpl = {}) {
  if (!name) return '';
  if (tmpl.title) return tmpl.title;
  const words = name.split(/[_-]+/).map(word => {
    if (!word) return '';
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
  return words.join(' ');
}

function getTemplateIcon(name) {
  const icons = {
    'timed_escrow_create': 'bi-hourglass-split',
    'conditional_escrow_create': 'bi-patch-question',
    'oracle_price_threshold': 'bi-graph-up-arrow',
    'escrow_finish': 'bi-unlock',
    'escrow_cancel': 'bi-x-octagon',
    'token_payment': 'bi-send',
    'drop_tool': 'bi-droplet'
  };
  return icons[name] || 'bi-file-earmark-text';
}

function updateTemplateList() {
  const templates = window.allTemplates || {};
  const sel = templateSelectEl;
  const frag = document.createDocumentFragment();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select an escrow...';
  frag.appendChild(placeholder);
  
  const grid = document.getElementById('templateGrid');
  if (grid) {
    grid.innerHTML = '';
    // Change grid container layout to list-group style
    grid.className = 'list-group list-group-flush border rounded shadow-sm overflow-hidden mt-2';
  }

  const lastUsed = window.connectedAccount ? 
    localStorage.getItem(`lastUsedTemplate_${window.connectedAccount}`) : 
    localStorage.getItem('lastUsedTemplate_anonymous');

  const TEMPLATE_CATEGORIES = {
    'timed_escrow_create': 'escrow',
    'conditional_escrow_create': 'escrow',
    'oracle_price_threshold': 'escrow',
    'token_payment': 'payment',
    'trustline': 'payment',
    'issue_token': 'payment',
    'drop_tool': 'payment',
    'enable_token_escrows': 'setup'
  };

  for (const name of Object.keys(templates)) {
    if (name === 'escrow_finish' || name === 'escrow_cancel') {
      continue;
    }
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = getFriendlyTemplateName(name, templates[name]);
    frag.appendChild(opt);

    if (grid) {
      const rowItem = document.createElement('div');
      rowItem.className = 'list-group-item p-0 template-row border-bottom border-secondary-subtle';
      rowItem.dataset.name = name;
      rowItem.dataset.category = TEMPLATE_CATEGORIES[name] || 'other';

      // Header part of the row
      const header = document.createElement('div');
      header.className = 'd-flex align-items-center justify-content-between p-3';
      header.style.cursor = 'pointer';
      header.style.transition = 'background-color 0.2s';
      
      const leftPart = document.createElement('div');
      leftPart.className = 'd-flex align-items-center gap-3';
      
      const icon = document.createElement('i');
      icon.className = `bi ${getTemplateIcon(name)} fs-5 text-primary`;
      
      const title = document.createElement('span');
      title.className = 'fw-bold text-dark-emphasis d-flex align-items-center gap-2';
      title.style.fontSize = '0.9rem';
      title.textContent = getFriendlyTemplateName(name, templates[name]);

      if (name === lastUsed) {
        const badge = document.createElement('span');
        badge.className = 'badge bg-secondary-subtle text-secondary border border-secondary-subtle';
        badge.style.fontSize = '0.62rem';
        badge.style.padding = '0.2rem 0.4rem';
        badge.textContent = 'Last Used';
        title.appendChild(badge);
      }
      
      leftPart.appendChild(icon);
      leftPart.appendChild(title);
      
      const rightPart = document.createElement('div');
      rightPart.className = 'd-flex align-items-center gap-2';
      
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'btn btn-xs btn-outline-primary py-1 px-3';
      actionBtn.innerHTML = 'Launch <i class="bi bi-chevron-right small"></i>';
      actionBtn.style.fontSize = '0.72rem';
      
      rightPart.appendChild(actionBtn);
      
      header.appendChild(leftPart);
      header.appendChild(rightPart);
      rowItem.appendChild(header);

      // Hover effect on the header
      header.addEventListener('mouseover', () => {
        header.classList.add('bg-body-tertiary');
      });
      header.addEventListener('mouseout', () => {
        header.classList.remove('bg-body-tertiary');
      });

      const handleRowActivation = () => {
        const isCurrentlyActive = rowItem.classList.contains('active-template-row');
        
        // Deactivate all rows
        document.querySelectorAll('.template-row').forEach(row => {
          row.classList.remove('active-template-row');
          const btn = row.querySelector('button');
          if (btn) {
            btn.className = 'btn btn-xs btn-outline-primary py-1 px-3';
            btn.innerHTML = 'Launch <i class="bi bi-chevron-right small"></i>';
          }
        });

        const activeWS = document.getElementById('activeTemplateWorkspace');
        const emptyState = document.getElementById('activeTemplateEmptyState');
        const buildPayloadBtn = document.getElementById('buildPayloadWrapper');

        if (isCurrentlyActive) {
          // Deselect template
          sel.value = '';
          if (activeWS) activeWS.style.display = 'none';
          if (emptyState) emptyState.style.display = 'block';
          if (buildPayloadBtn) buildPayloadBtn.style.display = 'none';
          renderFields();
          return;
        }

        // Activate this row
        rowItem.classList.add('active-template-row');
        actionBtn.className = 'btn btn-xs btn-primary py-1 px-3';
        actionBtn.innerHTML = 'Active <i class="bi bi-chevron-down small"></i>';

        // Select the template value
        sel.value = name;

        // Remember last used escrow template type
        if (window.connectedAccount) {
          localStorage.setItem(`lastUsedTemplate_${window.connectedAccount}`, name);
        } else {
          localStorage.setItem('lastUsedTemplate_anonymous', name);
        }
        
        // Update Workspace Info
        const activeTitle = document.getElementById('activeTemplateTitle');
        const activeIcon = document.getElementById('activeTemplateIcon');
        const activeDesc = document.getElementById('templateDesc');
        const jsonPreviewContainer = document.getElementById('templateJsonPreviewContainer');

        if (activeTitle) activeTitle.textContent = getFriendlyTemplateName(name, templates[name]);
        if (activeIcon) {
          activeIcon.className = `bi ${getTemplateIcon(name)} fs-4 text-primary`;
        }
        if (activeDesc) activeDesc.textContent = templates[name]?.description || '';

        // Raw JSON Template Preview Box
        if (jsonPreviewContainer) {
          jsonPreviewContainer.innerHTML = '';
          
          const previewBtn = document.createElement('button');
          previewBtn.type = 'button';
          previewBtn.className = 'btn btn-xs btn-outline-secondary py-1 px-2 mb-2 d-flex align-items-center gap-1';
          previewBtn.style.fontSize = '0.7rem';
          previewBtn.innerHTML = '<i class="bi bi-code-slash"></i> Preview Raw JSON Template';
          
          const previewBody = document.createElement('pre');
          previewBody.className = 'bg-dark text-light p-3 rounded border border-secondary shadow-sm';
          previewBody.style.fontSize = '0.75rem';
          previewBody.style.maxHeight = '250px';
          previewBody.style.overflow = 'auto';
          previewBody.style.display = 'none';
          
          const rawTx = templates[name]?.txjson || {};
          previewBody.textContent = JSON.stringify(rawTx, null, 2);
          
          previewBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const isHidden = previewBody.style.display === 'none';
            previewBody.style.display = isHidden ? 'block' : 'none';
            previewBtn.classList.toggle('btn-outline-secondary', !isHidden);
            previewBtn.classList.toggle('btn-secondary', isHidden);
          });
          
          jsonPreviewContainer.appendChild(previewBtn);
          jsonPreviewContainer.appendChild(previewBody);
        }

        if (emptyState) emptyState.style.display = 'none';
        if (activeWS) activeWS.style.display = 'block';
        if (buildPayloadBtn) buildPayloadBtn.style.display = 'block';

        // Render the fields inside templateFields
        debounceRenderFields();
      };

      header.addEventListener('click', handleRowActivation);
      actionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleRowActivation();
      });

      grid.appendChild(rowItem);
    }
  }

  sel.innerHTML = '';
  sel.appendChild(frag);

  // Search & Category Filtering Logic
  const searchInput = document.getElementById('templateSearchInput');
  const catButtons = document.querySelectorAll('#templateCategories button[data-category]');

  let activeCategory = 'all';
  let searchQuery = '';

  const applyFilters = () => {
    document.querySelectorAll('.template-row').forEach(row => {
      const rowName = row.dataset.name;
      const category = row.dataset.category || '';
      const text = row.querySelector('.fw-bold').textContent.toLowerCase();
      const desc = (templates[rowName]?.description || '').toLowerCase();
      
      const matchesSearch = text.includes(searchQuery) || desc.includes(searchQuery);
      const matchesCategory = activeCategory === 'all' || category === activeCategory;

      if (matchesSearch && matchesCategory) {
        row.style.setProperty('display', 'block', 'important');
      } else {
        row.style.setProperty('display', 'none', 'important');
      }
    });
  };

  if (searchInput) {
    // Clone and replace to prevent duplicate event listeners on re-renders
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    
    newSearchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      applyFilters();
    });
  }

  if (catButtons.length > 0) {
    catButtons.forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('#templateCategories button').forEach(b => {
          b.classList.remove('btn-primary', 'active-category-btn');
          b.classList.add('btn-outline-secondary');
        });
        newBtn.classList.remove('btn-outline-secondary');
        newBtn.classList.add('btn-primary', 'active-category-btn');
        activeCategory = newBtn.dataset.category;
        applyFilters();
      });
    });
  }

  // Auto-expand last used template on first load
  if (lastUsed) {
    setTimeout(() => {
      const lastRow = document.querySelector(`.template-row[data-name="${lastUsed}"]`);
      if (lastRow && !document.querySelector('.active-template-row')) {
        const hdr = lastRow.querySelector('div');
        if (hdr) hdr.click();
      }
    }, 150);
  }
}

function sanitizeId(name) {
  return ('field_' + name).replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 60);
}

function getFriendlyFieldLabel(key) {
  if (!key) return '';
  if (key === 'ACCOUNT') return 'r Address';
  return key
    .split(/[_-]+/)
    .map(word => {
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function getFieldDescription(key) {
  const descriptions = {
    'ACCOUNT': 'The XRPL address (r-address) of the account initiating the transaction.',
    'DESTINATION': 'The XRPL address (r-address) receiving the funds.',
    'DESTINATION_TAG': 'An optional integer tag used to identify the recipient.',
    'AMOUNT': 'The amount of XRP (in drops) or the token object to be escrowed/sent.',
    'CONDITION': 'A PREIMAGE-SHA-256 crypto-condition that must be fulfilled to release the escrow.',
    'FINISH_AFTER': 'A timestamp (in XRPL Epoch seconds) indicating when the escrow can be claimed.',
    'CANCEL_AFTER': 'A timestamp (in XRPL Epoch seconds) after which the escrow can be cancelled and returned.',
    'OWNER': 'The XRPL address of the account that created the escrow.',
    'OFFER_SEQUENCE': 'The sequence number of the EscrowCreate transaction (found in the original creation transaction).',
    'FULFILLMENT': 'The cryptographic fulfillment (hex string) matching the escrow\'s condition.',
    'CURRENCY': 'The currency code (e.g., USD, EUR) or hex for the token.',
    'ISSUER': 'The XRPL address of the token issuer.',
    'LIMIT': 'The maximum amount of the token you trust the issuer for.',
    'TOKEN_PAIR': 'The oracle token pair to track, e.g., XRP/USD.',
    'TARGET_PRICE': 'The target price that triggers the oracle condition.',
    'MEMOS': 'An optional public memo attached to the transaction (will be hex-encoded).'
  };
  return descriptions[key] || `Please enter the ${getFriendlyFieldLabel(key)}.`;
}

function formatCurrencyCode(cur) {
  if (!cur) return '';
  cur = cur.trim();
  if (cur.length === 3 || (cur.length === 40 && /^[0-9A-Fa-f]{40}$/i.test(cur))) {
    return cur.length === 40 ? cur.toUpperCase() : cur;
  }
  let hex = '';
  for (let i = 0; i < cur.length; i++) {
    hex += cur.charCodeAt(i).toString(16);
  }
  return hex.padEnd(40, '0').toUpperCase();
}

function decodeCurrencyCode(hex) {
  if (!hex) return '';
  if (hex.length === 40 && /^[0-9A-Fa-f]{40}$/i.test(hex)) {
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
      const code = parseInt(hex.substring(i, i + 2), 16);
      if (code !== 0) {
        str += String.fromCharCode(code);
      }
    }
    if (/^[\x20-\x7E]*$/.test(str)) {
      return str.trim() || hex;
    }
  }
  return hex;
}

function syncTimedEscrowFields(e) {
  const source = e ? e.target.id : null;
  const nowMs = Date.now();
  let finishMs = null;

  // Determine finishMs based on which field was just edited, or current state
  if (source === 'escrowDurationHours') {
    const hours = parseFloat(escrowDurationHoursEl.value);
    if (!isNaN(hours) && hours > 0) {
      finishMs = nowMs + (hours * 60 * 60 * 1000);
      if (escrowFinishDatetimeEl) {
         const d = new Date(finishMs);
         const tzOffset = d.getTimezoneOffset() * 60000;
         escrowFinishDatetimeEl.value = (new Date(d - tzOffset)).toISOString().slice(0, 16);
      }
    } else {
      if (escrowFinishDatetimeEl) escrowFinishDatetimeEl.value = '';
    }
  } else if (source === 'escrowFinishDatetime') {
    if (escrowDurationHoursEl) escrowDurationHoursEl.value = ''; // clear hours to prefer exact datetime
    if (escrowFinishDatetimeEl.value) {
      const d = new Date(escrowFinishDatetimeEl.value);
      if (!isNaN(d.getTime())) finishMs = d.getTime();
    }
  } else {
    // Unrelated field edited (like CancelDatetime or initial load). Re-read from UI.
    if (escrowFinishDatetimeEl && escrowFinishDatetimeEl.value) {
      const d = new Date(escrowFinishDatetimeEl.value);
      if (!isNaN(d.getTime())) finishMs = d.getTime();
    } else if (escrowDurationHoursEl && parseFloat(escrowDurationHoursEl.value) > 0) {
      finishMs = nowMs + (parseFloat(escrowDurationHoursEl.value) * 60 * 60 * 1000);
    }
  }

  const finishAfterField = document.getElementById('field_FINISH_AFTER');
  const cancelAfterField = document.getElementById('field_CANCEL_AFTER');

  if (finishAfterField) {
    if (finishMs) {
      const d = new Date(finishMs);
      finishAfterField.value = d.toLocaleString(); // Format as human-readable day and time
      finishAfterField.readOnly = true;
      finishAfterField.classList.add('bg-light');
        
      // Auto-adjust CancelAfter visual picker to 30 days after FinishAfter
      if (cancelAfterField && escrowCancelDatetimeEl && source !== 'escrowCancelDatetime') {
        const cancelMs = finishMs + (30 * 24 * 60 * 60 * 1000); // Add 30 days
        const cd = new Date(cancelMs);
        const tzOffset = cd.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(cd - tzOffset)).toISOString().slice(0, 16);
        
        if (!escrowCancelDatetimeEl.value || escrowCancelDatetimeEl.dataset.autoFilled === escrowCancelDatetimeEl.value) {
          escrowCancelDatetimeEl.value = localISOTime;
          escrowCancelDatetimeEl.dataset.autoFilled = localISOTime;
        }
      }
    } else {
      finishAfterField.value = '';
      finishAfterField.readOnly = false;
      finishAfterField.classList.remove('bg-light');
        
      if (cancelAfterField && escrowCancelDatetimeEl && source !== 'escrowCancelDatetime') {
        if (escrowCancelDatetimeEl.dataset.autoFilled === escrowCancelDatetimeEl.value) {
          escrowCancelDatetimeEl.value = '';
          escrowCancelDatetimeEl.dataset.autoFilled = '';
        }
      }
    }
  }

  // Keep the underlying field_CANCEL_AFTER synchronized with the visual datetime picker
  if (cancelAfterField && escrowCancelDatetimeEl) {
    if (escrowCancelDatetimeEl.value) {
      const cd = new Date(escrowCancelDatetimeEl.value);
      if (!isNaN(cd.getTime())) {
        cancelAfterField.value = cd.toLocaleString();
        cancelAfterField.readOnly = true;
        cancelAfterField.classList.add('bg-light');
        // Remove autoFilled flag if user manually modified it
        if (source === 'escrowCancelDatetime') escrowCancelDatetimeEl.dataset.autoFilled = '';
        if (source) cancelAfterField.dispatchEvent(new Event('input'));
      }
    } else {
      cancelAfterField.value = '';
      cancelAfterField.readOnly = false;
      cancelAfterField.classList.remove('bg-light');
      if (source) cancelAfterField.dispatchEvent(new Event('input'));
    }
  }

  // Real-time visual validation feedback for Finish/Cancel datetime and Duration inputs
  const checkTime = Date.now();
  if (escrowDurationHoursEl) {
    const val = parseFloat(escrowDurationHoursEl.value);
    if (escrowDurationHoursEl.value) {
      if (isNaN(val) || val <= 0) {
        escrowDurationHoursEl.classList.add('is-invalid');
        escrowDurationHoursEl.classList.remove('is-valid');
      } else {
        escrowDurationHoursEl.classList.remove('is-invalid');
        escrowDurationHoursEl.classList.add('is-valid');
      }
    } else {
      escrowDurationHoursEl.classList.remove('is-invalid', 'is-valid');
    }
  }

  if (escrowFinishDatetimeEl) {
    if (escrowFinishDatetimeEl.value) {
      const fd = new Date(escrowFinishDatetimeEl.value);
      if (!isNaN(fd.getTime())) {
        if (fd.getTime() < checkTime - 60000) { // Allow 1 minute grace time
          escrowFinishDatetimeEl.classList.add('is-invalid');
          escrowFinishDatetimeEl.classList.remove('is-valid');
        } else {
          escrowFinishDatetimeEl.classList.remove('is-invalid');
          escrowFinishDatetimeEl.classList.add('is-valid');
        }
      } else {
        escrowFinishDatetimeEl.classList.remove('is-invalid', 'is-valid');
      }
    } else {
      escrowFinishDatetimeEl.classList.remove('is-invalid', 'is-valid');
    }
  }

  if (escrowCancelDatetimeEl) {
    if (escrowCancelDatetimeEl.value) {
      const cd = new Date(escrowCancelDatetimeEl.value);
      if (!isNaN(cd.getTime())) {
        const isPast = cd.getTime() < checkTime - 60000;
        const isBeforeFinish = finishMs && cd.getTime() <= finishMs;
        if (isPast || isBeforeFinish) {
          escrowCancelDatetimeEl.classList.add('is-invalid');
          escrowCancelDatetimeEl.classList.remove('is-valid');
        } else {
          escrowCancelDatetimeEl.classList.remove('is-invalid');
          escrowCancelDatetimeEl.classList.add('is-valid');
        }
      } else {
        escrowCancelDatetimeEl.classList.remove('is-invalid', 'is-valid');
      }
    } else {
      escrowCancelDatetimeEl.classList.remove('is-invalid', 'is-valid');
    }
  }
}

if (escrowDurationHoursEl) escrowDurationHoursEl.addEventListener('input', syncTimedEscrowFields);
if (escrowFinishDatetimeEl) escrowFinishDatetimeEl.addEventListener('input', syncTimedEscrowFields);
if (escrowCancelDatetimeEl) escrowCancelDatetimeEl.addEventListener('input', syncTimedEscrowFields);

// Duration Quick-Select Button Handler
function initDurationQuickSelect() {
  const buttons = document.querySelectorAll('.duration-quick-btn');
  if (buttons.length === 0) return;

  function updateActiveButton() {
    const currentValue = escrowDurationHoursEl ? parseFloat(escrowDurationHoursEl.value) : null;
    buttons.forEach(btn => {
      const btnHours = parseFloat(btn.getAttribute('data-hours'));
      btn.classList.toggle('active', currentValue === btnHours);
    });
  }

  buttons.forEach(btn => {
    // Remove any existing listeners to avoid duplicates
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const hours = parseFloat(newBtn.getAttribute('data-hours'));
      if (escrowDurationHoursEl) {
        escrowDurationHoursEl.value = hours;
        escrowDurationHoursEl.dispatchEvent(new Event('input', { bubbles: true }));
        updateActiveButton();
      }
    });
  });

  // Update active button state when duration field changes
  if (escrowDurationHoursEl) {
    escrowDurationHoursEl.addEventListener('input', updateActiveButton);
  }

  updateActiveButton();
}

function renderFields() {
  const name = templateSelectEl.value;
  const fieldsDiv = templateFieldsEl;
  
  // Safely move durationRow out before clearing fieldsDiv to prevent destruction
  const durationRow = document.getElementById('escrowDurationRow');
  if (durationRow && fieldsDiv.contains(durationRow)) {
    fieldsDiv.parentNode.insertBefore(durationRow, fieldsDiv);
  }
  
  templateDescEl.textContent = '';
  fieldsDiv.innerHTML = '';
  if (!name) {
    if (durationRow) {
      durationRow.style.display = 'none';
      escrowDurationHoursEl.value = '';
      if (escrowFinishDatetimeEl) escrowFinishDatetimeEl.value = '';
      if (escrowCancelDatetimeEl) escrowCancelDatetimeEl.value = '';
    }
    // Restore build buttons if wizard is closed
    const btnBuild = document.getElementById('buildPayload');
    const btnAddBatch = document.getElementById('addToBatchBtn');
    if (btnBuild) btnBuild.style.display = 'inline-block';
    if (btnAddBatch) btnAddBatch.style.display = 'inline-block';
    return;
  }
  const templates = window.allTemplates || {};
  const tmpl = templates[name] || {};
  templateDescEl.textContent = tmpl.description || '';
  const txjson = tmpl.txjson || {};
  const s = JSON.stringify(txjson);
  const matches = s.match(/\{\{\s*([^}]+)\s*\}\}/g) || [];
  const keys = [...new Set(matches.map(m => m.replace(/[{}]/g, '').trim()))];

  if (keys.length === 0) {
    const p = document.createElement('p');
    p.className = 'text-muted';
    p.textContent = 'No parameters required for this escrow template.';
    fieldsDiv.appendChild(p);
    return;
  }

  const frag = document.createDocumentFragment();

  // WIZARD SETUP
  const wizardContainer = document.createElement('div');
  wizardContainer.className = 'escrow-wizard mt-3';
  
  const stepHeaders = document.createElement('div');
  stepHeaders.className = 'd-flex justify-content-between mb-4 px-2 wizard-headers text-center';
  
  const allSteps = [
    { id: 'account', label: '1. Parties', keys: ['ACCOUNT', 'DESTINATION', 'DESTINATION_TAG', 'OWNER'] },
    { id: 'amount', label: '2. Amount', keys: ['AMOUNT'] },
    { id: 'dates', label: '3. Terms', keys: ['FINISH_AFTER', 'CANCEL_AFTER', 'CONDITION', 'TOKEN_PAIR', 'TARGET_PRICE', 'OFFER_SEQUENCE'] },
    { id: 'review', label: '4. Extras', keys: ['MEMOS'] }
  ];
  
  const stepBodies = document.createElement('div');
  stepBodies.className = 'wizard-bodies position-relative';
  
  const stepDivs = {};
  allSteps.forEach(step => {
    const bdy = document.createElement('div');
    bdy.className = 'wizard-step-body row g-3';
    stepDivs[step.id] = bdy;
  });
  
  const appendToStep = (key, el) => {
    const targetStep = allSteps.find(s => s.keys.includes(key)) || allSteps[3];
    stepDivs[targetStep.id].appendChild(el);
  };

  if (name === 'oracle_price_threshold') {
    const note = document.createElement('div');
    note.className = 'alert alert-info col-12';
    note.textContent = 'Automatically generate the escrow condition from the token pair and target price. The stored hash will be used to release funds when the oracle threshold is reached.';
    appendToStep('CONDITION', note);

    const pairCol = document.createElement('div');
    pairCol.className = 'col-md-6 mb-3';
    const pairLabel = document.createElement('label');
    pairLabel.className = 'form-label';
    pairLabel.innerHTML = `<strong>TOKEN_PAIR</strong> <i class="bi bi-info-circle ms-1 text-muted" data-bs-toggle="tooltip" title="${getFieldDescription('TOKEN_PAIR')}" style="cursor: help;"></i>`;
    const pairInput = document.createElement('input');
    pairInput.type = 'text';
    pairInput.id = 'field_TOKEN_PAIR';
    pairInput.className = 'form-control';
    pairInput.placeholder = 'Enter token pair (e.g. XRP/USD)';
    pairCol.appendChild(pairLabel);
    pairCol.appendChild(pairInput);
    appendToStep('TOKEN_PAIR', pairCol);

    const priceCol = document.createElement('div');
    priceCol.className = 'col-md-6 mb-3';
    const priceLabel = document.createElement('label');
    priceLabel.className = 'form-label';
    priceLabel.innerHTML = `<strong>TARGET_PRICE</strong> <i class="bi bi-info-circle ms-1 text-muted" data-bs-toggle="tooltip" title="${getFieldDescription('TARGET_PRICE')}" style="cursor: help;"></i>`;
    const priceInput = document.createElement('input');
    priceInput.type = 'text';
    priceInput.id = 'field_TARGET_PRICE';
    priceInput.className = 'form-control';
    priceInput.placeholder = 'Enter target price (e.g. 1.50)';
    priceCol.appendChild(priceLabel);
    priceCol.appendChild(priceInput);
    appendToStep('TARGET_PRICE', priceCol);
  }

  for (const k of keys) {
    if (name === 'oracle_price_threshold' && k === 'CONDITION') continue;
    
    const safeId = sanitizeId(k);

    // Hide specific fields from the UI but keep them in the DOM for payload generation
    if (k === 'FINISH_AFTER' || k === 'CANCEL_AFTER' || (k === 'CONDITION' && name !== 'conditional_escrow_create')) {
      const hiddenInput = document.createElement('input');
      hiddenInput.type = 'hidden';
      hiddenInput.id = safeId;
      appendToStep(k, hiddenInput);
      continue;
    }

    const isRequired = ['ACCOUNT', 'DESTINATION', 'AMOUNT', 'OWNER'].includes(k);
    const col = document.createElement('div');
    col.className = 'col-md-6 mb-3 position-relative';
    const label = document.createElement('label');
    label.className = 'form-label';
    const friendlyLabel = getFriendlyFieldLabel(k);
    // Add asterisk and tooltip for required fields
    let requiredHtml = isRequired ? `<span class="text-danger" data-bs-toggle="tooltip" title="This field is required">*</span>` : '';
    label.innerHTML = `<strong>${friendlyLabel}</strong> ${requiredHtml} <i class="bi bi-info-circle ms-1 text-muted" data-bs-toggle="tooltip" title="${getFieldDescription(k)}" style="cursor: help;"></i>`;
    col.appendChild(label);

    // Helper text
    const helper = document.createElement('div');
    helper.className = 'form-text text-muted mb-1';
    helper.textContent = getFieldDescription(k);
    col.appendChild(helper);

    // Special handling for AMOUNT and MEMOS
    if (k === 'AMOUNT') {
      const hiddenInput = document.createElement('input');
      hiddenInput.type = 'hidden';
      hiddenInput.id = safeId;
      col.appendChild(hiddenInput);

      const typeSelect = document.createElement('select');
      typeSelect.className = 'form-select mb-2';
      typeSelect.id = 'field_AMOUNT_TYPE';
      typeSelect.innerHTML = '<option value="XRP">XRP (Native)</option><option value="TOKEN">Issued Token (IOU)</option><option value="MPT">Multi-Purpose Token (MPT)</option>';
      col.appendChild(typeSelect);

      const xrpGroup = document.createElement('div');
      xrpGroup.className = 'xrp-group';
      const xrpInput = document.createElement('input');
      xrpInput.type = 'number';
      xrpInput.className = 'form-control';
      xrpInput.placeholder = 'Amount in drops (e.g., 1000000 for 1 XRP)';
      xrpGroup.appendChild(xrpInput);

      const xrpHelp = document.createElement('small');
      xrpHelp.className = 'text-info d-block mt-1 fw-semibold';
      xrpGroup.appendChild(xrpHelp);

      xrpInput.addEventListener('input', () => {
        const val = parseFloat(xrpInput.value);
        if (!isNaN(val) && val > 0) {
          xrpHelp.textContent = `Equivalent to: ${(val / 1000000).toLocaleString(undefined, {maximumFractionDigits: 6})} XRP`;
        } else {
          xrpHelp.textContent = '';
        }
      });

      const presetsDiv = document.createElement('div');
      presetsDiv.className = 'd-flex flex-wrap gap-2 mt-2 mb-2';
      [1, 10, 100, 1000].forEach(p => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm btn-outline-secondary px-3 py-1';
        btn.textContent = `${p} XRP`;
        btn.addEventListener('click', () => {
          xrpInput.value = p * 1000000;
          xrpInput.dispatchEvent(new Event('input'));
          xrpInput.dispatchEvent(new Event('blur'));
        });
        presetsDiv.appendChild(btn);
      });
      xrpGroup.appendChild(presetsDiv);
      col.appendChild(xrpGroup);

      const tokenGroup = document.createElement('div');
      tokenGroup.className = 'token-group row g-2';
      tokenGroup.style.display = 'none';

      // Smart Token Presets Picker Row
      const presetsCol = document.createElement('div');
      presetsCol.className = 'col-12 mb-1';
      const presetsBar = document.createElement('div');
      presetsBar.className = 'd-flex flex-wrap gap-1 align-items-center bg-light p-2 rounded border';
      presetsBar.innerHTML = '<small class="text-muted fw-bold me-2"><i class="bi bi-tags"></i> Token Presets:</small>';

      const TOKEN_PRESETS = [
        { name: 'RLUSD (Testnet)', currency: 'RLU', issuer: 'rQh82YKiEBBUJrxYLsLs32cB271F24Z5F3' },
        { name: 'RLUSD (Mainnet)', currency: '524C555344000000000000000000000000000000', issuer: 'rMxouZkuiKo7BYd3nnzhW4g5tZpJwVnGry' }
      ];

      TOKEN_PRESETS.forEach(p => {
        const badge = document.createElement('button');
        badge.type = 'button';
        badge.className = 'btn btn-xs btn-outline-info py-0 px-2 rounded-pill fw-medium';
        badge.style.fontSize = '0.68rem';
        badge.textContent = p.name;
        badge.title = `Fill ${p.name}`;
        badge.addEventListener('click', (e) => {
          e.preventDefault();
          tokenCurInput.value = p.currency;
          tokenIssInput.value = p.issuer;
          tokenCurInput.dispatchEvent(new Event('input', { bubbles: true }));
          tokenIssInput.dispatchEvent(new Event('input', { bubbles: true }));
          tokenCurInput.dispatchEvent(new Event('blur', { bubbles: true }));
          tokenIssInput.dispatchEvent(new Event('blur', { bubbles: true }));
        });
        presetsBar.appendChild(badge);
      });
      presetsCol.appendChild(presetsBar);
      tokenGroup.appendChild(presetsCol);

      const tokenValCol = document.createElement('div');
      tokenValCol.className = 'col-md-4 col-xl-3';
      const tokenValInput = document.createElement('input');
      tokenValInput.type = 'text';
      tokenValInput.className = 'form-control';
      tokenValInput.placeholder = 'Amount';
      tokenValCol.appendChild(tokenValInput);

      // Amount Presets for Token
      const tokenValPresets = document.createElement('div');
      tokenValPresets.className = 'd-flex flex-wrap gap-1 mt-1';
      [10, 100, 1000, 10000].forEach(p => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-xs btn-outline-secondary py-0 px-2 rounded';
        btn.style.fontSize = '0.7rem';
        btn.textContent = `${p}`;
        btn.addEventListener('click', () => {
          tokenValInput.value = String(p);
          tokenValInput.dispatchEvent(new Event('input', { bubbles: true }));
          tokenValInput.dispatchEvent(new Event('blur', { bubbles: true }));
        });
        tokenValPresets.appendChild(btn);
      });
      tokenValCol.appendChild(tokenValPresets);

      const tokenCurCol = document.createElement('div');
      tokenCurCol.className = 'col-md-4 col-xl-3';
      const tokenCurInput = document.createElement('input');
      tokenCurInput.type = 'text';
      tokenCurInput.className = 'form-control';
      tokenCurInput.id = 'field_AMOUNT_CURRENCY';
      tokenCurInput.placeholder = 'Currency Code';
      
      const curListId = 'popular_amount_currencies';
      const curDatalist = document.createElement('datalist');
      curDatalist.id = curListId;
      const popularCurs = ['RLU', 'USD', 'EUR', 'SOLO', 'CORE', '524C555344000000000000000000000000000000'];
      popularCurs.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        curDatalist.appendChild(opt);
      });
      tokenCurInput.setAttribute('list', curListId);
      tokenCurCol.appendChild(tokenCurInput);
      tokenCurCol.appendChild(curDatalist);

      const tokenIssCol = document.createElement('div');
      tokenIssCol.className = 'col-md-4 col-xl-5';
      const tokenIssInput = document.createElement('input');
      tokenIssInput.type = 'text';
      tokenIssInput.className = 'form-control';
      tokenIssInput.id = 'field_AMOUNT_ISSUER';
      tokenIssInput.placeholder = 'Issuer r-Address';

      const issListId = 'history_AMOUNT_ISSUER';
      const issDatalist = document.createElement('datalist');
      issDatalist.id = issListId;
      const addrHistory = JSON.parse(localStorage.getItem('xrplAddressHistory') || '[]');
      addrHistory.forEach(addr => {
        const opt = document.createElement('option');
        opt.value = addr;
        issDatalist.appendChild(opt);
      });
      tokenIssInput.setAttribute('list', issListId);
      tokenIssCol.appendChild(tokenIssInput);
      tokenIssCol.appendChild(issDatalist);

      const tokenSearchCol = document.createElement('div');
      tokenSearchCol.className = 'col-md-12 col-xl-1 mt-2 mt-xl-0 d-flex align-items-end';
      const tokenSearchBtn = document.createElement('button');
      tokenSearchBtn.type = 'button';
      tokenSearchBtn.className = 'btn btn-outline-primary w-100';
      tokenSearchBtn.title = 'Lookup Token';
      tokenSearchBtn.innerHTML = '<i class="bi bi-search"></i>';
      tokenSearchBtn.addEventListener('click', () => {
        window.activeTokenTarget = { curInput: tokenCurInput, issInput: tokenIssInput };
        const modalEl = document.getElementById('tokenSearchModal');
        if (modalEl) {
          const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
          modal.show();
          setTimeout(() => document.getElementById('tokenSearchInput').focus(), 500);
        }
      });
      tokenSearchCol.appendChild(tokenSearchBtn);

      // Create Trustlines Dropdown element
      const trustlinesCol = document.createElement('div');
      trustlinesCol.className = 'col-12 mb-2 trustlines-dropdown-container';
      trustlinesCol.style.display = 'none';
      const trustlinesLabel = document.createElement('label');
      trustlinesLabel.className = 'form-label small fw-bold text-secondary mb-1';
      trustlinesLabel.innerHTML = '<i class="bi bi-wallet2"></i> Select from connected wallet trustlines:';
      const trustlinesSelect = document.createElement('select');
      trustlinesSelect.className = 'form-select form-select-sm trustlines-select';
      trustlinesCol.appendChild(trustlinesLabel);
      trustlinesCol.appendChild(trustlinesSelect);
      tokenGroup.appendChild(trustlinesCol);
      
      // Populate it immediately if trustlines are loaded
      populateTrustlinesDropdown(trustlinesSelect, tokenCurInput, tokenIssInput);

      // Listen for events to show the badge
      tokenCurInput.addEventListener('input', () => {
        fetchAndShowTokenBadge(tokenGroup, tokenCurInput.value.trim(), tokenIssInput.value.trim());
      });
      tokenIssInput.addEventListener('input', () => {
        fetchAndShowTokenBadge(tokenGroup, tokenCurInput.value.trim(), tokenIssInput.value.trim());
      });

      tokenGroup.appendChild(tokenValCol);
      tokenGroup.appendChild(tokenCurCol);
      tokenGroup.appendChild(tokenIssCol);
      tokenGroup.appendChild(tokenSearchCol);
      col.appendChild(tokenGroup);

      const mptGroup = document.createElement('div');
      mptGroup.className = 'mpt-group row g-2';
      mptGroup.style.display = 'none';

      const mptValCol = document.createElement('div');
      mptValCol.className = 'col-md-4';
      const mptValInput = document.createElement('input');
      mptValInput.type = 'text';
      mptValInput.className = 'form-control';
      mptValInput.placeholder = 'MPT Amount (Integer)';
      mptValCol.appendChild(mptValInput);

      // Amount Presets for MPT
      const mptValPresets = document.createElement('div');
      mptValPresets.className = 'd-flex flex-wrap gap-1 mt-1';
      [1, 5, 10, 50, 100].forEach(p => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-xs btn-outline-secondary py-0 px-2 rounded';
        btn.style.fontSize = '0.7rem';
        btn.textContent = `${p}`;
        btn.addEventListener('click', () => {
          mptValInput.value = String(p);
          mptValInput.dispatchEvent(new Event('input', { bubbles: true }));
          mptValInput.dispatchEvent(new Event('blur', { bubbles: true }));
        });
        mptValPresets.appendChild(btn);
      });
      mptValCol.appendChild(mptValPresets);

      const mptIdCol = document.createElement('div');
      mptIdCol.className = 'col-md-8';
      const mptIdInput = document.createElement('input');
      mptIdInput.type = 'text';
      mptIdInput.className = 'form-control';
      mptIdInput.id = 'field_AMOUNT_MPT_ID';
      mptIdInput.placeholder = 'MPT Issuance ID';
      mptIdCol.appendChild(mptIdInput);

      mptGroup.appendChild(mptValCol);
      mptGroup.appendChild(mptIdCol);
      col.appendChild(mptGroup);

      const syncAmount = () => {
        if (typeSelect.value === 'XRP') {
          hiddenInput.value = xrpInput.value.trim();
        } else if (typeSelect.value === 'TOKEN') {
          const val = tokenValInput.value.trim();
          const cur = formatCurrencyCode(tokenCurInput.value.trim()); // Enforce XRPL format immediately
          const iss = tokenIssInput.value.trim();
          if (val || cur || iss) {
            hiddenInput.value = JSON.stringify({ value: val, currency: cur, issuer: iss });
          } else {
            hiddenInput.value = '';
          }
        } else if (typeSelect.value === 'MPT') {
          const val = mptValInput.value.trim();
          const mptId = mptIdInput.value.trim();
          if (val || mptId) {
            hiddenInput.value = JSON.stringify({ amount: val, mpt_issuance_id: mptId });
          } else {
            hiddenInput.value = '';
          }
        }
      };

      typeSelect.addEventListener('change', () => {
        if (typeSelect.value === 'XRP') {
          xrpGroup.style.display = 'block';
          tokenGroup.style.display = 'none';
          mptGroup.style.display = 'none';
        } else if (typeSelect.value === 'TOKEN') {
          xrpGroup.style.display = 'none';
          tokenGroup.style.display = 'flex';
          mptGroup.style.display = 'none';
        } else if (typeSelect.value === 'MPT') {
          xrpGroup.style.display = 'none';
          tokenGroup.style.display = 'none';
          mptGroup.style.display = 'flex';
        }
        syncAmount();
      });

      xrpInput.addEventListener('input', syncAmount);
      tokenValInput.addEventListener('input', syncAmount);
      tokenCurInput.addEventListener('input', syncAmount);
      tokenIssInput.addEventListener('input', syncAmount);
      mptValInput.addEventListener('input', syncAmount);
      mptIdInput.addEventListener('input', syncAmount);

      [xrpInput, tokenValInput, tokenCurInput, tokenIssInput, mptValInput, mptIdInput].forEach(inp => {
        if (!inp) return;
        
        // Real-time validation as user types
        inp.addEventListener('input', () => {
          inp.classList.remove('is-invalid');
          removeValidCheck(inp);
          
          // Validate issuer address in real-time
          if (inp === tokenIssInput) {
            const addr = inp.value.trim();
            if (addr.length >= 25 && isValidXRPLAddressFormat(addr)) {
              inp.classList.add('is-valid');
              showValidCheck(inp);
              recordAddressInHistory(addr);
            }
          }
          // Validate XRP amount
          else if (inp === xrpInput && inp.value.trim()) {
            if (/^\d+$/.test(inp.value.trim()) && parseInt(inp.value) > 0) {
              inp.classList.add('is-valid');
              showValidCheck(inp);
            }
          }
          // Validate token amount
          else if (inp === tokenValInput && inp.value.trim()) {
            if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(inp.value.trim())) {
              inp.classList.add('is-valid');
              showValidCheck(inp);
            }
          }
          // Validate MPT ID
          else if (inp === mptIdInput && inp.value.trim()) {
            inp.classList.add('is-valid');
            showValidCheck(inp);
          }
          // Validate MPT Amount
          else if (inp === mptValInput && inp.value.trim()) {
            if (/^\d+$/.test(inp.value.trim()) && parseInt(inp.value) >= 0) {
              inp.classList.add('is-valid');
              showValidCheck(inp);
            }
          }
        });
        
        inp.addEventListener('blur', () => {
          if (typeSelect.value === 'XRP') {
            if (!xrpInput.value.trim()) {
              xrpInput.classList.add('is-invalid');
              setFieldError(xrpInput, 'Amount is required.');
            } else if (/^\d+$/.test(xrpInput.value.trim()) && parseInt(xrpInput.value) > 0) {
              xrpInput.classList.add('is-valid');
              showValidCheck(xrpInput);
            } else {
              xrpInput.classList.add('is-invalid');
              setFieldError(xrpInput, 'Amount must be a positive integer (drops).');
            }
          } else if (typeSelect.value === 'TOKEN') {
            [tokenValInput, tokenCurInput, tokenIssInput].forEach(ti => {
              if (!ti.value.trim()) {
                ti.classList.add('is-invalid');
                setFieldError(ti, 'Token details are required.');
              } else if (ti === tokenIssInput) {
                if (isValidXRPLAddressFormat(ti.value.trim())) {
                  ti.classList.add('is-valid');
                  showValidCheck(ti);
                  recordAddressInHistory(ti.value.trim());
                } else {
                  ti.classList.add('is-invalid');
                  setFieldError(ti, 'Invalid issuer address format.');
                }
              } else {
                ti.classList.add('is-valid');
                showValidCheck(ti);
              }
            });
          } else if (typeSelect.value === 'MPT') {
            [mptValInput, mptIdInput].forEach(ti => {
              if (!ti.value.trim()) {
                ti.classList.add('is-invalid');
                setFieldError(ti, 'MPT details are required.');
              } else if (ti === mptValInput && !/^\d+$/.test(ti.value.trim())) {
                ti.classList.add('is-invalid');
                setFieldError(ti, 'MPT amount must be a positive integer.');
              } else {
                ti.classList.add('is-valid');
                showValidCheck(ti);
              }
            });
          }
        });
      });
      appendToStep(k, col);
      continue;
    }

    if (k === 'MEMOS') {
      const visibleInput = document.createElement('input');
      visibleInput.type = 'text';
      visibleInput.className = 'form-control';
      visibleInput.placeholder = 'Enter plain text memo (will be hex-encoded)';
      col.appendChild(visibleInput);
      
      const hiddenInput = document.createElement('input');
      hiddenInput.type = 'hidden';
      hiddenInput.id = safeId;
      col.appendChild(hiddenInput);

      visibleInput.addEventListener('input', () => {
        const val = visibleInput.value.trim();
        if (val) {
          const hex = Array.from(new TextEncoder().encode(val))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('').toUpperCase();
          hiddenInput.value = JSON.stringify([{ Memo: { MemoData: hex } }]);
        } else {
          hiddenInput.value = '';
        }
      });

      visibleInput.addEventListener('blur', () => {
        if (visibleInput.value.trim()) {
          visibleInput.classList.remove('is-invalid');
          showValidCheck(visibleInput);
        }
      });
      appendToStep(k, col);
      continue;
    }

    // Default input
    const input = document.createElement('input');
    input.type = 'text';
    input.id = safeId;
    input.className = 'form-control';
    input.placeholder = 'Enter ' + friendlyLabel;

    // Auto-fill connected account if available
    if ((k === 'ACCOUNT' || k === 'OWNER') && window.connectedAccount) {
      input.value = window.connectedAccount;
      input.classList.add('is-valid');
      setTimeout(() => {
        showValidCheck(input);
      }, 50);
    }

    // Address autocomplete history
    if (['ACCOUNT', 'DESTINATION', 'OWNER', 'ISSUER'].some(key => sanitizeId(key) === input.id)) {
      const listId = input.id + '_history';
      const datalist = document.createElement('datalist');
      datalist.id = listId;
      const history = JSON.parse(localStorage.getItem('xrplAddressHistory') || '[]');
      history.forEach(addr => {
        const opt = document.createElement('option');
        opt.value = addr;
        datalist.appendChild(opt);
      });
      input.setAttribute('list', listId);
      col.appendChild(datalist);
    }

    // Special popular currencies autocomplete list & preset badges for CURRENCY fields
    if (k === 'CURRENCY') {
      const curListId = 'popular_currencies_autocomplete';
      const curDatalist = document.createElement('datalist');
      curDatalist.id = curListId;
      const popularCurs = ['RLU', 'USD', 'EUR', 'SOLO', 'CORE', '524C555344000000000000000000000000000000'];
      popularCurs.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        curDatalist.appendChild(opt);
      });
      input.setAttribute('list', curListId);
      col.appendChild(curDatalist);

      const presetsBar = document.createElement('div');
      presetsBar.className = 'd-flex flex-wrap gap-1 align-items-center bg-body-tertiary p-2 rounded border mt-2';
      presetsBar.innerHTML = '<small class="text-muted fw-bold me-2"><i class="bi bi-tags"></i> Presets:</small>';

      const presets = [
        { name: 'RLUSD (Testnet)', currency: 'RLU', issuer: 'rQh82YKiEBBUJrxYLsLs32cB271F24Z5F3' },
        { name: 'RLUSD (Mainnet)', currency: '524C555344000000000000000000000000000000', issuer: 'rMxouZkuiKo7BYd3nnzhW4g5tZpJwVnGry' }
      ];

      presets.forEach(p => {
        const badge = document.createElement('button');
        badge.type = 'button';
        badge.className = 'btn btn-xs btn-outline-info py-0 px-2 rounded-pill fw-medium';
        badge.style.fontSize = '0.68rem';
        badge.textContent = p.name;
        badge.addEventListener('click', (e) => {
          e.preventDefault();
          input.value = p.currency;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('blur', { bubbles: true }));
          
          const issInp = document.getElementById('field_ISSUER');
          if (issInp) {
            issInp.value = p.issuer;
            issInp.dispatchEvent(new Event('input', { bubbles: true }));
            issInp.dispatchEvent(new Event('blur', { bubbles: true }));
          }
        });
        presetsBar.appendChild(badge);
      });
      col.appendChild(presetsBar);
    }

    // Remove validation error border on input
    input.addEventListener('input', () => {
      input.classList.remove('is-invalid');
      removeValidCheck(input);
      
      // Real-time validation for fields
      if (['ACCOUNT', 'DESTINATION', 'OWNER', 'AMOUNT_ISSUER', 'ISSUER'].some(k => sanitizeId(k) === input.id)) {
        const addr = input.value.trim();
        if (addr.length >= 25 && isValidXRPLAddressFormat(addr)) {
          input.classList.add('is-valid');
          showValidCheck(input);
          recordAddressInHistory(addr);
        } else if (addr.length > 0) {
          input.classList.remove('is-valid');
        }
      } else if (input.id === 'field_CONDITION') {
        const hexVal = input.value.trim();
        if (/^[0-9a-fA-F]{64,128}$/.test(hexVal) && hexVal.length % 2 === 0) {
          input.classList.add('is-valid');
          showValidCheck(input);
        } else {
          input.classList.remove('is-valid');
        }
      } else if (input.id === 'field_FULFILLMENT') {
        const hexVal = input.value.trim();
        if (/^[0-9a-fA-F]{2,256}$/.test(hexVal) && hexVal.length % 2 === 0) {
          input.classList.add('is-valid');
          showValidCheck(input);
        } else {
          input.classList.remove('is-valid');
        }
      } else if (input.id === 'field_CURRENCY') {
        const curVal = input.value.trim();
        if (curVal.length === 3 || (curVal.length === 40 && /^[0-9a-fA-F]{40}$/.test(curVal))) {
          input.classList.add('is-valid');
          showValidCheck(input);
        } else {
          input.classList.remove('is-valid');
        }
      }
    });

    // Inline validation on blur
    input.addEventListener('blur', () => {
      if (isRequired && !input.value.trim()) {
        input.classList.add('is-invalid');
        setFieldError(input, `${friendlyLabel} is required.`);
      } else if (input.value.trim()) {
        const addr = input.value.trim();
        // Validate format based on field type
        if (['ACCOUNT', 'DESTINATION', 'OWNER', 'AMOUNT_ISSUER', 'ISSUER'].some(k => sanitizeId(k) === input.id)) {
          if (isValidXRPLAddressFormat(addr)) {
            input.classList.add('is-valid');
            showValidCheck(input);
            recordAddressInHistory(addr);
          } else {
            input.classList.add('is-invalid');
            setFieldError(input, `Invalid XRPL address format. Must be 25-34 characters starting with 'r'.`);
          }
        } else if (input.id === 'field_CONDITION') {
          const hexVal = input.value.trim();
          if (/^[0-9a-fA-F]{64,128}$/.test(hexVal) && hexVal.length % 2 === 0) {
            input.classList.add('is-valid');
            showValidCheck(input);
          } else {
            input.classList.add('is-invalid');
            setFieldError(input, 'Condition must be a valid hex string between 64 and 128 characters (even length).');
          }
        } else if (input.id === 'field_FULFILLMENT') {
          const hexVal = input.value.trim();
          if (/^[0-9a-fA-F]{2,256}$/.test(hexVal) && hexVal.length % 2 === 0) {
            input.classList.add('is-valid');
            showValidCheck(input);
          } else {
            input.classList.add('is-invalid');
            setFieldError(input, 'Fulfillment must be a valid hex string between 2 and 256 characters (even length).');
          }
        } else if (input.id === 'field_CURRENCY') {
          const curVal = input.value.trim();
          if (curVal.length === 3 || (curVal.length === 40 && /^[0-9a-fA-F]{40}$/.test(curVal))) {
            input.classList.add('is-valid');
            showValidCheck(input);
          } else {
            input.classList.add('is-invalid');
            setFieldError(input, 'Currency must be a 3-character code (e.g. USD) or 40-character hex string.');
          }
        } else {
          input.classList.remove('is-invalid');
          showValidCheck(input);
        }
      }
    });

    col.appendChild(input);
    appendToStep(k, col);
  }

  // Helper functions for valid/invalid UI
  function setFieldError(inputEl, msg) {
    if (!inputEl) return;
    inputEl.classList.add('is-invalid');
    let feedbackEl = inputEl.parentNode.querySelector('.invalid-feedback');
    if (!feedbackEl) {
      feedbackEl = document.createElement('div');
      feedbackEl.className = 'invalid-feedback';
      inputEl.parentNode.appendChild(feedbackEl);
    }
    feedbackEl.textContent = msg;
  }

  function showValidCheck(inputEl) {
    removeValidCheck(inputEl);
    const check = document.createElement('span');
    check.className = 'valid-check position-absolute top-0 end-0 mt-2 me-2 text-success';
    check.innerHTML = '<i class="bi bi-check-circle-fill"></i>';
    inputEl.parentNode.appendChild(check);
  }

  function removeValidCheck(inputEl) {
    const check = inputEl.parentNode.querySelector('.valid-check');
    if (check) check.remove();
  }

  if (name === 'drop_tool') {
    const csvCol = document.createElement('div');
    csvCol.className = 'col-12 mt-3 mb-2';

    const card = document.createElement('div');
    card.className = 'card bg-body-tertiary border-0 shadow-sm';
    card.innerHTML = `
      <div class="card-body">
        <h6 class="card-title fw-bold"><i class="bi bi-filetype-csv text-primary"></i> Batch Drop via CSV Upload</h6>
        <p class="card-text text-muted small mb-3">
          Automatically queue up to 50 recipients to process sequentially. <br>
          <strong>Required:</strong> <code>destination</code>, <code>amount</code><br>
          <strong>Optional:</strong> <code>currency</code>, <code>issuer</code> (for IOUs), <code>memos</code>
        </p>
        <input type="file" id="dropCsvUpload" accept=".csv" class="form-control form-control-sm">
      </div>
    `;
    
    const fileInput = card.querySelector('#dropCsvUpload');
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const accountInput = document.getElementById('field_ACCOUNT');
      const account = (accountInput && accountInput.value.trim()) || window.connectedAccount || '';
      if (!account) {
        showAlert('Please enter your Account (rAddress) first or connect Xaman.', 'warning');
        e.target.value = '';
        return;
      }

      try {
        const text = await file.text();
        
        // Helper to parse CSV lines safely with quotes
        const parseCSVLine = (str) => {
          const arr = [];
          let quote = false, col = '';
          for (let i = 0; i < str.length; i++) {
            let cc = str[i], nc = str[i+1];
            if (cc === '"' && quote && nc === '"') { col += cc; ++i; continue; }
            if (cc === '"') { quote = !quote; continue; }
            if (cc === ',' && !quote) { arr.push(col.trim()); col = ''; continue; }
            col += cc;
          }
          arr.push(col.trim());
          return arr;
        };

        const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
        if (lines.length < 2) throw new Error("CSV is empty or missing headers.");
        
        const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
        const destIdx = headers.indexOf('destination');
        const amtIdx = headers.indexOf('amount');
        const curIdx = headers.indexOf('currency');
        const issIdx = headers.indexOf('issuer');
        const memoIdx = headers.indexOf('memos');
        const mptIdx = headers.indexOf('mpt_issuance_id');

        if (destIdx === -1 || amtIdx === -1) {
          throw new Error("CSV must contain 'destination' and 'amount' columns.");
        }

        let added = 0;
        for (let i = 1; i < lines.length; i++) {
          if (window.batchTransactions.length >= 50) {
            showAlert('Max 50 transactions allowed per queue. Truncating remaining rows.', 'warning');
            break;
          }
          
          const cols = parseCSVLine(lines[i]);
          let destRaw = cols[destIdx];
          const amt = cols[amtIdx];
          if (!destRaw || !amt) continue;

          // Automatically separate Destination Tags if the user passed format "rAddress:12345"
          let dest = destRaw.trim();
          let dTag = undefined;
          if (dest.includes(':')) {
            const parts = dest.split(':');
            dest = parts[0].trim();
            if (parts[1] && !isNaN(parts[1])) {
              dTag = parseInt(parts[1].trim(), 10);
            }
          }

          let amountObj = amt;
          
          // If MPT ID is present, format as a Multi-Purpose Token
          if (mptIdx !== -1 && cols[mptIdx]) {
            amountObj = {
              mpt_issuance_id: cols[mptIdx].trim(),
              amount: String(amt)
            };
          }
          // Else if currency and issuer exist, treat as issued token (IOU)
          else if (curIdx !== -1 && issIdx !== -1 && cols[curIdx] && cols[issIdx]) {
            const formattedCur = formatCurrencyCode(cols[curIdx].trim());
            const issuerStr = cols[issIdx].trim();
            amountObj = {
              currency: formattedCur,
              issuer: issuerStr,
              value: String(amt)
            };
            
            // Check trustline proactively
            if (dest !== issuerStr) {
              try {
                const tlResp = await fetch(`/check_trustline/${encodeURIComponent(dest)}/${encodeURIComponent(issuerStr)}/${encodeURIComponent(formattedCur)}`);
                if (tlResp.ok) {
                   const tlData = await tlResp.json();
                   if (!tlData.has_trustline) {
                        const errReason = tlData.error ? `Error: ${tlData.error}` : `Destination ${dest} does not have a trustline for ${formattedCur} from ${issuerStr}.`;
                        throw new Error(errReason);
                   }
                }
              } catch (err) {
                 throw new Error(`Row ${i} failed: ` + err.message);
              }
            }
          }

          const tx = {
            TransactionType: "Payment",
            Account: account,
            Destination: dest,
            Amount: amountObj,
            _templateName: 'token_payment',
            _formParams: {
               ACCOUNT: account,
               DESTINATION: dest,
               AMOUNT: typeof amountObj === 'string' ? amountObj : JSON.stringify(amountObj)
            }
          };

          if (dTag !== undefined) {
            tx.DestinationTag = dTag;
            tx._formParams.DESTINATION_TAG = String(dTag);
          }

          if (memoIdx !== -1 && cols[memoIdx]) {
            const hex = Array.from(new TextEncoder().encode(cols[memoIdx]))
              .map(b => b.toString(16).padStart(2, '0'))
              .join('').toUpperCase();
            tx.Memos = [{ Memo: { MemoData: hex } }];
            tx._formParams.MEMOS = JSON.stringify(tx.Memos);
          }

          window.batchTransactions.push(tx);
          added++;
        }
        
        if (added > 0) {
          updateBatchUI();
          showAlert(`Queued ${added} transactions from CSV.`, 'success');
        } else {
          showAlert('No valid rows found to queue.', 'warning');
        }
      } catch (err) {
        showAlert('CSV Error: ' + err.message, 'error');
      } finally {
        e.target.value = '';
      }
    });

    csvCol.appendChild(card);
    appendToStep('ACCOUNT', csvCol);
  }

  if (durationRow) {
    if (tmpl.escrow_type === 'timed' || keys.includes('FINISH_AFTER') || keys.includes('CANCEL_AFTER')) {
      durationRow.style.display = 'block';
      durationRow.className = 'col-12 mt-3'; // Ensure it spans the row
      appendToStep('FINISH_AFTER', durationRow);
      
      // Auto-prefill default duration of 24h if empty
      if (!escrowDurationHoursEl.value && (!escrowFinishDatetimeEl || !escrowFinishDatetimeEl.value)) {
        escrowDurationHoursEl.value = '24';
        setTimeout(() => {
          escrowDurationHoursEl.dispatchEvent(new Event('input', { bubbles: true }));
        }, 50);
      }
    } else {
      durationRow.style.display = 'none';
      escrowDurationHoursEl.value = '';
      if (escrowFinishDatetimeEl) escrowFinishDatetimeEl.value = '';
      fieldsDiv.parentNode.insertBefore(durationRow, fieldsDiv);
    }
  }
  
  // Filter out any steps that don't have inputs required for this specific template
  const activeSteps = allSteps.filter(step => stepDivs[step.id].children.length > 0);
  activeSteps.forEach((step, idx) => {
    step.displayLabel = `${idx + 1}. ${step.label.split('. ')[1]}`;
    
    const hdr = document.createElement('div');
    hdr.className = `wizard-header-item flex-fill pb-2 border-bottom px-1 px-sm-2 ${idx === 0 ? 'text-primary fw-bold border-primary' : 'text-muted'}`;
    hdr.style.transition = 'all 0.3s ease';
    hdr.style.fontSize = 'clamp(0.75rem, 2.5vw, 1rem)'; // Ensure text scales cleanly on mobile devices
    hdr.textContent = step.displayLabel;
    stepHeaders.appendChild(hdr);

    const bdy = stepDivs[step.id];
    bdy.style.display = idx === 0 ? 'flex' : 'none';
    stepBodies.appendChild(bdy);
  });

  wizardContainer.appendChild(stepHeaders);
  wizardContainer.appendChild(stepBodies);

  // WIZARD NAVIGATION CONTROLS
  const wizardNav = document.createElement('div');
  wizardNav.className = 'd-flex justify-content-between mt-4 border-top pt-3';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn btn-outline-secondary';
  prevBtn.innerHTML = '<i class="bi bi-arrow-left"></i> Back';
  prevBtn.style.visibility = 'hidden';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn btn-primary px-4';
  nextBtn.innerHTML = 'Next <i class="bi bi-arrow-right"></i>';

  let currentStepIdx = 0;
  const btnBuild = document.getElementById('buildPayload');
  const btnAddBatch = document.getElementById('addToBatchBtn');

  const updateWizardNav = () => {
    Array.from(stepHeaders.children).forEach((hdr, idx) => {
      hdr.className = `wizard-header-item flex-fill pb-2 border-bottom ${idx === currentStepIdx ? 'text-primary fw-bold border-primary' : (idx < currentStepIdx ? 'text-body border-secondary' : 'text-muted')}`;
    });

    Array.from(stepBodies.children).forEach((bdy, idx) => {
      bdy.style.display = idx === currentStepIdx ? 'flex' : 'none';
    });

    prevBtn.style.visibility = currentStepIdx === 0 ? 'hidden' : 'visible';

    // Only show submission buttons on the final step
    if (currentStepIdx === activeSteps.length - 1 || activeSteps.length === 0) {
      nextBtn.style.display = 'none';
      if (btnBuild) btnBuild.style.display = 'inline-block';
      if (btnAddBatch) btnAddBatch.style.display = 'inline-block';
    } else {
      nextBtn.style.display = 'inline-block';
      if (btnBuild) btnBuild.style.display = 'none';
      if (btnAddBatch) btnAddBatch.style.display = 'none';
    }
  };

  prevBtn.addEventListener('click', () => {
    if (currentStepIdx > 0) currentStepIdx--;
    updateWizardNav();
  });

  nextBtn.addEventListener('click', () => {
    if (currentStepIdx < activeSteps.length - 1) currentStepIdx++;
    updateWizardNav();
  });

  wizardNav.appendChild(prevBtn);
  wizardNav.appendChild(nextBtn);
  wizardContainer.appendChild(wizardNav);

  frag.appendChild(wizardContainer);
  fieldsDiv.appendChild(frag);

  // Init nav state
  updateWizardNav();
  
  if (tmpl.escrow_type === 'timed') {
    syncTimedEscrowFields();
  }

  // --- Dynamic Trustline Indicator UI ---
  const destEl = document.getElementById('field_DESTINATION');
  const typeEl = document.getElementById('field_AMOUNT_TYPE');
  const curEl = document.getElementById('field_AMOUNT_CURRENCY');
  const issEl = document.getElementById('field_AMOUNT_ISSUER');

  if (destEl) {
    const runTrustlineCheck = async () => {
      let tlStatus = document.getElementById('trustlineStatus');
      if (!tlStatus) {
        tlStatus = document.createElement('div');
        tlStatus.id = 'trustlineStatus';
        tlStatus.className = 'mt-2 small fw-bold';
        destEl.parentNode.appendChild(tlStatus);
      }

      const dest = destEl.value.trim();
      if (!dest || !dest.startsWith('r') || dest.length < 25) {
        tlStatus.innerHTML = '';
        return;
      }

      let cur, iss;
      if (typeEl && typeEl.value === 'TOKEN' && curEl && issEl) {
        cur = formatCurrencyCode(curEl.value.trim());
        iss = issEl.value.trim();
      } else {
        const amtEl = document.getElementById('field_AMOUNT');
        if (amtEl && amtEl.value.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(amtEl.value);
            if (parsed.currency && parsed.issuer) {
              cur = formatCurrencyCode(parsed.currency);
              iss = parsed.issuer;
            }
          } catch (e) {}
        }
      }

      if (cur && iss && iss.startsWith('r') && iss.length >= 25 && dest !== iss) {
        tlStatus.innerHTML = '<span class="text-muted"><span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" style="width: 0.8rem; height: 0.8rem;"></span>Checking trustline...</span>';
        try {
          const tlResp = await fetch(`/check_trustline/${encodeURIComponent(dest)}/${encodeURIComponent(iss)}/${encodeURIComponent(cur)}`);
          if (tlResp.ok) {
            const tlData = await tlResp.json();
            if (tlData.has_trustline) {
              const balStr = tlData.balance ? ` (Bal: ${Number(tlData.balance).toLocaleString()})` : '';
              tlStatus.innerHTML = `<span class="text-success"><i class="bi bi-shield-check"></i> Trustline active${balStr}</span>`;
            } else {
              const safeError = escapeHtml(tlData.error ? (tlData.error.includes('Account not found') ? tlData.error : 'Missing: ' + tlData.error) : 'No trustline');
              tlStatus.innerHTML = `<span class="text-danger"><i class="bi bi-shield-exclamation"></i> ${safeError}</span>`;
            }
          } else {
            tlStatus.innerHTML = '<span class="text-warning"><i class="bi bi-exclamation-triangle"></i> Check failed</span>';
          }
        } catch (e) {
          tlStatus.innerHTML = '';
        }
        return;
      }
      tlStatus.innerHTML = '';
    };

    destEl.addEventListener('blur', runTrustlineCheck);
    if (typeEl) typeEl.addEventListener('change', runTrustlineCheck);
    if (curEl) curEl.addEventListener('blur', runTrustlineCheck);
    if (issEl) issEl.addEventListener('blur', runTrustlineCheck);
    
    // If loading an already populated batch item, check immediately
    if (destEl.value) setTimeout(runTrustlineCheck, 500);
  }

  initDurationQuickSelect();
  initTooltips();
}

const debounceRenderFields = debounce(renderFields, 150);

function showAlert(msg, type = 'info', isHtml = false, action = null) {
  // Create toast container if it doesn't exist
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    document.body.appendChild(toastContainer);
  }

  // Map toast types to icons and classes
  const toastConfig = {
    'success': { icon: 'check-circle-fill', class: 'toast-success', delay: 4000 },
    'error': { icon: 'exclamation-circle-fill', class: 'toast-error', delay: 6000 },
    'warning': { icon: 'exclamation-triangle-fill', class: 'toast-warning', delay: 5000 },
    'info': { icon: 'info-circle-fill', class: 'toast-info', delay: 4000 },
    'copy': { icon: 'check-circle-fill', class: 'toast-copy', delay: 2000 }
  };

  const config = toastConfig[type] || toastConfig['info'];
  const delayMs = action ? 10000 : config.delay; // Longer if there's an action

  // Create toast element
  const toastEl = document.createElement('div');
  toastEl.className = `toast ${config.class} align-items-center border-0 position-relative`;
  toastEl.setAttribute('role', 'alert');
  toastEl.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  toastEl.setAttribute('aria-atomic', 'true');

  // Build HTML
  const actionHtml = action ? `<button class="toast-action" data-action="true">${escapeHtml(action.label)}</button>` : '';
  
  toastEl.innerHTML = `
    <div class="toast-body d-flex gap-2 align-items-center justify-content-between w-100">
      <div class="d-flex align-items-center gap-2">
        <span class="toast-icon">
          <i class="bi bi-${config.icon}"></i>
        </span>
        <span class="toast-content">
          <span class="toast-msg"></span>
        </span>
      </div>
      <div class="d-flex align-items-center gap-2" style="flex-shrink: 0;">
        ${actionHtml}
        <button type="button" class="btn-close btn-close-toast" aria-label="Close"></button>
      </div>
    </div>
    <div class="toast-progress"></div>
  `;

  // Set message content
  const msgSpan = toastEl.querySelector('.toast-msg');
  if (isHtml) {
    msgSpan.innerHTML = String(msg);
  } else {
    msgSpan.textContent = String(msg);
  }

  // Handle action button if provided
  if (action && action.callback) {
    const actionBtn = toastEl.querySelector('[data-action="true"]');
    if (actionBtn) {
      actionBtn.addEventListener('click', (e) => {
        e.preventDefault();
        action.callback();
        // Close toast after action
        if (window.bootstrap && window.bootstrap.Toast) {
          const toast = bootstrap.Toast.getInstance(toastEl);
          if (toast) toast.hide();
        } else {
          toastEl.classList.remove('show');
          setTimeout(() => toastEl.remove(), 150);
        }
      });
    }
  }

  // Add to container
  toastContainer.appendChild(toastEl);

  // Handle close button
  const closeBtn = toastEl.querySelector('.btn-close-toast');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.bootstrap && window.bootstrap.Toast) {
        const toast = bootstrap.Toast.getInstance(toastEl);
        if (toast) toast.hide();
      } else {
        toastEl.classList.remove('show');
        setTimeout(() => toastEl.remove(), 150);
      }
    });
  }

  // Show toast with Bootstrap or fallback
  if (window.bootstrap && window.bootstrap.Toast) {
    const toast = new window.bootstrap.Toast(toastEl, { delay: delayMs });
    toast.show();
    
    // Clean up when hidden
    toastEl.addEventListener('hidden.bs.toast', () => {
      toastEl.remove();
    });
  } else {
    // Fallback if Bootstrap is not loaded
    toastEl.classList.add('show');
    setTimeout(() => {
      toastEl.classList.remove('show');
      setTimeout(() => toastEl.remove(), 150);
    }, delayMs);
  }
}

// Convenience function for copy-to-clipboard with feedback
function copyToClipboard(text, label = 'Copied!') {
  navigator.clipboard.writeText(text).then(() => {
    showAlert(label, 'copy');
  }).catch(() => {
    showAlert('Failed to copy to clipboard', 'error');
  });
}

// Format XRP drops to readable format
function formatXrpAmount(drops) {
  if (!drops) return '0 XRP';
  const num = parseInt(drops);
  return `${(num / 1e6).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 6 })} XRP`;
}

// Shorten XRPL address for display: "rN7n...VvKQA"
function shortenAddress(address) {
  if (!address || address.length < 10) return address;
  return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
}

// Format timestamp to readable date/time
function formatTimestamp(seconds) {
  if (!seconds) return 'N/A';
  // Convert XRPL epoch (seconds since Jan 1 2000) to Unix epoch
  const date = new Date((parseInt(seconds) + 946684800) * 1000);
  return date.toLocaleString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true
  });
}

// Calculate readable duration from ripple timestamp
function getReadableDuration(fromSeconds, toSeconds) {
  if (!fromSeconds || !toSeconds) return null;
  const diff = toSeconds - fromSeconds;
  const hours = Math.floor(diff / 3600);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const years = Math.floor(days / 365);
  
  if (years > 0) return `${years} year${years > 1 ? 's' : ''}`;
  if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''}`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  return 'Less than an hour';
}

// Generate safety warnings
function generateSafetyWarnings(txjson) {
  const warnings = [];
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Check for large amounts
  if (txjson.Amount) {
    const drops = typeof txjson.Amount === 'string' ? parseInt(txjson.Amount) : null;
    if (drops && drops > 100000000) { // > 100 XRP
      warnings.push({
        level: 'warning',
        icon: 'exclamation-triangle',
        title: 'Large Amount',
        message: `This is a significant amount (${formatXrpAmount(drops)}). Please verify the recipient address multiple times.`
      });
    }
  }
  
  // Check for extreme durations
  if (txjson.FinishAfter && txjson.CancelAfter) {
    const duration = txjson.CancelAfter - txjson.FinishAfter;
    if (duration < 0) {
      warnings.push({
        level: 'danger',
        icon: 'exclamation-circle',
        title: 'Invalid Duration',
        message: 'Cancel date is before Finish date. This escrow can be cancelled before it can be claimed.'
      });
    }
  }

  if (txjson.FinishAfter) {
    const xrplNow = currentTime - 946684800;
    if (txjson.FinishAfter - xrplNow > 157680000) { // > 5 years
      warnings.push({
        level: 'warning',
        icon: 'clock-history',
        title: 'Extended Lock',
        message: 'This escrow is locked for over 5 years. Verify this is intentional.'
      });
    }
  }
  
  // Check for condition without cancellation
  if (txjson.Condition && !txjson.CancelAfter) {
    warnings.push({
      level: 'warning',
      icon: 'shield-exclamation',
      title: 'No Cancellation',
      message: 'This escrow has a condition but no cancellation date. It could be locked forever if not fulfilled.'
    });
  }
  
  // Check for same sender/recipient
  if (txjson.Destination && txjson.Account === txjson.Destination) {
    warnings.push({
      level: 'warning',
      icon: 'info-circle',
      title: 'Self-Transfer',
      message: 'Sender and recipient are the same address. Is this intentional?'
    });
  }
  
  if (warnings.length === 0) return null;
  
  const container = document.createElement('div');
  container.className = 'safety-warnings mb-3';
  
  warnings.forEach(warn => {
    const alertClass = warn.level === 'danger' ? 'alert-danger' : 'alert-warning';
    const alert = document.createElement('div');
    alert.className = `alert ${alertClass} d-flex gap-2 align-items-start mb-2`;
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'flex-shrink-0';
    iconSpan.innerHTML = `<i class="bi bi-${warn.icon}"></i>`;
    alert.appendChild(iconSpan);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'flex-grow-1';
    const title = document.createElement('strong');
    title.textContent = warn.title;
    contentDiv.appendChild(title);
    const msg = document.createElement('div');
    msg.className = 'small mt-1';
    msg.textContent = warn.message;
    contentDiv.appendChild(msg);
    alert.appendChild(contentDiv);
    
    container.appendChild(alert);
  });
  
  return container;
}

function initTooltips() {
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(function (tooltipTriggerEl) {
    const existing = bootstrap.Tooltip.getInstance(tooltipTriggerEl);
    if (!existing) {
      return new bootstrap.Tooltip(tooltipTriggerEl);
    }
    return existing;
  });
}

let payloadPollingInterval = null;
let payloadPollingUuid = null;
const payloadPollingStatusEl = document.getElementById('payloadPollingStatus');

function setSpinner(spinnerEl, active) {
  if (!spinnerEl) return;
  if (active) {
    spinnerEl.classList.add('active');
  } else {
    spinnerEl.classList.remove('active');
  }
}

async function computeOracleCondition(tokenPair, targetPrice) {
  const encoder = new TextEncoder();
  const payload = `oracle:${tokenPair.trim().toUpperCase()}:${targetPrice.trim()}`;
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(payload));
  const hashBytes = new Uint8Array(hashBuffer);
  const hashHex = Array.from(hashBytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  
  // XRPL requires PREIMAGE-SHA-256 conditions to follow the ILP Crypto-Condition format:
  // A0258020 + [32-byte hash] + 8101 + [preimage length in hex]
  const payloadLengthHex = payload.length.toString(16).padStart(2, '0').toUpperCase();
  return `A0258020${hashHex}8101${payloadLengthHex}`;
}

function isFinalPayloadState(state) {
  return ['signed', 'expired', 'cancelled', 'rejected', 'failed'].includes(state.toLowerCase());
}

function normalizePayloadState(data) {
  return data.state || (data.meta && data.meta.state) || (data.response && data.response.meta && data.response.meta.state) || 'unknown';
}

function updatePollingStatusMessage(state, details, isHtml = false) {
  if (!payloadPollingStatusEl) return;
  payloadPollingStatusEl.innerHTML = '';
  const badge = document.createElement('span');
  badge.className = 'status-badge ' + (state === 'signed' ? 'status-success' : isFinalPayloadState(state) ? 'status-warning' : 'status-info');
  const icon = document.createElement('i');
  icon.className = state === 'signed' ? 'bi bi-check-circle' : isFinalPayloadState(state) ? 'bi bi-exclamation-circle' : 'bi bi-hourglass-split';
  badge.appendChild(icon);
  const text = document.createElement('span');
  text.style.marginLeft = '8px';
  text.textContent = `Payload state: ${state}`;
  badge.appendChild(text);
  payloadPollingStatusEl.appendChild(badge);
  if (details) {
    const detailsText = document.createElement('div');
    detailsText.className = 'text-muted small mt-2';
    if (isHtml) {
      detailsText.innerHTML = details;
    } else {
      detailsText.textContent = details;
    }
    payloadPollingStatusEl.appendChild(detailsText);
  }
}

function startPayloadWebSocket(wsUrl, uuid) {
  stopPayloadPolling(); // Stop HTTP polling
  payloadPollingUuid = uuid;
  updatePollingStatusMessage('pending', 'Waiting for user interaction via Xaman...');
  
  const ws = new WebSocket(wsUrl);
  window.currentPayloadWs = ws;
  
  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.opened === true) {
        updatePollingStatusMessage('pending', '👀 Status Update: User has opened the push notification.');
      }
      if (msg.signed === true) {
        updatePollingStatusMessage('signed', '✅ Status Update: User has approved and signed the transaction. Verifying...');
        ws.close();
        window.closeActiveXamanPopup();
        try {
          const vResp = await fetch(`/xumm/verify/${uuid}`);
          const vData = await vResp.json();
          if (vData.ok) {
            let vMsg = '✅ Status Update: Transaction signed and verified securely.';
            let isHtml = false;
            if (vData.remote && vData.remote.xrpl_submission) {
              const engineRes = vData.remote.xrpl_submission.result?.engine_result || 'Unknown';
              const txHash = vData.remote.xrpl_submission.result?.tx_json?.hash;
              vMsg += `<br>🚀 XRPL Submission: <strong>${engineRes}</strong>`;
              if (txHash) {
                vMsg += `<br>🔗 Hash: <code>${txHash}</code> <a href="https://testnet.xrpl.org/transactions/${txHash}" target="_blank" class="ms-1">(Testnet)</a> <a href="https://livenet.xrpl.org/transactions/${txHash}" target="_blank" class="ms-1">(Mainnet)</a>`;
              }
              isHtml = true;
            }
            updatePollingStatusMessage('signed', vMsg, isHtml);
          }
        } catch (e) {
          console.error("Verification failed", e);
        }
        showAlert('Xaman payload was signed successfully.', 'success');
        loadSignatureHistory();
        
        if (window.batchTransactions && window.batchTransactions.length > 0) {
          showAlert('Auto-advancing to next transaction in queue...', 'info');
          setTimeout(() => {
            const txModal = bootstrap.Modal.getInstance(document.getElementById('txSubmittedModal'));
            if (txModal) txModal.hide();
            const btn = document.getElementById('buildPayload');
            if (btn) btn.click();
          }, 1500);
        } else {
          setTimeout(() => {
            const txModal = bootstrap.Modal.getInstance(document.getElementById('txSubmittedModal'));
            if (txModal) txModal.hide();
          }, 3000);
        }
      } else if (msg.signed === false) {
        updatePollingStatusMessage('rejected', '❌ Status Update: User rejected the transaction request.');
        ws.close();
        window.closeActiveXamanPopup();
        showAlert('Transaction was rejected in Xaman. Please try again.', 'warning');
        const txModal = bootstrap.Modal.getInstance(document.getElementById('txSubmittedModal'));
        if (txModal) txModal.hide();
      }
    } catch (e) { }
  };
  
  ws.onclose = () => {
    if (window.currentPayloadWs === ws) window.currentPayloadWs = null;
  };
}

function stopPayloadPolling() {
  if (payloadPollingInterval) {
    clearInterval(payloadPollingInterval);
    payloadPollingInterval = null;
  }
  if (window.currentPayloadWs) {
    window.currentPayloadWs.close();
    window.currentPayloadWs = null;
  }
  payloadPollingUuid = null;
}

function getXrplErrorExplanation(code) {
  const explanations = {
    'temBAD_FEE': 'The transaction fee specified is invalid or too low for current network conditions.',
    'tecNO_DST_INSUF_XRP': 'The destination account does not exist, and the amount sent is not enough to fund the account reserve (requires 10 XRP).',
    'tecNO_LINE': 'The destination account does not have a trustline established for this token.',
    'tecNO_LINE_INSUF_RESERVE': 'The destination account cannot accept this token due to insufficient XRP reserve to create a new trustline.',
    'tecNO_DST': 'The destination account does not exist on the ledger.',
    'tecPATH_DRY': 'Unable to find a payment path to exchange the tokens between the sender and recipient.',
    'tecINSUFFICIENT_FUNDS': 'The sending account has insufficient funds to complete this transaction.',
    'tecUNFUNDED_PAYMENT': 'The sending account does not have enough funds to complete this transaction.',
    'tecUNFUNDED_ADD': 'The sending account has insufficient funds to fulfill the trustline limit.',
    'tecOWNERS': 'The account has too many ledger entries or cannot be deleted/modified.',
    'tefALREADY': 'This exact transaction has already been applied to the ledger.',
    'tefBAD_AUTH_MASTER': 'The master key is disabled, and no regular key or multi-signature was used.',
    'tefPAST_SEQ': 'The transaction sequence number has already been passed/used.',
    'terQUEUED': 'The transaction has been queued and will be retried in a future ledger.',
  };
  return explanations[code] || 'An on-chain verification error occurred. Please verify your account balances and inputs.';
}

async function pollPayloadStatus(uuid) {
  if (!uuid) return;
  try {
    const resp = await fetch(`/xumm/payload_status/${uuid}`);
    const data = await resp.json();
    const state = normalizePayloadState(data).toLowerCase();
    const details = JSON.stringify(data, null, 2);
    updatePollingStatusMessage(state, details);
    if (isFinalPayloadState(state)) {
      stopPayloadPolling();
      window.closeActiveXamanPopup();
      if (state === 'signed') {
        updatePollingStatusMessage('signed', '✅ Status Update: Transaction signed. Verifying...');
        try {
          const vResp = await fetch(`/xumm/verify/${uuid}`);
          const vData = await vResp.json();
          if (vData.ok) {
            let vMsg = '✅ Status Update: Transaction signed and verified securely.';
            let isHtml = false;
            if (vData.remote && vData.remote.xrpl_submission) {
              const result = vData.remote.xrpl_submission.result || {};
              const engineRes = result.engine_result || 'Unknown';
              const engineMsg = result.engine_result_message || '';
              const txHash = result.tx_json?.hash;
              
              if (engineRes === 'tesSUCCESS' || engineRes === 'terQUEUED') {
                vMsg = '✅ Status Update: Transaction applied successfully on-chain!';
                vMsg += `<br>🚀 XRPL Submission: <strong class="text-success">${engineRes}</strong>`;
                if (engineMsg) vMsg += `<br><small class="text-muted">${engineMsg}</small>`;
              } else {
                const explanation = getXrplErrorExplanation(engineRes);
                vMsg = '❌ Status Update: Transaction rejected by XRPL ledger.';
                vMsg += `<br>🚀 XRPL Error: <strong class="text-danger">${engineRes}</strong>`;
                if (explanation) vMsg += `<br><span class="text-warning small">${explanation}</span>`;
                if (engineMsg) vMsg += `<br><small class="text-muted">(${engineMsg})</small>`;
              }
              
              if (txHash) {
                vMsg += `<br>🔗 Hash: <code>${txHash}</code> <a href="https://testnet.xrpl.org/transactions/${txHash}" target="_blank" class="ms-1">(Testnet)</a> <a href="https://livenet.xrpl.org/transactions/${txHash}" target="_blank" class="ms-1">(Mainnet)</a>`;
              }
              isHtml = true;
            }
            updatePollingStatusMessage('signed', vMsg, isHtml);
          }
        } catch (e) {
          console.error("Verification failed", e);
        }
        showAlert('XUMM payload was signed successfully.', 'success');
        loadSignatureHistory();
        
        if (window.batchTransactions && window.batchTransactions.length > 0) {
          showAlert('Auto-advancing to next transaction in queue...', 'info');
          setTimeout(() => {
            const txModal = bootstrap.Modal.getInstance(document.getElementById('txSubmittedModal'));
            if (txModal) txModal.hide();
            const btn = document.getElementById('buildPayload');
            if (btn) btn.click();
          }, 1500);
        } else {
          setTimeout(() => {
            const txModal = bootstrap.Modal.getInstance(document.getElementById('txSubmittedModal'));
            if (txModal) txModal.hide();
          }, 3000);
        }
      } else if (state === 'rejected') {
        showAlert('Transaction was rejected in Xaman. Please try again and approve the request.', 'warning');
        const txModal = bootstrap.Modal.getInstance(document.getElementById('txSubmittedModal'));
        if (txModal) txModal.hide();
      } else {
        showAlert(`XUMM payload reached final state: ${state}`, 'warning');
      }
    }
  } catch (err) {
    updatePollingStatusMessage('error', String(err));
  }
}

function startPayloadPolling(uuid) {
  if (!uuid) return;
  stopPayloadPolling();
  payloadPollingUuid = uuid;
  updatePollingStatusMessage('pending', 'Polling XUMM for signature status...');
  pollPayloadStatus(uuid);
  payloadPollingInterval = setInterval(() => pollPayloadStatus(uuid), 5000);
}

templateSelectEl.addEventListener('change', debounceRenderFields);

window.batchTransactions = [];

window.removeBatchItem = function(idx) {
  window.batchTransactions.splice(idx, 1);
  updateBatchUI();
};

window.editBatchItem = function(idx) {
  const tx = window.batchTransactions[idx];
  if (!tx._templateName || !tx._formParams) {
    showAlert('This transaction cannot be edited directly.', 'warning');
    return;
  }
  
  // Set template dropdown
  const sel = document.getElementById('templateSelect');
  if (sel) {
    sel.value = tx._templateName;
    const targetRow = document.querySelector(`.template-row[data-name="${tx._templateName}"]`);
    if (targetRow) {
      const header = targetRow.querySelector('div');
      if (header) {
        header.click();
      }
    } else {
      renderFields();
    }
  } else {
    renderFields();
  }

  // Populate fields
  Object.keys(tx._formParams).forEach(key => {
    const input = document.getElementById('field_' + key);
    if (input) {
      input.value = tx._formParams[key];
      // special handling for Amount
      if (key === 'AMOUNT') {
        const typeSelect = input.nextElementSibling;
        if (typeSelect && typeSelect.tagName === 'SELECT') {
           let isToken = false;
           try {
             const parsed = JSON.parse(tx._formParams[key]);
             if (parsed && parsed.currency) isToken = true;
           } catch(e) {}
           
           if (isToken) {
             typeSelect.value = 'TOKEN';
             typeSelect.dispatchEvent(new Event('change'));
             const parsed = JSON.parse(tx._formParams[key]);
             const tokenGroup = typeSelect.nextElementSibling.nextElementSibling;
             if (tokenGroup) {
               const tInputs = tokenGroup.querySelectorAll('input');
               if (tInputs.length >= 3) {
                 tInputs[0].value = parsed.value || '';
                 tInputs[1].value = parsed.currency || '';
                 tInputs[2].value = parsed.issuer || '';
               }
             }
           } else {
             typeSelect.value = 'XRP';
             typeSelect.dispatchEvent(new Event('change'));
             const xrpGroup = typeSelect.nextElementSibling;
             if (xrpGroup) {
               const xInp = xrpGroup.querySelector('input');
               if (xInp) xInp.value = tx._formParams[key];
             }
           }
        }
      } else if (key === 'MEMOS') {
        const visibleInput = input.previousElementSibling;
        if (visibleInput) {
           try {
             const parsed = JSON.parse(tx._formParams[key]);
             if (parsed && parsed.length > 0 && parsed[0].Memo && parsed[0].Memo.MemoData) {
               const hex = parsed[0].Memo.MemoData;
               let str = '';
               for (let i = 0; i < hex.length; i += 2) {
                 str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
               }
               visibleInput.value = str;
             }
           } catch(e) {}
        }
      } else if (key === 'FINISH_AFTER' || key === 'CANCEL_AFTER') {
        // Convert epoch to local datetime picker format
        const parsed = parseInt(tx._formParams[key], 10);
        if (!isNaN(parsed)) {
          const d = new Date((parsed + 946684800) * 1000);
          const tzOffset = d.getTimezoneOffset() * 60000;
          const localISOTime = (new Date(d - tzOffset)).toISOString().slice(0, 16);
          if (key === 'FINISH_AFTER' && document.getElementById('escrowFinishDatetime')) {
            document.getElementById('escrowFinishDatetime').value = localISOTime;
          } else if (key === 'CANCEL_AFTER' && document.getElementById('escrowCancelDatetime')) {
            document.getElementById('escrowCancelDatetime').value = localISOTime;
          }
          // Format the underlying fields properly based on these new visual values
        }
      }
    }
  });

  // Remove the item from batch so the user can re-add it
  window.removeBatchItem(idx);
  showAlert('Transaction loaded for editing.', 'info');
  if (document.getElementById('escrowFinishDatetime') && document.getElementById('escrowFinishDatetime').value) {
    syncTimedEscrowFields();
  }
  
  // Scroll to the builder
  const builderEl = document.getElementById('templateSelect');
  if (builderEl) {
    builderEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};

window.draggedBatchItemIdx = null;

window.onDragStartBatchItem = function(e, idx) {
  window.draggedBatchItemIdx = idx;
  e.dataTransfer.effectAllowed = 'move';
  e.target.style.opacity = '0.5';
};

window.onDragEndBatchItem = function(e) {
  e.target.style.opacity = '1';
};

window.onDragOverBatchItem = function(e) {
  e.preventDefault(); // Necessary to allow dropping
  e.dataTransfer.dropEffect = 'move';
};

window.onDropBatchItem = function(e, dropIdx) {
  e.preventDefault();
  const dragIdx = window.draggedBatchItemIdx;
  if (dragIdx === null || dragIdx === dropIdx) return;
  
  // Move the item to its new position in the array
  const item = window.batchTransactions.splice(dragIdx, 1)[0];
  window.batchTransactions.splice(dropIdx, 0, item);
  
  window.draggedBatchItemIdx = null;
  updateBatchUI();
};

function updateBatchUI() {
  const btnClearBatch = document.getElementById('clearBatchBtn');
  const batchContainer = document.getElementById('batchStatusContainer');
  const btnBuild = document.getElementById('buildPayload');
  if (window.batchTransactions.length > 0) {
    if (btnClearBatch) btnClearBatch.style.display = 'inline-block';
    if (batchContainer) {
      batchContainer.style.display = 'block';
      
      let listHtml = '<ul class="list-group list-group-flush mt-2">';
      window.batchTransactions.forEach((tx, idx) => {
        let amountStr = '';
        if (typeof tx.Amount === 'string') {
          const xrp = Number(tx.Amount) / 1000000;
          amountStr = ` (${xrp.toLocaleString(undefined, { maximumFractionDigits: 6 })} XRP)`;
        } else if (tx.Amount && tx.Amount.currency) {
          let cur = escapeHtml(decodeCurrencyCode(tx.Amount.currency) || 'Token');
          const tokenVal = Number(tx.Amount.value).toLocaleString(undefined, { maximumFractionDigits: 8 });
          amountStr = ` (${tokenVal} ${cur})`;
        }
        let destStr = tx.Destination ? ` &rarr; ${escapeHtml(tx.Destination.substring(0, 6))}...${escapeHtml(tx.Destination.substring(tx.Destination.length - 4))}` : '';
        listHtml += `<li class="list-group-item bg-transparent px-0 py-1 border-0 d-flex justify-content-between align-items-center" style="font-size: 0.85rem;"
          draggable="true"
          ondragstart="onDragStartBatchItem(event, ${idx})"
          ondragend="onDragEndBatchItem(event)"
          ondragover="onDragOverBatchItem(event)"
          ondrop="onDropBatchItem(event, ${idx})">
          <span style="cursor: grab;">
            <i class="bi bi-grip-vertical text-muted me-1" title="Drag to reorder"></i>
            <strong>${idx + 1}. ${tx.TransactionType}</strong>${destStr}${amountStr}
          </span>
          <div>
            <button type="button" class="btn btn-sm text-primary p-0 border-0 me-2" onclick="editBatchItem(${idx})" title="Edit transaction"><i class="bi bi-pencil"></i></button>
            <button type="button" class="btn btn-sm text-danger p-0 border-0" onclick="removeBatchItem(${idx})" title="Remove from batch"><i class="bi bi-x-circle"></i></button>
          </div>
        </li>`;
      });
      listHtml += '</ul>';
      listHtml += '<div id="batchFeeDisplay" class="mt-2 small text-secondary"><span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Estimating total network fee...</div>';

      batchContainer.innerHTML = `
        <div class="card-header bg-info text-white fw-bold d-flex justify-content-between align-items-center">
          <span><i class="bi bi-list-task"></i> Transaction Queue</span>
          <span class="badge bg-light text-dark rounded-pill px-2">${window.batchTransactions.length} / 50</span>
        </div>
        <div class="card-body p-3">
          <p class="small text-muted mb-2">Review your queue. Xaman will prompt you to sign each transaction sequentially. Once signed, the next will auto-trigger.</p>
          ${listHtml}
        </div>
      `;

      // Asynchronously fetch the fee for the entire queue
      // Instead of spamming the RPC with a request for every single item,
      // fetch the base fee once and multiply by the queue length.
      fetch('/estimate_fee', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({}) // Empty body fetches the base ledger fee
      })
      .then(r => r.ok ? r.json() : {})
      .then(res => {
        const baseFeeDrops = res.estimated_fee_drops ? Number(res.estimated_fee_drops) : 10;
        const totalDrops = baseFeeDrops * window.batchTransactions.length;
        const feeDiv = document.getElementById('batchFeeDisplay');
        if (feeDiv && totalDrops > 0) {
          const xrpFee = totalDrops / 1000000;
          feeDiv.innerHTML = `<strong>Estimated Queue Fee:</strong> ${totalDrops.toLocaleString()} drops (${xrpFee.toLocaleString(undefined, { maximumFractionDigits: 6 })} XRP)`;
        }
      })
      .catch(() => {
        const feeDiv = document.getElementById('batchFeeDisplay');
        if (feeDiv) feeDiv.innerHTML = `<span class="text-danger">Fee estimation unavailable</span>`;
      });
    }
    if (btnBuild) {
      const spinner = document.getElementById('buildSpinner');
      btnBuild.innerHTML = '<i class="bi bi-play-circle"></i> Sign Next in Queue';
      if (spinner) btnBuild.prepend(spinner);
    }
  } else {
    if (btnClearBatch) btnClearBatch.style.display = 'none';
    if (batchContainer) batchContainer.style.display = 'none';
    if (btnBuild) {
      const spinner = document.getElementById('buildSpinner');
      btnBuild.innerHTML = '<i class="bi bi-play-circle"></i> Sign Transaction';
      if (spinner) btnBuild.prepend(spinner);
    }
  }
}

async function getFormTxJson(isForBatch = false) {
  const name = templateSelectEl.value;
  if (!name) {
    showAlert('Please select an escrow', 'warning');
    return null;
  }
  const inputs = templateFieldsEl.querySelectorAll('input');
  const params = {};
  let missingRequired = false;
  
  function setFieldError(inputEl, msg) {
    if (!inputEl) return;
    inputEl.classList.add('is-invalid');
    let feedbackEl = inputEl.parentNode.querySelector('.invalid-feedback');
    if (!feedbackEl) {
      feedbackEl = document.createElement('div');
      feedbackEl.className = 'invalid-feedback';
      inputEl.parentNode.appendChild(feedbackEl);
    }
    feedbackEl.textContent = msg;
  }

  inputs.forEach(i => { 
    i.classList.remove('is-invalid'); // Reset any existing visual errors
    if (i.id && i.id.startsWith('field_')) {
      const key = i.id.replace(/^field_/, '');
      let val = i.value.trim();
      
      if (key === 'CURRENCY') {
        val = formatCurrencyCode(val);
      }
      params[key] = val;

      // Prevent Xaman app crashes by ensuring critical fields (like Amount) are never sent empty
      if ((key === 'ACCOUNT' || key === 'DESTINATION' || key === 'AMOUNT' || key === 'OWNER') && !val) {
        missingRequired = true;
        if (key !== 'AMOUNT') {
          setFieldError(i, `${getFriendlyFieldLabel(key)} is required.`);
        } else {
          // Handle highlighting the custom dynamic Amount inputs using robust class selectors
          const parent = i.parentNode;
          const typeSel = parent.querySelector('#field_AMOUNT_TYPE');
          if (typeSel) {
            if (typeSel.value === 'TOKEN') {
              const tokenGroup = parent.querySelector('.token-group');
              if (tokenGroup) tokenGroup.querySelectorAll('input').forEach(ti => { 
                if (!ti.value.trim() && ti.type !== 'hidden') setFieldError(ti, 'Token details are required.');
              });
            } else if (typeSel.value === 'XRP') {
              const xrpGroup = parent.querySelector('.xrp-group');
              if (xrpGroup) { 
                const xInp = xrpGroup.querySelector('input'); 
                if (xInp && !xInp.value.trim()) setFieldError(xInp, 'XRP amount is required.');
              }
            } else if (typeSel.value === 'MPT') {
              const mptGroup = parent.querySelector('.mpt-group');
              if (mptGroup) mptGroup.querySelectorAll('input').forEach(ti => { 
                if (!ti.value.trim() && ti.type !== 'hidden') setFieldError(ti, 'MPT details are required.');
              });
            }
          }
        }
      }
    }
  });

  if (missingRequired) {
    showAlert('Please fill in all required fields before generating the payload.', 'warning');
    return null;
  }

  // Validate CancelAfter for Batched Token Escrows
  const tmpl = window.allTemplates?.[name] || {};
  const isBatch = isForBatch || (tmpl.txjson?.TransactionType === 'Batch');
  let hasTokenAmount = false;

  for (const val of Object.values(params)) {
    if (typeof val === 'string' && val.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(val);
        if (parsed && (parsed.issuer || parsed.mpt_issuance_id)) {
          hasTokenAmount = true;
          break;
        }
      } catch(e) {}
    }
  }

  if (name === 'oracle_price_threshold') {
    const tokenPair = (params['TOKEN_PAIR'] || '').trim();
    const targetPrice = (params['TARGET_PRICE'] || '').trim();
    if (!tokenPair || !targetPrice) {
      if (!tokenPair) setFieldError(document.getElementById('field_TOKEN_PAIR'), 'Token pair is required.');
      if (!targetPrice) setFieldError(document.getElementById('field_TARGET_PRICE'), 'Target price is required.');
      showAlert('Please enter the token pair and target price for the oracle condition.', 'warning');
      return null;
    }
    params['CONDITION'] = await computeOracleCondition(tokenPair, targetPrice);
  }

  // Handle timed escrow: calculate FINISH_AFTER based on hours or precise datetime
  const escrowType = (window.allTemplates?.[name]?.escrow_type || '').toLowerCase();
  const durationHours = escrowDurationHoursEl.value;
  const finishDatetime = escrowFinishDatetimeEl ? escrowFinishDatetimeEl.value : '';
  const cancelDatetime = escrowCancelDatetimeEl ? escrowCancelDatetimeEl.value : '';
  
  if (escrowType === 'timed' && (durationHours || finishDatetime)) {
    const xrplEpochOffset = 946684800; // seconds
    const nowMs = Date.now();
    let finishMs;

    if (durationHours) {
      const hours = parseFloat(durationHours);
      if (isNaN(hours) || hours <= 0) {
        showAlert('Duration must be a positive number of hours.', 'warning');
        return null;
      }
      finishMs = nowMs + (hours * 60 * 60 * 1000);
    } else {
      const selectedDate = new Date(finishDatetime);
      if (isNaN(selectedDate.getTime()) || selectedDate.getTime() <= nowMs) {
        showAlert('Please select a valid future date and time.', 'warning');
        return null;
      }
      finishMs = selectedDate.getTime();
    }

    const finishAfter = Math.floor(finishMs / 1000) - xrplEpochOffset;
    params['FINISH_AFTER'] = String(Math.floor(finishAfter));
    
    if (cancelDatetime) {
      const cDate = new Date(cancelDatetime);
      if (!isNaN(cDate.getTime())) {
        params['CANCEL_AFTER'] = String(Math.floor(cDate.getTime() / 1000) - xrplEpochOffset);
      }
    }
  }

  // Set an automatic cancel 30 days after escrow finish time if not already set
  if (params['FINISH_AFTER'] && !params['CANCEL_AFTER']) {
    const parsedFinish = parseInt(params['FINISH_AFTER'], 10);
    if (!isNaN(parsedFinish)) {
      params['CANCEL_AFTER'] = String(parsedFinish + (30 * 24 * 60 * 60));
    }
  }

  // Enforce CancelAfter for Token Escrows in a Batch (Matching Backend)
  if (isBatch && hasTokenAmount && !params['CANCEL_AFTER']) {
    const cancelInput = document.getElementById('field_CANCEL_AFTER');
    if (cancelInput) setFieldError(cancelInput, 'CancelAfter is mandatory when batching token escrows.');
    showAlert('Batch Constraint Failed: Token escrows within a Batch must always have a CancelAfter field.', 'warning');
    return null;
  }

  // Address Format Validation (Matching Backend)
  for (const field of ['ACCOUNT', 'DESTINATION', 'OWNER']) {
    const addr = params[field];
    if (addr && (!addr.startsWith('r') || addr.length < 25 || addr.length > 35)) {
      const input = document.getElementById(`field_${field}`);
      if (input) setFieldError(input, 'Must be a valid XRPL r-address.');
      showAlert(`Invalid address format for ${field}: '${addr}'. Must be a valid XRPL r-address.`, 'warning');
      return null;
    }
  }

  const buildResp = await fetch(`/templates/${name}/build`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(params)
  });
  if (!buildResp.ok) {
    let errMsg = await buildResp.text();
    try { const errJson = JSON.parse(errMsg); if (errJson.detail) errMsg = errJson.detail; } catch (e) {}
    throw new Error(errMsg);
  }
  const result = await buildResp.json();
  result._templateName = name;
  result._formParams = params;
  return result;
}

const btnBuild = document.getElementById('buildPayload');
if (btnBuild) {
  btnBuild.type = 'button';
  
  const btnContainer = btnBuild.parentNode;
  btnContainer.classList.add('d-flex', 'flex-wrap', 'gap-2', 'align-items-center');

  const spinner = document.getElementById('buildSpinner');
  btnBuild.innerHTML = '<i class="bi bi-play-circle"></i> Sign Transaction';
  if (spinner) btnBuild.prepend(spinner);
  
  const btnAddBatch = document.createElement('button');
  btnAddBatch.type = 'button';
  btnAddBatch.className = 'btn btn-secondary';
  btnAddBatch.id = 'addToBatchBtn';
  btnAddBatch.innerHTML = '<i class="bi bi-plus-circle"></i> Add Transaction';
  btnContainer.insertBefore(btnAddBatch, btnBuild.nextSibling);

  const btnClearForm = document.createElement('button');
  btnClearForm.type = 'button';
  btnClearForm.className = 'btn btn-outline-secondary';
  btnClearForm.id = 'clearFormBtn';
  btnClearForm.innerHTML = '<i class="bi bi-eraser"></i> Clear Form';
  btnContainer.insertBefore(btnClearForm, btnAddBatch.nextSibling);

  const btnClearBatch = document.createElement('button');
  btnClearBatch.type = 'button';
  btnClearBatch.className = 'btn btn-outline-danger';
  btnClearBatch.id = 'clearBatchBtn';
  btnClearBatch.style.display = 'none';
  btnClearBatch.innerHTML = '<i class="bi bi-trash"></i> Clear Queue';
  btnContainer.insertBefore(btnClearBatch, btnClearForm.nextSibling);

  const batchContainer = document.createElement('div');
  batchContainer.className = 'card border-info shadow-sm ms-xl-4 mt-3 mt-xl-0 align-self-start';
  batchContainer.id = 'batchStatusContainer';
  batchContainer.style.display = 'none';
  batchContainer.style.width = '100%';
  batchContainer.style.maxWidth = '400px'; // Fluidly restrict width without hardcoding flex-basis which breaks in column mode

  // Restructure the form area to split left and right seamlessly
  const formArea = btnContainer.parentNode;
  if (formArea) {
    formArea.classList.add('d-flex', 'flex-column', 'flex-xl-row');
    const leftWrapper = document.createElement('div');
    leftWrapper.className = 'flex-grow-1';
    leftWrapper.style.minWidth = '0'; // Prevent flex blowout overlapping right box
    while (formArea.firstChild) {
      leftWrapper.appendChild(formArea.firstChild);
    }
    formArea.appendChild(leftWrapper);
    formArea.appendChild(batchContainer);
  }

  btnAddBatch.addEventListener('click', async () => {
    if (window.batchTransactions.length >= 50) {
      showAlert('You can only queue up to 50 transactions at a time.', 'warning');
      return;
    }
    const buildSpinner = document.getElementById('buildSpinner');
    setSpinner(buildSpinner, true);
    try {
      const txjson = await getFormTxJson(true);
      if (txjson) {
        window.batchTransactions.push(txjson);
        updateBatchUI();
        showAlert(`Transaction added to queue! (${window.batchTransactions.length}/50)`, 'success');

        // Clear form fields for the next transaction, preserving the sender Account and Token Issuer/Currency
        templateFieldsEl.querySelectorAll('input').forEach(input => {
          const keepFields = ['field_ACCOUNT', 'field_OWNER'];
          const keepPlaceholders = ['Currency Code', 'Issuer r-Address'];
          
          if (!keepFields.includes(input.id) && !keepPlaceholders.some(p => input.placeholder && input.placeholder.includes(p))) {
            input.value = '';
            input.classList.remove('is-invalid');
          }
        });

        if (escrowDurationHoursEl) escrowDurationHoursEl.value = '';
        if (escrowFinishDatetimeEl) escrowFinishDatetimeEl.value = '';
        if (escrowCancelDatetimeEl) escrowCancelDatetimeEl.value = '';
        syncTimedEscrowFields(); // Reset time display fields
      }
    } catch (err) {
      showAlert('Error adding to batch: ' + String(err), 'error');
    } finally {
      setSpinner(buildSpinner, false);
    }
  });

  btnClearBatch.addEventListener('click', () => {
    if (!confirm('Are you sure you want to clear all queued transactions? This cannot be undone.')) {
      return;
    }
    window.batchTransactions = [];
    updateBatchUI();
  });

  btnClearForm.addEventListener('click', () => {
    if (!confirm('Are you sure you want to clear all form fields? This cannot be undone.')) {
      return;
    }
    templateFieldsEl.querySelectorAll('input').forEach(input => {
      input.value = '';
      input.classList.remove('is-invalid');
    });
    if (escrowDurationHoursEl) escrowDurationHoursEl.value = '';
    if (escrowFinishDatetimeEl) escrowFinishDatetimeEl.value = '';
    if (escrowCancelDatetimeEl) escrowCancelDatetimeEl.value = '';
    syncTimedEscrowFields(); // Reset time display fields
    showAlert('Form fields cleared.', 'info');
  });
}

function renderHumanReadablePreview(tx) {
  const container = document.createElement('div');
  container.className = 'card mb-3 border-info bg-info-subtle bg-opacity-10 shadow-sm';
  
  const header = document.createElement('div');
  header.className = 'card-header bg-info-subtle border-info py-2 d-flex justify-content-between align-items-center';
  header.innerHTML = '<span class="fw-bold small text-info-emphasis"><i class="bi bi-info-circle-fill"></i> Transaction Details Preview</span>';
  container.appendChild(header);
  
  const body = document.createElement('div');
  body.className = 'card-body py-3';
  
  let details = '';
  const txType = tx.TransactionType || 'SignIn';
  
  const getAmountLabel = (amt) => {
    if (typeof amt === 'string') {
      return formatXrpAmount(amt);
    } else if (typeof amt === 'object' && amt !== null) {
      const decodedCurrency = amt.currency ? decodeCurrencyCode(amt.currency) : 'Token';
      return `${Number(amt.value).toLocaleString(undefined, {maximumFractionDigits: 6})} ${decodedCurrency} (Issued by ${shortenAddress(amt.issuer)})`;
    }
    return String(amt);
  };
  
  const getDateLabel = (epochSecs) => {
    if (!epochSecs) return 'N/A';
    const dateNum = Number(epochSecs);
    if (!isNaN(dateNum)) {
      return new Date((dateNum + 946684800) * 1000).toLocaleString();
    }
    return String(epochSecs);
  };

  if (txType === 'EscrowCreate') {
    details = `
      <div class="row g-2 small">
        <div class="col-sm-4 fw-semibold text-secondary">Action:</div>
        <div class="col-sm-8 text-primary fw-bold">Create Escrow</div>
        
        <div class="col-sm-4 fw-semibold text-secondary">Locked Amount:</div>
        <div class="col-sm-8 text-dark fw-bold">${getAmountLabel(tx.Amount)}</div>
        
        <div class="col-sm-4 fw-semibold text-secondary">Sender (Owner):</div>
        <div class="col-sm-8 text-dark font-monospace">${shortenAddress(tx.Account)}</div>
        
        <div class="col-sm-4 fw-semibold text-secondary">Recipient:</div>
        <div class="col-sm-8 text-dark font-monospace">${shortenAddress(tx.Destination)}</div>
        
        ${tx.FinishAfter ? `
          <div class="col-sm-4 fw-semibold text-secondary">Release Date:</div>
          <div class="col-sm-8 text-dark">${getDateLabel(tx.FinishAfter)}</div>
        ` : ''}
        
        ${tx.CancelAfter ? `
          <div class="col-sm-4 fw-semibold text-secondary">Expiration Date:</div>
          <div class="col-sm-8 text-dark">${getDateLabel(tx.CancelAfter)} (Refundable after this)</div>
        ` : ''}
        
        ${tx.Condition ? `
          <div class="col-sm-4 fw-semibold text-secondary">Condition:</div>
          <div class="col-sm-8 text-dark"><span class="badge bg-warning-subtle text-warning border border-warning-subtle">Fulfillment Required</span></div>
        ` : ''}
      </div>
    `;
  } else if (txType === 'EscrowFinish') {
    details = `
      <div class="row g-2 small">
        <div class="col-sm-4 fw-semibold text-secondary">Action:</div>
        <div class="col-sm-8 text-primary fw-bold">Claim Escrow</div>
        
        <div class="col-sm-4 fw-semibold text-secondary">Escrow Owner:</div>
        <div class="col-sm-8 text-dark font-monospace">${shortenAddress(tx.Owner)}</div>
        
        <div class="col-sm-4 fw-semibold text-secondary">Sequence ID:</div>
        <div class="col-sm-8 text-dark font-monospace">${tx.OfferSequence}</div>
        
        ${tx.Fulfillment ? `
          <div class="col-sm-4 fw-semibold text-secondary">Fulfillment Signature:</div>
          <div class="col-sm-8 text-dark font-monospace text-truncate" style="max-width:240px;" title="${tx.Fulfillment}">${tx.Fulfillment.substring(0, 12)}...</div>
        ` : ''}
      </div>
    `;
  } else if (txType === 'EscrowCancel') {
    details = `
      <div class="row g-2 small">
        <div class="col-sm-4 fw-semibold text-secondary">Action:</div>
        <div class="col-sm-8 text-primary fw-bold">Cancel/Refund Escrow</div>
        
        <div class="col-sm-4 fw-semibold text-secondary">Escrow Owner:</div>
        <div class="col-sm-8 text-dark font-monospace">${shortenAddress(tx.Owner)}</div>
        
        <div class="col-sm-4 fw-semibold text-secondary">Sequence ID:</div>
        <div class="col-sm-8 text-dark font-monospace">${tx.OfferSequence}</div>
      </div>
    `;
  } else if (txType === 'Payment') {
    details = `
      <div class="row g-2 small">
        <div class="col-sm-4 fw-semibold text-secondary">Action:</div>
        <div class="col-sm-8 text-primary fw-bold">Direct Payment</div>
        
        <div class="col-sm-4 fw-semibold text-secondary">Amount:</div>
        <div class="col-sm-8 text-dark fw-bold">${getAmountLabel(tx.Amount)}</div>
        
        <div class="col-sm-4 fw-semibold text-secondary">Sender:</div>
        <div class="col-sm-8 text-dark font-monospace">${shortenAddress(tx.Account)}</div>
        
        <div class="col-sm-4 fw-semibold text-secondary">Destination:</div>
        <div class="col-sm-8 text-dark font-monospace">${shortenAddress(tx.Destination)}</div>
      </div>
    `;
  } else if (txType === 'TrustSet') {
    details = `
      <div class="row g-2 small">
        <div class="col-sm-4 fw-semibold text-secondary">Action:</div>
        <div class="col-sm-8 text-primary fw-bold">Create Token Trustline</div>
        
        <div class="col-sm-4 fw-semibold text-secondary">Token Info:</div>
        <div class="col-sm-8 text-dark fw-bold">${getAmountLabel(tx.LimitAmount)}</div>
      </div>
    `;
  } else if (txType === 'AccountSet') {
    details = `
      <div class="row g-2 small">
        <div class="col-sm-4 fw-semibold text-secondary">Action:</div>
        <div class="col-sm-8 text-primary fw-bold">Modify Account Settings</div>
        
        ${tx.SetFlag === 18 ? `
          <div class="col-sm-4 fw-semibold text-secondary">Feature:</div>
          <div class="col-sm-8 text-success fw-bold"><i class="bi bi-shield-check"></i> Enable Trust Line Locking (Escrows)</div>
        ` : `
          <div class="col-sm-4 fw-semibold text-secondary">Set Flag:</div>
          <div class="col-sm-8 text-dark font-monospace">${tx.SetFlag}</div>
        `}
      </div>
    `;
  } else {
    details = `
      <div class="row g-2 small">
        <div class="col-sm-4 fw-semibold text-secondary">Transaction:</div>
        <div class="col-sm-8 text-dark font-monospace">${txType}</div>
      </div>
    `;
  }
  
  body.innerHTML = details;
  container.appendChild(body);
  return container;
}

window.showSubmittedModal = function(data, txjson = null) {
  const modalBody = document.getElementById('txSubmittedModalBody');
  if (!modalBody) return;

  modalBody.innerHTML = '';
  const tx = txjson || data.request?.txjson || (data.payload?.request?.txjson) || {};

  // Display safety warnings if any
  const safetyWarnings = generateSafetyWarnings(tx);
  if (safetyWarnings) {
    modalBody.appendChild(safetyWarnings);
  }

  // Display human-readable transaction preview card
  const previewCard = renderHumanReadablePreview(tx);
  modalBody.appendChild(previewCard);

  const uuid = data.uuid;

  if (data.next && data.next.always) {
    window.lastXummNext = data.next.always;
    
    const pushInfo = document.createElement('div');
    pushInfo.className = `alert text-center ${data.pushed ? 'alert-info' : 'alert-warning'}`;
    if (data.pushed) {
      pushInfo.innerHTML = `
        <i class="bi bi-phone-vibrate fs-4 d-block mb-2 text-primary"></i>
        <strong>Push notification sent!</strong><br>
        Check your connected device to review and sign.
        <div class="mt-3 small text-muted border-top border-info pt-2">Didn't receive it? Scan the QR code below.</div>
      `;
    } else {
      pushInfo.innerHTML = `
        <i class="bi bi-qr-code-scan fs-4 d-block mb-2 text-warning"></i>
        <strong>Awaiting Signature</strong><br>
        Scan the QR code below using the Xaman app to continue.
      `;
    }
    
    if (data.refs && data.refs.qr_png) {
      const qrImg = document.createElement('img');
      qrImg.src = data.refs.qr_png;
      qrImg.className = 'img-fluid rounded mt-2 shadow-sm d-block mx-auto';
      qrImg.style.maxWidth = '200px';
      pushInfo.appendChild(qrImg);
    }
    
    const openLink = document.createElement('div');
    openLink.style.marginTop = '16px';
    openLink.innerHTML = `
      <a href="${data.next.always}" target="_blank" class="btn btn-primary btn-md w-100 fw-bold py-2 shadow-sm" style="background-color: #0d6efd; border-color: #0d6efd;">
        <i class="bi bi-box-arrow-up-right me-1"></i> Open Xaman directly (Mobile)
      </a>
    `;
    pushInfo.appendChild(openLink);
    modalBody.appendChild(pushInfo);
    
    const pollingStatus = document.getElementById('payloadPollingStatus');
    if (pollingStatus) {
      pollingStatus.innerHTML = '';
      modalBody.appendChild(pollingStatus);
    }
    
    if (data.refs && data.refs.websocket_status) {
      startPayloadWebSocket(data.refs.websocket_status, uuid);
    } else {
      startPayloadPolling(uuid);
    }
  }
  
  if (data.pushed) {
    showAlert('Push notification sent! Check your device.', 'success');
  } else {
    showAlert(`Push notification failed to deliver. Please scan the QR code to continue.`, 'warning');
  }

  // Center footnote UUID at the very bottom
  const footnote = document.createElement('div');
  footnote.className = 'mt-4 pt-2 border-top text-center text-secondary';
  footnote.style.fontSize = '0.72rem';
  
  const shortUuid = String(uuid).slice(0, 8) + '...' + String(uuid).slice(-8);
  footnote.innerHTML = `
    <span class="d-inline-flex align-items-center gap-1">
      Transaction ID: <span class="font-monospace fw-semibold">${shortUuid}</span>
      <button type="button" class="btn btn-link btn-xs p-0 text-decoration-none text-muted" id="btnCopyFootnoteUuid" title="Copy Full ID" style="font-size: 0.72rem; line-height: 1;">
        <i class="bi bi-copy"></i>
      </button>
    </span>
  `;
  modalBody.appendChild(footnote);

  // Add click listener to footnote copy button
  setTimeout(() => {
    const copyBtn = document.getElementById('btnCopyFootnoteUuid');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        copyToClipboard(String(uuid), 'Transaction ID copied!');
      });
    }
  }, 100);

  const txModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('txSubmittedModal'));
  txModal.show();
};

document.getElementById('buildPayload').addEventListener('click', async (e) => {
  if (e) e.preventDefault();

  if (!window.connectedUserToken) {
    const wantsToConnect = confirm("💡 Connect Wallet First?\n\nTo sign this transaction via Push Notification, please connect your wallet first.\n\nClick 'OK' to connect now.");
    if (wantsToConnect) {
      window.autoResumePayload = true;
      const connectBtn = document.getElementById('connectXamanBtn');
      if (connectBtn) connectBtn.click();
    }
    return;
  }

  const buildSpinner = document.getElementById('buildSpinner');
  setSpinner(buildSpinner, true);
  try {
    let txjson = null;

    if (window.batchTransactions && window.batchTransactions.length > 0) {
      const tx = window.batchTransactions.shift();
      txjson = { ...tx };
      delete txjson._templateName;
      delete txjson._formParams;
      updateBatchUI();
    } else {
      txjson = await getFormTxJson(false);
      if (!txjson) {
        setSpinner(buildSpinner, false);
        return;
      }
      delete txjson._templateName;
      delete txjson._formParams;
    }

    // Estimate network fees before proceeding to XUMM
    const feeResp = await fetch('/estimate_fee', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(txjson)
    });
    if (feeResp.ok) {
      const feeData = await feeResp.json();
      const feeDrops = Number(feeData.estimated_fee_drops);
      let confirmMsg = `Estimated network fee for this transaction is ${feeDrops.toLocaleString()} drops.\n\nProceed to ask XUMM to sign it?`;
      if (feeDrops > 100000) {
        confirmMsg = `⚠️ WARNING: High Network Fee Detected!\n\nThe estimated fee is ${(feeDrops / 1000000)} XRP (${feeDrops.toLocaleString()} drops), which is unusually high.\n\nAre you sure you want to proceed and request signature?`;
      }
      const userConfirmed = confirm(confirmMsg);
      if (!userConfirmed) {
        setSpinner(buildSpinner, false);
        return;
      }
      // Note: We deliberately do NOT enforce the fee on txjson.Fee here. Letting Xaman dynamically calculate the fee prevents "Cannot fetch account/transaction" evaluation errors.
    }

    const reqBody = { 
      txjson: txjson,
      user_token: window.connectedUserToken,
      custom_meta: {
        identifier: 'Self-Custodial Escrow',
        instruction: 'Please review and sign this newly created transaction.'
      }
    };
    
    if (window.batchTransactions && window.batchTransactions.length > 0) {
      reqBody.custom_meta = {
        identifier: 'Queued Transaction',
        instruction: `Please sign this transaction. There are ${window.batchTransactions.length} more remaining in your queue.`
      };
    }

    const resp = await fetch('/xumm/payload', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(reqBody)
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || JSON.stringify(data));

    const resDiv = payloadResultEl || document.getElementById('payloadResult');
    if (resDiv) resDiv.innerHTML = ''; // Clear any old errors from the main screen

    showSubmittedModal(data, txjson);
  } catch (err) {
    const errorMsg = err.message || String(err).replace(/^Error:\s*/, '');
    const resDiv = payloadResultEl || document.getElementById('payloadResult');
    if (resDiv) {
      resDiv.innerHTML = `
        <div class="alert alert-danger mt-3 shadow-sm border-danger">
          <h6 class="fw-bold mb-2"><i class="bi bi-exclamation-triangle-fill text-danger me-2"></i> Payload Validation Failed</h6>
          <p class="mb-0 small text-dark">${escapeHtml(errorMsg)}</p>
        </div>
      `;
    }
    showAlert('Failed to build payload. See details below.', 'error');
    
    // Auto-disconnect if session is forbidden
    if (errorMsg.includes('403 Forbidden') || errorMsg.includes('Session Expired')) {
      const disconnectBtn = document.getElementById('disconnectBtn');
      if (disconnectBtn) disconnectBtn.click();
    }
  } finally {
    setSpinner(buildSpinner, false);
  }
});

async function updateDashboard(account) {
  const dashDisconnected = document.getElementById('dashboard-disconnected');
  const dashConnected = document.getElementById('dashboard-connected');
  const dashAccountAddr = document.getElementById('dashboard-account-address');
  const dashBalance = document.getElementById('dashboard-balance');
  const dashEscrowsCount = document.getElementById('dashboard-active-escrows-count');
  const dashEscrowsContainer = document.getElementById('dashboardEscrowsContainer');

  if (!account) {
    if (dashDisconnected) dashDisconnected.style.display = 'block';
    if (dashConnected) dashConnected.style.display = 'none';
    return;
  }

  if (dashDisconnected) dashDisconnected.style.display = 'none';
  if (dashConnected) dashConnected.style.display = 'block';
  if (dashAccountAddr) dashAccountAddr.textContent = account;

  // 1. Fetch balance from endpoint
  try {
    const res = await fetch(`/account_info/${encodeURIComponent(account)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.Balance) {
        const xrp = Number(data.Balance) / 1000000;
        if (dashBalance) dashBalance.textContent = `${xrp.toLocaleString(undefined, { maximumFractionDigits: 4 })} XRP`;
      }
    } else {
      if (dashBalance) dashBalance.textContent = 'Unfunded Wallet';
    }
  } catch (err) {
    console.error("Error fetching account balance:", err);
    if (dashBalance) dashBalance.textContent = 'Error Loading';
  }

  // 2. Fetch and render active escrows on dashboard
  if (dashEscrowsContainer) {
    dashEscrowsContainer.innerHTML = '<div class="text-center py-3"><span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Scanning ledger...</div>';
    try {
      const escrows = await fetchActiveEscrows(account);
      dashEscrowsContainer.innerHTML = '';
      if (dashEscrowsCount) dashEscrowsCount.textContent = escrows.length;

      const sumEl = document.getElementById('dashboard-active-escrows-sum');
      if (sumEl) {
        if (escrows.length > 0) {
          const totals = {};
          escrows.forEach(e => {
            let cur = 'XRP';
            let val = 0;
            if (typeof e.Amount === 'string') {
              cur = 'XRP';
              val = Number(e.Amount) / 1000000;
            } else if (typeof e.Amount === 'object' && e.Amount !== null) {
              cur = e.Amount.currency ? decodeCurrencyCode(e.Amount.currency) : 'Token';
              val = Number(e.Amount.value || 0);
            }
            totals[cur] = (totals[cur] || 0) + val;
          });
          
          const sumParts = Object.entries(totals).map(([cur, val]) => {
            return `${val.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${cur}`;
          });
          
          sumEl.textContent = `Sum: ${sumParts.join(', ')} Locked`;
          sumEl.style.display = 'block';
        } else {
          sumEl.style.display = 'none';
        }
      }
      
      if (escrows.length === 0) {
        dashEscrowsContainer.innerHTML = '<div class="alert alert-info mb-0">No active escrows found for your account on the ledger.</div>';
        return;
      }
      
      await renderActiveEscrows(account, dashEscrowsContainer, escrows);
    } catch (err) {
      dashEscrowsContainer.innerHTML = `
        <div class="alert alert-danger mb-0 d-flex align-items-center justify-content-between flex-wrap gap-2">
          <span><i class="bi bi-wifi-off me-2"></i> Error scanning escrows: ${escapeHtml(err.message || String(err))}</span>
          <button class="btn btn-sm btn-danger py-1 px-3" onclick="updateDashboard('${account}')"><i class="bi bi-arrow-clockwise"></i> Retry</button>
        </div>
      `;
    }
  }
}

function updateXamanUI(account) {
  if (!connectXamanBtnEl) return;
  connectXamanBtnEl.innerHTML = `<i class="bi bi-person-check"></i> ${account.substring(0, 6)}...${account.substring(account.length - 4)}`;
  connectXamanBtnEl.classList.remove('btn-outline-light');
  connectXamanBtnEl.classList.add('btn-light', 'fw-bold', 'opacity-100');
  connectXamanBtnEl.disabled = true;
  
  if (!document.getElementById('copyAddressBtn')) {
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.id = 'copyAddressBtn';
    copyBtn.className = 'btn btn-outline-light btn-sm';
    copyBtn.title = 'Copy Address';
    copyBtn.innerHTML = '<i class="bi bi-copy"></i>';
    copyBtn.addEventListener('click', () => {
      copyToClipboard(account, 'Address copied!');
    });
    connectXamanBtnEl.parentNode.insertBefore(copyBtn, connectXamanBtnEl.nextSibling);
  }

  if (!document.getElementById('disconnectBtn')) {
    const disconnectBtn = document.createElement('button');
    disconnectBtn.type = 'button';
    disconnectBtn.id = 'disconnectBtn';
    disconnectBtn.className = 'btn btn-outline-danger btn-sm';
    disconnectBtn.title = 'Disconnect';
    disconnectBtn.innerHTML = '<i class="bi bi-power"></i>';
    disconnectBtn.addEventListener('click', () => {
      window.connectedAccount = null;
      window.connectedUserToken = null;
      window.userTrustlines = [];
      localStorage.removeItem('xamanUserToken');
      localStorage.removeItem('xamanAccount');
      connectXamanBtnEl.innerHTML = '<i class="bi bi-qr-code-scan"></i> Connect Wallet';
      connectXamanBtnEl.classList.remove('btn-light', 'fw-bold', 'opacity-100');
      connectXamanBtnEl.classList.add('btn-outline-light');
      connectXamanBtnEl.disabled = false;
      document.getElementById('copyAddressBtn')?.remove();
      disconnectBtn.remove();
      updateDashboard(null);
      updateFormTrustlinesDropdowns();
      initMemeDashboard();
    });
    const copyBtnNode = document.getElementById('copyAddressBtn');
    connectXamanBtnEl.parentNode.insertBefore(disconnectBtn, copyBtnNode.nextSibling);
  }

  updateDashboard(account);
  fetchUserTrustlines(account);
  initMemeDashboard();

  // Auto-fill form fields if a template is currently open and inputs are empty
  const accountInput = document.getElementById('field_ACCOUNT');
  if (accountInput && !accountInput.value) {
    accountInput.value = account;
    accountInput.dispatchEvent(new Event('input', { bubbles: true }));
    accountInput.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  const ownerInput = document.getElementById('field_OWNER');
  if (ownerInput && !ownerInput.value) {
    ownerInput.value = account;
    ownerInput.dispatchEvent(new Event('input', { bubbles: true }));
    ownerInput.dispatchEvent(new Event('blur', { bubbles: true }));
  }
}

// Session check moved to DOMContentLoaded listener to avoid hoisting errors

// No wallet address input is shown; user fills required ACCOUNT fields in the selected escrow.

function stopSignInPolling() {
  if (signInPollingInterval) {
    clearInterval(signInPollingInterval);
    signInPollingInterval = null;
  }
  if (connectXamanBtnEl) {
    const originalHtml = connectXamanBtnEl.getAttribute('data-original-html') || '<i class="bi bi-qr-code-scan"></i> Connect Wallet';
    connectXamanBtnEl.innerHTML = originalHtml;
    connectXamanBtnEl.disabled = false;
  }
}
window.stopSignInPolling = stopSignInPolling;

if (connectXamanBtnEl) connectXamanBtnEl.addEventListener('click', async () => {
  const originalHtml = connectXamanBtnEl.innerHTML;
  connectXamanBtnEl.setAttribute('data-original-html', originalHtml);
  connectXamanBtnEl.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Connecting...';
  connectXamanBtnEl.disabled = true;

  try {
    // Generate the SignIn pseudo-transaction via the backend
    const resp = await fetch('/xumm/payload', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ txjson: { TransactionType: "SignIn" } })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || JSON.stringify(data));

    // Inject QR code and metadata into center modal content
    const modalContent = document.getElementById('xamanConnectModalContent');
    if (modalContent) {
      modalContent.innerHTML = `
        <div class="mb-3">
          <img src="${data.refs.qr_png}" class="img-fluid rounded shadow mb-3" style="max-width: 240px;" alt="Xaman QR">
        </div>
        <h6 class="fw-bold mb-2">Scan with your Xaman App</h6>
        <p class="text-secondary small mb-3">Scan this QR code using the camera or Xaman app to connect your wallet securely.</p>
        <div class="d-grid gap-2 col-10 mx-auto">
          <a href="${data.next.always}" target="_blank" class="btn btn-primary btn-sm">
            <i class="bi bi-box-arrow-up-right me-1"></i> Open Xaman (Mobile Link)
          </a>
          <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" onclick="stopSignInPolling()">
            Cancel
          </button>
        </div>
      `;
    }

    // Display the center modal
    const modalEl = document.getElementById('xamanConnectModal');
    if (modalEl) {
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }

    // Start polling for sign-in resolution
    startSignInPolling(data.uuid, originalHtml);
  } catch (err) {
    showAlert('Error connecting: ' + String(err), 'error');
    connectXamanBtnEl.innerHTML = originalHtml;
    connectXamanBtnEl.disabled = false;
  }
});

let signInPollingInterval = null;
function startSignInPolling(uuid, originalHtml) {
  if (signInPollingInterval) clearInterval(signInPollingInterval);
  
  signInPollingInterval = setInterval(async () => {
    try {
      const resp = await fetch(`/xumm/payload_status/${uuid}`);
      if (!resp.ok) return;
      const data = await resp.json();
      const state = normalizePayloadState(data).toLowerCase();
      
      if (isFinalPayloadState(state)) {
        clearInterval(signInPollingInterval);
        signInPollingInterval = null;
        window.closeActiveXamanPopup();
        
        // Hide the connection modal if visible
        const modalEl = document.getElementById('xamanConnectModal');
        if (modalEl) {
          const modal = bootstrap.Modal.getInstance(modalEl);
          if (modal) modal.hide();
        }
        
        const qrContainer = document.getElementById('xamanQrContainer');
        if (qrContainer) qrContainer.remove();

        if (state === 'signed') {
          // Extract the user's R-address from the payload resolution
          const account = data.remote?.response?.account || data.local?.response?.payloadResponse?.account || data.local?.response?.response?.account || data.local?.response?.account;
          
          if (account) {
            window.connectedAccount = account;
            localStorage.setItem('xamanAccount', account);

            // Capture user_token for future Push Notifications
            const userToken = data.remote?.application?.issued_user_token || data.remote?.response?.user || data.local?.response?.application?.issued_user_token || data.local?.response?.payloadResponse?.user || data.local?.response?.user;
            if (userToken) {
              window.connectedUserToken = userToken;
              localStorage.setItem('xamanUserToken', userToken);
            }
            showAlert(`Successfully connected: ${account}`, 'success');
            
            updateXamanUI(account);
            initMemeDashboard();
            loadSignatureHistory();
            
            // Auto-fill active escrow viewer if empty and trigger a scan
            const escrowAccountInput = document.getElementById('escrowAccountInput');
            if (escrowAccountInput && !escrowAccountInput.value) {
                escrowAccountInput.value = account;
                document.getElementById('fetchEscrowsBtn').click();
            }
            
            // Auto-resume payload execution if they were intercepted for a push notification
            if (window.autoResumePayload) {
              window.autoResumePayload = false;
              setTimeout(() => {
                const btn = document.getElementById('buildPayload');
                if (btn) btn.click();
              }, 1500);
            }
            
            // Auto-resume direct actions (Claim/Cancel Escrow) if they were intercepted
            if (window.autoResumeDirectAction) {
              const { action, escrow } = window.autoResumeDirectAction;
              window.autoResumeDirectAction = null;
              setTimeout(() => {
                executeDirectEscrowAction(action, escrow);
              }, 1500);
            }
          } else {
            showAlert('Sign-in completed but account address was not found in the response payload.', 'warning');
            connectXamanBtnEl.innerHTML = originalHtml;
            connectXamanBtnEl.disabled = false;
          }
        } else {
          showAlert(`Sign-in was ${state}`, 'warning');
          connectXamanBtnEl.innerHTML = originalHtml;
          connectXamanBtnEl.disabled = false;
        }
      }
    } catch (e) {
      console.error("Sign-in polling error", e);
    }
  }, 3000);
}

if (connectXamanBtnEl) {
  const enableEscrowsBtn = document.createElement('button');
  enableEscrowsBtn.type = 'button';
  enableEscrowsBtn.className = 'btn btn-outline-info ms-2';
  enableEscrowsBtn.id = 'enableEscrowsBtn';
  enableEscrowsBtn.innerHTML = '<i class="bi bi-shield-check"></i> Enable Escrows for my Token';
  connectXamanBtnEl.parentNode.insertBefore(enableEscrowsBtn, connectXamanBtnEl.nextSibling);

  enableEscrowsBtn.addEventListener('click', async () => {
    if (!window.connectedUserToken) {
      const wantsToConnect = confirm("💡 Connect Wallet First?\n\nTo enable escrows via Push Notification, please connect your wallet first.\n\nClick 'OK' to connect now.");
      if (wantsToConnect) {
        const connectBtn = document.getElementById('connectXamanBtn');
        if (connectBtn) connectBtn.click();
      }
      return;
    }

    const account = prompt("Enter your Token's Issuing Account (rAddress) to enable Trust Line Locking:");
    if (!account) return;
    const trimmedAccount = account.trim();
    if (!trimmedAccount) return;

    if (!isValidXRPLAddressFormat(trimmedAccount)) {
      showAlert('Invalid address format. Classic XRPL addresses must start with "r" and be 25-35 characters long.', 'warning');
      return;
    }

    const originalHtml = enableEscrowsBtn.innerHTML;
    enableEscrowsBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Checking status...';
    enableEscrowsBtn.disabled = true;

    try {
      // Check if already enabled
      const checkResp = await fetch(`/check_issuer_status/${encodeURIComponent(trimmedAccount)}`);
      if (!checkResp.ok) {
        let checkErrMsg = await checkResp.text();
        try { const errJson = JSON.parse(checkErrMsg); if (errJson.detail) checkErrMsg = errJson.detail; } catch (e) {}
        throw new Error("Failed to check issuer status: " + checkErrMsg);
      }
      const checkData = await checkResp.json();
      
      if (checkData.escrows_enabled) {
        showAlert('Trust Line Locking (Escrows) is already enabled for this issuer account!', 'info');
        return;
      }

      enableEscrowsBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';

      // Build payload from template
      const buildResp = await fetch(`/templates/enable_token_escrows/build`, {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ ACCOUNT: trimmedAccount })
      });
      if (!buildResp.ok) {
        let errMsg = await buildResp.text();
        try { const errJson = JSON.parse(errMsg); if (errJson.detail) errMsg = errJson.detail; } catch (e) {}
        throw new Error(errMsg);
      }
      const txjson = await buildResp.json();

      // Estimate fee
      const feeResp = await fetch('/estimate_fee', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(txjson)
      });
      if (feeResp.ok) {
        const feeData = await feeResp.json();
        txjson.Fee = String(feeData.estimated_fee_drops);
        if (Number(feeData.estimated_fee_drops) > 100000) {
          const proceed = confirm(`⚠️ Warning: High Network Fee!\n\nThe estimated fee is ${(Number(feeData.estimated_fee_drops) / 1000000)} XRP, which is unusually high.\n\nDo you want to proceed anyway?`);
          if (!proceed) throw new Error("Transaction cancelled due to high network fee.");
        }
      }

      // Send to XUMM
      const reqBody = { 
        txjson: txjson, 
        user_token: window.connectedUserToken,
        custom_meta: {
          identifier: 'Enable Token Escrows',
          instruction: 'Please sign this transaction to enable Trust Line Locking for your token.'
        }
      };
      const resp = await fetch('/xumm/payload', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(reqBody)
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || JSON.stringify(data));

      if (data.next && data.next.always) {
        window.lastXummNext = data.next.always;
        if (data.pushed) {
          showAlert(`Push notification sent! Check your device to enable escrows.<br><span class="small">Didn't receive it? <a href="${data.next.always}" target="_blank">Open Xaman Manually</a></span>`, 'success', true);
        } else {
          showAlert(`Push notification failed to deliver.<br><img src="${data.refs.qr_png}" class="mt-2 mb-2 rounded shadow-sm d-block mx-auto" style="max-width: 150px;"><div class="text-center"><a href="${data.next.always}" target="_blank" class="alert-link small">Or click here to open Xaman</a></div>`, 'warning', true);
        }
        if (data.refs && data.refs.websocket_status) {
          startPayloadWebSocket(data.refs.websocket_status, data.uuid);
        } else {
          startPayloadPolling(data.uuid);
        }
      }
    } catch (err) {
      showAlert('Error enabling escrows: ' + String(err), 'error');
    if (String(err).includes('403 Forbidden') || String(err).includes('Session Expired')) {
      const disconnectBtn = document.getElementById('disconnectBtn');
      if (disconnectBtn) disconnectBtn.click();
    }
    } finally {
      enableEscrowsBtn.innerHTML = originalHtml;
      enableEscrowsBtn.disabled = false;
    }
  });
}


// --- Dynamic Escrow Status Helpers ---

async function getLedgerTime() {
  try {
    const resp = await fetch('/ledger_time');
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.network_time; // XRPL epoch seconds
  } catch (err) {
    console.error("Failed to fetch ledger time:", err);
    return null;
  }
}

function evaluateEscrowState(escrow, ledgerTime) {
  let canClaim = false;
  let canCancel = false;

  // Escrows use XRPL Epoch time (seconds since Jan 1 2000)
  if (escrow.CancelAfter && ledgerTime >= escrow.CancelAfter) {
    // If past CancelAfter, it can only be cancelled, not claimed.
    canCancel = true;
  } else if (escrow.FinishAfter && ledgerTime >= escrow.FinishAfter) {
    // Time locked, but condition/time has now been met
    canClaim = true;
  } else if (!escrow.FinishAfter && !escrow.CancelAfter && escrow.Condition) {
    // Purely conditional escrow without any time locks
    canClaim = true;
  } else if (escrow.FinishAfter === undefined && escrow.CancelAfter && ledgerTime < escrow.CancelAfter) {
    // Time locked by CancelAfter, but before expiration
    canClaim = true;
  }

  return { canClaim, canCancel };
}

/**
 * Example usage: Pass your array of active escrow objects into this function.
 * It will fetch the true network time and toggle buttons by matching their HTML IDs.
 * Assumes buttons have IDs like: id="btn-claim-ESCROW_NODE_ID"
 */
async function refreshEscrowUI(activeEscrows) {
  const ledgerTime = await getLedgerTime();
  if (ledgerTime === null) return; // Silent fallback if network is unreachable

  activeEscrows.forEach(escrow => {
    const state = evaluateEscrowState(escrow, ledgerTime);
    const claimBtn = document.getElementById(`btn-claim-${escrow.index}`);
    const cancelBtn = document.getElementById(`btn-cancel-${escrow.index}`);
    
    if (claimBtn) {
      if (state.canClaim) {
        claimBtn.disabled = false;
        claimBtn.className = 'btn btn-success btn-sm me-2 fw-bold shadow-sm';
        claimBtn.innerHTML = '<i class="bi bi-unlock me-1"></i> Claim';
      } else {
        claimBtn.disabled = true;
        claimBtn.className = 'btn btn-sm border-0 bg-transparent text-secondary opacity-35 me-2';
        claimBtn.innerHTML = '<i class="bi bi-lock me-1"></i> Claim';
      }
    }
    if (cancelBtn) {
      if (state.canCancel) {
        cancelBtn.disabled = false;
        cancelBtn.className = 'btn btn-danger btn-sm fw-bold shadow-sm';
        cancelBtn.innerHTML = '<i class="bi bi-x-octagon me-1"></i> Cancel';
      } else {
        cancelBtn.disabled = true;
        cancelBtn.className = 'btn btn-sm border-0 bg-transparent text-secondary opacity-35';
        cancelBtn.innerHTML = '<i class="bi bi-lock me-1"></i> Cancel';
      }
    }
  });
}

// --- Active Escrow Fetching ---

async function fetchActiveEscrows(account) {
  try {
    const resp = await fetch(`/active_escrows/${encodeURIComponent(account)}`);
    if (!resp.ok) {
      let errMsg = await resp.text();
      try { const errJson = JSON.parse(errMsg); if (errJson.detail) errMsg = errJson.detail; } catch (e) {}
      throw new Error(errMsg);
    }
    const data = await resp.json();
    return data.escrows || [];
  } catch (err) {
    console.error("Failed to fetch active escrows:", err);
    showAlert('Error fetching active escrows: ' + String(err), 'error');
    throw err;
  }
}

function triggerEscrowAction(actionTemplate, escrow) {
  // Switch to the Build Escrow tab if tab element exists
  const buildTabBtn = document.getElementById('tab-build-btn');
  if (buildTabBtn && window.bootstrap && window.bootstrap.Tab) {
    const tab = window.bootstrap.Tab.getOrCreateInstance(buildTabBtn);
    tab.show();
  }

  // 1. Expand the templates section if it is collapsed
  const templatesSection = document.getElementById('templatesSection');
  if (templatesSection && !templatesSection.classList.contains('show')) {
    if (window.bootstrap && window.bootstrap.Collapse) {
      new window.bootstrap.Collapse(templatesSection, {toggle: false}).show();
    } else {
      templatesSection.classList.add('show');
    }
  }

  // 2. Select the template card visually
  const sel = document.getElementById('templateSelect');
  if (sel) sel.value = actionTemplate;

  const targetRow = document.querySelector(`.template-row[data-name="${actionTemplate}"]`);
  if (targetRow) {
    const header = targetRow.querySelector('div');
    if (header) {
      header.click();
    }
  } else {
    renderFields();
  }

  // 4. Auto-fill what we know and smoothly scroll the user up
  setTimeout(() => {
    const accountField = document.getElementById('field_ACCOUNT');
    const ownerField = document.getElementById('field_OWNER');
        const offerSeqField = document.getElementById('field_OFFER_SEQUENCE');

        if (accountField) accountField.value = window.connectedAccount || (actionTemplate === 'escrow_finish' ? escrow.Destination : escrow.Account);
    if (ownerField) ownerField.value = escrow.Account;
        if (offerSeqField) offerSeqField.value = escrow.OfferSequence;

    const cardHeader = document.querySelector('#templatesSection').parentElement;
    if (cardHeader) cardHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showAlert(`${actionTemplate === 'escrow_finish' ? 'Finish' : 'Cancel'} template loaded. Fill in any missing fields.`, 'info');
  }, 50);
}

async function executeDirectEscrowAction(action, escrow) {
  // Safeguard: Check if user is attempting to cancel a time-locked escrow before expiration
  if (action === 'escrow_cancel') {
    const nowUnix = Math.floor(Date.now() / 1000) - 946684800; // XRPL Epoch seconds
    if (escrow.CancelAfter && nowUnix < escrow.CancelAfter) {
      const remainingSecs = escrow.CancelAfter - nowUnix;
      const hours = (remainingSecs / 3600).toFixed(1);
      const confirmCancel = confirm(`⚠️ Warning: Expiration Lock Still Active!\n\nThis escrow is not scheduled to expire for another ${hours} hours.\n\nAre you sure you want to attempt this cancellation anyway? (It will likely be rejected by the XRPL ledger).`);
      if (!confirmCancel) return;
    }
  }

  // If the escrow has a condition, the user must provide a Fulfillment. Direct them to the builder.
  if (action === 'escrow_finish' && escrow.Condition) {
    triggerEscrowAction(action, escrow);
    showAlert('This is a conditional escrow. Please provide the Fulfillment to claim.', 'info');
    return;
  }

  const btnId = action === 'escrow_finish' ? `btn-claim-${escrow.index}` : `btn-cancel-${escrow.index}`;
  const btn = document.getElementById(btnId);
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
    btn.disabled = true;
  }

  let pushToken = window.connectedUserToken;
  if (!pushToken) {
    const wantsToConnect = confirm("💡 Connect Wallet First?\n\nTo sign transactions via Push Notification, please connect your wallet first.\n\nClick 'OK' to connect now.");
    if (wantsToConnect) {
      window.autoResumeDirectAction = { action, escrow }; // Save context to auto-resume
      const connectBtn = document.getElementById('connectXamanBtn');
      if (connectBtn) connectBtn.click();
    }
    if (btn) {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
    return; // Stop action and wait for connection
  }

  try {
    const txjson = {
      TransactionType: action === 'escrow_finish' ? 'EscrowFinish' : 'EscrowCancel',
      Account: window.connectedAccount || (action === 'escrow_finish' ? escrow.Destination : escrow.Account),
      Owner: escrow.Account,
      OfferSequence: escrow.OfferSequence
    };

    // Estimate fee
    const feeResp = await fetch('/estimate_fee', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(txjson)
    });
    if (feeResp.ok) {
      const feeData = await feeResp.json();
      txjson.Fee = String(feeData.estimated_fee_drops);
      if (Number(feeData.estimated_fee_drops) > 100000) {
        const proceed = confirm(`⚠️ Warning: High Network Fee!\n\nThe estimated fee is ${(Number(feeData.estimated_fee_drops) / 1000000)} XRP, which is unusually high.\n\nDo you want to proceed anyway?`);
        if (!proceed) throw new Error("Transaction cancelled due to high network fee.");
      }
    }

    const reqBody = { 
      txjson: txjson, 
      user_token: pushToken,
      custom_meta: {
        identifier: 'Escrow Action',
        instruction: `Please sign this request to ${action === 'escrow_finish' ? 'claim' : 'cancel'} the escrow.`
      }
    };
    const resp = await fetch('/xumm/payload', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(reqBody)
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || JSON.stringify(data));

    if (data.next && data.next.always) {
      window.lastXummNext = data.next.always;
      if (data.pushed) {
        showAlert(`Push notification sent! Check your device to sign.<br><span class="small">Didn't receive it? <a href="${data.next.always}" target="_blank">Open Xaman Manually</a></span>`, 'success', true);
      } else {
        showAlert(`Push notification failed to deliver.<br><img src="${data.refs.qr_png}" class="mt-2 mb-2 rounded shadow-sm d-block mx-auto" style="max-width: 150px;"><div class="text-center"><a href="${data.next.always}" target="_blank" class="alert-link small">Or click here to open Xaman</a></div>`, 'warning', true);
      }
      if (data.refs && data.refs.websocket_status) {
        startPayloadWebSocket(data.refs.websocket_status, data.uuid);
      } else {
        startPayloadPolling(data.uuid);
      }
    }
  } catch (err) {
    showAlert('Error executing action: ' + String(err), 'error');
  } finally {
    if (btn) {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  }
}

// --- CSV Export Helper ---
function exportEscrowsToCSV(escrows, accountAddress) {
  if (!escrows || escrows.length === 0) return;
  
  const headers = ['Escrow Index/ID', 'Sender (Account)', 'Recipient (Destination)', 'Amount', 'Asset/Currency', 'FinishAfter (Unix)', 'CancelAfter (Unix)', 'Condition (Hex)'];
  const rows = escrows.map(escrow => {
    let amountVal = '0';
    let assetStr = 'XRP';
    if (typeof escrow.Amount === 'string') {
      amountVal = Number(escrow.Amount) / 1000000;
      assetStr = 'XRP';
    } else if (typeof escrow.Amount === 'object' && escrow.Amount !== null) {
      amountVal = escrow.Amount.value || '0';
      assetStr = escrow.Amount.currency ? decodeCurrencyCode(escrow.Amount.currency) : 'Token';
    }
    
    return [
      escrow.index || '',
      escrow.Account || '',
      escrow.Destination || '',
      amountVal,
      assetStr,
      escrow.FinishAfter || '',
      escrow.CancelAfter || '',
      escrow.Condition || ''
    ];
  });
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `escrow_history_${accountAddress || 'scan'}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --- Live Ticking Countdown Helpers ---
function formatSecondsToRelative(diff) {
  if (diff <= 0) return '0s';
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  const secs = diff % 60;
  
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

function startLiveCountdownTimer() {
  if (window.liveCountdownTimer) clearInterval(window.liveCountdownTimer);
  window.liveCountdownTimer = setInterval(() => {
    const nowUnix = Math.floor(Date.now() / 1000);
    const xrplNow = nowUnix - 946684800; // XRPL Epoch seconds
    
    document.querySelectorAll('.escrow-countdown-timer').forEach(el => {
      const finishAfter = el.dataset.finish ? Number(el.dataset.finish) : null;
      const cancelAfter = el.dataset.cancel ? Number(el.dataset.cancel) : null;
      
      let text = '';
      if (finishAfter && xrplNow < finishAfter) {
        text = `unlocks in ${formatSecondsToRelative(finishAfter - xrplNow)}`;
      } else if (cancelAfter && xrplNow < cancelAfter) {
        text = `expires in ${formatSecondsToRelative(cancelAfter - xrplNow)}`;
      } else if (cancelAfter && xrplNow >= cancelAfter) {
        text = 'Expired';
      } else {
        text = 'Ready';
      }
      el.textContent = `(${text})`;
    });

    document.querySelectorAll('.escrow-progress-container').forEach(el => {
      const finishAfter = el.dataset.finish ? Number(el.dataset.finish) : null;
      const cancelAfter = el.dataset.cancel ? Number(el.dataset.cancel) : null;
      const progressBar = el.querySelector('.progress-bar');
      const progressLabel = el.querySelector('.progress-label');
      const progressText = el.querySelector('.progress-text');
      
      if (!progressBar || !progressLabel) return;
      
      let progressPct = 100;
      let progressColor = 'bg-success';
      let label = 'Ready to Claim!';
      
      if (finishAfter && xrplNow < finishAfter) {
        const remaining = finishAfter - xrplNow;
        const duration = 86400;
        const elapsed = Math.max(0, duration - remaining);
        progressPct = Math.min(95, Math.floor((elapsed / duration) * 100));
        progressColor = 'bg-primary progress-bar-striped progress-bar-animated';
        label = `Locked (unlocks in ${formatSecondsToRelative(finishAfter - xrplNow)})`;
      } else if (cancelAfter && xrplNow >= cancelAfter) {
        progressPct = 100;
        progressColor = 'bg-danger';
        label = 'Expired (Refundable)';
      }
      
      progressBar.className = `progress-bar ${progressColor}`;
      progressBar.style.width = `${progressPct}%`;
      progressLabel.innerHTML = label;
      if (progressText) progressText.textContent = `${progressPct}%`;
    });
  }, 1000);
}

async function renderActiveEscrows(account, container, preFetchedEscrows = null) {
  if (!container) return;

  container.innerHTML = '<div class="text-center my-3"><span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Scanning ledger...</div>';
  
  let escrows = preFetchedEscrows || await fetchActiveEscrows(account);
  container.innerHTML = '';

  // Save to global window for CSV export and background ticking
  window.currentEscrows = escrows;

  // Show/Hide CSV export button and bind event
  const exportBtn = document.getElementById('btnExportEscrowsCSV');
  if (exportBtn) {
    if (escrows.length > 0) {
      exportBtn.classList.remove('d-none');
      const newExportBtn = exportBtn.cloneNode(true);
      exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
      newExportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        exportEscrowsToCSV(escrows, account);
      });
    } else {
      exportBtn.classList.add('d-none');
    }
  }

  // Update Last Synced Time
  const syncTimeEl = document.getElementById('dashboardSyncTime');
  if (syncTimeEl) {
    syncTimeEl.textContent = `Last synced: ${new Date().toLocaleTimeString()}`;
  }

  if (escrows.length === 0) {
    container.innerHTML = '<div class="alert alert-info mb-0">No active escrows found for this account on the ledger.</div>';
    return;
  }

  // Sort escrows by release date (FinishAfter) or amount
  const sortType = localStorage.getItem('escrowSortType') || 'release_soonest';
  escrows = [...escrows].sort((a, b) => {
    const getReleaseTime = (esc) => {
      if (esc.FinishAfter !== undefined && esc.FinishAfter !== null) {
        return Number(esc.FinishAfter);
      }
      if (esc.CancelAfter !== undefined && esc.CancelAfter !== null) {
        return Number(esc.CancelAfter);
      }
      return null;
    };

    const getAmountDrops = (esc) => {
      const amt = esc.Amount;
      if (typeof amt === 'string') return Number(amt);
      if (typeof amt === 'object' && amt !== null && amt.value) return Number(amt.value);
      return 0;
    };

    if (sortType === 'release_soonest') {
      const ta = getReleaseTime(a);
      const tb = getReleaseTime(b);
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return ta - tb;
    } else if (sortType === 'release_latest') {
      const ta = getReleaseTime(a);
      const tb = getReleaseTime(b);
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return tb - ta;
    } else if (sortType === 'amount_desc') {
      return getAmountDrops(b) - getAmountDrops(a);
    } else if (sortType === 'amount_asc') {
      return getAmountDrops(a) - getAmountDrops(b);
    }
    return 0;
  });

  const formatTime = (epochSeconds) => {
    if (!epochSeconds) return 'N/A';
    return new Date((epochSeconds + 946684800) * 1000).toLocaleString();
  };

  const getRelativeTimeHtml = (epochSeconds) => {
    if (!epochSeconds) return '';
    const nowUnix = Math.floor(Date.now() / 1000);
    const targetUnix = epochSeconds + 946684800;
    const diff = targetUnix - nowUnix;
    
    if (diff <= 0) return 'Ready';
    
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    
    let str = 'in ';
    if (days > 0) str += `${days}d ${hours}h`;
    else if (hours > 0) str += `${hours}h ${mins}m`;
    else str += `${mins}m`;
    
    return str;
  };

  if (window.escrowViewType === 'list') {
    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-responsive';
    
    const table = document.createElement('table');
    table.className = 'table table-hover align-middle mb-0 text-dark-emphasis small';
    
    table.innerHTML = `
      <thead style="border-bottom: 2px solid var(--card-border);">
        <tr style="background-color: var(--card-bg);">
          <th scope="col" style="font-size: 0.72rem; background-color: var(--card-bg); color: var(--text-color);" class="text-uppercase fw-bold">Asset</th>
          <th scope="col" style="font-size: 0.72rem; background-color: var(--card-bg); color: var(--text-color);" class="text-uppercase fw-bold">Amount</th>
          <th scope="col" style="font-size: 0.72rem; background-color: var(--card-bg); color: var(--text-color);" class="text-uppercase fw-bold">Type</th>
          <th scope="col" style="font-size: 0.72rem; background-color: var(--card-bg); color: var(--text-color);" class="text-uppercase fw-bold">Address</th>
          <th scope="col" style="font-size: 0.72rem; background-color: var(--card-bg); color: var(--text-color);" class="text-uppercase fw-bold">Unlock/Expiration</th>
          <th scope="col" style="font-size: 0.72rem; background-color: var(--card-bg); color: var(--text-color);" class="text-uppercase fw-bold">Status</th>
          <th scope="col" style="font-size: 0.72rem; background-color: var(--card-bg); color: var(--text-color);" class="text-uppercase fw-bold text-end">Actions</th>
        </tr>
      </thead>
      <tbody class="table-group-divider"></tbody>
    `;
    
    const tbody = table.querySelector('tbody');
    
    escrows.forEach(escrow => {
      let amountVal;
      let assetStr = 'XRP';
      
      if (typeof escrow.Amount === 'string') {
        const xrp = Number(escrow.Amount) / 1000000;
        amountVal = xrp.toLocaleString(undefined, { maximumFractionDigits: 6 });
        assetStr = 'XRP';
      } else if (typeof escrow.Amount === 'object') {
        const tokenVal = Number(escrow.Amount.value).toLocaleString(undefined, { maximumFractionDigits: 8 });
        const decodedCurrency = escrow.Amount.currency ? decodeCurrencyCode(escrow.Amount.currency) : 'Token';
        amountVal = tokenVal;
        assetStr = decodedCurrency;
      } else {
        amountVal = String(escrow.Amount);
      }
      
      const isIncoming = escrow.Account !== account && escrow.Destination === account;
      const isSelf = escrow.Account === escrow.Destination;
      
      let typeBadge = '';
      if (isSelf) {
        typeBadge = '<span class="badge rounded-pill bg-info-subtle text-info border border-info-subtle px-2 py-1"><i class="bi bi-shield-lock-fill me-1"></i>Internal Vault</span>';
      } else {
        typeBadge = isIncoming ? '<span class="badge rounded-pill bg-success-subtle text-success border border-success-subtle px-2 py-1">Incoming</span>' : '<span class="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle px-2 py-1">Outgoing</span>';
      }
      
      let addressHtml = '';
      const copyBtn = (text, label) => `<i class="bi bi-copy text-muted ms-1" style="cursor: pointer; font-size: 0.9em; transition: opacity 0.2s;" onmouseover="this.style.opacity=0.7" onmouseout="this.style.opacity=1" onclick="copyToClipboard('${text}', '${label}')" title="Copy"></i>`;
      
      if (isSelf) {
        addressHtml = `
          <div class="d-flex align-items-center">
            <span class="font-monospace bg-light p-1 px-2 rounded border text-secondary d-flex align-items-center" style="font-size: 0.78rem;" title="${escrow.Account}">
              ${shortenAddress(escrow.Account)}
              ${copyBtn(escrow.Account, 'Account Address Copied!')}
              <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-0.5 ms-1.5 fw-semibold" style="font-size: 0.62rem; line-height: 1;">Me</span>
            </span>
          </div>
        `;
      } else {
        const fmHtml = escrow.Account === account 
          ? `<span class="text-secondary" title="${escrow.Account}">${shortenAddress(escrow.Account)}</span>${copyBtn(escrow.Account, 'Sender Address Copied!')}<span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-0.5 ms-1 fw-semibold" style="font-size: 0.62rem; line-height: 1;">Me</span>`
          : `<span class="text-secondary" title="${escrow.Account}">${shortenAddress(escrow.Account)}</span>${copyBtn(escrow.Account, 'Sender Address Copied!')}`;
        
        const toHtml = escrow.Destination === account 
          ? `<span class="text-secondary" title="${escrow.Destination}">${shortenAddress(escrow.Destination)}</span>${copyBtn(escrow.Destination, 'Recipient Address Copied!')}<span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-0.5 ms-1 fw-semibold" style="font-size: 0.62rem; line-height: 1;">Me</span>`
          : `<span class="text-secondary" title="${escrow.Destination}">${shortenAddress(escrow.Destination)}</span>${copyBtn(escrow.Destination, 'Recipient Address Copied!')}`;

        addressHtml = `
          <div class="d-flex align-items-center gap-1 font-monospace" style="font-size: 0.78rem;">
            <span class="text-muted fw-bold" style="font-size: 0.62rem;">FM:</span>
            ${fmHtml}
            <i class="bi bi-arrow-right text-muted mx-1"></i>
            <span class="text-muted fw-bold" style="font-size: 0.62rem;">TO:</span>
            ${toHtml}
          </div>
        `;
      }
      
      let timeHtml = '<div class="d-flex flex-column gap-1" style="font-size: 0.75rem;">';
      if (escrow.FinishAfter) {
         timeHtml += `<div class="text-success"><i class="bi bi-unlock-fill me-1"></i><strong>Unlocks:</strong> ${formatTime(escrow.FinishAfter)} <span class="escrow-countdown-timer text-secondary fw-semibold" data-finish="${escrow.FinishAfter}">(${getRelativeTimeHtml(escrow.FinishAfter)})</span></div>`;
      }
      if (escrow.CancelAfter) {
         timeHtml += `<div class="text-warning"><i class="bi bi-hourglass-split me-1"></i><strong>Expires:</strong> ${formatTime(escrow.CancelAfter)} <span class="escrow-countdown-timer text-secondary fw-semibold" data-cancel="${escrow.CancelAfter}">(${getRelativeTimeHtml(escrow.CancelAfter)})</span></div>`;
      }
      if (escrow.Condition) {
         timeHtml += `<div class="text-info"><i class="bi bi-key-fill me-1"></i><strong>Condition Required</strong></div>`;
      }
      if (!escrow.FinishAfter && !escrow.CancelAfter && !escrow.Condition) {
         timeHtml += `<div class="text-muted">No conditions</div>`;
      }
      timeHtml += '</div>';
      
      let progressPct = 0;
      let progressColor = 'bg-primary';
      let progressLabel = '';
      const nowVal = Math.floor(Date.now() / 1000) - 946684800; // XRPL Epoch seconds

      if (escrow.FinishAfter && nowVal < escrow.FinishAfter) {
        const remaining = escrow.FinishAfter - nowVal;
        const duration = 86400;
        const elapsed = Math.max(0, duration - remaining);
        progressPct = Math.min(95, Math.floor((elapsed / duration) * 100));
        progressColor = 'bg-primary progress-bar-striped progress-bar-animated';
        const rText = getRelativeTimeHtml(escrow.FinishAfter);
        progressLabel = `Locked (${rText})`;
      } else if (escrow.CancelAfter && nowVal >= escrow.CancelAfter) {
        progressPct = 100;
        progressColor = 'bg-danger';
        progressLabel = 'Expired (Refundable)';
      } else {
        progressPct = 100;
        progressColor = 'bg-success';
        progressLabel = 'Ready to Claim!';
      }
      
      const progressBarHtml = `
        <div style="min-width: 130px;" class="escrow-progress-container" data-finish="${escrow.FinishAfter || ''}" data-cancel="${escrow.CancelAfter || ''}">
          <div class="d-flex justify-content-between mb-1" style="font-size: 0.65rem;">
            <span class="fw-semibold text-secondary progress-label">${progressLabel}</span>
            <span class="text-secondary fw-semibold progress-text">${progressPct}%</span>
          </div>
          <div class="progress" style="height: 5px;">
            <div class="progress-bar ${progressColor}" role="progressbar" style="width: ${progressPct}%" aria-valuenow="${progressPct}" aria-valuemin="0" aria-valuemax="100"></div>
          </div>
        </div>
      `;
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace px-2 py-1">${assetStr}</span></td>
        <td><strong class="fs-6">${amountVal}</strong></td>
        <td>${typeBadge}</td>
        <td>${addressHtml}</td>
        <td>${timeHtml}</td>
        <td>${progressBarHtml}</td>
        <td>
          <div class="d-flex justify-content-end gap-1">
            <button type="button" class="btn btn-sm border-0 bg-transparent text-secondary opacity-35" id="btn-claim-${escrow.index}">
              <i class="bi bi-lock me-1"></i> Claim
            </button>
            <button type="button" class="btn btn-sm border-0 bg-transparent text-secondary opacity-35" id="btn-cancel-${escrow.index}">
              <i class="bi bi-lock me-1"></i> Cancel
            </button>
          </div>
        </td>
      `;
      
      tbody.appendChild(tr);
      
      const claimBtn = tr.querySelector(`#btn-claim-${escrow.index}`);
      if (claimBtn) {
        claimBtn.addEventListener('click', () => executeDirectEscrowAction('escrow_finish', escrow));
      }
      const cancelBtn = tr.querySelector(`#btn-cancel-${escrow.index}`);
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => executeDirectEscrowAction('escrow_cancel', escrow));
      }
    });
    
    tableContainer.appendChild(table);
    container.appendChild(tableContainer);
  } else {
    const grid = document.createElement('div');
    grid.className = 'row g-3';

    escrows.forEach(escrow => {
      const col = document.createElement('div');
      col.className = 'col-12 col-xl-6';

      const item = document.createElement('div');
      item.className = 'card h-100 shadow-sm border';

      const cardBody = document.createElement('div');
      cardBody.className = 'card-body d-flex flex-column';

      let amountStr;

      if (typeof escrow.Amount === 'string') {
        const xrp = Number(escrow.Amount) / 1000000;
        amountStr = `${xrp.toLocaleString(undefined, { maximumFractionDigits: 6 })} XRP`;
      } else if (typeof escrow.Amount === 'object') {
        const tokenVal = Number(escrow.Amount.value).toLocaleString(undefined, { maximumFractionDigits: 8 });
        const decodedCurrency = escrow.Amount.currency ? decodeCurrencyCode(escrow.Amount.currency) : 'Token';
        amountStr = `${tokenVal} ${decodedCurrency}`;
      } else {
        amountStr = String(escrow.Amount);
      }

      const isIncoming = escrow.Account !== account && escrow.Destination === account;
      const isSelf = escrow.Account === escrow.Destination;
      
      let badgeHtml = '';
      if (isSelf) {
        badgeHtml = '<span class="badge rounded-pill bg-info-subtle text-info border border-info-subtle px-2 py-1"><i class="bi bi-shield-lock-fill me-1"></i>Internal Vault</span>';
      } else {
        badgeHtml = isIncoming ? '<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1">Incoming</span>' : '<span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1">Outgoing</span>';
      }

      let timeDetails = '<ul class="list-unstyled mb-0 small">';
      if (escrow.FinishAfter) {
         timeDetails += `
           <li class="mb-2 p-2 rounded bg-success-subtle text-success-emphasis border border-success-subtle d-flex align-items-center">
             <i class="bi bi-unlock-fill me-2 fs-6"></i>
             <div>
               <strong>Unlocks:</strong> ${formatTime(escrow.FinishAfter)} 
               <span class="escrow-countdown-timer ms-1 text-secondary fw-semibold" data-finish="${escrow.FinishAfter}">(${getRelativeTimeHtml(escrow.FinishAfter)})</span>
             </div>
           </li>`;
      }
      if (escrow.CancelAfter) {
         timeDetails += `
           <li class="mb-2 p-2 rounded bg-warning-subtle text-warning-emphasis border border-warning-subtle d-flex align-items-center">
             <i class="bi bi-hourglass-split me-2 fs-6"></i>
             <div>
               <strong>Expires:</strong> ${formatTime(escrow.CancelAfter)} 
               <span class="escrow-countdown-timer ms-1 text-secondary fw-semibold" data-cancel="${escrow.CancelAfter}">(${getRelativeTimeHtml(escrow.CancelAfter)})</span>
             </div>
           </li>`;
      }
      if (escrow.Condition) {
         timeDetails += `
           <li class="mb-2 p-2 rounded bg-info-subtle text-info-emphasis border border-info-subtle d-flex align-items-center">
             <i class="bi bi-key-fill text-info me-2 fs-6"></i>
             <div>
               <strong>Condition:</strong> <span class="badge bg-info-subtle text-info border border-info-subtle">Fulfillment Required</span>
             </div>
           </li>`;
      }
      if (!escrow.FinishAfter && !escrow.CancelAfter && !escrow.Condition) {
         timeDetails += `<li class="text-muted p-2"><em>No time locks or conditions.</em></li>`;
      }
      timeDetails += '</ul>';

      const copyBtn = (text, label) => `<i class="bi bi-copy text-muted" style="cursor: pointer; font-size: 0.9em; transition: opacity 0.2s;" onmouseover="this.style.opacity=0.7" onmouseout="this.style.opacity=1" onclick="copyToClipboard('${text}', '${label}')" title="Copy"></i>`;
      const shortIdx = escrow.index ? `${escrow.index.substring(0, 4)}...${escrow.index.substring(escrow.index.length - 4)}` : 'N/A';

      let addressBlockHtml = '';
      if (isSelf) {
        addressBlockHtml = `
          <div class="d-flex align-items-center justify-content-between mb-3 bg-light p-2 rounded border">
            <div>
              <span class="text-muted d-block fw-bold" style="font-size: 0.65rem; letter-spacing: 0.5px;">ACCOUNT (SELF-LOCKUP)</span>
              <span class="font-monospace" title="${escrow.Account}">${shortenAddress(escrow.Account)}</span> ${copyBtn(escrow.Account, 'Account Address Copied!')}
            </div>
            <span class="badge rounded-pill bg-info-subtle text-info border border-info-subtle px-2 py-1"><i class="bi bi-shield-lock-fill me-1"></i>Internal Vault</span>
          </div>
        `;
      } else {
        addressBlockHtml = `
          <div class="d-flex align-items-center flex-wrap mb-3 bg-light p-2 rounded border">
            <div class="me-3">
              <span class="text-muted d-block fw-bold" style="font-size: 0.65rem; letter-spacing: 0.5px;">FROM</span>
              <span class="font-monospace" title="${escrow.Account}">${shortenAddress(escrow.Account)}</span> ${copyBtn(escrow.Account, 'Sender Address Copied!')}
            </div>
            <i class="bi bi-arrow-right text-muted me-3 fs-6"></i>
            <div>
              <span class="text-muted d-block fw-bold" style="font-size: 0.65rem; letter-spacing: 0.5px;">TO</span>
              <span class="font-monospace" title="${escrow.Destination}">${shortenAddress(escrow.Destination)}</span> ${copyBtn(escrow.Destination, 'Recipient Address Copied!')}
            </div>
          </div>
        `;
      }

      const infoDiv = document.createElement('div');
      infoDiv.className = 'w-100 mb-3';
      infoDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-3">
          <h4 class="mb-0 fw-bold"><i class="bi bi-safe text-primary me-2"></i>${amountStr}</h4>
          <div>${badgeHtml}</div>
        </div>
        ${addressBlockHtml}
        <div class="p-3 bg-body-tertiary rounded border mb-3">
           ${timeDetails}
           <div class="mt-3 pt-2 border-top">
             ${(() => {
               const nowVal = Math.floor(Date.now() / 1000) - 946684800; // XRPL Epoch seconds
               let progressPct = 0;
               let progressColor = 'bg-primary';
               let progressLabel = '';

               if (escrow.FinishAfter && nowVal < escrow.FinishAfter) {
                 const remaining = escrow.FinishAfter - nowVal;
                 const duration = 86400;
                 const elapsed = Math.max(0, duration - remaining);
                 progressPct = Math.min(95, Math.floor((elapsed / duration) * 100));
                 progressColor = 'bg-primary progress-bar-striped progress-bar-animated';
                 const rText = getRelativeTimeHtml(escrow.FinishAfter);
                 progressLabel = `<i class="bi bi-lock-fill text-primary"></i> Locked (Release ${rText})`;
               } else if (escrow.CancelAfter && nowVal >= escrow.CancelAfter) {
                 progressPct = 100;
                 progressColor = 'bg-danger';
                 progressLabel = '<i class="bi bi-exclamation-triangle-fill text-danger"></i> Expired (Refundable)';
               } else {
                 progressPct = 100;
                 progressColor = 'bg-success';
                 progressLabel = '<i class="bi bi-unlock-fill text-success"></i> Ready to Claim!';
               }

               return `
                 <div class="escrow-progress-container" data-finish="${escrow.FinishAfter || ''}" data-cancel="${escrow.CancelAfter || ''}">
                   <div class="d-flex justify-content-between mb-1 small">
                     <span class="fw-semibold text-secondary progress-label" style="font-size: 0.72rem;">${progressLabel}</span>
                     <span class="text-secondary fw-semibold progress-text" style="font-size: 0.7rem;">${progressPct}%</span>
                   </div>
                   <div class="progress" style="height: 6px;">
                     <div class="progress-bar ${progressColor}" role="progressbar" style="width: ${progressPct}%" aria-valuenow="${progressPct}" aria-valuemin="0" aria-valuemax="100"></div>
                   </div>
                 </div>
               `;
             })()}
           </div>
        </div>
        <div class="text-end" style="font-size:0.75rem;">
           <span class="text-muted fw-bold">ID:</span> <span class="font-monospace text-secondary">${shortIdx}</span> ${escrow.index ? copyBtn(escrow.index, 'Escrow ID Copied!') : ''}
        </div>
      `;
      
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'mt-auto text-end pt-3 border-top';

      const claimBtn = document.createElement('button');
      claimBtn.type = 'button';
      claimBtn.className = 'btn btn-sm border-0 bg-transparent text-secondary opacity-35 me-2';
      claimBtn.id = `btn-claim-${escrow.index}`;
      claimBtn.innerHTML = '<i class="bi bi-lock me-1"></i> Claim';
      claimBtn.disabled = true;
      claimBtn.addEventListener('click', () => executeDirectEscrowAction('escrow_finish', escrow));
      
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-sm border-0 bg-transparent text-secondary opacity-35';
      cancelBtn.id = `btn-cancel-${escrow.index}`;
      cancelBtn.innerHTML = '<i class="bi bi-lock me-1"></i> Cancel';
      cancelBtn.disabled = true;
      cancelBtn.addEventListener('click', () => executeDirectEscrowAction('escrow_cancel', escrow));

      actionsDiv.appendChild(claimBtn);
      actionsDiv.appendChild(cancelBtn);

      cardBody.appendChild(infoDiv);
      cardBody.appendChild(actionsDiv);
      item.appendChild(cardBody);
      col.appendChild(item);
      grid.appendChild(col);
    });
    
    container.appendChild(grid);
  }

  // Update button states dynamically based on the current validated ledger time!
  await refreshEscrowUI(escrows);
}

const fetchEscrowsBtn = document.getElementById('fetchEscrowsBtn');
if (fetchEscrowsBtn) {
  fetchEscrowsBtn.addEventListener('click', (e) => {
    if (e) e.preventDefault();
    const account = document.getElementById('escrowAccountInput').value.trim();
    if (!account) {
      showAlert('Please enter an account to scan.', 'warning');
      return;
    }
    renderActiveEscrows(account, document.getElementById('escrowViewerContainer'));
  });
}

// Auto-fill active escrow viewer if returning user
if (window.connectedAccount) {
  const escrowAccountInput = document.getElementById('escrowAccountInput');
  if (escrowAccountInput && !escrowAccountInput.value) {
    escrowAccountInput.value = window.connectedAccount;
  }
}

loadTemplates();
initTooltips();


// --- Token Lookup Integration (xrplmeta.org) ---
function initTokenSearch() {
  const searchInput = document.getElementById('tokenSearchInput');
  const searchResults = document.getElementById('tokenSearchResults');
  const searchBtn = document.getElementById('tokenSearchActionBtn');
  if (!searchInput || !searchResults || !searchBtn) return;

  const doSearch = async () => {
    const query = searchInput.value.trim();
    if (!query) return;

    searchResults.innerHTML = '<div class="text-center p-4"><span class="spinner-border text-primary"></span><div class="mt-2 text-muted">Searching tokens...</div></div>';

    try {
      let tokens = [];
      try {
        // First, try fetching by the exact XRPL formatted currency code
        const formattedQuery = formatCurrencyCode(query);
        const resp = await fetch(`/search_tokens?currency=${encodeURIComponent(formattedQuery)}`);
        if (resp.ok) {
          const data = await resp.json();
          tokens = Array.isArray(data) ? data : (data.tokens || []);
        }
      } catch (err) {
        console.warn('Currency search skipped or failed, falling back to name search.', err);
      }

      // If no tokens found, fallback to fuzzy searching by token name metadata
      if (tokens.length === 0) {
        const nameResp = await fetch(`/search_tokens?name=${encodeURIComponent(query)}`);
        if (!nameResp.ok) {
          let errDetail = 'API Request Failed';
          try { const errJson = await nameResp.json(); if(errJson.detail) errDetail = errJson.detail; } catch(e){}
          throw new Error(errDetail);
        }
        const nameData = await nameResp.json();
        tokens = Array.isArray(nameData) ? nameData : (nameData.tokens || []);
      }

      searchResults.innerHTML = '';
      if (tokens.length === 0) {
        searchResults.innerHTML = '<div class="alert alert-warning m-0 border-0 rounded-0">No tokens found. Try another abbreviation or name.</div>';
        return;
      }

      tokens.forEach(t => {
        const cur = t.currency || '';
        const decodedCur = decodeCurrencyCode(cur);
        const iss = t.issuer || '';
        const name = t.name || (t.meta && t.meta.name) || decodedCur;
        const domain = (t.meta && t.meta.domain) || t.domain || 'Unknown source';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3';
        btn.innerHTML = `
          <div class="text-truncate me-3">
            <strong class="text-primary fs-5">${escapeHtml(name)}</strong>
            <div class="small text-muted font-monospace mt-1 text-truncate" title="${escapeHtml(iss)}">
              <span class="fw-bold text-dark me-1">${escapeHtml(decodedCur)}</span> &bull; ${escapeHtml(iss)}
            </div>
          </div>
          <span class="badge bg-secondary rounded-pill fw-normal shadow-sm text-truncate" style="max-width: 120px;" title="${escapeHtml(domain)}">${escapeHtml(domain)}</span>
        `;
        btn.addEventListener('click', () => {
          if (window.activeTokenTarget) {
            window.activeTokenTarget.curInput.value = decodedCur;
            window.activeTokenTarget.issInput.value = iss;
            window.activeTokenTarget.curInput.dispatchEvent(new Event('input'));
            window.activeTokenTarget.issInput.dispatchEvent(new Event('input'));
            window.activeTokenTarget.curInput.dispatchEvent(new Event('blur'));
            window.activeTokenTarget.issInput.dispatchEvent(new Event('blur'));
          }
          const modal = bootstrap.Modal.getInstance(document.getElementById('tokenSearchModal'));
          if (modal) modal.hide();
        });
        searchResults.appendChild(btn);
      });
    } catch (err) {
      searchResults.innerHTML = `<div class="alert alert-danger m-0 border-0 rounded-0">Error fetching tokens: ${escapeHtml(err.message)}</div>`;
    }
  };

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') doSearch();
  });
}

function initViewToggle() {
  const grids = document.querySelectorAll('.btn-escrow-view-grid');
  const lists = document.querySelectorAll('.btn-escrow-view-list');
  
  const updateToggleUI = () => {
    const viewType = window.escrowViewType || localStorage.getItem('escrowViewType') || 'grid';
    
    grids.forEach(btnGrid => {
      if (viewType === 'list') {
        btnGrid.className = 'btn btn-sm btn-light px-2 btn-escrow-view-grid';
        btnGrid.innerHTML = '<i class="bi bi-grid-3x3-gap text-secondary"></i>';
      } else {
        btnGrid.className = 'btn btn-sm btn-primary px-2 text-white btn-escrow-view-grid';
        btnGrid.innerHTML = '<i class="bi bi-grid-3x3-gap"></i>';
      }
    });
    
    lists.forEach(btnList => {
      if (viewType === 'list') {
        btnList.className = 'btn btn-sm btn-primary px-2 text-white btn-escrow-view-list';
        btnList.innerHTML = '<i class="bi bi-list-task"></i>';
      } else {
        btnList.className = 'btn btn-sm btn-light px-2 btn-escrow-view-list';
        btnList.innerHTML = '<i class="bi bi-list-task text-secondary"></i>';
      }
    });
  };
  
  grids.forEach(btnGrid => {
    btnGrid.addEventListener('click', () => {
      window.escrowViewType = 'grid';
      localStorage.setItem('escrowViewType', 'grid');
      updateToggleUI();
      // Refresh active renderers
      if (window.connectedAccount) {
        updateDashboard(window.connectedAccount);
      }
      const scanInput = document.getElementById('escrowAccountInput');
      if (scanInput && scanInput.value.trim()) {
        renderActiveEscrows(scanInput.value.trim(), document.getElementById('escrowViewerContainer'));
      }
    });
  });
  
  lists.forEach(btnList => {
    btnList.addEventListener('click', () => {
      window.escrowViewType = 'list';
      localStorage.setItem('escrowViewType', 'list');
      updateToggleUI();
      // Refresh active renderers
      if (window.connectedAccount) {
        updateDashboard(window.connectedAccount);
      }
      const scanInput = document.getElementById('escrowAccountInput');
      if (scanInput && scanInput.value.trim()) {
        renderActiveEscrows(scanInput.value.trim(), document.getElementById('escrowViewerContainer'));
      }
    });
  });
  
  updateToggleUI();
}

function initSortToggle() {
  const sortSelects = document.querySelectorAll('.select-escrow-sort');
  
  const updateSortUI = () => {
    const sortType = localStorage.getItem('escrowSortType') || 'release_soonest';
    sortSelects.forEach(select => {
      select.value = sortType;
    });
  };
  
  sortSelects.forEach(select => {
    select.addEventListener('change', (e) => {
      const val = e.target.value;
      localStorage.setItem('escrowSortType', val);
      updateSortUI();
      
      // Refresh active renderers
      if (window.connectedAccount) {
        updateDashboard(window.connectedAccount);
      }
      const scanInput = document.getElementById('escrowAccountInput');
      if (scanInput && scanInput.value.trim()) {
        renderActiveEscrows(scanInput.value.trim(), document.getElementById('escrowViewerContainer'));
      }
    });
  });
  
  updateSortUI();
}

function initWelcomeTour() {
  const carouselEl = document.getElementById('welcomeCarousel');
  const modalEl = document.getElementById('welcomeModal');
  const btnTrigger = document.getElementById('btnTriggerWelcomeTour');
  
  if (!carouselEl || !modalEl) return;
  
  const carousel = bootstrap.Carousel.getOrCreateInstance(carouselEl);
  const prevBtn = document.getElementById('btnTourPrev');
  const nextBtn = document.getElementById('btnTourNext');
  const finishBtn = document.getElementById('btnTourFinish');
  
  const updateButtons = (activeIndex) => {
    if (activeIndex === 0) {
      if (prevBtn) prevBtn.style.visibility = 'hidden';
      if (nextBtn) nextBtn.style.display = 'inline-block';
      if (finishBtn) finishBtn.style.display = 'none';
    } else if (activeIndex === 3) {
      if (prevBtn) prevBtn.style.visibility = 'visible';
      if (nextBtn) nextBtn.style.display = 'none';
      if (finishBtn) finishBtn.style.display = 'inline-block';
    } else {
      if (prevBtn) prevBtn.style.visibility = 'visible';
      if (nextBtn) nextBtn.style.display = 'inline-block';
      if (finishBtn) finishBtn.style.display = 'none';
    }
  };
  
  carouselEl.addEventListener('slid.bs.carousel', (event) => {
    updateButtons(event.to);
  });
  
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      carousel.next();
    });
  }
  
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      carousel.prev();
    });
  }
  
  if (btnTrigger) {
    btnTrigger.addEventListener('click', () => {
      carousel.to(0);
      updateButtons(0);
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    });
  }
  
  // Initialize button visibility for first load
  updateButtons(0);
}

document.addEventListener('DOMContentLoaded', () => {
  initTokenSearch();
  initDurationQuickSelect();
  initViewToggle();
  initSortToggle();
  initWelcomeTour();
  startLiveCountdownTimer();
  initMemeDashboard();
  
  if (window.connectedAccount) {
    updateXamanUI(window.connectedAccount);
    fetchUserTrustlines(window.connectedAccount);
  } else {
    updateDashboard(null);
    fetchUserTrustlines(null);
  }
  
  const btnRefreshDashboard = document.getElementById('btnRefreshDashboardEscrows');
  if (btnRefreshDashboard) {
    btnRefreshDashboard.addEventListener('click', () => {
      if (window.connectedAccount) {
        updateDashboard(window.connectedAccount);
      }
    });
  }

  // Show welcome modal for first-time visitors
  if (!localStorage.getItem('hasSeenWelcome')) {
    const welcomeModalEl = document.getElementById('welcomeModal');
    if (welcomeModalEl) {
      const welcomeModal = new bootstrap.Modal(welcomeModalEl);
      welcomeModal.show();
      localStorage.setItem('hasSeenWelcome', 'true');
    }
  }
});

// --- L2 Token Auto-Release Vault (In-Browser Node logic) ---
let vaultMonitorTimer = null;
let vaultClient = null;

function logVault(msg) {
  const vaultLogEl = document.getElementById('vaultLog');
  if (!vaultLogEl) return;
  vaultLogEl.style.display = 'block';
  const p = document.createElement('div');
  p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  vaultLogEl.appendChild(p);
  vaultLogEl.scrollTop = vaultLogEl.scrollHeight;
}

function stopVault() {
  if (vaultMonitorTimer) clearInterval(vaultMonitorTimer);
  if (vaultClient && vaultClient.isConnected()) {
    vaultClient.disconnect();
  }
  document.getElementById('startVaultBtn').style.display = 'inline-block';
  document.getElementById('stopVaultBtn').style.display = 'none';
  logVault('Vault Monitor stopped.');
}

const startVaultBtnEl = document.getElementById('startVaultBtn');
if (startVaultBtnEl) {
  startVaultBtnEl.addEventListener('click', async (e) => {
    if (e) e.preventDefault();
    const seed = document.getElementById('vaultSeed').value.trim();
    const currency = document.getElementById('vaultCurrency').value.trim();
    const issuer = document.getElementById('vaultIssuer').value.trim();
    const dest = document.getElementById('vaultDestination').value.trim();
    const releaseTimeVal = document.getElementById('vaultReleaseTime').value;
    const rpc = document.getElementById('vaultRpc').value.trim();
    
    let formattedCurrency = formatCurrencyCode(currency);

    if (!seed || !formattedCurrency || !issuer || !dest || !releaseTimeVal) {
      showAlert('Please fill in all Vault fields.', 'warning');
      return;
    }

    if (!xrpl.isValidAddress(dest)) {
      showAlert('Invalid Destination Address.', 'warning');
      return;
    }

    const releaseUnix = Math.floor(new Date(releaseTimeVal).getTime() / 1000);

    document.getElementById('startVaultBtn').style.display = 'none';
    document.getElementById('stopVaultBtn').style.display = 'inline-block';
    document.getElementById('vaultLog').innerHTML = '';
    
    logVault('Starting L2 Vault Monitor...');
    
    try {
      vaultClient = new xrpl.Client(rpc);
      await vaultClient.connect();
      logVault(`Connected to ${rpc}`);
    } catch (e) {
      logVault(`Error connecting to XRPL node: ${e.message}`);
      stopVault();
      return;
    }

    let wallet;
    try {
      wallet = xrpl.Wallet.fromSeed(seed);
    } catch (e) {
      logVault(`Invalid Vault Seed provided.`);
      stopVault();
      return;
    }
    
    const vaultAddress = wallet.address;
    logVault(`Vault Account: ${vaultAddress}`);
    logVault(`Target Release Time: ${new Date(releaseUnix * 1000).toLocaleString()}`);

    // Immediate pre-validation of the vault account and trustline
    logVault('Verifying vault account and trustline on-chain...');
    try {
      const accountLinesReq = await vaultClient.request({ command: 'account_lines', account: vaultAddress, peer: issuer });
      const trustline = accountLinesReq.result.lines.find(l => {
        if (l.account !== issuer) return false;
        const ledgerDecoded = decodeCurrencyCode(l.currency).toUpperCase().trim();
        const targetDecoded = decodeCurrencyCode(currency).toUpperCase().trim();
        const formattedDecoded = decodeCurrencyCode(formattedCurrency).toUpperCase().trim();
        return l.currency === currency || 
               l.currency === formattedCurrency || 
               ledgerDecoded === targetDecoded || 
               ledgerDecoded === formattedDecoded;
      });

      if (!trustline) {
        const readableCurrency = decodeCurrencyCode(currency);
        logVault(`❌ [ERROR] Trustline for ${readableCurrency} (${issuer}) not found on the vault account.`);
        stopVault();
        return;
      }
      logVault(`✅ Trustline verified (Current Balance: ${trustline.balance})`);
    } catch (err) {
      if (err.data && err.data.error === 'actNotFound') {
        logVault(`❌ [ERROR] Vault account ${vaultAddress} not found/funded on the ledger.`);
      } else {
        logVault(`❌ [ERROR] Failed to verify trustline: ${err.message || err}`);
      }
      stopVault();
      return;
    }

    const executeSweep = async () => {
      try {
        logVault('Verifying balances for sweep...');
        const accountLinesReq = await vaultClient.request({ command: 'account_lines', account: vaultAddress, peer: issuer });
        const trustline = accountLinesReq.result.lines.find(l => {
          if (l.account !== issuer) return false;
          const ledgerDecoded = decodeCurrencyCode(l.currency).toUpperCase().trim();
          const targetDecoded = decodeCurrencyCode(currency).toUpperCase().trim();
          const formattedDecoded = decodeCurrencyCode(formattedCurrency).toUpperCase().trim();
          return l.currency === currency || 
                 l.currency === formattedCurrency || 
                 ledgerDecoded === targetDecoded || 
                 ledgerDecoded === formattedDecoded;
        });

        if (!trustline) {
          const readableCurrency = decodeCurrencyCode(currency);
          logVault(`❌ [ERROR] Trustline for ${readableCurrency} (${issuer}) not found on the vault account.`);
          return stopVault();
        }

        const tokenBalance = parseFloat(trustline.balance);
        if (tokenBalance <= 0) {
          logVault(`❌ Insufficient Layer 2 token balance. Current balance: ${tokenBalance}`);
          return stopVault();
        }

        const destLinesReq = await vaultClient.request({ command: 'account_lines', account: dest, peer: issuer });
        const destTrustline = destLinesReq.result.lines.find(l => {
          if (l.account !== issuer) return false;
          const ledgerDecoded = decodeCurrencyCode(l.currency).toUpperCase().trim();
          const targetDecoded = decodeCurrencyCode(currency).toUpperCase().trim();
          const formattedDecoded = decodeCurrencyCode(formattedCurrency).toUpperCase().trim();
          return l.currency === currency || 
                 l.currency === formattedCurrency || 
                 ledgerDecoded === targetDecoded || 
                 ledgerDecoded === formattedDecoded;
        });

        if (!destTrustline && dest !== issuer) {
          const readableCurrency = decodeCurrencyCode(currency);
          logVault(`❌ [ERROR] Destination address ${dest} does not have an active trustline for ${readableCurrency} (${issuer}).`);
          return stopVault();
        }

        const readableCurrency = decodeCurrencyCode(currency);
        logVault(`[LOG] Sending ${tokenBalance} ${readableCurrency} to ${dest}...`);
        logVault('[LOG] Signing release payload with vault key...');
        
        const paymentTx = {
          TransactionType: 'Payment',
          Account: vaultAddress,
          Destination: dest,
          Amount: {
            currency: formatCurrencyCode(currency),
            issuer: issuer,
            value: trustline.balance
          }
        };

        logVault('[LOG] Broadcasting transaction to the ledger...');
        const response = await vaultClient.submitAndWait(paymentTx, { wallet });
        const txResult = response.result.meta.TransactionResult;
        
        if (txResult === 'tesSUCCESS') {
          logVault('[LOG] ✅ Auto-release successful! Tokens returned.');
          logVault(`[LOG] Hash: ${response.result.hash}`);
          showAlert('Vault Auto-Release Successful!', 'success');
        } else {
          logVault(`[ERROR] Failed to send transaction: Transaction failed with result ${txResult}`);
        }
      } catch (err) {
        logVault(`[ERROR] Failed to send transaction: ${err.message || err}`);
      }
      stopVault();
    };

    const checkTime = async () => {
      if (!vaultClient.isConnected()) {
        logVault('Reconnecting to node...');
        await vaultClient.connect();
      }

      try {
        const ledgerReq = await vaultClient.request({ command: 'ledger', ledger_index: 'validated' });
        const currentUnixTime = ledgerReq.result.ledger.close_time + 946684800; // Offset XRPL Epoch to Unix Epoch

        if (currentUnixTime >= releaseUnix) {
          logVault('✅ Time-lock cleared!');
          if (vaultMonitorTimer) clearInterval(vaultMonitorTimer);
          await executeSweep();
        } else {
          const remaining = releaseUnix - currentUnixTime;
          logVault(`⏳ Waiting... ${remaining} seconds remaining until release.`);
        }
      } catch (e) {
        logVault(`Error during ledger check: ${e.message}`);
      }
    };

    // Compare times immediately at startup using validated ledger close time
    let currentUnixTime;
    try {
      const ledgerReq = await vaultClient.request({ command: 'ledger', ledger_index: 'validated' });
      currentUnixTime = ledgerReq.result.ledger.close_time + 946684800;
    } catch (e) {
      currentUnixTime = Math.floor(Date.now() / 1000);
    }

    if (currentUnixTime >= releaseUnix) {
      logVault('[LOG] Release time already reached. Skipping countdown and initializing immediate sweep...');
      await executeSweep();
    } else {
      vaultMonitorTimer = setInterval(checkTime, 10000); // Poll every 10 seconds
      checkTime(); // Execute immediately once
    }
  });
}

const stopVaultBtnEl = document.getElementById('stopVaultBtn');
if (stopVaultBtnEl) stopVaultBtnEl.addEventListener('click', stopVault);


// =============================================================================
// 🔑 CRYPTOGRAPHIC CONDITION & FULFILLMENT GENERATOR HELPERS
// =============================================================================

function encodeDerLength(len) {
  if (len < 128) {
    return [len];
  } else if (len < 256) {
    return [0x81, len];
  } else {
    return [0x82, (len >> 8) & 0xff, len & 0xff];
  }
}

function encodeUnsignedInt(val) {
  const bytes = [];
  if (val === 0) {
    bytes.push(0);
  } else {
    while (val > 0) {
      bytes.unshift(val & 0xff);
      val = val >> 8;
    }
  }
  return bytes;
}

async function generateConditionAndFulfillment(preimage) {
  const encoder = new TextEncoder();
  const preimageBytes = encoder.encode(preimage);
  
  // 1. Calculate standard SHA-256 hash matching XRPL consensus verification
  const hashBuffer = await crypto.subtle.digest('SHA-256', preimageBytes);
  const hashBytes = new Uint8Array(hashBuffer);
  
  // 2. Generate ILP Crypto-Conditions ASN.1 DER Fulfillment (Type 0: Preimage)
  // Inner value structure: [0x80] + [length of preimage] + [preimage bytes]
  const innerFulfill = [0x80, ...encodeDerLength(preimageBytes.length), ...preimageBytes];
  // Outer value structure: [0xA0] (constructed type 0) + [length of inner] + [inner bytes]
  const fulfillBytes = [0xA0, ...encodeDerLength(innerFulfill.length), ...innerFulfill];
  const fulfillHex = Array.from(fulfillBytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  
  // 3. Generate ILP Crypto-Conditions ASN.1 DER Condition (Type 0: Preimage)
  // Cost (preimage size) encoded as minimal unsigned big-endian integer bytes
  const costBytes = encodeUnsignedInt(preimageBytes.length);
  // Cost block structure: [0x81] + [length of cost] + [cost bytes]
  const costBlock = [0x81, ...encodeDerLength(costBytes.length), ...costBytes];
  // Hash block structure: [0x80] + [0x20] (32 bytes) + [32-byte SHA-256 fingerprint]
  const hashBlock = [0x80, 0x20, ...hashBytes];
  
  const innerCond = [...hashBlock, ...costBlock];
  // Outer value structure: [0xA0] + [length of inner] + [inner bytes]
  const condBytes = [0xA0, ...encodeDerLength(innerCond.length), ...innerCond];
  const condHex = Array.from(condBytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  
  return { condition: condHex, fulfillment: fulfillHex };
}

// Bind DOM event listeners for the generator card elements
document.addEventListener('DOMContentLoaded', () => {
  const btnGenRandom = document.getElementById('btnGenRandomPreimage');
  const helperPreimage = document.getElementById('helperPreimage');
  const btnGenCrypto = document.getElementById('btnGenerateCryptoData');
  const derivedCondition = document.getElementById('derivedCondition');
  const derivedFulfillment = document.getElementById('derivedFulfillment');

  if (btnGenRandom && helperPreimage) {
    btnGenRandom.addEventListener('click', () => {
      const arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      const randStr = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
      helperPreimage.value = `secret:${randStr}`;
    });
  }

  if (btnGenCrypto && helperPreimage && derivedCondition && derivedFulfillment) {
    btnGenCrypto.addEventListener('click', async () => {
      const preimage = helperPreimage.value.trim();
      if (!preimage) {
        showAlert('Please enter a secret preimage string.', 'warning');
        return;
      }
      try {
        const { condition, fulfillment } = await generateConditionAndFulfillment(preimage);
        derivedCondition.value = condition;
        derivedFulfillment.value = fulfillment;
        showAlert('Successfully generated condition and fulfillment!', 'success');
      } catch (err) {
        showAlert('Error generating cryptographic values: ' + String(err), 'error');
      }
    });
  }
});


// =============================================================================
// 📜 SIGNATURE HISTORY (AUDIT LOG) HELPERS
// =============================================================================

async function loadSignatureHistory() {
  const container = document.getElementById('signatureHistoryContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="text-center p-3">
      <span class="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true"></span>
      <span class="ms-1 small text-muted">Loading history...</span>
    </div>
  `;

  let url = '/xumm/history';
  if (window.connectedAccount) {
    url += `?account=${encodeURIComponent(window.connectedAccount)}`;
  }

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();

    if (!data || data.length === 0) {
      container.innerHTML = `<div class="text-center text-muted small p-3">No history records found${window.connectedAccount ? ' for this account' : ''}.</div>`;
      return;
    }

    let html = '<div class="list-group list-group-flush shadow-sm rounded border">';
    data.forEach(item => {
      const response = item.response || {};
      const status = item.status || 'unknown';
      const uuid = item.uuid;
      const createdAt = item.created_at ? new Date(item.created_at * 1000).toLocaleString() : 'Unknown Time';

      const requestData = response.request || response.payloadResponse || {};
      const txjson = requestData.txjson || response.remote?.request?.txjson || {};
      const txType = txjson.TransactionType || 'SignIn';
      
      const payloadMeta = response.meta || {};
      const isSigned = status === 'signed' || payloadMeta.signed === true || response.remote?.meta?.signed === true;
      
      const signer = response.response?.account || response.remote?.response?.account || txjson.Account || 'N/A';
      
      const txHash = response.remote?.xrpl_submission?.result?.tx_json?.hash || response.xrpl_submission?.result?.tx_json?.hash || response.response?.txid || '';

      let statusBadge = '';
      if (isSigned) {
        statusBadge = '<span class="badge bg-success-subtle text-success border border-success-subtle" style="font-size: 0.65rem;">Signed</span>';
      } else if (status === 'rejected') {
        statusBadge = '<span class="badge bg-danger-subtle text-danger border border-danger-subtle" style="font-size: 0.65rem;">Rejected</span>';
      } else if (status === 'expired') {
        statusBadge = '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle" style="font-size: 0.65rem;">Expired</span>';
      } else {
        statusBadge = '<span class="badge bg-info-subtle text-info border border-info-subtle" style="font-size: 0.65rem;">Pending</span>';
      }

      html += `
        <div class="list-group-item p-3">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <h6 class="mb-0 fw-bold text-primary small" style="font-size: 0.8rem;"><i class="bi bi-file-earmark-code"></i> ${escapeHtml(txType)}</h6>
            ${statusBadge}
          </div>
          <div class="small text-muted mb-1" style="font-size: 0.72rem;">
            <strong>Signer:</strong> <code>${escapeHtml(signer)}</code>
          </div>
          <div class="small text-muted mb-1" style="font-size: 0.72rem;">
            <strong>UUID:</strong> <code>${escapeHtml(uuid)}</code>
          </div>
          <div class="d-flex justify-content-between align-items-center mt-2 pt-1 border-top" style="font-size: 0.7rem;">
            <span class="text-secondary">${escapeHtml(createdAt)}</span>
            ${txHash ? `
              <div class="d-flex gap-1">
                <a href="https://testnet.xrpl.org/transactions/${txHash}" target="_blank" class="btn btn-xs btn-outline-info py-0 px-1" style="font-size: 0.65rem;">Testnet</a>
                <a href="https://livenet.xrpl.org/transactions/${txHash}" target="_blank" class="btn btn-xs btn-outline-primary py-0 px-1" style="font-size: 0.65rem;">Mainnet</a>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger small p-2 m-2">Error loading history: ${escapeHtml(err.message || String(err))}</div>`;
  }
}

// Bind DOM event listeners for the history refresh button
document.addEventListener('DOMContentLoaded', () => {
  const btnRefreshHistory = document.getElementById('btnRefreshHistory');
  if (btnRefreshHistory) {
    btnRefreshHistory.addEventListener('click', loadSignatureHistory);
  }
  
  // Load history initially on page load
  setTimeout(loadSignatureHistory, 1000);
});


// =============================================================================
// 🚀 XRPL MEME PORTAL & MULTISIG / CROWD-HODL COORDINATOR
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initial State
  let collectedSignatures = [];
  let preparedTxJson = null;
  let multisigPollingIntervals = [];

  // DOM Elements
  const tabMemeBtn = document.getElementById('tab-meme-btn');
  const memeTokenSelect = document.getElementById('memeTokenSelect');
  const btnMemeTokenSearch = document.getElementById('btnMemeTokenSearch');
  const memeTokenIssuer = document.getElementById('memeTokenIssuer');
  const memeTokenHex = document.getElementById('memeTokenHex');
  
  const memeLockAmount = document.getElementById('memeLockAmount');
  const memeLockType = document.getElementById('memeLockType');
  const memeLockRecipient = document.getElementById('memeLockRecipient');
  const memeSelfLockCheck = document.getElementById('memeSelfLockCheck');
  
  const memeTimeLockRow = document.getElementById('memeTimeLockRow');
  const memeLockReleaseTime = document.getElementById('memeLockReleaseTime');
  const memeHodlBadge = document.getElementById('memeHodlBadge');
  const memeHodlLevel = document.getElementById('memeHodlLevel');
  
  const memeConditionalRow = document.getElementById('memeConditionalRow');
  const memeLockCondition = document.getElementById('memeLockCondition');
  const memeLockFulfillment = document.getElementById('memeLockFulfillment');
  
  const memeMultisigSigners = document.getElementById('memeMultisigSigners');
  const memeMultisigQuorum = document.getElementById('memeMultisigQuorum');
  const btnMemeLockupSubmit = document.getElementById('btnMemeLockupSubmit');
  
  const memeMultisigCard = document.getElementById('memeMultisigCard');
  const memeMultisigProgressBar = document.getElementById('memeMultisigProgressBar');
  const memeMultisigSignersList = document.getElementById('memeMultisigSignersList');
  const btnSubmitMultisigTx = document.getElementById('btnSubmitMultisigTx');
  const btnCancelMultisig = document.getElementById('btnCancelMultisig');

  const crowdhdlVaultAddress = document.getElementById('crowdhdlVaultAddress');
  const btnScanCrowdhdl = document.getElementById('btnScanCrowdhdl');
  const crowdhdlTokenSelect = document.getElementById('crowdhdlTokenSelect');
  const crowdhdlDepositAmount = document.getElementById('crowdhdlDepositAmount');
  const btnCrowdhdlDeposit = document.getElementById('btnCrowdhdlDeposit');
  
  const crowdhdlAdminPanel = document.getElementById('crowdhdlAdminPanel');
  const crowdhdlAdminSigners = document.getElementById('crowdhdlAdminSigners');
  const crowdhdlReleaseTime = document.getElementById('crowdhdlReleaseTime');
  const btnCrowdhdlPrepareRefund = document.getElementById('btnCrowdhdlPrepareRefund');
  const crowdhdlTotalLocked = document.getElementById('crowdhdlTotalLocked');
  const crowdhdlDepositorsCount = document.getElementById('crowdhdlDepositorsCount');
  const crowdhdlLeaderboardBody = document.getElementById('crowdhdlLeaderboardBody');

  // Verify all DOM elements exist to prevent errors
  if (!memeTokenSelect || !btnMemeLockupSubmit) return;

  // 2. Setup Token Search Interception
  memeTokenSelect.addEventListener('change', () => {
    const val = memeTokenSelect.value;
    if (val === 'custom') {
      btnMemeTokenSearch.style.display = 'inline-block';
      // Setup window active target interceptor
      window.activeTokenTarget = {
        curInput: {
          value: '',
          set value(v) {
            memeTokenHex.value = formatCurrencyCode(v);
            let opt = memeTokenSelect.querySelector(`option[data-currency="${v}"]`);
            if (!opt) {
              opt = document.createElement('option');
              opt.dataset.currency = v;
              opt.value = JSON.stringify({ currency: v, decoded_currency: v, issuer: '' });
              opt.textContent = `${v} (Custom)`;
              memeTokenSelect.insertBefore(opt, memeTokenSelect.lastElementChild);
            }
            memeTokenSelect.value = opt.value;
            memeTokenSelect.dispatchEvent(new Event('change'));
          },
          dispatchEvent(e) {}
        },
        issInput: {
          value: '',
          set value(v) {
            memeTokenIssuer.value = v;
            const currentVal = memeTokenSelect.value;
            if (currentVal && currentVal.startsWith('{')) {
              try {
                const parsed = JSON.parse(currentVal);
                parsed.issuer = v;
                const newOptVal = JSON.stringify(parsed);
                const opt = memeTokenSelect.querySelector(`option[value="${currentVal}"]`);
                if (opt) {
                  opt.value = newOptVal;
                  opt.setAttribute('data-issuer', v);
                  memeTokenSelect.value = newOptVal;
                }
              } catch(e){}
            }
          },
          dispatchEvent(e) {}
        }
      };
      // Trigger search modal
      btnMemeTokenSearch.click();
    } else if (val && val.startsWith('{')) {
      btnMemeTokenSearch.style.display = 'none';
      try {
        const { currency, issuer } = JSON.parse(val);
        memeTokenIssuer.value = issuer;
        memeTokenHex.value = formatCurrencyCode(currency);
      } catch (e) {
        console.error('Error parsing selected meme token:', e);
      }
    } else {
      btnMemeTokenSearch.style.display = 'none';
    }
  });

  if (btnMemeTokenSearch) {
    btnMemeTokenSearch.addEventListener('click', () => {
      const modalEl = document.getElementById('tokenSearchModal');
      if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        setTimeout(() => document.getElementById('tokenSearchInput').focus(), 500);
      }
    });
  }

  // 3. Lockup Form View Toggles
  memeLockType.addEventListener('change', () => {
    if (memeLockType.value === 'time') {
      memeTimeLockRow.classList.remove('d-none');
      memeConditionalRow.classList.add('d-none');
    } else {
      memeTimeLockRow.classList.add('d-none');
      memeConditionalRow.classList.remove('d-none');
    }
  });

  memeSelfLockCheck.addEventListener('change', () => {
    if (memeSelfLockCheck.checked) {
      memeLockRecipient.value = window.connectedAccount || '';
      memeLockRecipient.setAttribute('readonly', 'true');
    } else {
      memeLockRecipient.value = '';
      memeLockRecipient.removeAttribute('readonly');
    }
  });

  // Automatically update recipient when connected account changes
  window.addEventListener('storage', () => {
    if (memeSelfLockCheck.checked) {
      memeLockRecipient.value = window.connectedAccount || '';
    }
  });
  
  // Custom polling hook for active account
  const intervalId = setInterval(() => {
    if (memeSelfLockCheck && memeSelfLockCheck.checked && memeLockRecipient.value !== window.connectedAccount) {
      memeLockRecipient.value = window.connectedAccount || '';
    }
  }, 1000);

  // 4. Time Lock Duration Presets & HODL Strength Calculations
  const updateHodlStrength = () => {
    const timeVal = memeLockReleaseTime.value;
    if (!timeVal) {
      memeHodlBadge.classList.add('d-none');
      return;
    }
    const releaseTime = new Date(timeVal).getTime();
    const now = Date.now();
    const diffMs = releaseTime - now;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    memeHodlBadge.classList.remove('d-none');
    memeHodlBadge.className = 'mt-2 fw-semibold small ';

    if (diffDays < 0) {
      memeHodlBadge.classList.add('d-none');
    } else if (diffDays < 2) {
      memeHodlBadge.classList.add('text-secondary');
      memeHodlLevel.innerHTML = '<i class="bi bi-trash"></i> Paper Hands 🧻';
    } else if (diffDays < 15) {
      memeHodlBadge.classList.add('text-warning');
      memeHodlLevel.innerHTML = '<i class="bi bi-award"></i> Bronze HODLer 🥉';
    } else if (diffDays < 60) {
      memeHodlBadge.classList.add('text-info');
      memeHodlLevel.innerHTML = '<i class="bi bi-award-fill"></i> Silver HODLer 🥈';
    } else if (diffDays < 180) {
      memeHodlBadge.classList.add('text-warning');
      memeHodlLevel.innerHTML = '<i class="bi bi-patch-check-fill text-warning"></i> Gold HODLer 🥇';
    } else {
      memeHodlBadge.classList.add('text-danger', 'animate-pulse');
      memeHodlLevel.innerHTML = '<i class="bi bi-gem text-danger"></i> DIAMOND HANDS 💎';
    }
  };

  document.querySelectorAll('.meme-dur-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = parseInt(btn.getAttribute('data-days'));
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + days);
      
      // format to local ISO without seconds (YYYY-MM-DDTHH:MM)
      const tzOffset = targetDate.getTimezoneOffset() * 60000; // offset in milliseconds
      const localISOTime = (new Date(targetDate - tzOffset)).toISOString().slice(0, 16);
      
      memeLockReleaseTime.value = localISOTime;
      updateHodlStrength();
    });
  });

  memeLockReleaseTime.addEventListener('input', updateHodlStrength);
  memeLockReleaseTime.addEventListener('change', updateHodlStrength);

  // Deploy Signer List to Active Wallet
  const btnMemeConfigureSigners = document.getElementById('btnMemeConfigureSigners');
  if (btnMemeConfigureSigners) {
    btnMemeConfigureSigners.addEventListener('click', async () => {
      if (!window.connectedAccount) {
        showAlert('Please connect your wallet first to set up its signer list.', 'warning');
        return;
      }

      const signerAddressesStr = memeMultisigSigners.value.trim();
      const quorum = parseInt(memeMultisigQuorum.value) || 2;
      
      const signers = signerAddressesStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
      if (signers.length === 0) {
        showAlert('Please provide comma-separated signer addresses for multisig.', 'warning');
        return;
      }

      btnMemeConfigureSigners.setAttribute('disabled', 'true');
      btnMemeConfigureSigners.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Preparing payload...';

      try {
        // Map signers into SignerEntries
        const signerEntries = signers.map(signer => ({
          SignerEntry: {
            Account: signer,
            SignerWeight: 1
          }
        }));

        // Construct SignerListSet transaction
        const txjson = {
          TransactionType: 'SignerListSet',
          Account: window.connectedAccount,
          SignerQuorum: quorum,
          SignerEntries: signerEntries
        };

        const resp = await fetch('/xumm/payload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txjson })
        });
        if (!resp.ok) throw new Error(await resp.text());
        const payload = await resp.json();

        // Show payload modal for signing
        showSubmittedModal(payload);

      } catch (err) {
        showAlert(`Failed to configure signers: ${err.message}`, 'error');
      } finally {
        btnMemeConfigureSigners.removeAttribute('disabled');
        btnMemeConfigureSigners.innerHTML = '<i class="bi bi-person-plus-fill"></i> Deploy Signer List to Active Wallet';
      }
    });
  }

  // 5. Submit Individual or Multisig Lockup
  btnMemeLockupSubmit.addEventListener('click', async () => {
    const amount = parseFloat(memeLockAmount.value);
    const recipient = memeLockRecipient.value.trim();
    const vault = document.getElementById('memeLockVaultAddress').value.trim();
    const lockType = memeLockType.value;
    const tokenSymbol = memeTokenSelect.value;
    const issuer = memeTokenIssuer.value.trim();
    const currency = memeTokenHex.value.trim();

    if (!amount || amount <= 0) {
      showAlert('Please enter a valid amount greater than 0.', 'warning');
      return;
    }
    if (!vault) {
      showAlert('Pool / Vault Address is required.', 'warning');
      return;
    }
    if (!recipient) {
      showAlert('Recipient address is required.', 'warning');
      return;
    }
    if (lockType === 'time' && !memeLockReleaseTime.value) {
      showAlert('Please select a release time lock.', 'warning');
      return;
    }
    if (lockType === 'conditional' && !memeLockCondition.value) {
      showAlert('Please enter the condition hash.', 'warning');
      return;
    }

    // Determine if multisig is configured
    const signerAddressesStr = memeMultisigSigners.value.trim();
    const isMultisig = signerAddressesStr.length > 0;
    const quorum = parseInt(memeMultisigQuorum.value) || 2;

    if (isMultisig) {
      // Setup Multisig Coordinator
      const signers = signerAddressesStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
      if (signers.length === 0) {
        showAlert('Please provide valid signer addresses for multisig.', 'warning');
        return;
      }
      
      // We must fetch the sequence of the sender (the multisig account)
      const sender = window.connectedAccount || signers[0]; // fallback
      let seq = 0;
      try {
        const infoResp = await fetch(`/account_info/${encodeURIComponent(sender)}`);
        if (!infoResp.ok) throw new Error(await infoResp.text());
        const info = await infoResp.json();
        seq = info.Sequence;
      } catch (err) {
        showAlert(`Failed to fetch Multisig Account sequence: ${err.message}. Ensure the account is funded on the selected network.`, 'error');
        return;
      }

      // Calculate fee: base fee (12 drops) * (1 + signers count)
      const totalFeeDrops = (12 * (1 + signers.length)).toString();

      // Build prepared transaction JSON
      preparedTxJson = {
        TransactionType: 'Payment',
        Account: sender,
        Destination: recipient,
        Amount: {
          currency: currency,
          issuer: issuer,
          value: amount.toString()
        },
        Fee: totalFeeDrops,
        Sequence: seq,
        SigningPubKey: ''
      };

      // Launch multisig signing UI
      memeMultisigCard.classList.remove('d-none');
      collectedSignatures = [];
      updateMultisigProgress(signers, quorum);

      // Create Xaman payloads for each signer
      multisigPollingIntervals.forEach(clearInterval);
      multisigPollingIntervals = [];

      for (let i = 0; i < signers.length; i++) {
        const signer = signers[i];
        try {
          const payloadData = {
            txjson: preparedTxJson,
            options: {
              submit: false,
              multisign: true
            }
          };
          const pResp = await fetch('/xumm/payload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadData)
          });
          if (!pResp.ok) throw new Error(await pResp.text());
          const payload = await pResp.json();
          const uuid = payload.uuid;

          const signerItem = document.getElementById(`multisig-signer-${signer}`);
          if (signerItem) {
            const linkCol = signerItem.querySelector('.signer-link-col');
            linkCol.innerHTML = `
              <a href="${payload.next.always}" target="_blank" class="btn btn-xs btn-primary"><i class="bi bi-qr-code-scan"></i> Sign Payload</a>
              <div class="mt-1 small text-muted font-monospace" style="font-size: 0.62rem;">UUID: ${uuid.slice(0,8)}...</div>
            `;
          }

          // Start polling for this signer's payload status
          const checkStatus = async () => {
            try {
              const sResp = await fetch(`/xumm/payload_status/${uuid}`);
              if (!sResp.ok) return;
              const statusData = await sResp.json();
              if (statusData.status === 'signed' || (statusData.response && statusData.response.response && statusData.response.response.tx_signature)) {
                clearInterval(pollId);
                
                const responseObj = statusData.response?.response || {};
                const sig = responseObj.tx_signature || statusData.response?.tx_signature;
                const pubkey = responseObj.signer || statusData.response?.signer;

                if (sig && pubkey) {
                  addCollectedSignature(signer, sig, pubkey, signers, quorum);
                }
              }
            } catch (err) {
              console.error(err);
            }
          };

          const pollId = setInterval(checkStatus, 3000);
          multisigPollingIntervals.push(pollId);

        } catch (err) {
          showAlert(`Failed to create signing payload for ${signer}: ${err.message}`, 'error');
        }
      }

    } else {
      // Individual Time Lock / Conditional Escrow
      btnMemeLockupSubmit.setAttribute('disabled', 'true');
      btnMemeLockupSubmit.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Creating Xaman Payload...';

      try {
        const payloadData = {
          txjson: {
            TransactionType: 'Payment',
            Account: window.connectedAccount || '',
            Destination: vault,
            Amount: {
              currency: formatCurrencyCode(currency),
              issuer: issuer,
              value: amount.toString()
            }
          }
        };

        const resp = await fetch('/xumm/payload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadData)
        });
        if (!resp.ok) throw new Error(await resp.text());
        const payload = await resp.json();

        // Show secure sign modal
        showSubmittedModal(payload);

        // Save to Local Storage Dashboard
        const newLock = {
          vault: vault,
          recipient: recipient,
          currency: currency,
          issuer: issuer,
          amount: amount,
          releaseTime: memeLockReleaseTime.value,
          owner: window.connectedAccount,
          network: window.activeNetwork || 'mainnet'
        };
        window.saveMemeLockToStorage(newLock);

        // Fill Vault inputs so they can monitor
        const seedInput = document.getElementById('vaultSeed');
        if (seedInput) {
          seedInput.value = '';
          seedInput.placeholder = `Enter seed for Vault: ${vault}`;
        }
        document.getElementById('vaultDestination').value = recipient;
        let displayCurrency = currency;
        if (tokenSymbol && tokenSymbol.startsWith('{')) {
          try {
            const parsed = JSON.parse(tokenSymbol);
            displayCurrency = parsed.decoded_currency || parsed.currency;
          } catch(e){}
        } else {
          displayCurrency = decodeCurrencyCode(currency);
        }
        document.getElementById('vaultCurrency').value = displayCurrency;
        document.getElementById('vaultIssuer').value = issuer;
        document.getElementById('vaultReleaseTime').value = memeLockReleaseTime.value;

        // Switch to Vault Pane
        const vaultTabBtn = document.getElementById('tab-vault-btn');
        if (vaultTabBtn) vaultTabBtn.click();
      } catch (err) {
        showAlert(`Failed to configure lockup: ${err.message}`, 'error');
      } finally {
        btnMemeLockupSubmit.removeAttribute('disabled');
        btnMemeLockupSubmit.innerHTML = '<i class="bi bi-lock-fill"></i> Lock Meme Tokens';
      }
    }
  });

  const updateMultisigProgress = (signers, quorum) => {
    memeMultisigSignersList.innerHTML = '';
    signers.forEach(s => {
      const div = document.createElement('div');
      div.className = 'list-group-item d-flex justify-content-between align-items-center py-2';
      div.id = `multisig-signer-${s}`;
      div.innerHTML = `
        <div class="text-truncate" style="max-width: 60%;">
          <strong class="text-secondary small font-monospace">${s}</strong>
          <div class="status-indicator small text-muted"><i class="bi bi-clock-history"></i> Waiting for signature...</div>
        </div>
        <div class="signer-link-col text-end">
          <span class="spinner-border spinner-border-sm text-primary" role="status"></span> Preparing payload...
        </div>
      `;
      memeMultisigSignersList.appendChild(div);
    });

    const percent = Math.min(100, Math.round((collectedSignatures.length / quorum) * 100));
    memeMultisigProgressBar.style.width = `${percent}%`;
    memeMultisigProgressBar.textContent = `${collectedSignatures.length} / ${quorum} Signatures`;
  };

  const addCollectedSignature = (account, signature, pubkey, signers, quorum) => {
    // Check if already collected
    const existing = collectedSignatures.find(s => s.Signer.Account === account);
    if (existing) return;

    collectedSignatures.push({
      Signer: {
        Account: account,
        TxnSignature: signature,
        SigningPubKey: pubkey
      }
    });

    const item = document.getElementById(`multisig-signer-${account}`);
    if (item) {
      item.querySelector('.status-indicator').innerHTML = '<span class="text-success fw-bold"><i class="bi bi-check-circle-fill"></i> Signed successfully</span>';
      item.querySelector('.signer-link-col').innerHTML = '<span class="badge bg-success"><i class="bi bi-patch-check"></i> OK</span>';
    }

    const percent = Math.min(100, Math.round((collectedSignatures.length / quorum) * 100));
    memeMultisigProgressBar.style.width = `${percent}%`;
    memeMultisigProgressBar.textContent = `${collectedSignatures.length} / ${quorum} Signatures`;

    if (collectedSignatures.length >= quorum) {
      memeMultisigProgressBar.className = 'progress-bar bg-success text-white fw-bold';
      btnSubmitMultisigTx.removeAttribute('disabled');
      showAlert('Multisig Quorum achieved! You can now submit the transaction to the ledger.', 'success');
    }
  };

  btnSubmitMultisigTx.addEventListener('click', async () => {
    if (!preparedTxJson || collectedSignatures.length === 0) return;

    // Append signers array to prepared transaction (sorted alphabetically by Account)
    const sortedSigners = [...collectedSignatures].sort((a, b) => {
      return a.Signer.Account.localeCompare(b.Signer.Account);
    });

    const finalTx = {
      ...preparedTxJson,
      Signers: sortedSigners
    };

    btnSubmitMultisigTx.setAttribute('disabled', 'true');
    btnSubmitMultisigTx.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Submitting...';

    try {
      const resp = await fetch('/submit_json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tx_json: finalTx })
      });
      if (!resp.ok) throw new Error(await resp.text());
      const res = await resp.json();
      
      const result = res.result || {};
      if (result.engine_result === 'tesSUCCESS' || result.engine_result_code === 0) {
        showAlert('Multisig Transaction Submitted Successfully!', 'success');
        memeMultisigCard.classList.add('d-none');
        multisigPollingIntervals.forEach(clearInterval);
        multisigPollingIntervals = [];
      } else {
        showAlert(`Ledger Submission Failed: ${result.engine_result_message || result.engine_result}`, 'danger');
        btnSubmitMultisigTx.removeAttribute('disabled');
        btnSubmitMultisigTx.innerHTML = '<i class="bi bi-cloud-upload"></i> Merge & Submit Multi-Signed Transaction';
      }
    } catch (err) {
      showAlert(`API Error submitting transaction: ${err.message}`, 'error');
      btnSubmitMultisigTx.removeAttribute('disabled');
      btnSubmitMultisigTx.innerHTML = '<i class="bi bi-cloud-upload"></i> Merge & Submit Multi-Signed Transaction';
    }
  });

  btnCancelMultisig.addEventListener('click', (e) => {
    e.preventDefault();
    memeMultisigCard.classList.add('d-none');
    multisigPollingIntervals.forEach(clearInterval);
    multisigPollingIntervals = [];
    showAlert('Multisig signature collection aborted.', 'warning');
  });

  // 6. Crowd-HODL Manager logic
  btnScanCrowdhdl.addEventListener('click', async () => {
    const vault = crowdhdlVaultAddress.value.trim();
    const tokenVal = document.getElementById('crowdhdlTokenSelect').value;
    if (!vault) {
      showAlert('Please enter a Vault / Pool address to scan.', 'warning');
      return;
    }
    if (!tokenVal) {
      showAlert('Please select a token to scan deposits for.', 'warning');
      return;
    }

    let currencyHex = '';
    let issuerAddress = '';
    let readableSymbol = '';
    try {
      const parsed = JSON.parse(tokenVal);
      currencyHex = formatCurrencyCode(parsed.currency);
      issuerAddress = parsed.issuer;
      readableSymbol = parsed.decoded_currency || parsed.currency;
    } catch(e) {
      showAlert('Invalid token selection.', 'warning');
      return;
    }

    btnScanCrowdhdl.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Scanning...';
    btnScanCrowdhdl.setAttribute('disabled', 'true');

    try {
      const r = await fetch(`/account_tx/${encodeURIComponent(vault)}?limit=400`);
      if (!r.ok) throw new Error(await r.text());
      const txHistory = await r.json();

      const transactions = txHistory.transactions || [];
      const deposits = {}; // account -> totalAmount

      transactions.forEach(item => {
        const tx = item.tx || item.transaction || {};
        const meta = item.meta || item.metaData || {};
        if (tx.TransactionType === 'Payment' && tx.Destination === vault && meta.TransactionResult === 'tesSUCCESS') {
          const amt = tx.Amount;
          if (amt && typeof amt === 'object') {
            const txCurrencyHex = formatCurrencyCode(amt.currency);
            if (txCurrencyHex === currencyHex && amt.issuer === issuerAddress) {
              const sender = tx.Account;
              const value = parseFloat(amt.value) || 0;
              if (value > 0) {
                deposits[sender] = (deposits[sender] || 0) + value;
              }
            }
          }
        }
      });

      // Sort deposits by amount descending
      const sorted = Object.entries(deposits).map(([addr, val]) => ({ addr, val })).sort((a, b) => b.val - a.val);

      crowdhdlLeaderboardBody.innerHTML = '';
      if (sorted.length === 0) {
        crowdhdlLeaderboardBody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-4">No deposits found for $${readableSymbol} on this account.</td></tr>`;
        crowdhdlTotalLocked.textContent = `0 ${readableSymbol}`;
        crowdhdlDepositorsCount.textContent = '0 Depositors';
      } else {
        let total = 0;
        sorted.forEach((d, idx) => {
          total += d.val;
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>#${idx + 1}</strong></td>
            <td class="font-monospace">${shortenAddress(d.addr)}</td>
            <td class="fw-bold text-success">${d.val.toLocaleString()} ${readableSymbol}</td>
          `;
          crowdhdlLeaderboardBody.appendChild(tr);
        });
        crowdhdlTotalLocked.textContent = `${total.toLocaleString()} ${readableSymbol}`;
        crowdhdlDepositorsCount.textContent = `${sorted.length} Depositors`;

        // Show the release panel
        crowdhdlAdminPanel.classList.remove('d-none');
      }

    } catch (err) {
      showAlert(`Scan failed: ${err.message}`, 'error');
    } finally {
      btnScanCrowdhdl.innerHTML = '<i class="bi bi-search"></i> Scan';
      btnScanCrowdhdl.removeAttribute('disabled');
    }
  });

  btnCrowdhdlDeposit.addEventListener('click', async () => {
    const vault = crowdhdlVaultAddress.value.trim();
    const amount = parseFloat(crowdhdlDepositAmount.value);
    const tokenVal = document.getElementById('crowdhdlTokenSelect').value;
    
    if (!vault) {
      showAlert('Vault address is required.', 'warning');
      return;
    }
    if (!amount || amount <= 0) {
      showAlert('Please enter an amount to deposit.', 'warning');
      return;
    }
    if (!tokenVal) {
      showAlert('Please select a token to deposit.', 'warning');
      return;
    }

    let currencyHex = '';
    let issuerAddress = '';
    try {
      const parsed = JSON.parse(tokenVal);
      currencyHex = formatCurrencyCode(parsed.currency);
      issuerAddress = parsed.issuer;
    } catch(e) {
      showAlert('Invalid token selection.', 'warning');
      return;
    }

    btnCrowdhdlDeposit.setAttribute('disabled', 'true');
    btnCrowdhdlDeposit.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Loading Xaman...';

    try {
      // Construct Xaman payload for Payment deposit
      const payloadData = {
        txjson: {
          TransactionType: 'Payment',
          Account: window.connectedAccount || '',
          Destination: vault,
          Amount: {
            currency: currencyHex,
            issuer: issuerAddress,
            value: amount.toString()
          }
        }
      };

      const resp = await fetch('/xumm/payload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadData)
      });
      if (!resp.ok) throw new Error(await resp.text());
      const payload = await resp.json();

      // Show submit modal
      showSubmittedModal(payload);

    } catch (err) {
      showAlert(`Failed to initiate deposit: ${err.message}`, 'error');
    } finally {
      btnCrowdhdlDeposit.removeAttribute('disabled');
      btnCrowdhdlDeposit.textContent = 'Deposit';
    }
  });

  const btnCrowdhdlConfigureSigners = document.getElementById('btnCrowdhdlConfigureSigners');
  if (btnCrowdhdlConfigureSigners) {
    btnCrowdhdlConfigureSigners.addEventListener('click', async () => {
      if (!window.connectedAccount) {
        showAlert('Please connect your wallet first to set up its signer list.', 'warning');
        return;
      }

      const adminSignersStr = crowdhdlAdminSigners.value.trim();
      const quorumInput = document.getElementById('crowdhdlAdminQuorum');
      const quorum = parseInt(quorumInput?.value) || 2;
      
      const signers = adminSignersStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
      if (signers.length === 0) {
        showAlert('Please provide comma-separated signer addresses for the admin multisig.', 'warning');
        return;
      }

      btnCrowdhdlConfigureSigners.setAttribute('disabled', 'true');
      btnCrowdhdlConfigureSigners.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Preparing payload...';

      try {
        const signerEntries = signers.map(signer => ({
          SignerEntry: {
            Account: signer,
            SignerWeight: 1
          }
        }));

        const txjson = {
          TransactionType: 'SignerListSet',
          Account: window.connectedAccount,
          SignerQuorum: quorum,
          SignerEntries: signerEntries
        };

        const resp = await fetch('/xumm/payload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txjson })
        });
        if (!resp.ok) throw new Error(await resp.text());
        const payload = await resp.json();

        showSubmittedModal(payload);

      } catch (err) {
        showAlert(`Failed to configure admin signers: ${err.message}`, 'error');
      } finally {
        btnCrowdhdlConfigureSigners.removeAttribute('disabled');
        btnCrowdhdlConfigureSigners.innerHTML = '<i class="bi bi-person-plus-fill"></i> Deploy Signer List to Active Wallet';
      }
    });
  }

  btnCrowdhdlPrepareRefund.addEventListener('click', async () => {
    const vault = crowdhdlVaultAddress.value.trim();
    const adminSignersStr = crowdhdlAdminSigners.value.trim();
    const timeVal = crowdhdlReleaseTime.value;
    const tokenVal = document.getElementById('crowdhdlTokenSelect').value;

    if (!vault) {
      showAlert('Vault address is required.', 'warning');
      return;
    }
    if (!adminSignersStr) {
      showAlert('Please provide comma-separated admin signer addresses.', 'warning');
      return;
    }
    if (!timeVal) {
      showAlert('Please select the release date and time lock.', 'warning');
      return;
    }
    if (!tokenVal) {
      showAlert('Please select the token.', 'warning');
      return;
    }

    let currencyHex = '';
    let issuerAddress = '';
    try {
      const parsed = JSON.parse(tokenVal);
      currencyHex = formatCurrencyCode(parsed.currency);
      issuerAddress = parsed.issuer;
    } catch(e) {
      showAlert('Invalid token selection.', 'warning');
      return;
    }

    const releaseUnix = Math.floor(new Date(timeVal).getTime() / 1000);
    const nowUnix = Math.floor(Date.now() / 1000);
    if (releaseUnix > nowUnix) {
      showAlert('The release time lock date has not passed yet. Refund batch can only be triggered after the time lock expires.', 'warning');
      return;
    }

    // Prepare list of depositors to refund
    try {
      const r = await fetch(`/account_tx/${encodeURIComponent(vault)}?limit=400`);
      if (!r.ok) throw new Error(await r.text());
      const txHistory = await r.json();

      const transactions = txHistory.transactions || [];
      const deposits = {};

      transactions.forEach(item => {
        const tx = item.tx || item.transaction || {};
        const meta = item.meta || item.metaData || {};
        if (tx.TransactionType === 'Payment' && tx.Destination === vault && meta.TransactionResult === 'tesSUCCESS') {
          const amt = tx.Amount;
          if (amt && typeof amt === 'object') {
            const txCurrencyHex = formatCurrencyCode(amt.currency);
            if (txCurrencyHex === currencyHex && amt.issuer === issuerAddress) {
              const sender = tx.Account;
              const value = parseFloat(amt.value) || 0;
              if (value > 0) {
                deposits[sender] = (deposits[sender] || 0) + value;
              }
            }
          }
        }
      });

      // Convert deposits into batch Payment transactions
      window.batchTransactions = [];
      Object.entries(deposits).forEach(([addr, val]) => {
        window.batchTransactions.push({
          TransactionType: 'Payment',
          Account: vault,
          Destination: addr,
          Amount: {
            currency: currencyHex,
            issuer: issuerAddress,
            value: val.toString()
          }
        });
      });

      updateBatchUI();
      showAlert(`Prepared refund batch for ${Object.keys(deposits).length} depositors. Switch to the Auto-Sweep Vault / Batch tab to review and execute!`, 'success');

    } catch (err) {
      showAlert(`Failed to compile refund transactions: ${err.message}`, 'error');
    }
  });

  // Shorten XRPL addresses helper
  function shortenAddress(addr) {
    if (!addr) return '';
    return addr.slice(0, 6) + '...' + addr.slice(-6);
  }

  // --- Real-Time Meme Lockup Dashboard controller ---
  window.activeMemeLocks = [];
  let memeDashboardCountdownInterval = null;
  let memeDashboardBodyDelegated = false;

  window.loadMemeLocksFromStorage = function() {
    if (!window.connectedAccount) {
      window.activeMemeLocks = [];
      return;
    }
    const raw = localStorage.getItem('local_meme_vault_locks');
    let locks = [];
    if (raw) {
      try {
        locks = JSON.parse(raw);
      } catch(e) {
        locks = [];
      }
    }
    window.activeMemeLocks = locks.filter(l => l.owner === window.connectedAccount);
  };

  window.saveMemeLockToStorage = function(lock) {
    const raw = localStorage.getItem('local_meme_vault_locks');
    let locks = [];
    if (raw) {
      try {
        locks = JSON.parse(raw);
      } catch(e) {
        locks = [];
      }
    }
    locks.push(lock);
    localStorage.setItem('local_meme_vault_locks', JSON.stringify(locks));
    window.loadMemeLocksFromStorage();
    window.renderMemeDashboardTable();
    window.refreshMemeDashboardBalances();
  };

  window.renderMemeDashboardTable = function() {
    const tbody = document.getElementById('memeDashboardBody');
    if (!tbody) return;

    if (!window.connectedAccount) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted py-4">
            <i class="bi bi-info-circle me-1"></i> Connect wallet to view your active locks.
          </td>
        </tr>
      `;
      return;
    }

    const activeTab = document.getElementById('memeFilterHistory')?.checked ? 'history' : 'active';
    let filteredLocks = [];
    if (activeTab === 'active') {
      filteredLocks = window.activeMemeLocks.filter(lock => {
        const balance = lock.currentBalance !== undefined ? lock.currentBalance : lock.amount;
        return balance > 0;
      });
    } else {
      filteredLocks = window.activeMemeLocks.filter(lock => {
        const balance = lock.currentBalance !== undefined ? lock.currentBalance : lock.amount;
        return balance <= 0;
      });
    }

    if (filteredLocks.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted py-4">
            <i class="bi bi-shield-lock me-1"></i> No ${activeTab} lockups found.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = '';
    filteredLocks.forEach(lock => {
      const tr = document.createElement('tr');
      tr.id = `lock-row-${lock.vault}-${lock.currency}`;
      
      const readableCurrency = decodeCurrencyCode(lock.currency);
      const balance = lock.currentBalance !== undefined ? lock.currentBalance : lock.amount;

      tr.innerHTML = `
        <td class="align-middle">
          <span class="fw-bold text-warning">${escapeHtml(readableCurrency)}</span>
        </td>
        <td class="align-middle font-monospace fw-semibold">${balance.toLocaleString()}</td>
        <td class="align-middle">
          <a href="https://xrpl.org/account/${lock.vault}" target="_blank" class="font-monospace text-primary text-decoration-none small text-truncate d-inline-block" style="max-width: 140px;" title="${lock.vault}">
            ${lock.vault}
          </a>
        </td>
        <td class="align-middle text-secondary small">${new Date(lock.releaseTime).toLocaleString()}</td>
        <td class="align-middle lock-countdown">
          <span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">⏳ Loading...</span>
        </td>
        <td class="align-middle text-end lock-action-cell">
          <span class="spinner-border spinner-border-sm text-secondary" role="status"></span>
        </td>
      `;
      tbody.appendChild(tr);
    });

    window.updateMemeDashboardCountdowns();
  };

  window.updateMemeDashboardCountdowns = function() {
    const tbody = document.getElementById('memeDashboardBody');
    if (!tbody || !window.activeMemeLocks || window.activeMemeLocks.length === 0) return;

    const activeTab = document.getElementById('memeFilterHistory')?.checked ? 'history' : 'active';
    const nowUnix = Math.floor(Date.now() / 1000);

    window.activeMemeLocks.forEach(lock => {
      const rowEl = document.getElementById(`lock-row-${lock.vault}-${lock.currency}`);
      if (!rowEl) return;

      const countdownEl = rowEl.querySelector('.lock-countdown');
      const actionEl = rowEl.querySelector('.lock-action-cell');
      if (!countdownEl) return;

      const releaseUnix = Math.floor(new Date(lock.releaseTime).getTime() / 1000);
      const balance = lock.currentBalance !== undefined ? lock.currentBalance : lock.amount;

      if (activeTab === 'history') {
        countdownEl.innerHTML = '<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-check-circle-fill"></i> Sweep Complete</span>';
        if (actionEl) {
          actionEl.innerHTML = `
            <span class="badge bg-success text-white fw-bold px-2 py-1"><i class="bi bi-check-lg"></i> Swept</span>
            <button class="btn btn-outline-danger btn-xs lock-delete-btn ms-2" data-vault="${lock.vault}" data-currency="${lock.currency}">
              <i class="bi bi-trash"></i>
            </button>
          `;
        }
        return;
      }

      if (balance <= 0) {
        countdownEl.innerHTML = '<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-check-circle-fill"></i> Sweep Complete</span>';
        if (actionEl) {
          actionEl.innerHTML = `
            <button class="btn btn-outline-danger btn-xs lock-delete-btn" data-vault="${lock.vault}" data-currency="${lock.currency}">
              <i class="bi bi-trash"></i> Remove
            </button>
          `;
        }
        return;
      }

      if (nowUnix >= releaseUnix) {
        countdownEl.innerHTML = '<span class="badge bg-warning-subtle text-warning border border-warning-subtle animate-pulse"><i class="bi bi-unlock-fill"></i> Ready to Sweep</span>';
        if (actionEl) {
          actionEl.innerHTML = `
            <button class="btn btn-success btn-xs fw-bold lock-claim-btn" data-vault="${lock.vault}" data-currency="${lock.currency}" data-issuer="${lock.issuer}" data-recipient="${lock.recipient}">
              <i class="bi bi-box-arrow-right"></i> Sweep
            </button>
            <button class="btn btn-outline-info btn-xs lock-monitor-btn ms-1" data-vault="${lock.vault}" data-currency="${lock.currency}" data-issuer="${lock.issuer}" data-recipient="${lock.recipient}" data-release="${lock.releaseTime}">
              <i class="bi bi-eye"></i> Monitor
            </button>
          `;
        }
      } else {
        const diff = releaseUnix - nowUnix;
        const days = Math.floor(diff / 86400);
        const hours = Math.floor((diff % 86400) / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;

        let timeStr = '';
        if (days > 0) {
          timeStr = `${days}d ${hours}h ${minutes}m ${seconds}s remaining`;
        } else {
          timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} remaining`;
        }
        countdownEl.innerHTML = `<span class="badge bg-info-subtle text-info border border-info-subtle font-monospace">${timeStr}</span>`;
        
        if (actionEl) {
          actionEl.innerHTML = `
            <button class="btn btn-outline-info btn-xs lock-monitor-btn" data-vault="${lock.vault}" data-currency="${lock.currency}" data-issuer="${lock.issuer}" data-recipient="${lock.recipient}" data-release="${lock.releaseTime}">
              <i class="bi bi-eye"></i> Monitor
            </button>
          `;
        }
      }
    });
  };

  window.refreshMemeDashboardBalances = async function() {
    if (!window.connectedAccount) return;
    const rpc = document.getElementById('vaultRpc').value.trim() || 'https://s1.ripple.com:51234/';
    const tempClient = new xrpl.Client(rpc);
    try {
      await tempClient.connect();
      for (let lock of window.activeMemeLocks) {
        try {
          const lines = await tempClient.request({ command: 'account_lines', account: lock.vault, peer: lock.issuer });
          const trustline = lines.result.lines.find(l => l.currency === lock.currency || l.currency === formatCurrencyCode(lock.currency));
          if (trustline) {
            lock.currentBalance = parseFloat(trustline.balance);
          } else {
            lock.currentBalance = 0;
          }
        } catch (e) {
          console.error(`Failed to fetch lines for vault ${lock.vault}:`, e);
          lock.currentBalance = 0;
        }
      }
      window.renderMemeDashboardTable();
    } catch (err) {
      console.error('Error refreshing dashboard balances:', err);
    } finally {
      if (tempClient.isConnected()) {
        await tempClient.disconnect();
      }
    }
  };

  window.initMemeDashboard = function() {
    window.loadMemeLocksFromStorage();
    window.renderMemeDashboardTable();
    window.refreshMemeDashboardBalances();

    if (memeDashboardCountdownInterval) clearInterval(memeDashboardCountdownInterval);
    memeDashboardCountdownInterval = setInterval(window.updateMemeDashboardCountdowns, 1000);

    // Setup active/history filter toggles
    const activeRadio = document.getElementById('memeFilterActive');
    const historyRadio = document.getElementById('memeFilterHistory');
    if (activeRadio && !activeRadio.dataset.listenerAdded) {
      activeRadio.dataset.listenerAdded = 'true';
      activeRadio.addEventListener('change', () => {
        window.renderMemeDashboardTable();
      });
    }
    if (historyRadio && !historyRadio.dataset.listenerAdded) {
      historyRadio.dataset.listenerAdded = 'true';
      historyRadio.addEventListener('change', () => {
        window.renderMemeDashboardTable();
      });
    }

    // Setup click listeners
    const btnRefresh = document.getElementById('btnRefreshMemeDashboard');
    if (btnRefresh && !btnRefresh.dataset.listenerAdded) {
      btnRefresh.dataset.listenerAdded = 'true';
      btnRefresh.addEventListener('click', (e) => {
        e.preventDefault();
        btnRefresh.innerHTML = '<i class="bi bi-arrow-clockwise animate-spin"></i> Refreshing...';
        btnRefresh.setAttribute('disabled', 'true');
        
        window.refreshMemeDashboardBalances().then(() => {
          btnRefresh.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Refresh';
          btnRefresh.removeAttribute('disabled');
        });
      });
    }

    const memeDashboardBody = document.getElementById('memeDashboardBody');
    if (memeDashboardBody && !memeDashboardBodyDelegated) {
      memeDashboardBodyDelegated = true;
      memeDashboardBody.addEventListener('click', async (e) => {
        // 1. Claim Click
        const claimBtn = e.target.closest('.lock-claim-btn');
        if (claimBtn) {
          const vault = claimBtn.getAttribute('data-vault');
          const currency = claimBtn.getAttribute('data-currency');
          const issuer = claimBtn.getAttribute('data-issuer');
          const recipient = claimBtn.getAttribute('data-recipient');

          claimBtn.setAttribute('disabled', 'true');
          claimBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Claiming...';

          try {
            const rpc = document.getElementById('vaultRpc').value.trim() || 'https://s1.ripple.com:51234/';
            const tempClient = new xrpl.Client(rpc);
            await tempClient.connect();
            const lines = await tempClient.request({ command: 'account_lines', account: vault, peer: issuer });
            const trustline = lines.result.lines.find(l => l.currency === currency || l.currency === formatCurrencyCode(currency));
            const balance = trustline ? trustline.balance : '0';
            await tempClient.disconnect();

            if (parseFloat(balance) <= 0) {
              showAlert('Vault balance is 0 or empty.', 'warning');
              claimBtn.removeAttribute('disabled');
              claimBtn.innerHTML = '<i class="bi bi-box-arrow-right"></i> Claim';
              return;
            }

            const paymentTx = {
              TransactionType: 'Payment',
              Account: vault,
              Destination: recipient,
              Amount: {
                currency: formatCurrencyCode(currency),
                issuer: issuer,
                value: balance
              }
            };

            const resp = await fetch('/xumm/payload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ txjson: paymentTx })
            });
            if (!resp.ok) throw new Error(await resp.text());
            const payload = await resp.json();

            showAlert('Release payload generated. Please sign the transaction on Xaman!', 'success');
            showSubmittedModal(payload);
          } catch(err) {
            showAlert(`Failed to claim: ${err.message}`, 'error');
          } finally {
            claimBtn.removeAttribute('disabled');
            claimBtn.innerHTML = '<i class="bi bi-box-arrow-right"></i> Claim';
          }
        }

        // 2. Monitor Click
        const monitorBtn = e.target.closest('.lock-monitor-btn');
        if (monitorBtn) {
          const vault = monitorBtn.getAttribute('data-vault');
          const currency = monitorBtn.getAttribute('data-currency');
          const issuer = monitorBtn.getAttribute('data-issuer');
          const recipient = monitorBtn.getAttribute('data-recipient');
          const releaseTime = monitorBtn.getAttribute('data-release');

          const seedInput = document.getElementById('vaultSeed');
          if (seedInput) {
            seedInput.value = '';
            seedInput.placeholder = `Enter seed for Vault: ${vault}`;
          }
          document.getElementById('vaultDestination').value = recipient;
          document.getElementById('vaultCurrency').value = decodeCurrencyCode(currency);
          document.getElementById('vaultIssuer').value = issuer;
          document.getElementById('vaultReleaseTime').value = releaseTime;

          const vaultTabBtn = document.getElementById('tab-vault-btn');
          if (vaultTabBtn) vaultTabBtn.click();
          
          showAlert(`Loaded Vault ${vault} into L2 Monitor. Click 'Start Vault Monitor' to run countdown.`, 'info');
        }

        // 3. Delete Click
        const deleteBtn = e.target.closest('.lock-delete-btn');
        if (deleteBtn) {
          const vault = deleteBtn.getAttribute('data-vault');
          const currency = deleteBtn.getAttribute('data-currency');

          const raw = localStorage.getItem('local_meme_vault_locks');
          if (raw) {
            try {
              let locks = JSON.parse(raw);
              locks = locks.filter(l => !(l.vault === vault && l.currency === currency));
              localStorage.setItem('local_meme_vault_locks', JSON.stringify(locks));
            } catch(e) {}
          }
          
          window.loadMemeLocksFromStorage();
          window.renderMemeDashboardTable();
          showAlert('Lockup removed from dashboard view.', 'success');
        }
      });
    }
  };
});
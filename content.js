var popupSuppressionEnabled = false;
var popupObserver = null;
var ctrlCopyEnabled = true;
var contextMenuInitialized = false;
var EXTENSION_NAME = 'Google Sheets Utilities';
var COPY_BLOCKED_TEXT = 'Copying and pasting content outside this file has been disabled';

function isEditableTarget(target) {
  if (!target) {
    return false;
  }

  var tag = (target.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    return true;
  }

  return !!target.closest('[contenteditable="true"], [role="textbox"]');
}

function getSelectedTextFromSheet() {
  var selectedText = window.getSelection().toString();
  if (!selectedText) {
    var activeCell = document.querySelector('.waffle-formulatext');
    if (activeCell) {
      selectedText = activeCell.textContent || activeCell.innerText || '';
    }
  }

  if (!selectedText) {
    var selectedGridCell = document.querySelector('[role="gridcell"][aria-selected="true"]');
    if (selectedGridCell) {
      selectedText = selectedGridCell.getAttribute('aria-label') || '';
    }
  }

  return selectedText;
}

function applyCtrlCopy(enabled) {
  ctrlCopyEnabled = !!enabled;
}

function getSpreadsheetIdFromUrl(url) {
  var match = (url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : '';
}

function getSheetGidFromUrl(url) {
  var match = (url || '').match(/[?#&]gid=([0-9]+)/);
  return match ? match[1] : '';
}

function getLikelySheetName() {
  var activeTabSelectors = [
    '.docs-sheet-tab.docs-sheet-active-tab .docs-sheet-tab-name',
    '.docs-sheet-tab[aria-selected="true"] .docs-sheet-tab-name',
    '.docs-sheet-tab[aria-selected="true"]',
    '[role="tab"][aria-selected="true"]'
  ];

  for (var i = 0; i < activeTabSelectors.length; i++) {
    var node = document.querySelector(activeTabSelectors[i]);
    if (!node) {
      continue;
    }

    var name = (node.textContent || node.innerText || '').trim();
    if (name) {
      return name;
    }
  }

  return '';
}

function getSelectedRangeHint() {
  var sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    return '';
  }

  var anchor = sel.anchorNode;
  if (!anchor) {
    return '';
  }

  var gridCell = anchor.parentElement && anchor.parentElement.closest
    ? anchor.parentElement.closest('[role="gridcell"]')
    : null;
  if (!gridCell) {
    return '';
  }

  var label = gridCell.getAttribute('aria-label') || '';
  var colRowMatch = label.match(/^([A-Z]+)(\d+)/);
  return colRowMatch ? colRowMatch[1] + colRowMatch[2] : '';
}

function getAllSheetTabs() {
  var tabs = [];
  var tabNodes = document.querySelectorAll(
    '.docs-sheet-tab .docs-sheet-tab-name, .docs-sheet-tab[aria-label]'
  );
  for (var i = 0; i < tabNodes.length; i++) {
    var name = (tabNodes[i].textContent || tabNodes[i].innerText || '').trim();
    var ariaLabel = tabNodes[i].getAttribute('aria-label') || '';
    if (!name && ariaLabel) {
      name = ariaLabel;
    }
    if (name) {
      tabs.push(name);
    }
  }
  return tabs;
}

function getPageContextReport() {
  var url = window.location.href;
  var spreadsheetId = getSpreadsheetIdFromUrl(url);
  var gid = getSheetGidFromUrl(url);
  var sheetName = getLikelySheetName();
  var title = (document.title || '').replace(/\s*-\s*Google Sheets\s*$/i, '').trim();
  var selectedCell = getSelectedRangeHint();
  var allTabs = getAllSheetTabs();
  var safeSheetName = sheetName || 'Sheet1';
  var safeSpreadsheetId = spreadsheetId || 'SPREADSHEET_ID';

  var rangeExample = selectedCell
    ? "'" + safeSheetName + "'!" + selectedCell
    : "'" + safeSheetName + "'!A1:Z1000";

  var baseApi = 'https://sheets.googleapis.com/v4/spreadsheets/' + safeSpreadsheetId;

  var lines = [
    '=== SHEET INFO ===',
    'Spreadsheet ID:  ' + (spreadsheetId || '(not detected)'),
    'Sheet GID:       ' + (gid || '(not detected)'),
    'Sheet Name:      ' + (sheetName || '(not detected)'),
    'Doc Title:       ' + (title || '(empty)'),
    'Selected Cell:   ' + (selectedCell || '(none)'),
    'All Tabs:        ' + (allTabs.length ? allTabs.join(', ') : '(none found)'),
    '',
    '=== API ENDPOINTS ===',
    'Get spreadsheet metadata:',
    '  GET ' + baseApi,
    '',
    'Get all values in this sheet:',
    "  GET " + baseApi + "/values/" + encodeURIComponent("'" + safeSheetName + "'"),
    '',
    'Get a specific range:',
    "  GET " + baseApi + "/values/" + encodeURIComponent(rangeExample),
    '',
    'Append rows:',
    "  POST " + baseApi + "/values/" + encodeURIComponent("'" + safeSheetName + "'") + ":append?valueInputOption=USER_ENTER",
    '',
    'Update a range:',
    "  PUT " + baseApi + "/values/" + encodeURIComponent(rangeExample) + "?valueInputOption=USER_ENTER",
    '',
    '=== CURL EXAMPLES ===',
    '# Read this sheet:',
    'curl \\',
    '  -H "Authorization: Bearer $ACCESS_TOKEN" \\',
    '  "' + baseApi + '/values/' + encodeURIComponent("'" + safeSheetName + "'") + '"',
    '',
    '# Write to a cell:',
    'curl -X PUT \\',
    '  -H "Authorization: Bearer $ACCESS_TOKEN" \\',
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"values":[["hello world"]]}\' \\',
    '  "' + baseApi + '/values/' + encodeURIComponent(rangeExample) + '?valueInputOption=USER_ENTER"',
    '',
    '=== JAVASCRIPT SNIPPET ===',
    'const { google } = require("googleapis");',
    'const sheets = google.sheets({ version: "v4", auth: YOUR_AUTH });',
    '',
    '// Read this sheet',
    'const res = await sheets.spreadsheets.values.get({',
    '  spreadsheetId: "' + safeSpreadsheetId + '",',
    '  range: "' + rangeExample + '",',
    '});',
    'console.log(res.data.values);',
    '',
    '=== PYTHON SNIPPET ===',
    'from googleapiclient.discovery import build',
    '',
    'service = build("sheets", "v4", credentials=creds)',
    'sheet = service.spreadsheets().values().get(',
    '    spreadsheetId="' + safeSpreadsheetId + '",',
    '    range="' + rangeExample + '")',
    'result = sheet.execute()',
    'print(result.get("values", []))',
  ];

  showToast('API context captured for this sheet.');

  return { report: lines.join('\n') };
}

function showToast(message) {
  var existing = document.getElementById('gsuToast');
  if (existing) {
    existing.remove();
  }

  var toast = document.createElement('div');
  toast.id = 'gsuToast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(function () {
    toast.classList.add('visible');
  }, 10);

  setTimeout(function () {
    toast.classList.remove('visible');
    setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 200);
  }, 1800);
}

function hideGoogleCopyBlockedBanner() {
  var containers = document.querySelectorAll('[role="alert"], [role="status"], .docs-toast, .jfk-bubble, .docs-material');
  for (var i = 0; i < containers.length; i++) {
    var node = containers[i];
    var text = node.innerText || '';
    if (text.indexOf(COPY_BLOCKED_TEXT) === -1) {
      continue;
    }

    var close = node.querySelector('[aria-label="Close"], [aria-label="close"], button, [role="button"]');
    if (close) {
      close.click();
    }
    node.style.display = 'none';
  }
}

function hideGoogleCopyBlockedBannerSoon() {
  hideGoogleCopyBlockedBanner();
  setTimeout(hideGoogleCopyBlockedBanner, 30);
  setTimeout(hideGoogleCopyBlockedBanner, 120);
}

function copySelectedText(successMessage) {
  var text = getSelectedTextFromSheet();
  if (!text) {
    showToast('No text selected.');
    return false;
  }

  var textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  hideGoogleCopyBlockedBannerSoon();
  showToast(successMessage || ('Copied via ' + EXTENSION_NAME + '.'));
  return true;
}

function handleCopyEvent(event) {
  if (!ctrlCopyEnabled) {
    return;
  }

  if (isEditableTarget(event.target)) {
    return;
  }

  var text = getSelectedTextFromSheet();
  if (!text || !event.clipboardData) {
    return;
  }

  event.clipboardData.setData('text/plain', text);
  event.preventDefault();
  hideGoogleCopyBlockedBannerSoon();
  showToast('Copied via ' + EXTENSION_NAME + '.');
}

function handleCopyHotkey(event) {
  if (!ctrlCopyEnabled) {
    return;
  }

  var key = (event.key || '').toLowerCase();
  var isCopyKey = (event.ctrlKey || event.metaKey) && !event.altKey && key === 'c';
  if (!isCopyKey) {
    return;
  }

  if (isEditableTarget(event.target)) {
    return;
  }

  var copied = copySelectedText('Copied via ' + EXTENSION_NAME + '.');
  if (!copied) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === 'function') {
    event.stopImmediatePropagation();
  }
}

function hideContextMenu() {
  var menu = document.getElementById('gsuContextMenu');
  if (menu) {
    menu.style.display = 'none';
  }
}

function createContextMenu() {
  if (contextMenuInitialized) {
    return;
  }

  contextMenuInitialized = true;
  var contextMenu = document.createElement('div');
  contextMenu.id = 'gsuContextMenu';

  var copyItem = document.createElement('div');
  copyItem.id = 'gsuCopyItem';
  copyItem.textContent = 'Copy with Sheets Utilities';
  copyItem.addEventListener('click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    copySelectedText();
    hideContextMenu();
  });

  contextMenu.appendChild(copyItem);
  document.body.appendChild(contextMenu);

  document.addEventListener('contextmenu', function (event) {
    var selection = window.getSelection().toString();
    if (!selection && !document.querySelector('.waffle-formulatext')) {
      return;
    }

    contextMenu.style.display = 'block';
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    event.preventDefault();
  });

  document.addEventListener('click', hideContextMenu);
  document.addEventListener('scroll', hideContextMenu, true);
}

function scheduleNonCriticalInit() {
  var run = function () {
    createContextMenu();
    showToast('Sheets Utilities loaded on this page.');
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 450 });
  } else {
    setTimeout(run, 120);
  }
}

function shouldSuppressDialog(text) {
  if (!text) {
    return false;
  }

  var normalized = text.toLowerCase();
  return (
    normalized.indexOf('security limitations') !== -1 ||
    normalized.indexOf("you're currently signed in as") !== -1 ||
    normalized.indexOf('limitations are applied based on permissions') !== -1 ||
    normalized.indexOf('view all limitations') !== -1 ||
    normalized.indexOf('change account') !== -1 ||
    normalized.indexOf('copying and pasting content outside this file has been disabled') !== -1
  );
}

function closeMatchedDialog(dialog) {
  var closeBtn = dialog.querySelector('[aria-label="Close"], [aria-label="close"]');
  var gotItBtn = Array.prototype.find.call(dialog.querySelectorAll('button, [role="button"]'), function (btn) {
    var label = (btn.textContent || '').trim();
    return (
      label === 'Got it' ||
      label === 'OK' ||
      label === 'Close' ||
      label === 'Dismiss' ||
      label === 'Done' ||
      label === 'Cancel' ||
      label === 'Continue'
    );
  });

  if (gotItBtn) {
    gotItBtn.click();
  } else if (closeBtn) {
    closeBtn.click();
  } else {
    dialog.style.display = 'none';
  }
}

function getPossiblePopupContainers() {
  return document.querySelectorAll(
    '[role="dialog"], [role="alert"], [role="status"], .modal-dialog, .docs-dialog, .jfk-bubble, .docs-toast'
  );
}

function suppressKnownPopups() {
  if (!popupSuppressionEnabled) {
    return;
  }

  var dialogs = getPossiblePopupContainers();
  dialogs.forEach(function (dialog) {
    var text = dialog.innerText || '';
    if (shouldSuppressDialog(text)) {
      closeMatchedDialog(dialog);
    }
  });
}

function startPopupSuppression() {
  if (popupObserver) {
    popupObserver.disconnect();
  }

  popupObserver = new MutationObserver(function () {
    suppressKnownPopups();
  });

  popupObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  suppressKnownPopups();
}

function stopPopupSuppression() {
  if (popupObserver) {
    popupObserver.disconnect();
    popupObserver = null;
  }
}

function applyPopupSuppression(enabled) {
  popupSuppressionEnabled = !!enabled;
  if (popupSuppressionEnabled) {
    startPopupSuppression();
  } else {
    stopPopupSuppression();
  }
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'getSelectedText') {
    sendResponse({ text: getSelectedTextFromSheet() });
    return;
  }

  if (request.action === 'getPageContext') {
    sendResponse(getPageContextReport());
    return;
  }

  if (request.action === 'updateCtrlCopy') {
    applyCtrlCopy(request.enabled);
    sendResponse({ success: true });
    return;
  }

  if (request.action === 'updatePopupSuppression') {
    applyPopupSuppression(request.enabled);
    sendResponse({ success: true });
  }
});

function init() {
  scheduleNonCriticalInit();
  document.addEventListener('keydown', handleCopyHotkey, true);
  document.addEventListener('copy', handleCopyEvent, true);

  chrome.storage.sync.get({
    suppressGooglePopups: false,
    enableCtrlCopy: true
  }, function (result) {
    applyPopupSuppression(result.suppressGooglePopups);
    applyCtrlCopy(result.enableCtrlCopy);
  });
}

init();

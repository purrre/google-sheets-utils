function setStatus(message, isError) {
  var statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#c5221f' : '#1a73e8';
  setTimeout(function () {
    statusEl.textContent = '';
  }, 2500);
}

function setReport(title, body) {
  var reportEl = document.getElementById('report');
  if (!title && !body) {
    reportEl.textContent = '';
    return;
  }

  reportEl.textContent = title + '\n\n' + body;
}

function sendMessageToActiveSheetTab(message, callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs || !tabs.length) {
      setStatus('No active tab found.', true);
      return;
    }

    var tab = tabs[0];
    if (!tab.url || tab.url.indexOf('https://docs.google.com/spreadsheets/') !== 0) {
      setStatus('Open a Google Sheets tab first.', true);
      return;
    }

    chrome.tabs.sendMessage(tab.id, message, callback);
  });
}

function loadSettings() {
  chrome.storage.sync.get(
    {
      suppressGooglePopups: false,
      enableCtrlCopy: true
    },
    function (result) {
      document.getElementById('suppressGooglePopups').checked = !!result.suppressGooglePopups;
      document.getElementById('enableCtrlCopy').checked = !!result.enableCtrlCopy;
    }
  );
}

function init() {
  var ctrlCopyToggle = document.getElementById('enableCtrlCopy');
  var suppressToggle = document.getElementById('suppressGooglePopups');
  var pageContextBtn = document.getElementById('getPageContextBtn');

  ctrlCopyToggle.addEventListener('change', function () {
    var enabled = ctrlCopyToggle.checked;
    chrome.storage.sync.set({ enableCtrlCopy: enabled }, function () {
      sendMessageToActiveSheetTab({ action: 'updateCtrlCopy', enabled: enabled }, function () {
        setStatus(enabled ? 'Ctrl/Cmd+C override enabled.' : 'Ctrl/Cmd+C override disabled.', false);
      });
    });
  });

  suppressToggle.addEventListener('change', function () {
    var enabled = suppressToggle.checked;
    chrome.storage.sync.set({ suppressGooglePopups: enabled }, function () {
      sendMessageToActiveSheetTab(
        { action: 'updatePopupSuppression', enabled: enabled },
        function () {
          setStatus(enabled ? 'Popup suppression enabled.' : 'Popup suppression disabled.', false);
        }
      );
    });
  });

  pageContextBtn.addEventListener('click', function () {
    sendMessageToActiveSheetTab({ action: 'getPageContext' }, function (response) {
      if (chrome.runtime.lastError) {
        setStatus('Unable to read page context. Reload the sheet.', true);
        return;
      }

      if (!response) {
        setStatus('No result returned.', true);
        return;
      }

      setStatus('API context ready.', false);
      setReport('API Helper', response.report || 'No details.');
    });
  });

  loadSettings();
}

document.addEventListener('DOMContentLoaded', init);

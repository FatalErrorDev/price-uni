/* === Scraping Page Logic === */

(function () {
  'use strict';

  var runNowFile = null;
  var scheduleFile = null;
  var selectedDay = null;

  document.addEventListener('DOMContentLoaded', function () {
    initDropZone('run-now-drop', onRunNowFile);
    initDropZone('schedule-drop', onScheduleFile);
    initDayPicker();
    initUploadButtons();

    var refreshBtn = document.getElementById('btn-refresh-scheduled');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadScheduledFiles);
    }
  });

  /* === Drop Zone === */
  function initDropZone(id, onFile) {
    var zone = document.getElementById(id);
    if (!zone) return;

    zone.addEventListener('dragover', function (e) {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', function () {
      zone.classList.remove('dragover');
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('dragover');
      var file = e.dataTransfer.files[0];
      if (file) validateAndSet(file, zone, onFile);
    });
    zone.addEventListener('click', function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xlsx';
      input.onchange = function () {
        if (input.files[0]) validateAndSet(input.files[0], zone, onFile);
      };
      input.click();
    });
  }

  function validateAndSet(file, zone, callback) {
    var errorEl = zone.parentElement.querySelector('.error-msg');
    if (errorEl) errorEl.textContent = '';

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      if (errorEl) errorEl.textContent = 'Only .xlsx files are accepted.';
      return;
    }
    zone.classList.add('has-file');
    callback(file);
  }

  function onRunNowFile(file) {
    runNowFile = file;
    showFileChip('run-now-chip', file.name, function () {
      runNowFile = null;
      clearFileChip('run-now-chip');
      document.getElementById('run-now-drop').classList.remove('has-file');
      updateRunNowButton();
    });
    resetState('run-now-result');
    updateRunNowButton();
  }

  function onScheduleFile(file) {
    scheduleFile = file;
    showFileChip('schedule-chip', file.name, function () {
      scheduleFile = null;
      clearFileChip('schedule-chip');
      document.getElementById('schedule-drop').classList.remove('has-file');
      updateScheduleButton();
    });
    resetState('schedule-result');
    updateScheduleButton();
  }

  function showFileChip(containerId, name, onRemove) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML =
      '<div class="file-chip">' +
        '<span>' + escHtml(name) + '</span>' +
        '<button class="remove" title="Remove">&times;</button>' +
      '</div>';
    container.querySelector('.remove').addEventListener('click', function (e) {
      e.stopPropagation();
      onRemove();
    });
  }

  function clearFileChip(containerId) {
    var el = document.getElementById(containerId);
    if (el) el.innerHTML = '';
  }

  function resetState(resultId) {
    var el = document.getElementById(resultId);
    if (el) el.innerHTML = '';
  }

  /* === Day Picker === */
  function initDayPicker() {
    document.querySelectorAll('.day-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.day-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        selectedDay = btn.dataset.day;
        updateScheduleButton();
      });
    });
  }

  /* === Upload Buttons === */
  function initUploadButtons() {
    var runBtn = document.getElementById('btn-run-now');
    if (runBtn) {
      runBtn.addEventListener('click', doRunNowUpload);
    }
    var schedBtn = document.getElementById('btn-schedule');
    if (schedBtn) {
      schedBtn.addEventListener('click', doScheduleUpload);
    }
  }

  function updateRunNowButton() {
    var btn = document.getElementById('btn-run-now');
    if (btn) btn.disabled = !runNowFile;
  }

  function updateScheduleButton() {
    var btn = document.getElementById('btn-schedule');
    var label = document.getElementById('schedule-btn-label');
    if (btn) btn.disabled = !(scheduleFile && selectedDay);
    if (label) {
      label.textContent = selectedDay
        ? 'Schedule for ' + selectedDay.charAt(0).toUpperCase() + selectedDay.slice(1)
        : 'Schedule upload';
    }
  }

  async function doRunNowUpload() {
    if (!runNowFile) return;
    var resultEl = document.getElementById('run-now-result');
    if (!isSignedIn()) {
      resultEl.innerHTML = '<div class="error-msg">Please connect Google Drive first.</div>';
      return;
    }
    resultEl.innerHTML = '<div class="loading-state"><span class="spinner"></span> Uploading...</div>';
    try {
      var res = await uploadFile(runNowFile, FOLDERS.input);
      resultEl.innerHTML =
        '<div class="success-state">' +
          '<span>\u2713 Uploaded successfully</span>' +
          (res.webViewLink ? '<a href="' + res.webViewLink + '" target="_blank">Open in Drive</a>' : '') +
          '<button class="btn btn-outline" onclick="resetRunNow()">Upload another</button>' +
        '</div>';
    } catch (err) {
      resultEl.innerHTML = '<div class="error-msg">' + escHtml(err.message) + '</div>';
    }
  }

  async function doScheduleUpload() {
    if (!scheduleFile || !selectedDay) return;
    var resultEl = document.getElementById('schedule-result');
    if (!isSignedIn()) {
      resultEl.innerHTML = '<div class="error-msg">Please connect Google Drive first.</div>';
      return;
    }

    resultEl.innerHTML = '<div class="loading-state"><span class="spinner"></span> Uploading...</div>';
    try {
      var res = await uploadFile(scheduleFile, FOLDERS[selectedDay]);
      resultEl.innerHTML =
        '<div class="success-state">' +
          '<span>\u2713 Scheduled for ' + selectedDay.charAt(0).toUpperCase() + selectedDay.slice(1) + '</span>' +
          (res.webViewLink ? '<a href="' + res.webViewLink + '" target="_blank">Open in Drive</a>' : '') +
          '<button class="btn btn-outline" onclick="resetSchedule()">Schedule another</button>' +
        '</div>';
      loadScheduledFiles();
    } catch (err) {
      resultEl.innerHTML = '<div class="error-msg">' + escHtml(err.message) + '</div>';
    }
  }

  function resetRunNow() {
    runNowFile = null;
    clearFileChip('run-now-chip');
    resetState('run-now-result');
    document.getElementById('run-now-drop').classList.remove('has-file');
    updateRunNowButton();
  }

  function resetSchedule() {
    scheduleFile = null;
    selectedDay = null;
    clearFileChip('schedule-chip');
    resetState('schedule-result');
    document.getElementById('schedule-drop').classList.remove('has-file');
    document.querySelectorAll('.day-btn').forEach(function (b) { b.classList.remove('active'); });
    updateScheduleButton();
  }

  /* === Scheduled Files Panel === */
  var DAY_ORDER = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  var DAY_LABELS = {
    monday:'Mon', tuesday:'Tue', wednesday:'Wed',
    thursday:'Thu', friday:'Fri', saturday:'Sat', sunday:'Sun'
  };
  var scheduledLoading = false;

  async function loadScheduledFiles() {
    var container = document.getElementById('scheduled-files-content');
    if (!container || scheduledLoading) return;

    if (!isSignedIn()) {
      container.innerHTML = '<div class="empty-state">Connect Google Drive to see scheduled files.</div>';
      return;
    }

    scheduledLoading = true;
    container.innerHTML = '<div class="loading-state"><span class="spinner"></span> Loading scheduled files\u2026</div>';

    try {
      var results = await Promise.allSettled(
        DAY_ORDER.map(function (day) {
          return listFiles(FOLDERS[day]).then(function (files) {
            return files.map(function (f) {
              return { day: day, id: f.id, name: f.name, modifiedTime: f.modifiedTime, webViewLink: f.webViewLink };
            });
          });
        })
      );

      var allFiles = [];
      var hasError = false;
      results.forEach(function (r) {
        if (r.status === 'fulfilled') {
          allFiles = allFiles.concat(r.value);
        } else {
          hasError = true;
        }
      });

      if (hasError && results.every(function (r) { return r.status === 'rejected'; })) {
        container.innerHTML = '<div class="error-msg">Failed to load scheduled files.</div>';
        return;
      }

      renderScheduledGrid(container, allFiles, hasError);
    } catch (err) {
      container.innerHTML = '<div class="error-msg">' + escHtml(err.message) + '</div>';
    } finally {
      scheduledLoading = false;
    }
  }

  function renderFileNameHtml(file) {
    var safeName = escHtml(file.name);
    if (file.webViewLink) {
      return '<a class="day-file-name" href="' + escHtml(file.webViewLink) + '" target="_blank" rel="noopener noreferrer" title="' + safeName + '">' + safeName + '</a>';
    }
    return '<span class="day-file-name">' + safeName + '</span>';
  }

  function renderFileHtml(file) {
    var dateStr = file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString('pl-PL') : '\u2014';
    return '<div class="day-file">' +
      renderFileNameHtml(file) +
      '<div class="day-file-row">' +
        '<span class="day-file-date">' + escHtml(dateStr) + '</span>' +
        '<button class="day-file-delete" data-file-id="' + escHtml(file.id) + '" title="Delete file">&times;</button>' +
      '</div>' +
    '</div>';
  }

  async function handleDeleteClick(btn) {
    var fileId = btn.dataset.fileId;
    if (!fileId) return;
    if (!confirm('Delete this file from Google Drive?')) return;
    btn.disabled = true;
    btn.textContent = '\u2026';
    try {
      await deleteFile(fileId);
      loadScheduledFiles();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '\u00d7';
      alert('Delete failed: ' + err.message);
    }
  }

  function renderScheduledGrid(container, files, hasPartialError) {
    var byDay = {};
    files.forEach(function (f) { (byDay[f.day] = byDay[f.day] || []).push(f); });

    var html = '';
    if (hasPartialError) {
      html += '<div class="warning-banner">Some folders could not be loaded.</div>';
    }
    html += '<div class="day-grid">';
    DAY_ORDER.forEach(function (day) {
      var dayFiles = byDay[day] || [];
      var hasFiles = dayFiles.length > 0;
      html += '<div class="day-slot' + (hasFiles ? ' has-files' : '') + '">';
      html += '<span class="day-slot-label">' + escHtml(DAY_LABELS[day]) + '</span>';
      if (!hasFiles) {
        html += '<span class="day-slot-empty">\u2014</span>';
      } else {
        html += '<div class="day-slot-files">';
        dayFiles.forEach(function (f) { html += renderFileHtml(f); });
        html += '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.day-file-delete').forEach(function (btn) {
      btn.addEventListener('click', function () { handleDeleteClick(btn); });
    });
  }

  window.resetRunNow = resetRunNow;
  window.resetSchedule = resetSchedule;
  window.loadScheduledFiles = loadScheduledFiles;
})();

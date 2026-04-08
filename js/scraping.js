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
    var warningEl = document.getElementById('schedule-warning');
    if (!isSignedIn()) {
      resultEl.innerHTML = '<div class="error-msg">Please connect Google Drive first.</div>';
      return;
    }

    // Check for existing file
    resultEl.innerHTML = '<div class="loading-state"><span class="spinner"></span> Checking folder...</div>';
    try {
      var existing = await listFiles(FOLDERS[selectedDay]);
      if (existing.length > 0 && warningEl && !warningEl.dataset.confirmed) {
        warningEl.innerHTML =
          '<div class="warning-banner">\u26A0 A file is already waiting for ' +
          selectedDay.charAt(0).toUpperCase() + selectedDay.slice(1) +
          '. Uploading will replace it.</div>';
        warningEl.dataset.confirmed = 'true';
        resultEl.innerHTML = '';
        return;
      }
    } catch (e) {
      // Could not check — proceed anyway
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
      if (warningEl) { warningEl.innerHTML = ''; delete warningEl.dataset.confirmed; }
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
    var warningEl = document.getElementById('schedule-warning');
    if (warningEl) { warningEl.innerHTML = ''; delete warningEl.dataset.confirmed; }
    updateScheduleButton();
  }

  window.resetRunNow = resetRunNow;
  window.resetSchedule = resetSchedule;
})();

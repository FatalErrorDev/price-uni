/* === Scraping Progress Panel === */

(function () {
  'use strict';

  var RELAY_URL = (function () {
    var meta = document.querySelector('meta[name="progress-relay-url"]');
    return meta ? meta.content : 'http://localhost:8001';
  })();
  var eventSource = null;
  var sessions = {};

  /* === Transport === */

  function connect() {
    if (eventSource) eventSource.close();
    updateConnectionStatus('connecting');

    eventSource = new EventSource(RELAY_URL + '/events');

    eventSource.addEventListener('init', function (e) {
      var snapshot = JSON.parse(e.data);
      sessions = {};
      snapshot.forEach(function (s) { sessions[s.session_id] = s; });
      renderAll();
      updateConnectionStatus('connected');
    });

    eventSource.addEventListener('update', function (e) {
      var data = JSON.parse(e.data);
      sessions[data.session_id] = data;
      renderSession(data.session_id);
    });

    eventSource.addEventListener('session_end', function (e) {
      var data = JSON.parse(e.data);
      removeSession(data.session_id);
    });

    eventSource.onopen = function () {
      updateConnectionStatus('connected');
    };

    eventSource.onerror = function () {
      updateConnectionStatus('disconnected');
    };
  }

  /* === Rendering === */

  function renderAll() {
    // Clear existing sessions from DOM
    ['sewera', 'dobromir'].forEach(function (loc) {
      var container = document.getElementById('progress-sessions-' + loc);
      if (container) {
        var els = container.querySelectorAll('.progress-session');
        for (var i = 0; i < els.length; i++) els[i].remove();
      }
    });

    var hasAny = false;
    Object.keys(sessions).forEach(function (sid) {
      hasAny = true;
      renderSession(sid);
    });

    if (!hasAny) {
      ['sewera', 'dobromir'].forEach(function (loc) {
        restoreEmptyState(document.getElementById('progress-sessions-' + loc));
      });
    }
  }

  function renderSession(sessionId) {
    var s = sessions[sessionId];
    if (!s) return;

    var location = normalizeLocation(s.location);
    var container = document.getElementById('progress-sessions-' + location);
    if (!container) return;

    // Remove empty state
    var empty = container.querySelector('.empty-state');
    if (empty) empty.remove();

    var el = container.querySelector('[data-session-id="' + sessionId + '"]');
    if (!el) {
      el = document.createElement('div');
      el.className = 'progress-session';
      el.dataset.sessionId = sessionId;
      container.appendChild(el);
    }

    var pct = s.total_steps > 0
      ? Math.round((s.current_step / s.total_steps) * 100) : 0;

    el.innerHTML =
      '<div class="progress-session-header">' +
        '<span class="progress-competitor-label">' + escHtml(s.competitor || '') +
        ' <span class="progress-meta">(' + s.current_competitor + '/' + s.total_competitors + ')</span></span>' +
        '<span class="progress-pct">' + pct + '%</span>' +
      '</div>' +
      '<div class="progress-bar-track">' +
        '<div class="progress-bar-fill" style="width:' + pct + '%"></div>' +
      '</div>';

    // Check completion
    if (s.current_step >= s.total_steps && s.current_competitor >= s.total_competitors) {
      el.classList.add('complete');
      setTimeout(function () { removeSession(sessionId); }, 5000);
    }
  }

  function removeSession(sessionId) {
    delete sessions[sessionId];
    ['sewera', 'dobromir'].forEach(function (loc) {
      var container = document.getElementById('progress-sessions-' + loc);
      if (!container) return;
      var el = container.querySelector('[data-session-id="' + sessionId + '"]');
      if (el) {
        el.classList.add('removing');
        setTimeout(function () {
          el.remove();
          restoreEmptyState(container);
        }, 300);
      }
    });
  }

  function restoreEmptyState(container) {
    if (!container) return;
    if (container.children.length === 0) {
      container.innerHTML = '<div class="empty-state empty-state-sm">No active sessions</div>';
    }
  }

  function normalizeLocation(loc) {
    var l = (loc || '').toLowerCase();
    if (l.indexOf('dobromir') !== -1) return 'dobromir';
    return 'sewera';
  }

  function updateConnectionStatus(state) {
    var el = document.getElementById('progress-connection-status');
    if (!el) return;
    if (state === 'connected') {
      el.textContent = '\u25cf Connected';
      el.className = 'progress-connection-status status-connected';
    } else if (state === 'connecting') {
      el.textContent = '\u25cb Connecting\u2026';
      el.className = 'progress-connection-status status-connecting';
    } else {
      el.innerHTML = '<a href="' + escHtml(RELAY_URL) + '" target="_blank" rel="noopener noreferrer" class="status-disconnected-link">\u25cb Disconnected — click to authorize</a>';
      el.className = 'progress-connection-status status-disconnected';
    }
  }

  /* === Init === */
  document.addEventListener('DOMContentLoaded', function () {
    connect();
  });

  window.connectProgress = connect;
})();

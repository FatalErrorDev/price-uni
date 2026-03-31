/* === Analysis Page Logic === */

(function () {
  'use strict';

  var currentMode = {};    // { sewera: 'single', dobromir: 'single' }
  var cachedFiles = {};    // { sewera: [...], dobromir: [...] }
  var selectedFileId = {}; // { sewera: 'id', dobromir: 'id' }

  // Called by nav.js when branch switches
  window.onBranchSwitch = function (branch) {
    destroyAllCharts();
    loadFileList(branch);
  };

  // Initialize mode toggle buttons on DOM ready
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.mode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var branch = btn.dataset.branch;
        var mode = btn.dataset.mode;
        setMode(branch, mode);
      });
    });
  });

  function setMode(branch, mode) {
    currentMode[branch] = mode;

    // Update toggle UI
    var header = document.getElementById('page-' + branch);
    if (header) {
      header.querySelectorAll('.mode-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.mode === mode);
      });
    }

    destroyAllCharts();

    if (mode === 'all') {
      // Hide tile selection, run all-files trend
      var container = getFileListContainer(branch);
      if (container) container.style.display = 'none';
      runAllFilesAnalysis(branch);
    } else {
      // Show tiles
      var container = getFileListContainer(branch);
      if (container) container.style.display = '';
      // If a file was selected, re-render it; otherwise show empty state
      if (selectedFileId[branch] && cachedFiles[branch]) {
        var file = cachedFiles[branch].find(function (f) { return f.id === selectedFileId[branch]; });
        if (file) {
          runSingleFileAnalysis(branch, file);
          return;
        }
      }
      var resultArea = getResultArea(branch);
      if (resultArea) resultArea.innerHTML = '<div class="empty-state">Select a file above to run analysis.</div>';
    }
  }

  function getMode(branch) {
    return currentMode[branch] || 'single';
  }

  async function loadFileList(branch) {
    var config = BRANCH_CONFIG[branch];
    if (!config) return;
    var container = getFileListContainer(branch);
    var resultArea = getResultArea(branch);
    if (!container) return;

    // Reset mode to single on branch switch
    currentMode[branch] = 'single';
    selectedFileId[branch] = null;
    var header = document.getElementById('page-' + branch);
    if (header) {
      header.querySelectorAll('.mode-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.mode === 'single');
      });
    }
    container.style.display = '';

    if (!isSignedIn()) {
      container.innerHTML = '<div class="empty-state">Connect your Google Drive account to load files.</div>';
      if (resultArea) resultArea.innerHTML = '';
      return;
    }

    container.innerHTML = '<div class="loading-state"><span class="spinner"></span> Loading files...</div>';
    if (resultArea) resultArea.innerHTML = '<div class="empty-state">Select a file above to run analysis.</div>';

    try {
      var files = await listFiles(config.folderId);
      if (files.length === 0) {
        container.innerHTML = '<div class="empty-state">No files found in Drive folder. Drop output files into the correct folder to begin.</div>';
        return;
      }
      // Enrich with dates
      files.forEach(function (f) {
        f.date = extractDate(f.name) || '';
      });
      // Sort oldest to newest by date in filename
      files.sort(function (a, b) {
        var da = a.date ? dateSortKey(a.date) : '';
        var db = b.date ? dateSortKey(b.date) : '';
        return da.localeCompare(db);
      });
      cachedFiles[branch] = files;
      renderFileTiles(container, files, branch);

      // Background preload: cache all files for this branch
      preloadAll(branch, files);

      // Also preload the other branch in background
      var otherBranch = branch === 'sewera' ? 'dobromir' : 'sewera';
      var otherConfig = BRANCH_CONFIG[otherBranch];
      if (otherConfig && !cachedFiles[otherBranch]) {
        listFiles(otherConfig.folderId).then(function (otherFiles) {
          otherFiles.forEach(function (f) {
            f.date = extractDate(f.name) || '';
          });
          cachedFiles[otherBranch] = otherFiles;
          preloadAll(otherBranch, otherFiles);
        }).catch(function () {}); // Swallow errors for background preload
      }
    } catch (err) {
      container.innerHTML = '<div class="error-msg">' + escHtml(err.message) + '</div>';
    }
  }

  function renderFileTiles(container, files, branch) {
    var html = '<div class="file-tiles">';
    files.forEach(function (f) {
      var dateDisplay = f.date || 'No date';
      var selected = selectedFileId[branch] === f.id ? ' selected' : '';
      html +=
        '<div class="file-tile' + selected + '" data-id="' + f.id + '" data-branch="' + branch + '">' +
          '<div class="file-tile-date">' + escHtml(dateDisplay) + '</div>' +
          '<div class="file-tile-name" title="' + escHtml(f.name) + '">' + escHtml(f.name) + '</div>' +
        '</div>';
    });
    html += '</div>';
    container.innerHTML = html;

    // Wire up tile clicks
    container.querySelectorAll('.file-tile').forEach(function (tile) {
      tile.addEventListener('click', function () {
        var fileId = tile.dataset.id;
        var b = tile.dataset.branch;

        // Deselect if clicking same tile
        if (selectedFileId[b] === fileId) {
          selectedFileId[b] = null;
          tile.classList.remove('selected');
          destroyAllCharts();
          var resultArea = getResultArea(b);
          if (resultArea) resultArea.innerHTML = '<div class="empty-state">Select a file above to run analysis.</div>';
          return;
        }

        // Select this tile
        selectedFileId[b] = fileId;
        container.querySelectorAll('.file-tile').forEach(function (t) { t.classList.remove('selected'); });
        tile.classList.add('selected');

        var file = cachedFiles[b].find(function (f) { return f.id === fileId; });
        if (file) runSingleFileAnalysis(b, file);
      });
    });
  }

  async function runSingleFileAnalysis(branch, file) {
    var resultArea = getResultArea(branch);
    if (!resultArea) return;

    destroyAllCharts();
    resultArea.innerHTML = '<div class="loading-state"><span class="spinner"></span> Analyzing ' + escHtml(file.name) + '...</div>';

    try {
      var result = await getAnalysis(file, branch);
      renderSingleFile(resultArea, result, branch);
    } catch (err) {
      resultArea.innerHTML = '<div class="error-msg">Analysis error: ' + escHtml(err.message) + '</div>';
    }
  }

  async function runAllFilesAnalysis(branch) {
    var resultArea = getResultArea(branch);
    if (!resultArea) return;
    var files = cachedFiles[branch];

    if (!files || files.length === 0) {
      resultArea.innerHTML = '<div class="empty-state">No files available for trend analysis.</div>';
      return;
    }

    if (files.length < 2) {
      resultArea.innerHTML = '<div class="empty-state">Need at least 2 files for trend analysis. Only 1 file found.</div>';
      return;
    }

    destroyAllCharts();
    resultArea.innerHTML = '<div class="loading-state"><span class="spinner"></span> Analyzing ' + files.length + ' files...</div>';

    try {
      // Sort by date chronologically
      var sorted = files.slice().sort(function (a, b) {
        var da = a.date ? dateSortKey(a.date) : '';
        var db = b.date ? dateSortKey(b.date) : '';
        return da.localeCompare(db);
      });

      var analyses = [];
      for (var i = 0; i < sorted.length; i++) {
        var result = await getAnalysis(sorted[i], branch);
        analyses.push(result);
      }

      renderTrendView(resultArea, analyses, branch);
    } catch (err) {
      resultArea.innerHTML = '<div class="error-msg">Analysis error: ' + escHtml(err.message) + '</div>';
    }
  }

  /* === Single File Dashboard === */
  function renderSingleFile(container, data, branch) {
    var config = BRANCH_CONFIG[branch];
    var pctCheaper = data.withComp > 0 ? ((data.cheaper / data.withComp) * 100).toFixed(1) : '0';
    var pctExpensive = data.withComp > 0 ? ((data.expensive / data.withComp) * 100).toFixed(1) : '0';
    var medianClass = data.median > 0 ? 'amber' : 'accent';

    var html = '';

    // KPI Cards
    html += '<div class="kpi-grid">';
    html += kpiCard('Total products', data.total, '');
    html += kpiCard('With competitor data', data.withComp, '');
    html += kpiCard('% cheapest/equal', pctCheaper + '%', 'accent');
    html += kpiCard('% more expensive', pctExpensive + '%', 'red');
    html += kpiCard('Median price diff', (data.median >= 0 ? '+' : '') + data.median.toFixed(2) + '%', medianClass);
    html += kpiCard('No competitor data', data.noComp, '');
    html += '</div>';

    // Charts row (IDs namespaced by branch)
    var covId = 'chart-coverage-' + branch;
    var distId = 'chart-dist-' + branch;
    var expListId = 'product-list-expensive-' + branch;
    var cheapListId = 'product-list-cheapest-' + branch;

    html += '<div class="chart-row">';
    html += '<div class="chart-card"><h2>Competitor Coverage</h2><div style="height:220px"><canvas id="' + covId + '"></canvas></div></div>';
    html += '<div class="chart-card"><h2>Price Distribution</h2><div style="height:220px"><canvas id="' + distId + '"></canvas></div></div>';
    html += '</div>';

    // Segment breakdown
    html += '<div class="card" style="margin-bottom:1.5rem"><h2>Segment Breakdown</h2>';
    html += renderSegmentBars(data.segments);
    html += '</div>';

    // Product lists
    html += '<div class="card"><h2>Product Comparison</h2>';
    html += '<div class="product-tabs">';
    html += '<button class="product-tab active" data-list="expensive">' + config.label + ' najdro\u017Csza</button>';
    html += '<button class="product-tab" data-list="cheapest">' + config.label + ' najta\u0144sza</button>';
    html += '</div>';
    html += '<div id="' + expListId + '">' + renderProductTable(data.topExpensive) + '</div>';
    html += '<div id="' + cheapListId + '" style="display:none">' + renderProductTable(data.topCheapest) + '</div>';
    html += '</div>';

    container.innerHTML = html;

    // Create charts
    createCoverageChart(covId, data.compCoverage);
    createDistributionChart(distId, data.dist);

    // Product tab switching
    container.querySelectorAll('.product-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        container.querySelectorAll('.product-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var list = tab.dataset.list;
        document.getElementById(expListId).style.display = list === 'expensive' ? '' : 'none';
        document.getElementById(cheapListId).style.display = list === 'cheapest' ? '' : 'none';
      });
    });
  }

  function kpiCard(label, value, colorClass) {
    return '<div class="kpi"><div class="kpi-label">' + label + '</div>' +
      '<div class="kpi-value ' + colorClass + '">' + value + '</div></div>';
  }

  function renderSegmentBars(segments) {
    if (segments.length === 0) return '<div class="empty-state">No segment data</div>';
    var html = '';
    segments.forEach(function (s) {
      var total = s.cheaper + s.expensive;
      var cheaperW = total > 0 ? (s.cheaper / total * 100) : 0;
      var expensiveW = total > 0 ? (s.expensive / total * 100) : 0;
      html += '<div class="segment-row">' +
        '<span class="segment-name" title="' + escHtml(s.name) + '">' + escHtml(s.name) + '</span>' +
        '<div class="segment-bar-wrap">' +
          '<div class="segment-bar-cheaper" style="width:' + cheaperW + '%"></div>' +
          '<div class="segment-bar-expensive" style="width:' + expensiveW + '%"></div>' +
        '</div>' +
        '<span class="segment-stats">' +
          s.cheaper + ' cheaper/equal &middot; ' + s.expensive + ' expensive &middot; med ' + s.median.toFixed(1) + '%' +
        '</span>' +
      '</div>';
    });
    return html;
  }

  function renderProductTable(items) {
    if (items.length === 0) return '<div class="empty-state">No data</div>';
    var html = '<table class="product-table"><thead><tr><th>Product</th><th>Producer</th><th>Diff</th></tr></thead><tbody>';
    items.forEach(function (item) {
      var cls = item.pct > 0 ? 'positive' : 'negative';
      var sign = item.pct > 0 ? '+' : '';
      html += '<tr><td>' + escHtml(item.name) + '</td><td>' + escHtml(item.producer) + '</td>' +
        '<td><span class="pct-badge ' + cls + '">' + sign + item.pct.toFixed(2) + '%</span></td></tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  /* === Multi-file Trend View === */
  function renderTrendView(container, analyses, branch) {
    var first = analyses[0];
    var last = analyses[analyses.length - 1];

    var medianChange = last.median - first.median;
    var firstPctCheaper = first.withComp > 0 ? (first.cheaper / first.withComp * 100) : 0;
    var lastPctCheaper = last.withComp > 0 ? (last.cheaper / last.withComp * 100) : 0;
    var pctCheapChange = lastPctCheaper - firstPctCheaper;

    var html = '';

    // Trend KPIs
    html += '<div class="kpi-grid">';
    html += kpiCard('Files analyzed', analyses.length, '');
    html += kpiCard('Median change', (medianChange >= 0 ? '+' : '') + medianChange.toFixed(2) + ' pp', medianChange > 0 ? 'red' : 'green');
    html += kpiCard('% cheapest change', (pctCheapChange >= 0 ? '+' : '') + pctCheapChange.toFixed(1) + ' pp', pctCheapChange >= 0 ? 'green' : 'red');
    html += kpiCard('Products (latest)', last.total, '');
    html += '</div>';

    // Line charts
    var dates = analyses.map(function (a) { return a.date || '?'; });
    var medians = analyses.map(function (a) { return a.median; });
    var pctCheapers = analyses.map(function (a) {
      return a.withComp > 0 ? (a.cheaper / a.withComp * 100) : 0;
    });

    var trendMedId = 'chart-trend-median-' + branch;
    var trendCheapId = 'chart-trend-cheapest-' + branch;

    html += '<div class="chart-row">';
    html += '<div class="chart-card"><h2>Median % Over Time</h2><div style="height:250px"><canvas id="' + trendMedId + '"></canvas></div></div>';
    html += '<div class="chart-card"><h2>% Cheapest Over Time</h2><div style="height:250px"><canvas id="' + trendCheapId + '"></canvas></div></div>';
    html += '</div>';

    // Segment trend table
    html += '<div class="card"><h2>Segment Trend (First \u2192 Last)</h2>';
    html += renderSegmentTrend(first, last);
    html += '</div>';

    container.innerHTML = html;

    createLineChart(trendMedId, dates, medians);
    createLineChart(trendCheapId, dates, pctCheapers);
  }

  function renderSegmentTrend(first, last) {
    var segMap = {};
    first.segments.forEach(function (s) { segMap[s.name] = { first: s.median, last: 0 }; });
    last.segments.forEach(function (s) {
      if (!segMap[s.name]) segMap[s.name] = { first: 0, last: 0 };
      segMap[s.name].last = s.median;
    });

    var entries = Object.entries(segMap).map(function (e) {
      return { name: e[0], first: e[1].first, last: e[1].last, delta: e[1].last - e[1].first };
    }).sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });

    if (entries.length === 0) return '<div class="empty-state">No segment data</div>';

    var html = '<table class="trend-table"><thead><tr><th>Segment</th><th>First</th><th></th><th>Last</th><th>Delta</th></tr></thead><tbody>';
    entries.forEach(function (e) {
      var cls = e.delta > 0 ? 'delta-positive' : 'delta-negative';
      var sign = e.delta > 0 ? '+' : '';
      html += '<tr><td>' + escHtml(e.name) + '</td><td>' + e.first.toFixed(1) + '%</td><td>\u2192</td>' +
        '<td>' + e.last.toFixed(1) + '%</td><td class="' + cls + '">' + sign + e.delta.toFixed(1) + ' pp</td></tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  /* === Helpers === */
  function getFileListContainer(branch) {
    return document.getElementById('file-list-' + branch);
  }

  function getResultArea(branch) {
    return document.getElementById('result-' + branch);
  }

  function escHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
})();

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
      var analyses = await Promise.all(files.map(function (f) {
        return getAnalysis(f, branch);
      }));

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
    html += kpiCard('% cheapest/equal', pctCheaper + '%', 'accent', data.cheaper);
    html += kpiCard('% more expensive', pctExpensive + '%', 'red', data.expensive);
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

  function kpiCard(label, value, colorClass, secondary) {
    var secHtml = (secondary !== undefined && secondary !== null && secondary !== '')
      ? '<span class="kpi-value-secondary">| ' + secondary + '</span>'
      : '';
    return '<div class="kpi"><div class="kpi-label">' + label + '</div>' +
      '<div class="kpi-value ' + colorClass + '">' + value + secHtml + '</div></div>';
  }

  function renderSegmentBars(segments) {
    if (segments.length === 0) return '<div class="empty-state">No segment data</div>';
    var sorted = segments.slice().sort(function (a, b) {
      var aTotal = a.cheaper + a.expensive;
      var bTotal = b.cheaper + b.expensive;
      var aRatio = aTotal > 0 ? (a.cheaper / aTotal) : 0;
      var bRatio = bTotal > 0 ? (b.cheaper / bTotal) : 0;
      return bRatio - aRatio;
    });
    var html = '';
    sorted.forEach(function (s) {
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
    var html = '<table class="product-table"><thead><tr><th>Code</th><th>Producer</th><th>Product Name</th><th>Diff</th><th>Competitor</th></tr></thead><tbody>';
    items.forEach(function (item) {
      var cls = item.pct > 0 ? 'positive' : 'negative';
      var sign = item.pct > 0 ? '+' : '';
      html += '<tr><td>' + escHtml(item.code) + '</td><td>' + escHtml(item.producer) + '</td>' +
        '<td>' + escHtml(item.name) + '</td>' +
        '<td><span class="pct-badge ' + cls + '">' + sign + item.pct.toFixed(2) + '%</span></td>' +
        '<td>' + escHtml(item.competitor) + '</td></tr>';
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
    var withComps = analyses.map(function (a) { return a.withComp; });

    var trendMedId = 'chart-trend-median-' + branch;
    var trendCheapId = 'chart-trend-cheapest-' + branch;
    var trendWithCompId = 'chart-trend-withcomp-' + branch;

    html += '<div class="chart-row">';
    html += '<div class="chart-card"><h2>Median % Over Time</h2><div style="height:250px"><canvas id="' + trendMedId + '"></canvas></div></div>';
    html += '<div class="chart-card"><h2>% Cheapest Over Time</h2><div style="height:250px"><canvas id="' + trendCheapId + '"></canvas></div></div>';
    html += '</div>';

    html += '<div class="chart-row">';
    html += '<div class="chart-card"><h2>Products With Competitor Data Over Time</h2><div style="height:250px"><canvas id="' + trendWithCompId + '"></canvas></div></div>';
    html += '</div>';

    // Products over time — switchable between Competitors and Segments
    var trendCovId = 'chart-trend-coverage-' + branch;

    html += '<div class="chart-card" style="margin-bottom:1.5rem">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between">';
    html += '<h2 style="margin:0">Products Scraped Over Time</h2>';
    html += '<button class="comp-toggle" id="select-all-toggle-' + branch + '" style="--comp-color:var(--text3)">All</button>';
    html += '</div>';
    html += '<div class="mode-toggle" style="margin-bottom:0.5rem">';
    html += '<button class="mode-btn active" data-covmode="competitors" data-branch="' + branch + '">Competitors</button>';
    html += '<button class="mode-btn" data-covmode="segments" data-branch="' + branch + '">Segments</button>';
    html += '</div>';
    html += '<div class="comp-toggle-row" id="comp-toggles-' + branch + '"></div>';
    html += '<div style="height:280px"><canvas id="' + trendCovId + '"></canvas></div>';
    html += '</div>';

    // Price activity table — switchable between Competitors and Segments
    var actTableId = 'activity-table-' + branch;
    html += '<div class="card" style="margin-bottom:1.5rem">';
    html += '<h2>Price Activity</h2>';
    html += '<div class="mode-toggle" style="margin-bottom:0.75rem">';
    html += '<button class="mode-btn active" data-actmode="competitors" data-branch="' + branch + '">Competitors</button>';
    html += '<button class="mode-btn" data-actmode="segments" data-branch="' + branch + '">Segments</button>';
    html += '</div>';
    html += '<div id="' + actTableId + '">' + renderActivityTable(analyses, branch, 'competitors') + '</div>';
    html += '</div>';

    // Segment trend table
    html += '<div class="card"><h2>Segment Trend (First \u2192 Last)</h2>';
    html += renderSegmentTrend(first, last);
    html += '</div>';

    container.innerHTML = html;

    createLineChart(trendMedId, dates, medians);
    createLineChart(trendCheapId, dates, pctCheapers);
    createLineChart(trendWithCompId, dates, withComps, { ySuffix: '' });

    // Build series data for both modes
    var competitors = BRANCH_CONFIG[branch] ? BRANCH_CONFIG[branch].competitors : [];
    var compSeries = competitors.map(function (comp) {
      return {
        name: comp,
        values: analyses.map(function (a) {
          return a.compCoverage ? (a.compCoverage[comp] || 0) : 0;
        })
      };
    });

    var segNames = [];
    analyses.forEach(function (a) {
      (a.segments || []).forEach(function (s) {
        if (segNames.indexOf(s.name) === -1) segNames.push(s.name);
      });
    });
    var segSeries = segNames.map(function (name) {
      return {
        name: name,
        values: analyses.map(function (a) {
          var seg = (a.segments || []).find(function (s) { return s.name === name; });
          return seg ? seg.pricePoints : 0;
        })
      };
    });

    var covChart = null;

    function buildCovChart(series) {
      destroyChart(trendCovId);
      covChart = createSeriesLineChart(trendCovId, dates, series);

      // Rebuild toggle buttons
      var toggleContainer = document.getElementById('comp-toggles-' + branch);
      if (!toggleContainer) return;
      var btnsHtml = '';
      series.forEach(function (s, i) {
        var color = SERIES_COLORS[i % SERIES_COLORS.length];
        btnsHtml += '<button class="comp-toggle active" data-index="' + i + '" style="--comp-color:' + color + '">' + escHtml(s.name) + '</button>';
      });
      toggleContainer.innerHTML = btnsHtml;

      toggleContainer.querySelectorAll('.comp-toggle').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var idx = parseInt(btn.dataset.index, 10);
          btn.classList.toggle('active');
          if (covChart) {
            covChart.setDatasetVisibility(idx, btn.classList.contains('active'));
            covChart.update();
          }
        });
      });

      // Wire select all / none toggle (clone to strip stale listeners from previous mode)
      var oldBtn = document.getElementById('select-all-toggle-' + branch);
      if (oldBtn) {
        var selectAllBtn = oldBtn.cloneNode(true);
        oldBtn.parentNode.replaceChild(selectAllBtn, oldBtn);
        selectAllBtn.textContent = 'None';
        selectAllBtn.addEventListener('click', function () {
          var showAll = selectAllBtn.textContent === 'All';
          selectAllBtn.textContent = showAll ? 'None' : 'All';
          toggleContainer.querySelectorAll('.comp-toggle').forEach(function (btn) {
            btn.classList.toggle('active', showAll);
            var idx = parseInt(btn.dataset.index, 10);
            if (covChart) covChart.setDatasetVisibility(idx, showAll);
          });
          if (covChart) covChart.update();
        });
      }
    }

    buildCovChart(compSeries);

    // Wire mode switch
    container.querySelectorAll('[data-covmode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        container.querySelectorAll('[data-covmode]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        buildCovChart(btn.dataset.covmode === 'segments' ? segSeries : compSeries);
      });
    });

    // Wire activity-table mode switch
    container.querySelectorAll('[data-actmode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        container.querySelectorAll('[data-actmode]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var target = document.getElementById(actTableId);
        if (target) target.innerHTML = renderActivityTable(analyses, branch, btn.dataset.actmode);
      });
    });
  }

  function renderActivityTable(analyses, branch, mode) {
    var competitors = (BRANCH_CONFIG[branch] || {}).competitors || [];
    if (analyses.length < 2 || competitors.length === 0) {
      return '<div class="empty-state">Need at least two files to compute activity.</div>';
    }

    var recent = analyses.slice(-7);

    var pairs = [];
    for (var i = 0; i < recent.length - 1; i++) {
      pairs.push({ prev: recent[i], next: recent[i + 1] });
    }

    var isSegments = mode === 'segments';
    var last = recent[recent.length - 1];

    // Build the set of row keys (competitor names, or segment names across the recent window)
    var rowKeys;
    if (isSegments) {
      var segSet = {};
      recent.forEach(function (a) {
        (a.segments || []).forEach(function (s) { segSet[s.name] = true; });
      });
      rowKeys = Object.keys(segSet);
    } else {
      rowKeys = competitors.slice();
    }

    // Per-pair diff: { rowKey -> changes count } (price changed between files)
    function diffPair(prev, next) {
      var prevMap = prev.productCompPrices || {};
      var nextMap = next.productCompPrices || {};
      var prevSeg = prev.productSegments || {};
      var nextSeg = next.productSegments || {};
      var out = {};
      rowKeys.forEach(function (k) { out[k] = 0; });

      Object.keys(nextMap).forEach(function (code) {
        var prevEntry = prevMap[code] || {};
        var nextEntry = nextMap[code] || {};
        var seg = nextSeg[code] || prevSeg[code] || 'Brak segmentu';
        competitors.forEach(function (c) {
          var pv = prevEntry[c];
          var nv = nextEntry[c];
          if (pv === undefined || nv === undefined) return;
          if (pv !== nv) {
            var key = isSegments ? seg : c;
            if (out[key] === undefined) out[key] = 0;
            out[key]++;
          }
        });
      });
      return out;
    }

    var perPair = pairs.map(function (p) { return diffPair(p.prev, p.next); });

    function shortLabel(a, b) {
      function fmt(d) {
        var parts = (d || '').split('-');
        return parts.length >= 2 ? parts[0] + '.' + parts[1] : (d || '?');
      }
      return fmt(a.date) + '\u2192' + fmt(b.date);
    }

    // Denominator for activity %:
    //   Competitors → avg compCoverage (that competitor's own tracked inventory)
    //   Segments    → avg segment.total (all products in the segment, not just priced ones)
    function avgBase(key) {
      var sum = 0, n = 0;
      recent.forEach(function (a) {
        if (isSegments) {
          var seg = (a.segments || []).find(function (s) { return s.name === key; });
          if (seg) { sum += seg.total; n++; }
        } else if (a.compCoverage && typeof a.compCoverage[key] === 'number') {
          sum += a.compCoverage[key];
          n++;
        }
      });
      return n > 0 ? sum / n : 0;
    }

    // X/Y note: products with this competitor's/segment's data vs total searched, computed on the latest file
    function noteFor(key) {
      if (isSegments) {
        var seg = (last.segments || []).find(function (s) { return s.name === key; });
        if (!seg) return '0/0';
        var withData = 0;
        var pcp = last.productCompPrices || {};
        var ps = last.productSegments || {};
        Object.keys(pcp).forEach(function (code) {
          if (ps[code] === key) withData++;
        });
        return withData + '/' + seg.total;
      }
      var cov = (last.compCoverage && last.compCoverage[key]) || 0;
      return cov + '/' + (last.total || 0);
    }

    var firstColLabel = isSegments ? 'Segment' : 'Konkurent';
    var header1 = '<tr>'
      + '<th rowspan="2">' + firstColLabel + '</th>'
      + '<th colspan="' + pairs.length + '" class="pair-group pair-group-start">Zmiany</th>'
      + '<th rowspan="2" class="pair-group-start">\u0141\u0105cznie</th>'
      + '<th rowspan="2">Ocena aktywno\u015Bci</th>'
      + '</tr>';
    var header2 = '<tr>';
    pairs.forEach(function (p, idx) {
      var startCls = idx === 0 ? ' class="pair-group-start"' : '';
      header2 += '<th' + startCls + '>' + shortLabel(p.prev, p.next) + '</th>';
    });
    header2 += '</tr>';
    var header = header1 + header2;

    var rows = rowKeys.map(function (k) {
      var total = 0;
      var cellHtml = '';
      perPair.forEach(function (pp, idx) {
        var v = pp[k] || 0;
        total += v;
        var startCls = idx === 0 ? ' class="pair-group-start"' : '';
        cellHtml += '<td' + startCls + '>' + v + '</td>';
      });

      var base = avgBase(k);
      var activityPct = base > 0 ? (total / base * 100) : 0;

      var veryCut   = isSegments ? 75 : 20;
      var activeCut = isSegments ? 25 : 5;

      var rating, ratingClass, ratingRank;
      if (activityPct >= veryCut)       { rating = 'Bardzo aktywny'; ratingClass = 'activity-very';     ratingRank = 3; }
      else if (activityPct >= activeCut) { rating = 'Aktywny';        ratingClass = 'activity-active';   ratingRank = 2; }
      else if (activityPct > 0)          { rating = 'Marginalny';     ratingClass = 'activity-marginal'; ratingRank = 1; }
      else                                { rating = 'Zerowy';         ratingClass = 'activity-zero';     ratingRank = 0; }

      return {
        name: k,
        note: noteFor(k),
        total: total,
        activityPct: activityPct,
        ratingRank: ratingRank,
        cellHtml: cellHtml,
        rating: rating,
        ratingClass: ratingClass,
      };
    }).sort(function (a, b) {
      if (b.ratingRank !== a.ratingRank) return b.ratingRank - a.ratingRank;
      return b.total - a.total;
    });

    var rowsHtml = '';
    rows.forEach(function (r) {
      rowsHtml += '<tr><td class="activity-name">' +
        '<div class="activity-name-main">' + escHtml(r.name) + '</div>' +
        '<div class="activity-name-note">' + escHtml(r.note) + '</div>' +
      '</td>' + r.cellHtml +
        '<td class="pair-group-start activity-total">' + r.total + '</td>' +
        '<td><span class="activity-badge ' + r.ratingClass + '">' +
          '<span class="activity-dot"></span>' + r.rating + '</span></td></tr>';
    });

    return '<div class="activity-table-wrap">' +
      '<table class="trend-table competitor-activity-table"><thead>' +
      header + '</thead><tbody>' + rowsHtml + '</tbody></table>' +
      '</div>';
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
})();

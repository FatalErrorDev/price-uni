/* === Chart.js Wrappers === */

(function () {
  'use strict';

  /* global Chart */

  var chartInstances = {};

  function destroyChart(canvasId) {
    if (chartInstances[canvasId]) {
      chartInstances[canvasId].destroy();
      delete chartInstances[canvasId];
    }
  }

  function destroyAllCharts() {
    Object.keys(chartInstances).forEach(destroyChart);
  }

  function getChartDefaults() {
    var style = getComputedStyle(document.body);
    return {
      text3: style.getPropertyValue('--text3').trim() || '#555552',
      gridColor: 'rgba(255,255,255,0.05)',
      bg3: style.getPropertyValue('--bg3').trim() || '#1e1e1e',
      accent: style.getPropertyValue('--accent').trim() || '#888884',
      accentDim: style.getPropertyValue('--accent-dim').trim() || 'rgba(136,136,132,0.08)',
      fontMono: "'DM Mono', monospace",
    };
  }

  function createDistributionChart(canvasId, distData) {
    destroyChart(canvasId);
    var ctx = document.getElementById(canvasId);
    if (!ctx) return;
    var d = getChartDefaults();

    var colors = [
      '#60a0f0', '#7ab0f0', '#94c0f0', '#b0d0f0',
      '#999999',
      '#f0c080', '#f0a060', '#f06060'
    ];

    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: distData.map(function (b) { return b.label; }),
        datasets: [{
          data: distData.map(function (b) { return b.count; }),
          backgroundColor: colors,
          borderRadius: 3,
          maxBarThickness: 40,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: d.text3, font: { family: d.fontMono, size: 10 } },
            grid: { color: d.gridColor },
          },
          y: {
            ticks: { color: d.text3, font: { family: d.fontMono, size: 10 } },
            grid: { color: d.gridColor },
            beginAtZero: true,
          },
        },
      },
    });
  }

  function createCoverageChart(canvasId, compCoverage) {
    destroyChart(canvasId);
    var ctx = document.getElementById(canvasId);
    if (!ctx) return;
    var d = getChartDefaults();

    var entries = Object.entries(compCoverage)
      .sort(function (a, b) { return b[1] - a[1]; });
    var labels = entries.map(function (e) { return e[0]; });
    var values = entries.map(function (e) { return e[1]; });

    var compColors = [
      '#60a0f0', '#f0a040', '#4ecdc4', '#f06060',
      '#c8f060', '#a080f0', '#f060a0', '#80d0f0'
    ];

    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: compColors.slice(0, labels.length),
          borderRadius: 3,
          maxBarThickness: 28,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: d.text3, font: { family: d.fontMono, size: 10 } },
            grid: { color: d.gridColor },
            beginAtZero: true,
          },
          y: {
            ticks: { color: d.text3, font: { family: d.fontMono, size: 11 } },
            grid: { display: false },
          },
        },
      },
    });
  }

  function createLineChart(canvasId, labels, values, yLabel) {
    destroyChart(canvasId);
    var ctx = document.getElementById(canvasId);
    if (!ctx) return;
    var d = getChartDefaults();

    chartInstances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          borderColor: d.accent,
          backgroundColor: d.accentDim,
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: d.accent,
          pointBorderColor: d.accent,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: d.text3, font: { family: d.fontMono, size: 10 } },
            grid: { color: d.gridColor },
          },
          y: {
            ticks: {
              color: d.text3,
              font: { family: d.fontMono, size: 10 },
              callback: function (v) { return v + '%'; },
            },
            grid: { color: d.gridColor },
          },
        },
      },
    });
  }

  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function dateToDayName(dateStr) {
    // DD-MM-YYYY → day-of-week abbreviation
    var parts = dateStr.split('-');
    if (parts.length !== 3) return '';
    var d = new Date(parts[2], parts[1] - 1, parts[0]);
    return isNaN(d.getTime()) ? '' : DAY_NAMES[d.getDay()];
  }

  function createCompCoverageLineChart(canvasId, dates, analyses) {
    destroyChart(canvasId);
    var ctx = document.getElementById(canvasId);
    if (!ctx) return;
    var d = getChartDefaults();
    var tickColor = '#b0b0a8';

    var compColors = [
      '#b349da', '#31ac87', '#eee360', '#6150f8',
      '#2b9ebf', '#aa3e3e', '#17c844', '#b57622'
    ];

    // Collect all competitor names from all analyses
    var competitors = [];
    analyses.forEach(function (a) {
      if (a.compCoverage) {
        Object.keys(a.compCoverage).forEach(function (c) {
          if (competitors.indexOf(c) === -1) competitors.push(c);
        });
      }
    });

    // Build multiline labels: date + day of week
    var labels = dates.map(function (dt) {
      var day = dateToDayName(dt);
      return day ? [dt, day] : [dt];
    });

    // Compute per-date totals (sum of visible competitors)
    var totals = analyses.map(function (a) {
      var sum = 0;
      if (a.compCoverage) {
        competitors.forEach(function (c) { sum += (a.compCoverage[c] || 0); });
      }
      return sum;
    });

    var datasets = competitors.map(function (comp, i) {
      var color = compColors[i % compColors.length];
      return {
        label: comp,
        data: analyses.map(function (a) {
          return a.compCoverage ? (a.compCoverage[comp] || 0) : 0;
        }),
        borderColor: color,
        backgroundColor: color + '18',
        fill: false,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: color,
        pointBorderColor: color,
        borderWidth: 2,
      };
    });

    // Custom plugin to draw sum totals above each x-tick
    var sumPlugin = {
      id: 'sumTotals',
      afterDraw: function (chart) {
        var ctx2 = chart.ctx;
        var xScale = chart.scales.x;
        var yScale = chart.scales.y;
        ctx2.save();
        ctx2.font = '11px ' + d.fontMono;
        ctx2.fillStyle = tickColor;
        ctx2.textAlign = 'center';
        for (var i = 0; i < totals.length; i++) {
          // Recalculate sum from visible datasets only
          var visibleSum = 0;
          chart.data.datasets.forEach(function (ds, idx) {
            if (chart.isDatasetVisible(idx)) {
              visibleSum += (ds.data[i] || 0);
            }
          });
          var x = xScale.getPixelForValue(i);
          var y = yScale.top - 6;
          ctx2.fillText(visibleSum, x, y);
        }
        ctx2.restore();
      }
    };

    chartInstances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 20 } },
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: tickColor, font: { family: d.fontMono, size: 10 } },
            grid: { color: d.gridColor },
          },
          y: {
            ticks: { color: tickColor, font: { family: d.fontMono, size: 10 } },
            grid: { color: d.gridColor },
            beginAtZero: true,
          },
        },
      },
      plugins: [sumPlugin],
    });

    return chartInstances[canvasId];
  }

  // Expose globals
  window.destroyChart = destroyChart;
  window.destroyAllCharts = destroyAllCharts;
  window.createDistributionChart = createDistributionChart;
  window.createCoverageChart = createCoverageChart;
  window.createLineChart = createLineChart;
  window.createCompCoverageLineChart = createCompCoverageLineChart;
})();

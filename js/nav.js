/* === Navigation === */

(function () {
  'use strict';

  var currentPage = 'scraping';
  var currentBranch = 'sewera';

  function switchPage(page) {
    // page = 'scraping' | 'analysis'
    var pages = document.querySelectorAll('.page-section');
    var tabs = document.querySelectorAll('.nav-tab');
    var toggle = document.querySelector('.branch-toggle');

    if (page === 'analysis') {
      // Show the current branch page
      pages.forEach(function (p) { p.classList.remove('active'); });
      var target = document.getElementById('page-' + currentBranch);
      if (target) target.classList.add('active');
      document.body.className = 'page-' + currentBranch;
    } else {
      pages.forEach(function (p) { p.classList.remove('active'); });
      var scrapingPage = document.getElementById('page-scraping');
      if (scrapingPage) scrapingPage.classList.add('active');
      document.body.className = 'page-scraping';
      if (typeof window.loadScheduledFiles === 'function') {
        window.loadScheduledFiles();
      }
    }

    // Update tab active state
    tabs.forEach(function (t) {
      t.classList.toggle('active', t.dataset.page === page);
    });

    // Show/hide branch toggle
    if (toggle) {
      toggle.classList.toggle('visible', page === 'analysis');
    }

    currentPage = page;

    // Trigger branch load if switching to analysis
    if (page === 'analysis' && typeof onBranchSwitch === 'function') {
      onBranchSwitch(currentBranch);
    }
  }

  function switchBranch(branch) {
    currentBranch = branch;
    document.body.className = 'page-' + branch;

    // Update branch buttons
    var btns = document.querySelectorAll('.branch-btn');
    btns.forEach(function (b) {
      b.classList.toggle('active', b.dataset.branch === branch);
    });

    // Show correct analysis page
    var pages = document.querySelectorAll('.page-section');
    pages.forEach(function (p) { p.classList.remove('active'); });
    var target = document.getElementById('page-' + branch);
    if (target) target.classList.add('active');

    if (typeof onBranchSwitch === 'function') {
      onBranchSwitch(branch);
    }
  }

  function getCurrentBranch() {
    return currentBranch;
  }

  // Initialize nav on DOM ready
  document.addEventListener('DOMContentLoaded', function () {
    // Tab clicks
    document.querySelectorAll('.nav-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchPage(tab.dataset.page);
      });
    });

    // Branch toggle clicks
    document.querySelectorAll('.branch-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchBranch(btn.dataset.branch);
      });
    });

    // Set initial state
    switchPage('scraping');
  });

  // Expose globals
  window.switchPage = switchPage;
  window.switchBranch = switchBranch;
  window.getCurrentBranch = getCurrentBranch;
})();

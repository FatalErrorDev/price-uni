/* === Google Drive API === */

var FOLDERS = {
  input:     '1ZVc2-CEQxPGxUqNRS21oriJ5pC_OjgUB',
  monday:    '1V06NGq4x0YrXwkjd4X4CcxuYkDfed8mi',
  tuesday:   '18wHCkZHahJQ3isPlu3uNFeLolt-kCBsR',
  wednesday: '1mxgRHKkxt90492qhp9H_CPThcF8zoAfx',
  thursday:  '1UZ_-2b2_DtSGEF0zMWGOQeKu4qTy00uU',
  friday:    '1th9yZGHzO3-btd0J4GPhcMRtJw9COQAq',
  saturday:  '1LqYKmDdb5tqHyIVARX-0gJAg6BEqKHoh',
  sunday:    '1zZW2kSI5U4D_RC22dIa-c8WgMxI6KVGU',
  sewera:    '1UDqeC8GzD0iq5lDJRdbL1usoiNhyCngq',
  dobromir:  '1ixaHR6UZYQGCRFehtAp_aTuRmV6ipuGU',
};

(function () {
  'use strict';

  var tokenClient = null;
  var accessToken = null;

  function getClientId() {
    var meta = document.querySelector('meta[name="google-client-id"]');
    return meta ? meta.content : '';
  }

  function initDrive() {
    var clientId = getClientId();
    if (!clientId || clientId === 'YOUR_CLIENT_ID_HERE') {
      console.warn('Google Client ID not configured. Set it in the <meta name="google-client-id"> tag.');
      return;
    }

    /* global google */
    if (typeof google === 'undefined' || !google.accounts) {
      console.warn('Google Identity Services library not loaded.');
      return;
    }

    google.accounts.id.disableAutoSelect();

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive',
      callback: function (response) {
        if (response.error) {
          console.error('OAuth error:', response.error);
          updateAuthUI(false);
          return;
        }
        accessToken = response.access_token;
        sessionStorage.setItem('driveToken', response.access_token);
        updateAuthUI(true);
      },
    });

    var saved = sessionStorage.getItem('driveToken');
    if (saved) {
      // Verify the token is still valid
      fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + saved)
        .then(function (resp) {
          if (resp.ok) {
            accessToken = saved;
            updateAuthUI(true);
          } else {
            sessionStorage.removeItem('driveToken');
          }
        })
        .catch(function () {
          sessionStorage.removeItem('driveToken');
        });
    }
  }

  function signIn() {
    if (!tokenClient) {
      initDrive();
    }
    if (tokenClient) {
      tokenClient.requestAccessToken();
    } else {
      updateAuthUI(false, 'Google OAuth not configured');
    }
  }

  function disconnectDrive() {
    if (accessToken) {
      google.accounts.oauth2.revoke(accessToken);
    }
    accessToken = null;
    sessionStorage.removeItem('driveToken');
    updateAuthUI(false);
  }

  function isSignedIn() {
    return !!accessToken;
  }

  function requireAuth() {
    if (!isSignedIn()) {
      throw new Error('Not authenticated. Please connect Google Drive first.');
    }
  }

  function updateAuthUI(connected, errorMsg) {
    var bar = document.getElementById('auth-bar');
    if (!bar) return;
    if (connected) {
      bar.innerHTML = '<span class="status-ok" onclick="disconnectDrive()" style="cursor:pointer" title="Click to disconnect">Connected to Drive \u2713</span>';
      if (typeof window.loadScheduledFiles === 'function') {
        window.loadScheduledFiles();
      }
    } else if (errorMsg) {
      bar.innerHTML = '<span style="color:#f06060">' + errorMsg + '</span>';
    } else {
      bar.innerHTML = '<button onclick="signIn()">Connect Google Drive</button>';
    }
  }

  async function uploadFile(file, folderId) {
    requireAuth();
    var metadata = {
      name: file.name,
      parents: [folderId],
    };
    var form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    var resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken },
      body: form,
    });
    if (!resp.ok) {
      var err = await resp.text();
      throw new Error('Upload failed: ' + err);
    }
    return resp.json();
  }

  async function listFiles(folderId) {
    requireAuth();
    var q = encodeURIComponent("'" + folderId + "' in parents and mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' and trashed=false");
    var url = 'https://www.googleapis.com/drive/v3/files?q=' + q + '&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime,webViewLink)';
    var resp = await fetch(url, {
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    if (!resp.ok) {
      var err = await resp.text();
      throw new Error('List files failed: ' + err);
    }
    var data = await resp.json();
    return data.files || [];
  }

  async function deleteFile(fileId) {
    requireAuth();
    var resp = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    if (!resp.ok) {
      var err = await resp.text();
      throw new Error('Delete failed: ' + err);
    }
  }

  async function downloadFile(fileId) {
    requireAuth();
    var resp = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media', {
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    if (!resp.ok) {
      var err = await resp.text();
      throw new Error('Download failed: ' + err);
    }
    return resp.arrayBuffer();
  }

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', function () {
    updateAuthUI(false);
    // Wait for GSI library to load
    var waitForGSI = setInterval(function () {
      if (window._gsiReady && 
          typeof google !== 'undefined' &&
          google.accounts &&
          google.accounts.oauth2 &&
          typeof google.accounts.oauth2.initTokenClient === 'function') {
        clearInterval(waitForGSI);
        initDrive();
      }
    }, 100);
    // Stop waiting after 10s
    setTimeout(function () { clearInterval(waitForGSI); }, 10000);
  });

  // Expose globals
  window.signIn = signIn;
  window.disconnectDrive = disconnectDrive;
  window.isSignedIn = isSignedIn;
  window.uploadFile = uploadFile;
  window.listFiles = listFiles;
  window.deleteFile = deleteFile;
  window.downloadFile = downloadFile;
})();

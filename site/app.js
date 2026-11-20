// Keep the download section pointing at the latest published GitHub Release.
//
// index.html ships direct links to the current version, so downloads work
// without JavaScript and when GitHub's API is unreachable or rate-limited
// (60 requests an hour per visitor). When the API reports a newer release, its
// assets replace those links. Asset names follow
// PRIVIA-<version>-<platform>-<arch>.<ext> (see packaging/collect_artifacts.py).

(function () {
  const REPO = 'MohitKB22/Privia';
  const RELEASES = `https://github.com/${REPO}/releases`;

  const KINDS = [
    { os: 'macos', match: /-macos-arm64\.dmg$/, label: 'Apple Silicon (.dmg)' },
    { os: 'macos', match: /-macos-x64\.dmg$/, label: 'Intel (.dmg)' },
    { os: 'windows', match: /-windows-x64-setup\.exe$/, label: 'Installer (.exe)' },
    { os: 'windows', match: /-windows-x64\.msi$/, label: 'MSI package (.msi)' },
    { os: 'linux', match: /-linux-x64\.AppImage$/, label: 'AppImage' },
    { os: 'linux', match: /-linux-x64\.deb$/, label: 'Debian / Ubuntu (.deb)' },
    { os: 'linux', match: /-linux-x64\.rpm$/, label: 'Fedora / openSUSE (.rpm)' },
  ];

  const status = document.getElementById('download-status');
  const meta = document.getElementById('release-meta');
  const footer = document.getElementById('footer-version');
  const primary = document.getElementById('primary-download');

  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    if (text) node.textContent = text;
    return node;
  }

  function detectOs() {
    const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    const ua = navigator.userAgent || '';
    if (/mac/i.test(platform) || /Mac OS X/.test(ua)) return 'macos';
    if (/win/i.test(platform) || /Windows/.test(ua)) return 'windows';
    if (/linux/i.test(platform) || /Linux/.test(ua)) return 'linux';
    return null;
  }

  function noRelease(message) {
    // Keep the links that shipped with the page; only fill boxes left empty.
    let empty = false;
    document.querySelectorAll('[data-links]').forEach((box) => {
      if (box.children.length) return;
      empty = true;
      box.append(el('a', { class: 'button small', href: RELEASES }, 'See releases'));
    });
    if (empty) status.textContent = message;
  }

  function pickPrimary() {
    const os = detectOs();
    const preferred = os && document.querySelector(`[data-links="${os}"] a`);
    if (preferred && preferred.getAttribute('href') !== RELEASES) {
      primary.href = preferred.href;
      primary.textContent = `Download for ${{ macos: 'macOS', windows: 'Windows', linux: 'Linux' }[os]}`;
    }
  }

  fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
    .then((response) => {
      if (response.status === 404) throw new Error('none');
      if (!response.ok) throw new Error('unavailable');
      return response.json();
    })
    .then((release) => {
      const version = String(release.tag_name || '').replace(/^v/, '');
      const date = release.published_at ? new Date(release.published_at).toLocaleDateString() : '';
      status.textContent = `Version ${version}${date ? `, released ${date}` : ''}.`;
      meta.textContent = `Version ${version} · macOS · Windows · Linux`;
      footer.textContent = `Version ${version} · Apache-2.0`;

      const assets = release.assets || [];
      if (!assets.length) return;
      document.querySelectorAll('[data-links]').forEach((box) => box.replaceChildren());
      KINDS.forEach((kind) => {
        const asset = assets.find((a) => kind.match.test(a.name));
        if (!asset) return;
        const box = document.querySelector(`[data-links="${kind.os}"]`);
        const link = el('a', { class: 'button small', href: asset.browser_download_url });
        link.append(el('span', {}, kind.label));
        link.append(el('span', { class: 'size' }, `${(asset.size / 1048576).toFixed(0)} MB`));
        box.append(link);
      });
      const sums = assets.find((a) => a.name === 'SHA256SUMS.txt');
      if (sums) {
        status.append(' ');
        status.append(el('a', { href: sums.browser_download_url }, 'SHA-256 checksums'));
      }
      document.querySelectorAll('[data-links]').forEach((box) => {
        if (!box.children.length) box.append(el('a', { class: 'button small', href: release.html_url }, 'All files'));
      });
    })
    .catch((error) => {
      noRelease(
        error.message === 'none'
          ? 'The first release has not been published yet. You can build PRIVIA from source today.'
          : 'GitHub could not be reached to look up the latest release.',
      );
    })
    .finally(pickPrimary);
})();

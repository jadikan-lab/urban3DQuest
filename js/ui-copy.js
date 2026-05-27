(() => {
  const store = Object.create(null);

  function flushCurrent(currentKey, currentValue) {
    if (!currentKey) return null;
    store[currentKey] = currentValue.join('\n').replace(/\s+$/, '');
    return null;
  }

  function parseMarkdownCopy(markdown) {
    const lines = String(markdown || '').split(/\r?\n/);
    let inCodeBlock = false;
    let currentKey = null;
    let currentValue = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('```')) {
        if (inCodeBlock) {
          currentKey = flushCurrent(currentKey, currentValue);
          currentValue = [];
        }
        inCodeBlock = !inCodeBlock;
        continue;
      }

      if (!inCodeBlock) continue;

      const keyMatch = line.match(/^([A-Z0-9_]+):\s*(.*)$/);
      if (keyMatch) {
        currentKey = flushCurrent(currentKey, currentValue);
        currentKey = keyMatch[1];
        currentValue = [keyMatch[2]];
        continue;
      }

      if (currentKey && (line.startsWith(' ') || line.startsWith('\t'))) {
        currentValue.push(line.replace(/^\s+/, ''));
        continue;
      }

      if (currentKey && trimmed === '') {
        currentValue.push('');
      }
    }

    flushCurrent(currentKey, currentValue);
  }

  function u3dqCopyText(key, fallback = '') {
    const value = store[key];
    return typeof value === 'string' && value.length ? value : fallback;
  }

  window.u3dqCopy = store;
  window.u3dqCopyText = u3dqCopyText;
  window.u3dqCopyReady = (async () => {
    try {
      const response = await fetch('ui-copy.md', { cache: 'no-store' });
      if (!response.ok) return false;
      parseMarkdownCopy(await response.text());
      return true;
    } catch {
      return false;
    }
  })();
})();
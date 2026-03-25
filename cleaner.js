/* ============================================
   Velora — Text Cleaner
   Removes "2026 Velora. Data TMDB." from all
   text nodes on the page automatically.
   ============================================ */
(function () {
  'use strict';

  const TARGET = '2026 Velora. Data TMDB.';

  function cleanTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.includes(TARGET)) {
        // Remove the target text (and optional © before it)
        node.nodeValue = node.nodeValue
          .replace(/©?\s*2026 Velora\.\s*Data TMDB\./g, '')
          .trim();

        // If the parent element is now empty, remove it entirely
        const parent = node.parentElement;
        if (parent && parent.textContent.trim() === '') {
          parent.remove();
        }
      }
    }
  }

  function run() {
    cleanTextNodes(document.body);

    // Watch for dynamically added content
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const added of m.addedNodes) {
          if (added.nodeType === Node.ELEMENT_NODE) {
            cleanTextNodes(added);
          } else if (added.nodeType === Node.TEXT_NODE) {
            if (added.nodeValue && added.nodeValue.includes(TARGET)) {
              added.nodeValue = added.nodeValue
                .replace(/©?\s*2026 Velora\.\s*Data TMDB\./g, '')
                .trim();

              const parent = added.parentElement;
              if (parent && parent.textContent.trim() === '') {
                parent.remove();
              }
            }
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();

(function (root, factory) {
  root.GelamConfig = {};
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    factory(root, module.exports);
  } else {
    factory(root, root.GelamConfig);
  }
}(this, function(root, exports) {
  // Point the baseUrl at deps/, so that most third-party modules can
  // be referenced directly. Our own code lives under src/.

  exports.getRequireConfig = function() {
    return {
      catchError: { define: true },
      scriptType: 'text/javascript;version=1.8', // for messageGenerator.js
      baseUrl: '../deps',
      useStrict: true,
      optimize: 'none',
      paths: {
        'src': '../src',
        'bleach': 'bleach.js/lib/bleach',
        'smtpclient': 'smtpclient/src/smtpclient',
        'smtpclient-response-parser':
          'smtpclient/src/smtpclient-response-parser',
        'wo-imap-handler': 'imap-handler/src/imap-handler',
        'imap-formal-syntax': 'imap-handler/src/imap-formal-syntax',
        'wbxml': 'activesync/wbxml/wbxml',
        'tests': '../test/unit'
      },
      map: {
        '*': {
          'wo-utf7': 'utf7',
          'axe-logger': 'axe'
        }
      },
      packages: [
        { name: 'wo-imap-handler',
          location: 'imap-handler/src',
          main: 'imap-handler' }
      ],
      // Never timeout waiting for modules to load. This is important
      // for low-end devices, which may take unnaturally long amounts of
      // time to load modules.
      waitSeconds: 4
    };
  };

  // Shim for setZeroTimeout, used in various places:
  root.setZeroTimeout = function(fn) {
    setTimeout(function() {
      fn();
    }, 0);
  };

  exports.load = function() {
    require(exports.getRequireConfig());
  };
}));

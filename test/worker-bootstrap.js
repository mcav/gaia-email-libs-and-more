/**
 * Worker bootstrapping for unit test purposes (for now).  Gets replaced with
 * a gaia appropriate file on install-into-gaia.  The contents of the path
 * map are currently identical to those in gelam-require-map.js.
 *
 * The key differences between this and the real bootstrapper are:
 * - our paths map is different; we don't use consolidated files (currently,
 *   probably a good idea to use them)
 * - we include paths for the unit test framework
 * - we load the unit-test driver
 **/
var window = self;
var testLogEnable = false;

var gelamWorkerBaseUrl = '../js';

importScripts('../js/ext/alameda.js');
importScripts('../js/worker-config.js');

function makeConsoleFunc(prefix) {
  return function() {
    if (!this._enabled)
      return;
    var msg = prefix + ':';
    for (var i = 0; i < arguments.length; i++) {
      msg += ' ' + arguments[i];
    }
    msg += '\x1b[0m\n';
    dump(msg);
  };
}

window.console = {
  _enabled: false,
  log: makeConsoleFunc('\x1b[32mWLOG'),
  error: makeConsoleFunc('\x1b[31mWERR'),
  info: makeConsoleFunc('\x1b[36mWINF'),
  warn: makeConsoleFunc('\x1b[33mWWAR'),
};

window.navigator.mozContacts = {
  find: function(opts) {
    var req = { onsuccess: null, onerror: null, result: null };
    window.setZeroTimeout(function() {
      if (req.onsuccess)
        req.onsuccess({ target: req });
    });
    return req;
  },
};

var document = { cookie: null };

// Configure path for the test directory, relative to gelamWorkerBaseUrl
require.config({
  paths: {
    test: '../test',
    gelam: '.'
  }
});

require(['test/loggest-runner-worker']);

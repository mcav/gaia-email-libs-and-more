'use strict';
// Note: No AMD module here, just our global GelamLoader, since this
// file is the one that configures RequireJS.
(function(root) {

  /**
   * GELAM's loader and RequireJS configuration.
   *
   * This file is included from both the Gaia-side Email app and the
   * GELAM tests. It knows how to configure our RequireJS paths for
   * either side.
   *
   * `GelamLoader.loadMailAPI()` kicks off the GELAM backend and
   * creates the MailAPI when called from within Gaia.
   */

  root.GelamLoader = {

    /**
     * Configure GELAM. Call this before anything else.
     *
     * This initializes our RequireJS configuration to allow us to
     * refer to any module within the following two directories using
     * absolute paths:
     *
     *   js/
     *   js/ext/
     *
     * (This requires some build trickery, as explained in
     * `scripts/sync-js-ext-deps.js`.)
     *
     * When installed from Gaia, we use Require's `context` option to
     * avoid conflicting with Gaia Email's loader.
     *
     * @param {object} opts
     * @param {boolean} opts.standalone
     *   Set to true when running GELAM standalone, i.e. from unit tests.
     */
    config: function(opts) {

      var baseUrl = (opts.standalone ? '/js' : '/js/ext');

      // Configure any manual paths here:
      var allPaths = {
        'bleach': 'ext/bleach.js/lib/bleach',
        'imap-formal-syntax': 'ext/imap-handler/src/imap-formal-syntax',
        'smtpclient-response-parser':
        'ext/smtpclient/src/smtpclient-response-parser',
        'tests': '../test/unit',
        'wbxml': 'ext/activesync-lib/wbxml/wbxml',
        'activesync/codepages': 'ext/activesync-lib/codepages',
        'activesync/protocol': 'ext/activesync-lib/protocol'
      };

      // Now, automatically splice in modules from 'js/ext/'...
      this.pathsInExt.forEach(function(path) {
        allPaths[path] = baseUrl + '/ext/' + path;
      });

      // Configure the context.
      this.require = require.config({
        context: (opts.standalone ? null : 'gelam'),
        baseUrl: baseUrl,
        packages: [
          { name: 'wo-imap-handler',
            location: 'ext/imap-handler/src',
            main: 'imap-handler' }
        ],
        paths: allPaths,
        // When we're in Gaia, never allow modules to timeout, as slow
        // phones may get bogged down in disk i/o and we should never
        // have missing modules in real life. (When standalone, just
        // use the default timeout of 7 seconds.)
        waitSeconds: (opts.standalone ? 7 : 0)
      });

      this._installShims();
    },

    require: null, // Instantiated after .config()

    // This array lists every top-level module in GELAM/js/ext.
    // CAUTION: It is automatically updated during the build step;
    // don't change or your edits will be as sticky as a dusty post-it.
    // If you see changes here because you modified our deps, commit it!
    pathsInExt: [
      // <gelam-ext>
      '.tern-port',
      'activesync-lib',
      'addressparser',
      'alameda',
      'axe',
      'axe-logger',
      'bleach.js',
      'browserbox',
      'browserbox-imap',
      'evt',
      'imap-handler',
      'mailbuild',
      'md5',
      'mimefuncs',
      'mimeparser',
      'mimeparser-tzabbr',
      'mimetypes',
      'mix',
      'punycode',
      'rdcommon',
      'rdplat',
      'safe-base64',
      'smtpclient',
      'smtpclient',
      'stringencoding',
      'tcp-socket',
      'utf7',
      'wmsy',
      'wo-utf7'
      // </gelam-ext>
    ],

    /**
     * Load GELAM (spin up the backend) and give back a reference to MailAPI.
     *
     * @param {function(MailAPI)} callback
     */
    loadMailAPI: function(cb) {
      if (!this.require) {
        console.error('You must call GelamLoader.config() first.');
        return;
      }
      this.require(['main-frame-setup'], function(MailAPI) {
        cb(MailAPI);
      });
    },

    /**
     * Install super-simple shims here.
     */
    _installShims: function() {
      root.setZeroTimeout = function(fn) {
        setTimeout(function() { fn(); }, 0);
      };
    }
  };
})(this);

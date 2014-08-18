(function (root, factory) {
  root.GelamConfig = {};
  factory(root.GelamConfig);
}(this, function(exports) {
  // Point the baseUrl at deps/, so that most third-party modules can
  // be referenced directly. Our own code lives under src/.

  exports.requireConfig = {
    catchError: { define: true },
    scriptType: 'text/javascript;version=1.8', // for messageGenerator.js
    baseUrl: '../deps',
    useStrict: true,
    optimize: 'none',
    paths: {
      'src': '../src',
      'bleach': 'bleach.js/lib/bleach',
      'smtpclient': 'smtpclient/src/smtpclient',
      'smtpclient-response-parser': 'smtpclient/src/smtpclient-response-parser',
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

  exports.moduleGroups = {
    bootstrap: [
      'alameda',
      'config',
      'event-queue',
      'src/mailslice',
      'src/db/mail_rep',
      'src/searchfilter',
      'src/jobs/outbox',
      'src/jobmixins',
      'src/drafts/jobs',
      'src/drafts/draft_rep',
      'src/async_blob_fetcher',
      'src/accountmixins',
      'util',
      'stream',
      'crypto',
      'mix',
      'src/worker-setup'
    ],

    'activesync/protocollayer': [
      'wbxml',
      'activesync/codepages',
      'activesync/protocol'
    ],

    'activesync/configurator': [
      'activesync/codepages/FolderHierarchy',
      'activesync/codepages/ComposeMail',
      'activesync/codepages/AirSync',
      'activesync/codepages/AirSyncBase',
      'activesync/codepages/ItemEstimate',
      'activesync/codepages/Email',
      'activesync/codepages/ItemOperations',
      'activesync/codepages/Move'
    ],

    'chewlayer': [
      'htmlchew',
      'quotechew',
      'mailchew',
      'imap/imapchew'
    ],

    'imap/protocollayer': [
      'imap/protocol/sync',
      'imap/protocol/textparser',
      'imap/protocol/snippetparser',
      'imap/protocol/bodyfetcher'
    ]


  };

  window.setZeroTimeout = function(fn) {
    setTimeout(function() {
      fn();
    }, 0);
  };

  define('stringencoding', function(require) {
    var utf7 = require('utf7');
    return {
      TextEncoder: function(encoding) {
        var encoder = new TextEncoder(encoding);
        this.encode = encoder.encode.bind(encoder);
      },
      TextDecoder: function(encoding) {
        encoding = encoding && encoding.toLowerCase();
        if (encoding === 'utf-7' || encoding === 'utf7') {
          this.decode = function(buf) {
            var mimefuncs = require('mimefuncs');
            return utf7.decode(mimefuncs.fromTypedArray(buf));
          };
        } else {
          var decoder = new TextDecoder(encoding);
          this.decode = decoder.decode.bind(decoder)
        }
      }
    };
  });

   define('axe', function(require, exports, module) {
    ['debug', 'log', 'warn', 'error'].forEach(function(name) {
      exports[name] = console.log.bind(console);
    });
  });

  define('slog', function(require, exports, module) {
    var $log = require('rdcommon/log');
    var evt = require('evt');

    var logEmitter = new evt.Emitter();

    var LogChecker = exports.LogChecker = function(T, RT) {
      this.T = T;
      this.RT = RT;
      this.eLazy = T.lazyLogger('slog');
    };
    LogChecker.prototype.mustLog = function(name, /* optional */ predicate) {
      this.RT.reportActiveActorThisStep(this.eLazy);
      var successDesc = predicate.toString();
      this.eLazy.expect_namedValue(name, true);

      logEmitter.once(name, function(details) {
        try {
          var result = predicate(details);
          this.eLazy.namedValue(name, result);
        } catch(e) {
          console.error('Exception running LogChecker predicate:', e);
        }
      }.bind(this));
    };

    ['log', 'info', 'warn', 'error'].forEach(function(name) {
      exports[name] = function(logName, details) {
        var orig = console[name].bind(console, '[slog]');

        logEmitter.emit(logName, details);

        orig.apply(console, Array.slice(arguments).map(function(arg) {

          if (typeof arg === 'object') {
            // Remove private properties
            // TODO: unhide these in super-secret debug mode
            var publicKeys = {};
            for (var key in arg) {
              if (key[0] !== '_') {
                publicKeys[key] = arg[key];
              }
            }
            try {
              return JSON.stringify(publicKeys);
            } catch(e) {
              return '[un-JSONifiable ' + arg + ']';
            }
          } else {
            return arg;
          }
        }));
      };
    });
  });

  exports.load = function() {
    require(exports.requireConfig);
  };
}));

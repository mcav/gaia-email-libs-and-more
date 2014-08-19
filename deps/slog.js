/**
 * slog: Structured Logging.
 *
 * A precursor to the future in <https://bugzil.la/976850>; WIP and
 * intended to be exploratory as we figure out how to actually
 * implement the full-on test refactoring.
 *
 * Usage:
 *
 *   slog.log('imap:error', {
 *     user: 'foo',
 *     _pass: 'bar' // Private, due to the underscore.
 *   });
 *
 * The LogChecker for unit tests allows you to assert on logged
 * events. Presently it hooks in with a lazyLogger; in the future it
 * (and these structured logs) would be hooked directly into ArbPL:
 *
 *   var log = new LogChecker(T, RT);
 *   log.mustLog('imap:error', function(details) {
 *     return details.user === 'foo';
 *   });
 */
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
    var successDesc = predicate && predicate.toString() || 'ok';
    this.eLazy.expect_namedValue(name, true);

    logEmitter.once(name, function(details) {
      try {
        var result = predicate && predicate(details) || true;
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

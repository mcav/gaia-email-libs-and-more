/**
 * Shim for 'axe-logger' as required by the email.js libs.
 */
define('axe', function(require, exports, module) {
  ['debug', 'log', 'warn', 'error'].forEach(function(name) {
    exports[name] = console.log.bind(console);
  });
});

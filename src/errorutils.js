define(['exports'], function(exports) {

  exports.shouldReportProblem = function(err) {
    return [
      'bad-user-or-pass',
      'bad-security'
    ].indexOf(err) !== -1;
  };

  exports.shouldRetry = function(err) {
    return [
      'bad-user-or-pass',
      'bad-security'
    ].indexOf(err) === -1;
  };

  exports.wasErrorFromReachableState = function(err) {
    return (err !== 'unresponsive-server');
  };

  exports.analyzeException = function(err) {
    // Fault-injecting-socket returns the string "Connection refused"
    // for certian socket errors. (Does mozTCPSocket raise that error
    // verbatim?)
    if (err === 'Connection refused') {
      err = { name: 'ConnectionRefusedError' };
    }
    // Otherwise, assume a plain-old-string is already normalized.
    else if (typeof err === 'string') {
      return err;
    }

    if (!err || !err.name) {
      return null;
    }

   var str = (err.name || '') + ' ' + (err.message || '');

    if (/^Security/.test(str)) {
      return 'bad-security';
    }
    else if (/^ConnectionRefused/i.test(str)) {
      return 'unresponsive-server';
    }
    else {
      return null; // We don't know.
    }
  }

});

define(function() {

  exports.shouldReportProblem = function(err) {
    return [
      'bad-user-or-pass',
      'bad-security'
    ].indexOf(err) !== -1;
  };

  exports.wasErrorFromReachableState = function(err) {
    return (err !== 'unresponsive-server');
  };

});

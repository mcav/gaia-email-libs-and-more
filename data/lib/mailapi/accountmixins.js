/**
 * @module mailapi/accountmixins
 * @class AccountMixins
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

/**
 * @method runOp
 * @param op {MailOp}
 * @param mode {'local_do'|'check'|'do'|'local_undo'|'undo'}
 *   - local_do: Apply the mutation locally to our database rep.
 *   - check: Check if the manipulation has been performed on the server.  There
 *       is no need to perform a local check because there is no way our database
 *       can be inconsistent in its view of this.
 *   - do: Perform the manipulation on the server.
 *   - local_undo: Undo the mutation locally.
 *   - undo: Undo the mutation on the server.
 * @param callback {Function(error)}
 */
exports.runOp = function runOp(op, mode, callback) {
  console.log('runOp(' + mode + ': ' + JSON.stringify(op).substring(0, 160) +
              ')');

  var methodName = mode + '_' + op.type, self = this;

  if (!(methodName in this._jobDriver)) {
    console.warn('Unsupported op:', op.type, 'mode:', mode);
    callback('failure-give-up');
    return;
  }

  this._LOG.runOp_begin(mode, op.type, null, op);
  // _LOG supports wrapping calls, but we want to be able to strip out all
  // logging, and that wouldn't work.
  try {
    this._jobDriver[methodName](op, function(error, resultIfAny,
                                             accountSaveSuggested) {
      self._jobDriver.postJobCleanup(!error);
      self._LOG.runOp_end(mode, op.type, error, op);
      // defer the callback to the next tick to avoid deep recursion
      window.setZeroTimeout(function() {
        callback(error, resultIfAny, accountSaveSuggested);
      });
    });
  }
  catch (ex) {
    this._LOG.opError(mode, op.type, ex);
  }
};


/**
 * Return the folder metadata for the first folder with the given type, or null
 * if no such folder exists.
 *
 * @method getFirstFolderWithType
 * @param type {FolderType}
 */
exports.getFirstFolderWithType = function(type) {
  var folders = this.folders;
  for (var iFolder = 0; iFolder < folders.length; iFolder++) {
    if (folders[iFolder].type === type)
      return folders[iFolder];
  }
 return null;
};
/**
 * @method getFolderByPath
 * @param folderPath {String}
 */
exports.getFolderByPath = function(folderPath) {
  var folders = this.folders;
  for (var iFolder = 0; iFolder < folders.length; iFolder++) {
    if (folders[iFolder].path === folderPath)
      return folders[iFolder];
  }
 return null;
};

}); // end define

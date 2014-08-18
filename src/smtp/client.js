define([
  'slog',
  'smtpclient',
  '../syncbase',
  'exports'
], function(slog, SmtpClient, syncbase, exports) {

  var setTimeout = window.setTimeout;
  var clearTimeout = window.clearTimeout;

  exports.setTimeoutFunctions = function(setFn, clearFn) {
    setTimeout = setFn;
    clearTimeout = clearFn;
  };


  function noop() {
    // nothing
  }

  exports.createSmtpConnection = function(credentials, connInfo) {
    var conn;
    return new Promise(function(resolve, reject) {

      var auth = {
        // Someday, `null` might be a valid value, so be careful here
        user: (credentials.outgoingUsername !== undefined ?
               credentials.outgoingUsername :
               credentials.username),
        pass: (credentials.outgoingPassword !== undefined ?
               credentials.outgoingPassword :
               credentials.password)
      };
      slog.log('smtp:connect', {
        _auth: auth,
        connInfo: connInfo
      });
      conn = new SmtpClient(
        connInfo.hostname, connInfo.port,
        {
          useSecureTransport: (connInfo.crypto === 'ssl' ||
                               connInfo.crypto === true),
          starttls: connInfo.crypto === 'starttls',
          auth: auth
        });

      var connectTimeout = setTimeout(function() {
        conn.onerror('unresponsive-server');
        conn.close();
      }, syncbase.CONNECT_TIMEOUT_MS);

      function clearConnectTimeout() {
        if (connectTimeout) {
          clearTimeout(connectTimeout);
          connectTimeout = null;
        }
      }

      conn.onidle = function() {
        clearConnectTimeout();
        resolve(conn);
      };
      conn.onerror = function(err) {
        clearConnectTimeout();
        reject(err);
      };
      // if the connection closes without any of the other callbacks,
      // the server isn't responding properly.
      conn.onclose = function() {
        clearConnectTimeout();
        reject('server-maybe-offline');
      };

      conn.connect();
    }).then(function(conn) {
      slog.info('smtp:connected', connInfo);
      conn.onidle = conn.onclose = conn.onerror = noop;
      return conn;
    }).catch(function(err) {
      var errorString = analyzeSmtpError(conn, err, /* wasSending: */ false);
      slog.error('smtp:connect-error', {
        error: errorString,
        connInfo: connInfo
      });
      throw errorString;
    });
  };



  // SmtpClient doesn't provide any useful information in its onerror
  // handlers. Instead, intercept error responses and cache them so
  // that we can retrieve the most recent server error when needed.
  var onCommand = SmtpClient.prototype._onCommand;
  SmtpClient.prototype._onCommand = function(command) {
    if (command.statusCode && !command.success) {
      this._lastSmtpError = command;
    }
    onCommand.apply(this, arguments);
  };

  // SmtpClient passes data directly into the `new Error()`
  // constructor, which causes err.message to equal "[Object object]"
  // rather than the actual error object with details. This is just a
  // copy of that function, with the `new Error` constructor stripped
  // out so that the error details pass through to onerror.
  SmtpClient.prototype._onError = function(evt) {
    if (evt instanceof Error && evt.message) {
      this.onerror(evt);
    } else if (evt && evt.data instanceof Error) {
      this.onerror(evt.data);
    } else {
      this.onerror(evt && evt.data && evt.data.message ||
                   evt.data || evt || 'Error');
    }

    this.close();
  };




  var origHELO = SmtpClient.prototype._actionEHLO;
  SmtpClient.prototype._actionEHLO = function(command) {
    // If the server doesn't support EHLO, it can't support STARTTLS
    if (this.options.starttls) {
      if (!command.success) {
        slog.error('smtp:no-ehlo-support', {
          reason: 'EHLO is a prerequisite for STARTTLS'
        });
        this._onError('bad-security');
      } else {
        this._sendCommand("STARTTLS");
        this._currentAction = this._actionSTARTTLS;
      }
    } else {
      origHELO.apply(this, arguments);
    }
  };

  SmtpClient.prototype._actionSTARTTLS = function(command) {
    // STARTTLS is a requirement, not a suggestion.
    if (!command.success) {
      slog.error('smtp:no-starttls-support');
      this._onError('bad-security');
    } else {
      this._secureMode = true;
      this.socket.upgradeToSecure();
      // restart session
      this._currentAction = this._actionEHLO;
      this._sendCommand('EHLO ' + this.options.name);
    }
  };

  /**
   * Analyze a connection error for its cause and true nature,
   * returning a plain-old string. The error could come from the SMTP
   * dialog, or perhaps a socket error.
   *
   * @param {SmtpClient} conn
   * @param {Object} [rawError]
   *   If provided, use this error object if we couldn't find
   *   anything useful from the SMTP session's last error.
   *   For instance, socket errors will only get caught directly
   *   by the onerror handler.
   * @param {boolean} wasSending
   *   True if we were in the process of sending a message. If so,
   *   we need to interpret server error codes differently, as the
   *   SmtpClient doesn't maintain any easy-to-grab state about
   *   what mode the connection was in.
   */
  var analyzeSmtpError = exports.analyzeSmtpError =
        function(conn, rawError, wasSending) {
    var err = rawError;
    // If the error object is just an exception with no useful data,
    // try looking at recent SMTP errors.
    if ((err && !err.statusCode && err.name === 'Error') || !err) {
      err = conn && conn._lastSmtpError || null;
    }

    if (!err) {
      err = 'null-error';
    }

    var normalizedError = 'unknown';

    // If we were able to extract a negative SMTP response, we can
    // analyze the statusCode:
    if (err.statusCode) {
      // Example SMTP error:
      //   { "statusCode": 535,
      //     "enhancedStatus": "5.7.8",
      //     "data": "Wrong username or password, crook!",
      //     "line": "535 5.7.8 Wrong username or password, crook!",
      //     "success": false }
      switch (err.statusCode) {
      case 535:
        normalizedError = 'bad-user-or-pass';
        break;
      case 501: // Invalid Syntax
        if (wasSending) {
          normalizedError = 'bad-message';
        } else {
          normalizedError = 'server-maybe-offline';
        }
        break;
      case 550: // Mailbox Unavailable
      case 551: // User not local, will not send
      case 553: // Mailbox name not allowed
      case 554: // Transaction failed (in response to bad addresses)
        normalizedError = 'bad-address';
        break;
      case 500:
        normalizedError = 'server-problem';
        break;
      default:
        if (wasSending) {
          normalizedError = 'bad-message';
        } else {
          normalizedError = 'unknown';
        }
        break;
      }
    }
    // Socket errors only have a name:
    else if (err.name === 'ConnectionRefusedError') {
      normalizedError = 'unresponsive-server';
    }
    else if (/^Security/.test(err.name)) {
      normalizedError = 'bad-security';
    }
    // If we provided a string only, it's probably already normalized
    else if (typeof err === 'string') {
      normalizedError = err;
    }

    slog.log('smtp:analyzed-error', {
      statusCode: err.statusCode,
      enhancedStatus: err.enhancedStatus,
      rawError: rawError,
      rawErrorName: rawError && rawError.name,
      rawErrorMessage: rawError && rawError.message,
      rawErrorStack: rawError && rawError.stack,
      normalizedError: normalizedError,
      errorName: err.name,
      errorMessage: err.message,
      wasSending: wasSending
    });

    return normalizedError;
  };
});

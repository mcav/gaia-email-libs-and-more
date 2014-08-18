define([
  'browserbox',
  'browserbox-imap',
  'slog',
  '../syncbase',
  '../errorutils',
  'exports'
], function(BrowserBox, ImapClient, slog, syncbase, errorutils, exports) {

  var setTimeout = window.setTimeout;
  var clearTimeout = window.clearTimeout;

  exports.setTimeoutFunctions = function(setFn, clearFn) {
    setTimeout = setFn;
    clearTimeout = clearFn;
  };

  function noop() {
    // nothing
  }

   /**
   * Open a connection to an IMAP server.
   *
   * @param {object} credentials
   *   keys: hostname, port, crypto
   * @param {object} connInfo
   *   keys: username, password
   * @return {Promise}
   *   resolve => {BrowserBox} conn
   *   reject => {String} normalized String error
   */

  exports.createImapConnection = function(credentials, connInfo) {
    var conn = new BrowserBox(
      connInfo.hostname,
      connInfo.port, {
        auth: {
          user: credentials.username,
          pass: credentials.password
        },
        useSecureTransport: (connInfo.crypto === 'ssl' ||
                             connInfo.crypto === true),
        starttls: connInfo.crypto === 'starttls'
      });


    var connectTimeout = setTimeout(function() {
      conn.onerror('unresponsive-server');
      conn.close();
    }, syncbase.CONNECT_TIMEOUT_MS);

    return new Promise(function(resolve, reject) {
      conn.onauth = function() {
        clearTimeout(connectTimeout);
        resolve();
      };
      conn.onerror = function(err) {
        clearTimeout(connectTimeout);
        reject(err);
      };

      conn.connect();
    }).then(function() {
      slog.info('imap:connected', connInfo);
      conn.onauth = conn.onerror = noop;
      return conn;
    }).catch(function(errorObject) {
      var errorString = normalizeImapError(conn, errorObject);
      if (conn) {
        conn.close();
      }
      slog.error('imap:connect-error', {
        error: errorString,
        connInfo: connInfo
      });
      throw errorString;
    });
  }



  // ImapClient (from BrowserBox) doesn't pass along any useful error
  // information other than a human-readable string, and even then,
  // not always reliably. When we receive an IMAP protocol error
  // response form the server, all of the data we care about is in the
  // most recent 'NO' or 'BAD' response line. Until we can add
  // improved error handling upstream, cache the most recent error
  // response so that we can extract error codes when handling the
  // response.
  var processResponse = ImapClient.prototype._processResponse;
  ImapClient.prototype._processResponse = function(response) {
    processResponse.apply(this, arguments);

    var cmd = (response && response.command || '').toString()
          .toUpperCase().trim();

    if (['NO', 'BAD'].indexOf(cmd) !== -1) {
      slog.log('imap:protocol-error', {
        humanReadable: response.humanReadable
      });
      this._lastImapError = response;
    }
  }

  // ImapClient passes data directly into the `new Error()`
  // constructor, which causes err.message to equal "[Object object]"
  // rather than the actual error object with details. This is just a
  // copy of that function, with the `new Error` constructor stripped
  // out so that the error details pass through to onerror.
   ImapClient.prototype._onError = function(evt) {
    if (this.isError(evt)) {
      this.onerror(evt);
    } else if (evt && this.isError(evt.data)) {
      this.onerror(evt.data);
    } else {
      this.onerror(evt && evt.data && evt.data.message ||
                   evt.data || evt || 'Error');
    }

    this.close();
  };


  var origOpen = ImapClient.prototype._onOpen;
  ImapClient.prototype._onOpen = function() {
    origOpen.apply(this, arguments);
    if (this.options.starttls) {
      this.exec({ command: 'STARTTLS' }, function(response, next) {
        var command = (response && response.command || '').toUpperCase().trim();
        if (['BAD', 'NO'].indexOf(command) !== -1) {
          slog.error('imap:no-starttls-support', {
            humanReadable: response.humanReadable
          });
          this._onError({ name: 'SecurityError' });
        } else {
          slog.log('imap:upgrading-to-starttls');
          this.socket.upgradeToSecure();
        }
        next();
      }.bind(this));
    }
  };


  var origLogin = BrowserBox.prototype.login;
  BrowserBox.prototype.login = function(creds, cb) {
    // We've already asked for STARTTLS upgrade at the point we
    // grabbed the capabilities. If it still says LOGINDISABLED, the
    // server may be down for maintenance.
    if (this.capability.indexOf('LOGINDISABLED') !== -1) {
      this.onerror('server-maintenance');
    } else {
      return origLogin.apply(this, arguments);
    }
  };

  function analyzeLastImapError(err, state) {
    if (!err || !err.humanReadable) {
      return null;
    }
    // Structure of an IMAP error response:
    // { "tag":"W2",
    //   "command": "NO",
    //   "code": "AUTHENTICATIONFAILED",
    //   "attributes": [
    //     {"type":"TEXT","value":"invalid password"}
    //   ],
    //   "humanReadable": "invalid password" }

    // Dovecot says after a delay and does not terminate the connection:
    //     NO [AUTHENTICATIONFAILED] Authentication failed.
    // Zimbra 7.2.x says after a delay and DOES terminate the connection:
    //     NO LOGIN failed
    //     * BYE Zimbra IMAP server terminating connection
    // Yahoo says after a delay and does not terminate the connection:
    //     NO [AUTHENTICATIONFAILED] Incorrect username or password.

    var str = (err.code || '') + (err.humanReadable || '');

    if (/Application-specific password required/.test(str)) {
      return 'needs-app-pass';
    } else if (/Your account is not enabled for IMAP use/.test(str) ||
               /IMAP access is disabled for your domain/.test(str)) {
      return 'imap-disabled';
    } else if (/AUTHENTICATIONFAILED/.test(str) ||
               /login failed/i.test(str) ||
               /password/.test(str) ||
               state <= BrowserBox.prototype.STATE_NOT_AUTHENTICATED) {
      // If we got a protocol-level error but we weren't authenticated
      // yet, it's likely an authentication problem, as authenticating
      // is the first thing we do. Any other socket-level connection
      // problems (including STARTTLS, since we pass that along as an
      // exception) will be surfaced before hitting this conditional.
      return 'bad-user-or-pass';
    } else if (/UNAVAILABLE/.test(str)) {
      return 'server-maintenance';
    } else {
      return null;
    }
  }

  var normalizeImapError = exports.normalizeImapError = function(conn, err) {
    var socketLevelError = errorutils.analyzeException(err);
    var protocolLevelError =
          conn && analyzeLastImapError(conn.client._lastImapError, conn.state);

    var reportAs = (socketLevelError ||
                    protocolLevelError ||
                    'unknown');

    slog.error('imap:normalized-error', {
      error: err,
      errorName: err && err.name,
      errorMessage: err && err.message,
      errorStack: err && err.stack,
      socketLevelError: socketLevelError,
      protocolLevelError: protocolLevelError,
      reportAs: reportAs
    });

    return reportAs;
  }

});

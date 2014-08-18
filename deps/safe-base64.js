define(function(require, exports, module) {

  var ENCODER_OPTIONS = { fatal: false };

  /**
   * Safe atob-variant that does not throw exceptions and just ignores
   * characters that it does not know about. This is an attempt to
   * mimic node's implementation so that we can parse base64 with
   * newlines present as well as being tolerant of complete gibberish
   * people throw at us. Since we are doing this by hand, we also take
   * the opportunity to put the output directly in a typed array.
   *
   * In contrast, window.atob() throws Exceptions for all kinds of
   * angry reasons.
   */
  exports.decode = function(s) {
    var bitsSoFar = 0, validBits = 0, iOut = 0,
        arr = new Uint8Array(Math.ceil(s.length * 3 / 4));
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i), bits;
      if (c >= 65 && c <= 90) // [A-Z]
        bits = c - 65;
      else if (c >= 97 && c <= 122) // [a-z]
        bits = c - 97 + 26;
      else if (c >= 48 && c <= 57) // [0-9]
        bits = c - 48 + 52;
      else if (c === 43) // +
        bits = 62;
      else if (c === 47) // /
        bits = 63;
      else if (c === 61) { // =
        validBits = 0;
        continue;
      }
      // ignore all other characters!
      else
        continue;
      bitsSoFar = (bitsSoFar << 6) | bits;
      validBits += 6;
      if (validBits >= 8) {
        validBits -= 8;
        arr[iOut++] = bitsSoFar >> validBits;
        if (validBits === 2)
          bitsSoFar &= 0x3;
        else if (validBits === 4)
          bitsSoFar &= 0xf;
      }
    }

    if (iOut < arr.length)
      return arr.subarray(0, iOut);
    return arr;
  }

  /**
   * UInt8Array => base64 => UTF-8 String
   */
  exports.encode = function(view) {
    var sbits, i;
    sbits = new Array(view.length);
    for (i = 0; i < view.length; i++) {
      sbits[i] = String.fromCharCode(view[i]);
    }
    // (btoa is binary JS string -> base64 ASCII string)
    return window.btoa(sbits.join(''));
  }

}); // end define

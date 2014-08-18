/*jslint node: true, nomen: true, evil: true, indent: 2*/
'use strict';

var jsPath, currentConfig, indexPath, buildOptions,
  requirejs = require('./r'),
  fs = require('fs'),
  path = require('path'),
  exists = fs.existsSync || path.existsSync,
  dest = process.argv[2];

if (!dest || !exists(dest)) {
  console.log('Pass path to gaia destination (should be the apps/email dir ' +
      'inside a gaia directory).');
  process.exit(1);
}

jsPath = path.join(dest, 'js', 'ext');
indexPath = path.join(dest, 'index.html');

buildOptions = {
  baseUrl: path.join(__dirname, '..'),
  optimize: 'none', //'uglify',
  //Keep any "use strict" in the built code.
  useStrict: true,
};

var standardExcludes = [].concat(bootstrapIncludes);
var standardPlusComposerExcludes = ['src/drafts/composer']
      .concat(standardExcludes);

var configs = [
  // root aggregate loaded in worker context
  {
    name: 'src/worker-bootstrap',
    include: bootstrapIncludes,
    insertRequire: ['src/worker-setup'],
    out: jsPath + '/src/worker-bootstrap.js'
  },

  // root aggregate loaded in main frame context
  {
    name: 'src/main-frame-setup',
    out: jsPath + '/src/main-frame-setup.js'
  },

  // needed by all kinds of different layers, so broken out on its own:
  // - mailparser/mailparser
  // - src/drafts/composer (specifically mailcomposer)
  // - src/chewlayer (specifically src/imap/imapchew statically)
  // - activesync (specifically src/activesync/folder dynamically)
  {
    name: 'mimelib',
    exclude: standardExcludes,
    out: jsPath + '/mimelib.js'
  },

  // text/plain and text/html logic, needed by both IMAP and ActiveSync.
  // It's not clear why imapchew is in this layer; seems like it could be in
  // imap/protocollayer.
  {
    name: 'src/chewlayer',
    create: true,
    include: ['src/quotechew', 'src/htmlchew', 'src/mailchew',
              'src/imap/imapchew'],
    exclude: standardExcludes.concat(['mimelib']),
    out: jsPath + '/src/chewlayer.js'
  },

  // mailparser lib and deps sans mimelib
  {
    name: 'mailparser/mailparser',
    exclude: standardExcludes.concat(['mimelib']),
    out: jsPath + '/mailparser/mailparser.js'
  },

  // our composition abstraction and its deps
  {
    name: 'src/drafts/composer',
    exclude: standardExcludes.concat(['mailparser/mailparser',
                                      'src/quotechew',
                                      'src/htmlchew',
                                      'src/imap/imapchew',
                                      'mimelib']),
    out: jsPath + '/src/drafts/composer.js'
  },

  // imap protocol and probing support
  {
    name: 'src/imap/probe',
    exclude: standardPlusComposerExcludes.concat(['mailparser/mailparser']),
    out: jsPath + '/src/imap/probe.js'
  },

  // pop3 protocol and probing support
  {
    name: 'src/pop3/probe',
    exclude: standardPlusComposerExcludes.concat(['mailparser/mailparser']),
    out: jsPath + '/src/pop3/probe.js'
  },

  // imap online support
  {
    name: 'src/imap/protocollayer',
    exclude: standardPlusComposerExcludes.concat(
      ['mailparser/mailparser', 'mimelib', 'src/imap/imapchew']
    ),
    include: [
      'src/imap/protocol/sync',
      'src/imap/protocol/bodyfetcher',
      'src/imap/protocol/textparser',
      'src/imap/protocol/snippetparser'
    ],
    out: jsPath + '/src/imap/protocollayer.js',
    create: true
  },
  // smtp online support
  {
    name: 'src/smtp/probe',
    exclude: standardPlusComposerExcludes,
    out: jsPath + '/src/smtp/probe.js'
  },

  // activesync configurator, offline support
  {
    name: 'src/activesync/configurator',
    exclude: standardPlusComposerExcludes,
    out: jsPath + '/src/activesync/configurator.js'
  },

  // activesync configurator, offline support
  {
    name: 'pop3/pop3',
    exclude: standardPlusComposerExcludes,
    out: jsPath + '/pop3/pop3.js'
  },

  // activesync online support
  {
    name: 'src/activesync/protocollayer',
    create: true,
    include: ['wbxml', 'activesync/protocol'],
    exclude: standardExcludes.concat(['src/activesync/configurator']),
    out: jsPath + '/src/activesync/protocollayer.js'
  },

  // imap/smtp configuration, offline support
  {
    name: 'src/composite/configurator',
    exclude: standardPlusComposerExcludes,
    out: jsPath + '/src/composite/configurator.js'
  }
];

// Function used to mix in buildOptions to a new config target
function mix(target) {
  for (var prop in buildOptions) {
    if (buildOptions.hasOwnProperty(prop) && !target.hasOwnProperty(prop)) {
      target[prop] = buildOptions[prop];
    }
  }
  return target;
}

function onError(err) {
  console.error(err);
  process.exit(1);
}

//Create a runner that will run a separate build for each item
//in the configs array.
var runner = configs.reduceRight(function (prev, cfg) {
  return function (buildReportText) {
    if (buildReportText)
      console.log(buildReportText);

    currentConfig = mix(cfg);

    requirejs.optimize(currentConfig, prev, onError);
  };
}, function (buildReportText) {
  console.log(buildReportText);
});

//Run the builds
runner();

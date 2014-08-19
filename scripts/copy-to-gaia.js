/* jslint node: true, nomen: true, evil: true, indent: 2 */
'use strict';

var GelamConfig = require('../src/config');
var requirejs = require('./r');
var fs = require('fs');
var path = require('path');
var exists = fs.existsSync || path.existsSync;
var gaiaEmailDir = process.argv[2];

if (!gaiaEmailDir || !exists(gaiaEmailDir)) {
  console.log('Usage: node scripts/copy-to-gaia.js GAIA_EMAIL_DIR');
  process.exit(1);
}

var DEST_DIR = path.join(gaiaEmailDir, 'js', 'ext');

var LOADER_GROUP_TREE = {
  children: [
    {
      name: 'src/worker-bootstrap',
      insertRequire: ['src/worker-setup'], // this is main()
      include: [
        // Basics
        'alameda',
        'src/config',

        'src/mailslice', // Offline support
        'src/db/mail_rep', // Commonly-needed mail rep mutation funcs
        'src/searchfilter', // Offline searches

        // Job operations, including draft dependencies (could be
        // split out in the future):
        'src/jobs/outbox',
        'src/jobmixins',
        'src/drafts/jobs',
        'src/drafts/draft_rep',
        'src/async_blob_fetcher',
        'src/accountmixins',

        // Assorted small utilities:
        'mix',
        'utf7',
        'src/b64',

        // Bootstraps the universe, pulls in core dependencies like
        // MailUniverse and MailBridge:
        'src/worker-setup'
      ],

      children: [
        // Mime Parsing is used from a bunch of different layers
        // - mailparser/mailparser
        // - src/drafts/composer (specifically mailcomposer)
        // - src/chewlayer (specifically src/imap/imapchew statically)
        {
          name: 'mimeparser',
          children: [
            {
              name: 'src/chewlayer',
              include: [
                'src/quotechew',
                'src/htmlchew',
                'src/mailchew',
                'src/imap/imapchew'
              ]
            },
            // our composition abstraction and its deps
            {
              name: 'src/drafts/composer',
              children: [
                { name: 'src/imap/probe' },
                { name: 'src/pop3/probe' },
                { name: 'src/composite/configurator' }
              ]
            },
            // imap online support
            {
              name: 'src/imap/protocollayer',
              include: [
                'src/imap/protocol/sync',
                'src/imap/protocol/bodyfetcher',
                'src/imap/protocol/textparser',
                'src/imap/protocol/snippetparser'
              ]
            },
            { name: 'src/smtp/probe' },
            { name: 'pop3/pop3' },
            { name: 'src/activesync/configurator' },
            {
              name: 'src/activesync/protocollayer',
              include: ['wbxml', 'activesync/protocol'],
            }
          ]
        }
      ]
    },
    // Root aggregate loaded in main frame context:
    {
      name: 'src/main-frame-setup'
    }
  ]
};


function buildLoaderGroup(node, exclude) {
  if (node.name) {
    var config = GelamConfig.getRequireConfig();
    config.name = node.name;
    config.include = node.include;
    config.exclude = node.exclude;
    config.create = true; // It's okay if we create new files.
    config.baseUrl = path.join(__dirname, '../deps');
    config.out = DEST_DIR + '/' + node.name + '.js'
    requirejs.optimize(
      config,
      function onSuccess(resultText) {
        console.log(resultText);
      }, function onError(err) {
        console.error(err);
        process.exit(1);
      });
  }

  if (node.children) {
    node.children.forEach(function(childNode) {
      buildLoaderGroup(childNode, exclude.concat(node.include || []));
    });
  }
}

buildLoaderGroup(LOADER_GROUP_TREE, []);

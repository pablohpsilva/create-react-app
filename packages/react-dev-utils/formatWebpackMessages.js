/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

// WARNING: this code is untranspiled and is used in browser too.
// Please make sure any changes are in ES5 or contribute a Babel compile step.

// Some custom utilities to prettify Webpack output.
// This is quite hacky and hopefully won't be needed when Webpack fixes this.
// https://github.com/webpack/webpack/issues/2878

var chalk = require('chalk');
var friendlySyntaxErrorLabel = 'Syntax error:';

function isLikelyASyntaxError(message) {
  return message.indexOf(friendlySyntaxErrorLabel) !== -1;
}

// Cleans up webpack error messages.
// eslint-disable-next-line no-unused-vars
function formatMessage(message, isError) {
  var lines = message.split('\n');

  // Strip `WorkerError` header off message before parsing
  // https://github.com/webpack-contrib/thread-loader/blob/6fb5daff313c4839196cf533bdcdf14815a386d2/src/WorkerError.js
  lines = lines.filter(function(message) {
    return message.indexOf('Thread Loader (Worker') === -1;
  });

  // Add empty line for errors from third-party webpack plugins
  if (lines.length < 2) {
    lines[1] = '';
  }

  // Strip `ModuleWarning` head off message before parsing (because of ESLint)
  // https://github.com/webpack/webpack/blob/c77030573de96b8293c69dd396492f8e2d46561e/lib/ModuleWarning.js
  var moduleWarningPrefix = 'Module Warning: ';
  if (lines[1].indexOf(moduleWarningPrefix) === 0) {
    lines[1] = lines[1].slice(moduleWarningPrefix.length);
  } else if (lines[1].match(/Module Warning \(from.*?\):/)) {
    lines.splice(1, 1);
  }

  // Strip `ModuleError` header off message before parsing
  // https://github.com/webpack/webpack/blob/c77030573de96b8293c69dd396492f8e2d46561e/lib/ModuleError.js
  var moduleErrorPrefix = 'Module Error: ';
  if (lines[1].indexOf(moduleErrorPrefix) === 0) {
    lines[1] = lines[1].slice(moduleErrorPrefix.length);
  } else if (lines[1].match(/Module Error \(from.*?\):/)) {
    lines.splice(1, 1);
  }

  // Simplify `ModuleBuildError` before parsing (these may be nested so we use a while loop)
  // https://github.com/webpack/webpack/blob/c77030573de96b8293c69dd396492f8e2d46561e/lib/ModuleBuildError.js
  while (
    lines.length > 2 &&
    lines[1].match(/Module build failed \(from.*?\):/)
  ) {
    lines.splice(1, 1);
    lines[1] = 'Module build failed: ' + lines[1];
  }

  if (lines.length > 2 && lines[1] === '') {
    // Remove extra newline.
    lines.splice(1, 1);
  }

  // Remove webpack-specific loader notation from filename.
  // Before:
  // ./~/css-loader!./~/postcss-loader!./src/App.css
  // After:
  // ./src/App.css
  if (lines[0].lastIndexOf('!') !== -1) {
    lines[0] = lines[0].substr(lines[0].lastIndexOf('!') + 1);
  }

  lines = lines.filter(function(line) {
    // Webpack adds a list of entry points to warning messages:
    //  @ ./src/index.js
    //  @ multi react-scripts/~/react-dev-utils/webpackHotDevClient.js ...
    // It is misleading (and unrelated to the warnings) so we clean it up.
    // It is only useful for syntax errors but we have beautiful frames for them.
    return line.indexOf(' @ ') !== 0;
  });

  // line #0 is filename
  // line #1 is the main error message
  if (!lines[0] || !lines[1]) {
    return lines.join('\n');
  }

  // Cleans up verbose "module not found" messages for files and packages.
  if (lines[1].indexOf('Module not found: ') === 0) {
    lines = [
      lines[0],
      // Clean up message because "Module not found: " is descriptive enough.
      lines[1]
        .replace("Cannot resolve 'file' or 'directory' ", '')
        .replace('Cannot resolve module ', '')
        .replace('Error: ', '')
        .replace('[CaseSensitivePathsPlugin] ', ''),
    ];
  }

  if (lines[1].match(/Cannot find module.+node-sass/)) {
    lines[1] =
      'To import Sass files in this project, you need to install node-sass.\n';
    lines[1] +=
      'Please run `npm i node-sass --save` or `yarn add node-sass` inside your workspace.';
  }

  // Cleans up syntax error messages.
  if (lines[1].indexOf('Module build failed: ') === 0) {
    lines[1] = lines[1].replace(
      'Module build failed: Syntax Error ',
      friendlySyntaxErrorLabel
    );
    lines[1] = lines[1].replace(
      /Module build failed: .*?: /,
      friendlySyntaxErrorLabel + ' '
    );
    lines[1] = lines[1].trim();

    if (lines[1] === friendlySyntaxErrorLabel && lines[2] === '') {
      lines.splice(2, 1);
      if (lines.length > 2) {
        lines[1] += ' ' + lines[2];
        lines.splice(2, 1);
      }
    }
  }

  // Clean up export errors.
  // TODO: we should really send a PR to Webpack for this.
  var exportError = /\s*(.*?)\s*(?:")?export '(.+?)' was not found in '(.+?)'/;
  if (lines[1].match(exportError)) {
    lines[1] = lines[1].replace(
      exportError,
      "$1  '$3' does not contain an export named '$2'."
    );
  }

  lines[0] = chalk.inverse(lines[0]);

  // Reassemble the message.
  message = lines.join('\n');
  // Internal stacks are generally useless so we strip them... with the
  // exception of stacks containing `webpack:` because they're normally
  // from user code generated by WebPack. For more information see
  // https://github.com/facebook/create-react-app/pull/1050
  message = message.replace(
    /^\s*at\s((?!webpack:).)*:\d+:\d+[\s)]*(\n|$)/gm,
    ''
  ); // at ... ...:x:y
  message = message.replace(/^\s*at\s<anonymous>(\n|$)/gm, ''); // at <anonymous>

  return message.trim();
}

function formatWebpackMessages(json) {
  var formattedErrors = json.errors.map(function(message) {
    return formatMessage(message, true);
  });
  var formattedWarnings = json.warnings.map(function(message) {
    return formatMessage(message, false);
  });
  var result = {
    errors: formattedErrors,
    warnings: formattedWarnings,
  };
  if (result.errors.some(isLikelyASyntaxError)) {
    // If there are any syntax errors, show just them.
    // This prevents a confusing ESLint parsing error
    // preceding a much more useful Babel syntax error.
    result.errors = result.errors.filter(isLikelyASyntaxError);
  }
  return result;
}

module.exports = formatWebpackMessages;

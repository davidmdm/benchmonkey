'use strict';

module.exports = {
  bold: (input) => `\u{1b}[1m${input}\u{1b}[0m`,
  boldRed: (input) => `\u{1b}[31;1m${input}\u{1b}[0m`,
  boldYellow: (input) => `\u{1b}[33;1m${input}\u{1b}[0m`,
  red: (input) => `\u{1b}[31m${input}\u{1b}[0m`,
  green: (input) => `\u{1b}[32m${input}\u{1b}[0m`,
  yellow: (input) => `\u{1b}[33m${input}\u{1b}[0m`,
  blue: (input) => `\u{1b}[34m${input}\u{1b}[0m`,
  magenta: (input) => `\u{1b}[35m${input}\u{1b}[0m`,
  cyan: (input) => `\u{1b}[36m${input}\u{1b}[0m`,
};

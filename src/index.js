#!/usr/bin/env node --expose-gc

'use strict';

const pkg = require('./package.json');

const config = pkg.benchRunner || {};

if (Array.isArray(config.require) && config.require.every((elem) => typeof elem === 'string')) {
  for (const requirement of config.require) {
    require(requirement);
  }
}

const iter = Number(config.iterations);
const tol = Number(config.tolerance);

const defaultOptions = {
  iterations: iter > 0 ? iter : 1_000_000,
  tolerance: tol > 0 ? tol : 0.15,
};

const globalState = {
  opts: defaultOptions,
  cases: {},
  describes: {},
};

const rootNode = {
  previous: null,
  node: globalState,
};

let currentCtx = rootNode;

function describe(name, opts, fn) {
  currentCtx.node.describes[name] = {
    opts: typeof opts === 'object' ? opts : null,
    cases: {},
    describes: {},
  };

  currentCtx = {
    previous: currentCtx,
    node: currentCtx.node.describes[name],
  };

  if (typeof opts === 'function') opts();
  else fn();

  currentCtx = currentCtx.previous;
}

function it(name, opts, fn) {
  currentCtx.node.cases[name] = {
    opts: typeof opts === 'object' ? opts : null,
    fn: typeof opts === 'function' ? opts : fn,
  };
}

module.exports = { describe, it };

//@ts-ignore
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');

  const colors = require('./colors');

  const benchFilePath = path.resolve('benchmarks.json');
  const prevResults = fs.existsSync(benchFilePath) && fs.statSync(benchFilePath).isFile() ? require(benchFilePath) : {};

  const resultSymbol = Symbol.for('result');

  const files = process.argv.slice(2);

  for (const file of files) {
    require(path.resolve(file));
  }

  async function run(state, options, results, previous, indent = '') {
    const res = results || {};
    const prevRes = previous || prevResults;
    const opts = { ...options, ...state.opts };

    const log = (fmt, ...args) => console.log(indent + fmt, ...args);

    for (const [name, test] of Object.entries(state.cases)) {
      try {
        if (typeof globalThis.gc === 'function') {
          globalThis.gc();
        }
        const start = Date.now();
        for (let i = 0; i < opts.iterations; i++) {
          const r = test.fn();
          if (r instanceof Promise) {
            await r;
          }
        }
        const elapsed = Date.now() - start;
        const prevBestElapsed = prevRes[name] && prevRes[name].bestElapsed;
        const ratio = prevBestElapsed && elapsed / prevBestElapsed;
        res[name] = {
          [resultSymbol]: true,
          ratio,
          elapsed,
          iterationsPerSecond: Math.floor((1000 * opts.iterations) / elapsed),
          bestElapsed: prevBestElapsed ? Math.min(elapsed, prevBestElapsed) : elapsed,
          passed: ratio && ratio > 1 + opts.tolerance ? false : true,
          error: null,
        };

        log('- "%s" %s', colors.cyan(name), res[name].passed ? colors.green('PASSED') : colors.red('FAILED'));
        log(
          '   tolerance: %s   iterations: %s   iterations/second: %s   elapsed: %s   bestElapsed: %s   ratio: %s\n',
          opts.tolerance,
          opts.iterations,
          res[name].iterationsPerSecond,
          elapsed + 'ms',
          res[name].bestElapsed ? res[name].bestElapsed + 'ms' : 'N/A',
          ratio || 'N/A'
        );
      } catch (err) {
        res[name] = {
          [resultSymbol]: true,
          ...prevRes[name],
          error: err.message,
          passed: false,
        };
        log('- "%s" %s', colors.cyan(name), colors.red('FAILED'));
        log('   %s', err.message);
      }
    }

    for (const [name, desc] of Object.entries(state.describes)) {
      res[name] = {};
      log(colors.yellow(name), '\n');
      await run(desc, opts, res[name], typeof prevRes[name] === 'object' ? prevRes[name] : {}, indent + '  ');
    }

    return res;
  }

  function hasPassed(result) {
    return Object.values(result).every((elem) => (elem[resultSymbol] ? elem.passed : hasPassed(elem)));
  }

  async function main() {
    const result = await run(globalState);
    if (!hasPassed(result)) {
      throw new Error('Benchmarks failing');
    }
    fs.writeFileSync(benchFilePath, JSON.stringify(result, null, 2), 'utf8');
  }

  main().catch((err) => {
    console.error(err.message);
    process.exit(-1);
  });
}

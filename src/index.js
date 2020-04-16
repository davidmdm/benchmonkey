#!/usr/bin/env node

'use strict';

const path = require('path');

const pkg = require(path.resolve('package.json'));

const config = pkg.benchmonkey || {};

if (Array.isArray(config.require) && config.require.every((elem) => typeof elem === 'string')) {
  for (const requirement of config.require) {
    require(requirement);
  }
}

const iter = Number(config.iterations);
const tol = Number(config.tolerance);

const defaultOptions = {
  iterations: iter > 0 ? iter : 1_000_000,
  tolerance: tol > 0 ? tol : 0.25,
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
    fn: typeof opts === 'function' ? opts() : fn(),
  };
}

module.exports = { describe, it };

//@ts-ignore
if (require.main === module) {
  require('v8').setFlagsFromString('--expose-gc');
  const gc = require('vm').runInNewContext('gc');
  const fs = require('fs');

  const colors = require('./colors');

  const benchFilePath = path.resolve(config.outputfile || 'benchmarks.json');
  const prevResults = fs.existsSync(benchFilePath) && fs.statSync(benchFilePath).isFile() ? require(benchFilePath) : {};

  const resultSymbol = Symbol.for('result');

  const files = process.argv.slice(2).filter((x) => !x.startsWith('-'));

  const commandlineOptions = process.argv
    .slice(2)
    .filter((x) => x.startsWith('-'))
    .reduce((acc, arg) => {
      const [key, value] = arg.replace(/^-+/, '').split('=');
      if (key && value) {
        acc[key] = value;
      } else if (!arg.includes('=')) {
        acc[key] = true;
      }
      return acc;
    }, {});

  for (const file of files) {
    require(path.resolve(file));
  }

  const force = commandlineOptions.force || commandlineOptions.f;

  async function run(state, options, results, previous, indent = '') {
    const res = results || {};
    const prevRes = previous || prevResults;
    const opts = { ...options, ...state.opts };

    const log = (fmt, ...args) => console.log(indent + fmt, ...args);

    for (const [name, test] of Object.entries(state.cases)) {
      try {
        gc();
        const start = Date.now();
        for (let i = 0; i < opts.iterations; i++) {
          const r = test.fn();
          if (r instanceof Promise) {
            await r;
          }
        }
        const elapsed = Date.now() - start;
        const prevBestElapsed = prevRes[name] && prevRes[name].bestElapsed;
        const bestElapsed = prevBestElapsed ? Math.min(elapsed, prevBestElapsed) : elapsed;
        const iterationsPerSecond = Math.floor((1000 * opts.iterations) / elapsed);
        const bestIterationsPerSecond =
          prevRes[name] && prevRes[name].bestIterationsPerSecond
            ? Math.max(prevRes[name].bestIterationsPerSecond, iterationsPerSecond)
            : iterationsPerSecond;
        const ratio = Math.round(1000 * (bestIterationsPerSecond / iterationsPerSecond)) / 1000;

        res[name] = {
          [resultSymbol]: true,
          ratio,
          elapsed,
          iterationsPerSecond,
          bestIterationsPerSecond: force ? iterationsPerSecond : bestIterationsPerSecond,
          bestElapsed: force ? elapsed : bestElapsed,
          passed: force ? true : ratio && ratio > 1 + opts.tolerance ? false : true,
          error: null,
        };

        log('- "%s" %s', colors.cyan(name), res[name].passed ? colors.green('PASSED') : colors.red('FAILED'));
        log(
          '   tolerance: %s   iterations: %s   iterations/second: %s   bestIterations/second: %s   elapsed: %s   bestElapsed: %s   ratio: %s\n',
          opts.tolerance,
          opts.iterations,
          iterationsPerSecond,
          bestIterationsPerSecond,
          elapsed + 'ms',
          bestElapsed + 'ms',
          ratio < 1 ? colors.green(ratio) : ratio < 1 + opts.tolerance ? ratio : colors.red(ratio)
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

  function grepState(state, regex) {
    state.cases = Object.fromEntries(Object.entries(state.cases).filter(([name]) => regex.test(name)));
    const descEntries = Object.entries(state.describes);
    descEntries.forEach(([name, descState]) => regex.test(name) || grepState(descState, regex));
    const filteredDescs = descEntries.filter(
      ([_, descState]) => Object.keys(descState.cases).length > 0 || Object.keys(descState.describes).length > 0
    );
    state.describes = Object.fromEntries(filteredDescs);
  }

  const isResultStats = (res, key) => !!res[key] && typeof res[key].elapsed === 'number';

  function mergeResults(results, previous) {
    const keys = new Set([...Object.keys(results), ...Object.keys(previous)].sort());
    const ret = {};
    for (const key of keys) {
      if (!results[key]) {
        ret[key] = previous[key];
      } else if (isResultStats(results, key)) {
        ret[key] = results[key];
      } else if (!isResultStats(results, key) && !isResultStats(previous, key)) {
        ret[key] = mergeResults(results[key], previous[key] || {});
      }
    }
    return ret;
  }

  async function main() {
    if (commandlineOptions.grep) {
      grepState(globalState, new RegExp(commandlineOptions.grep));
    }

    const result = await run(globalState);
    if (!hasPassed(result)) {
      throw new Error('Benchmarks failing');
    }
    if (config.outputfile !== false) {
      fs.writeFileSync(benchFilePath, JSON.stringify(mergeResults(result, prevResults), null, 2), 'utf8');
    }
  }

  main().catch((err) => {
    console.error(err.message);
    process.exit(-1);
  });
}

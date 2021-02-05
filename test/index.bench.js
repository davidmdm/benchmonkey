'use strict';

const { describe, it } = require('../src/index');

it('boolean', () => {
  return () => true;
});

describe('My File Level Describe', {}, () => {
  describe('Describe A', {}, () => {
    it('noop', () => () => {});

    it('number', () => {
      return () => 2;
    });
  });

  describe('Describe B', () => {
    it('empty object', { iterations: 1000 }, () => () => ({}));
  });

  it('empty array', () => () => []);
});

it('string', () => () => 'hello');

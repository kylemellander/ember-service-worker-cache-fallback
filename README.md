# Ember Service Worker Cache Fallback

_An Ember Service Worker plugin that caches jsonapi requests and makes sure that
they are current in the background_

## Installation

```
ember install ember-service-worker-smart-jsonapi-caching
```

## Configuration

The configuration is done in the `ember-cli-build.js` file:

```js
var EmberApp = require('ember-cli/lib/broccoli/ember-app');

module.exports = function(defaults) {
  var app = new EmberApp(defaults, {
    'esw-smart-jsonapi-caching': {
      // RegExp patterns specifying which URLs to cache.
      patterns: [
        '/api/v1/(.+)',
      ],

      // changing this version number will bust the cache
      version: '1'
    }
  });

  return app.toTree();
};
```

## Authors

* Kyle Mellander

## Versioning

This library follows [Semantic Versioning](http://semver.org)

## Want to help?

Please do! We are always looking to improve this library. Please see our
[Contribution Guidelines](https://github.com/dockyard/ember-service-worker-cache-fallback/blob/master/CONTRIBUTING.md)
on how to properly submit issues and pull requests.

/* jshint node: true */
'use strict';

var Config = require('./lib/config');
var mergeTrees = require('broccoli-merge-trees');
var LocalForagePlugin = require('./lib/localforage');

module.exports = {
  name: 'ember-service-worker-smart-jsonapi-caching',

  included(app) {
    this._super.included && this._super.included.apply(this, arguments);
    this.app = app;
    this.app.options = this.app.options || {};
    this.app.options['esw-smart-jsonapi-caching'] = this.app.options['esw-smart-jsonapi-caching'] || {};
  },

  isDevelopingAddon: function() {
    return true;
  },

  treeForServiceWorker(swTree, appTree) {
    var options = this.app.options['esw-smart-jsonapi-caching'];
    var configFile = new Config([appTree], options);
    var localforageFile = new LocalForagePlugin([appTree], options);

    return mergeTrees([swTree, configFile, localforageFile]);
  }
};

'use strict';

const Plugin = require('broccoli-plugin');
const fs = require('fs');
const path = require('path');

module.exports = class LocalForagePlugin extends Plugin {
  constructor(inputNodes, options) {
    super(inputNodes, {
      name: options && options.name,
      annotation: options && options.annotation
    });

    this.options = options;
  }

  build() {
    const file = fs.readFileSync(path.join(__dirname, '../node_modules/localforage/dist/localforage.js'))
    fs.writeFileSync(path.join(this.outputPath, 'localforage.js'), file)
  }
};

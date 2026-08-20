// Resolution shim for bundlers that do not honour the "exports" map.
// Metro only reads package exports on newer React Native versions; without this
// file, `react-native-loupe/release` resolves as a plain path and finds nothing.
module.exports = require('./lib/commonjs/release.js')

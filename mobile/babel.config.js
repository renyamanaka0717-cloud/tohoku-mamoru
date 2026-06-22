module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // loose:false generates Object.defineProperty(this, key, {writable:true}) for instance
      // class fields, which creates own properties and avoids TypeError when a prototype
      // property with the same name is non-writable (react-native 0.81.5 Event.js pattern).
      ['@babel/plugin-transform-class-properties', { loose: false }],
      ['@babel/plugin-transform-private-methods', { loose: false }],
      ['@babel/plugin-transform-private-property-in-object', { loose: false }],
    ],
  };
};

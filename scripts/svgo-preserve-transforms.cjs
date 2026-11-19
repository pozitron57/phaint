// Профиль сравнения: не разворачивать координаты Potrace из компактной локальной системы.
module.exports = {
  multipass: true,
  floatPrecision: 3,
  plugins: [{ name: 'preset-default', params: { overrides: {
    convertPathData: { applyTransforms: false },
    convertTransform: false,
  } } }],
};
